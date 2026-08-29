import {
  isSecureContextOk,
  needsIOSPermission,
  requestPermission,
  startListening,
  hasOrientationSupport,
} from "./sensors.js";
import {
  normalizeDeg,
  strikeLineDeg,
  strikeQuadrantLabel,
  dipQuadrantLabel,
  snapDipDirection,
  isLevel,
  dipAngleFromTilt,
  compassLabel,
  formatDeg,
  smoothHeading,
  smoothLinear,
} from "./geology.js";
import { strikeDipSymbolSVG } from "./symbol.js";
import { calculateDeclination } from "./declination.js";

const el = (id) => document.getElementById(id);

const startScreen = el("start-screen");
const mainScreen = el("main-screen");
const insecureWarning = el("insecure-warning");
const permissionDenied = el("permission-denied");
const calibrationBanner = el("calibration-banner");
const noCompassWarning = el("no-compass-warning");
const declinationInput = el("declination-input");
const declinationGpsBtn = el("declination-gps-btn");
const declinationGpsStatus = el("declination-gps-status");

const needleGroup = el("needle-group");
const dipTickGroup = el("dip-tick-group");
const headingReadout = el("heading-readout");

const strikePanel = el("strike-panel");
const dipPanel = el("dip-panel");
const reviewPanel = el("review-panel");
const stepEls = Array.from(document.querySelectorAll(".step"));

const bubbleDot = el("bubble-dot");
const levelStatus = el("level-status");
const dipReadout = el("dip-readout");
const dipGaugeFill = el("dip-gauge-fill");
const dipGaugeMarker = el("dip-gauge-marker");
const steadyBall = el("steady-ball");

const strikeDipSymbol = el("strike-dip-symbol");
const summaryStrike = el("summary-strike");
const summaryDip = el("summary-dip");

const BUBBLE_MAX_TILT = 30;
// 기기가 많이 기울면(경사각을 읽는 중) 나침반 방위 자체의 정확도가 떨어질 수 있으므로,
// 아직 거의 평평할 때(이 각도 이내) 측정된 방위만 "경사 방향" 후보로 계속 갱신해 사용한다.
const DIRECTION_LATCH_TILT = 15;
// 이 시간 동안 방위 값을 한 번도 못 받으면 이 기기/브라우저는 나침반 미지원으로 간주.
const NO_COMPASS_WARNING_DELAY_MS = 3000;

// 센서값을 부드럽게 하는 정도(원형/선형 지수이동평균의 alpha). 낮을수록 부드럽지만 반응이 느려진다.
const SMOOTHING_ALPHA = 0.35;

let step = "strike"; // 'strike' | 'dip' | 'review'
let latest = { heading: null, tilt: null, frontBack: null, accuracy: null };
let smoothedHeading = null;
let smoothedTilt = null;
let smoothedFrontBack = null;
let captured = { strikeHeadingDeg: null, dipDeg: null, dipDirectionDeg: null };
let dipDirectionCandidate = null;
let declinationDeg = 0;
let noCompassTimer = null;

function setStep(next) {
  step = next;
  stepEls.forEach((node) => {
    node.classList.remove("active", "done");
    const order = ["strike", "dip", "review"];
    const idx = order.indexOf(node.dataset.step);
    const curIdx = order.indexOf(step);
    if (idx === curIdx) node.classList.add("active");
    else if (idx < curIdx) node.classList.add("done");
  });
  strikePanel.classList.toggle("hidden", step !== "strike");
  dipPanel.classList.toggle("hidden", step !== "dip");
  reviewPanel.classList.toggle("hidden", step !== "review");
}

// N/E/S/W 배경판은 고정, 바늘이 회전해서 폰이 지금(또는 주향을 기록한 순간)
// 향하는 방향을 가리킨다 (폰을 돌리는 방향 = 바늘이 도는 방향, 직관적으로 일치).
function updateCompassVisual() {
  const referenceHeading = step === "strike" ? latest.heading : captured.strikeHeadingDeg;
  if (typeof referenceHeading === "number") {
    needleGroup.style.transform = `rotate(${-referenceHeading}deg)`;
  }
  if (captured.dipDirectionDeg !== null && captured.strikeHeadingDeg !== null) {
    dipTickGroup.classList.remove("hidden");
    const relative = captured.strikeHeadingDeg - captured.dipDirectionDeg;
    dipTickGroup.style.transform = `rotate(${relative}deg)`;
  }
}

function updateBubbleLevel(tilt, frontBack) {
  const gamma = Math.max(-BUBBLE_MAX_TILT, Math.min(BUBBLE_MAX_TILT, tilt ?? 0));
  const beta = Math.max(-BUBBLE_MAX_TILT, Math.min(BUBBLE_MAX_TILT, frontBack ?? 0));
  bubbleDot.style.left = `${50 + (gamma / BUBBLE_MAX_TILT) * 42}%`;
  bubbleDot.style.top = `${50 + (beta / BUBBLE_MAX_TILT) * 42}%`;
  const level = isLevel(tilt);
  bubbleDot.classList.toggle("level-ok", level);
  levelStatus.textContent = level
    ? "수평입니다. 지금 주향을 기록하세요."
    : "기기를 기울여 기포를 가운데 통로로 옮기세요.";
}

function updateDipGauge(dip) {
  const pct = typeof dip === "number" ? Math.min(100, Math.max(0, (dip / 90) * 100)) : 0;
  dipGaugeFill.style.height = `${pct}%`;
  dipGaugeMarker.style.bottom = `${pct}%`;
  dipReadout.textContent = formatDeg(dip);
}

// 경사(좌우 기울기)를 읽는 동안 앞뒤로 흔들려 주향 방향이 틀어지지 않았는지 확인.
function updateSteadyCheck(frontBack) {
  const clamped = Math.max(-BUBBLE_MAX_TILT, Math.min(BUBBLE_MAX_TILT, frontBack ?? 0));
  steadyBall.style.left = `${50 + (clamped / BUBBLE_MAX_TILT) * 44}%`;
  steadyBall.classList.toggle("level-ok", isLevel(frontBack));
}

// 센서가 주는 자북 기준 방위에 편각을 더해 진북 기준 방위로 바꾼다.
function applyDeclination(reading) {
  if (typeof reading.heading !== "number") return reading;
  return { ...reading, heading: normalizeDeg(reading.heading + declinationDeg) };
}

// 방위/기울기 각각을 이동평균으로 다듬어 손떨림·자북 흔들림에 의한 순간적인
// 값 튐을 줄인다. 측정(캡처)도 이 다듬어진 값을 기준으로 하므로 정확도에도 도움이 된다.
function smoothReading(reading) {
  smoothedHeading = smoothHeading(smoothedHeading, reading.heading, SMOOTHING_ALPHA);
  smoothedTilt = smoothLinear(smoothedTilt, reading.tilt, SMOOTHING_ALPHA);
  smoothedFrontBack = smoothLinear(smoothedFrontBack, reading.frontBack, SMOOTHING_ALPHA);
  return { ...reading, heading: smoothedHeading, tilt: smoothedTilt, frontBack: smoothedFrontBack };
}

function onReading(rawReading) {
  const reading = smoothReading(applyDeclination(rawReading));
  latest = reading;

  if (typeof reading.heading === "number") {
    headingReadout.textContent = `${formatDeg(reading.heading)} (${compassLabel(reading.heading)})`;
    el("capture-strike-btn").disabled = false;
    el("capture-dip-btn").disabled = typeof reading.tilt !== "number";
    noCompassWarning.classList.add("hidden");
    if (noCompassTimer) {
      clearTimeout(noCompassTimer);
      noCompassTimer = null;
    }
  }

  const badAccuracy = typeof reading.accuracy === "number" && reading.accuracy > 15;
  calibrationBanner.classList.toggle("hidden", !badAccuracy);

  if (step === "strike") {
    updateBubbleLevel(reading.tilt, reading.frontBack);
  } else if (step === "dip") {
    updateDipGauge(dipAngleFromTilt(reading.tilt));
    updateSteadyCheck(reading.frontBack);
    if (
      typeof reading.heading === "number" &&
      typeof reading.tilt === "number" &&
      Math.abs(reading.tilt) <= DIRECTION_LATCH_TILT
    ) {
      // 아직 많이 기울기 전(방향만 맞추는 중)의 방위를 계속 최신값으로 잡아둔다.
      dipDirectionCandidate = reading.heading;
    }
  }

  updateCompassVisual();
}

function handleDeclinationGps() {
  if (!("geolocation" in navigator)) {
    declinationGpsStatus.textContent = "이 브라우저는 위치 정보를 지원하지 않습니다.";
    return;
  }
  declinationGpsStatus.textContent = "위치 확인 중...";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, altitude } = position.coords;
      const altitudeKm = typeof altitude === "number" ? altitude / 1000 : 0;
      const declination = calculateDeclination(latitude, longitude, altitudeKm);
      declinationInput.value = declination;
      declinationGpsStatus.textContent = `현재 위치 기준 자편각 ${formatDeg(declination, 1)} 적용됨 (필요하면 직접 수정 가능)`;
    },
    () => {
      declinationGpsStatus.textContent = "위치를 가져오지 못했습니다. 위치 권한을 허용했는지 확인하거나 직접 입력해주세요.";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function handleStart() {
  insecureWarning.classList.toggle("hidden", isSecureContextOk());
  permissionDenied.classList.add("hidden");
  declinationDeg = Number(declinationInput.value) || 0;

  if (needsIOSPermission()) {
    const granted = await requestPermission();
    if (!granted) {
      permissionDenied.classList.remove("hidden");
      return;
    }
  }

  startScreen.classList.add("hidden");
  mainScreen.classList.remove("hidden");
  setStep("strike");
  smoothedHeading = null;
  smoothedTilt = null;
  smoothedFrontBack = null;
  startListening(onReading);
  registerServiceWorker();

  if (!hasOrientationSupport()) {
    // API 자체가 없는 기기/브라우저는 몇 초 기다릴 것도 없이 바로 안내한다.
    noCompassWarning.classList.remove("hidden");
    return;
  }
  noCompassTimer = setTimeout(() => {
    if (typeof latest.heading !== "number") {
      noCompassWarning.classList.remove("hidden");
    }
  }, NO_COMPASS_WARNING_DELAY_MS);
}

function handleCaptureStrike() {
  if (typeof latest.heading !== "number") return;
  captured.strikeHeadingDeg = latest.heading;
  dipDirectionCandidate = null;
  setStep("dip");
  updateCompassVisual();
}

function handleBackToStrike() {
  captured.dipDeg = null;
  captured.dipDirectionDeg = null;
  dipDirectionCandidate = null;
  dipTickGroup.classList.add("hidden");
  setStep("strike");
}

function handleCaptureDip() {
  if (typeof latest.tilt !== "number" || typeof latest.heading !== "number") return;
  captured.dipDeg = dipAngleFromTilt(latest.tilt);
  // 많이 기울어진 지금 이 순간의 나침반 방위보다, 아직 평평했을 때(회전만 마친 상태) 잡아둔
  // 방위가 더 정확하므로 그것을 우선 사용한다.
  const directionSource = dipDirectionCandidate !== null ? dipDirectionCandidate : latest.heading;
  captured.dipDirectionDeg = snapDipDirection(captured.strikeHeadingDeg, directionSource);

  summaryStrike.textContent = strikeQuadrantLabel(captured.strikeHeadingDeg);
  summaryDip.textContent = dipQuadrantLabel(captured.dipDeg, captured.dipDirectionDeg);
  strikeDipSymbol.innerHTML = strikeDipSymbolSVG(
    strikeLineDeg(captured.strikeHeadingDeg),
    captured.dipDeg,
    captured.dipDirectionDeg,
    64
  );

  setStep("review");
  updateCompassVisual();
}

function handleRestart() {
  captured = { strikeHeadingDeg: null, dipDeg: null, dipDirectionDeg: null };
  dipDirectionCandidate = null;
  dipTickGroup.classList.add("hidden");
  setStep("strike");
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

el("start-btn").addEventListener("click", handleStart);
declinationGpsBtn.addEventListener("click", handleDeclinationGps);
el("capture-strike-btn").addEventListener("click", handleCaptureStrike);
el("back-to-strike-btn").addEventListener("click", handleBackToStrike);
el("capture-dip-btn").addEventListener("click", handleCaptureDip);
el("restart-btn").addEventListener("click", handleRestart);

insecureWarning.classList.toggle("hidden", isSecureContextOk());
