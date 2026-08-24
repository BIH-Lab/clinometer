import {
  isSecureContextOk,
  needsIOSPermission,
  requestPermission,
  startListening,
} from "./sensors.js";
import {
  strikeLineDeg,
  isLevel,
  dipAngleFromTilt,
  compassLabel,
  formatDeg,
} from "./geology.js";
import { getRecords, addRecord, deleteRecord, exportCSV, exportJSON } from "./storage.js";

const el = (id) => document.getElementById(id);

const startScreen = el("start-screen");
const mainScreen = el("main-screen");
const insecureWarning = el("insecure-warning");
const permissionDenied = el("permission-denied");
const calibrationBanner = el("calibration-banner");

const strikeGroup = el("strike-group");
const dipTickGroup = el("dip-tick-group");
const headingReadout = el("heading-readout");

const strikePanel = el("strike-panel");
const dipPanel = el("dip-panel");
const reviewPanel = el("review-panel");
const stepEls = Array.from(document.querySelectorAll(".step"));

const levelBall = el("level-ball");
const levelStatus = el("level-status");
const dipReadout = el("dip-readout");

const summaryStrike = el("summary-strike");
const summaryDip = el("summary-dip");
const summaryDipDir = el("summary-dipdir");
const noteInput = el("note-input");

const recordsList = el("records-list");

let step = "strike"; // 'strike' | 'dip' | 'review'
let latest = { heading: null, tilt: null, accuracy: null };
let captured = { strikeHeadingDeg: null, dipDeg: null, dipDirectionDeg: null };

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

function updateCompassVisual() {
  if (step === "strike" && typeof latest.heading === "number") {
    strikeGroup.style.transform = `rotate(${latest.heading}deg)`;
  } else if (captured.strikeHeadingDeg !== null) {
    strikeGroup.style.transform = `rotate(${captured.strikeHeadingDeg}deg)`;
  }
  if (captured.dipDirectionDeg !== null) {
    dipTickGroup.classList.remove("hidden");
    dipTickGroup.style.transform = `rotate(${captured.dipDirectionDeg}deg)`;
  }
}

function onReading(reading) {
  latest = reading;

  if (typeof reading.heading === "number") {
    headingReadout.textContent = `${formatDeg(reading.heading)} (${compassLabel(reading.heading)})`;
    el("capture-strike-btn").disabled = false;
    el("capture-dip-btn").disabled = typeof reading.tilt !== "number";
  }

  const badAccuracy = typeof reading.accuracy === "number" && reading.accuracy > 15;
  calibrationBanner.classList.toggle("hidden", !badAccuracy);

  if (step === "strike") {
    const tilt = reading.tilt;
    const clamped = Math.max(-45, Math.min(45, tilt ?? 0));
    const pct = 50 + (clamped / 45) * 44;
    levelBall.style.left = `${pct}%`;
    const level = isLevel(tilt);
    levelBall.classList.toggle("level-ok", level);
    levelStatus.textContent = level
      ? "수평입니다. 지금 주향을 기록하세요."
      : "기기를 좌우로 기울여 수평을 맞추세요.";
  } else if (step === "dip") {
    const dip = dipAngleFromTilt(reading.tilt);
    dipReadout.textContent = formatDeg(dip);
  }

  updateCompassVisual();
}

async function handleStart() {
  insecureWarning.classList.toggle("hidden", isSecureContextOk());
  permissionDenied.classList.add("hidden");

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
  startListening(onReading);
  renderRecords();
  registerServiceWorker();
}

function handleCaptureStrike() {
  if (typeof latest.heading !== "number") return;
  captured.strikeHeadingDeg = latest.heading;
  setStep("dip");
  updateCompassVisual();
}

function handleBackToStrike() {
  captured.dipDeg = null;
  captured.dipDirectionDeg = null;
  dipTickGroup.classList.add("hidden");
  setStep("strike");
}

function handleCaptureDip() {
  if (typeof latest.tilt !== "number" || typeof latest.heading !== "number") return;
  captured.dipDeg = dipAngleFromTilt(latest.tilt);
  captured.dipDirectionDeg = latest.heading;

  summaryStrike.textContent = `${formatDeg(strikeLineDeg(captured.strikeHeadingDeg))} / ${formatDeg(
    (strikeLineDeg(captured.strikeHeadingDeg) + 180) % 360
  )}`;
  summaryDip.textContent = formatDeg(captured.dipDeg);
  summaryDipDir.textContent = `${formatDeg(captured.dipDirectionDeg)} (${compassLabel(captured.dipDirectionDeg)})`;

  setStep("review");
  updateCompassVisual();
}

function handleSave() {
  if (captured.strikeHeadingDeg === null || captured.dipDeg === null) return;
  addRecord({
    strikeDeg: strikeLineDeg(captured.strikeHeadingDeg),
    dipDeg: captured.dipDeg,
    dipDirectionDeg: captured.dipDirectionDeg,
    note: noteInput.value.trim(),
  });
  noteInput.value = "";
  renderRecords();
  handleRestart();
}

function handleRestart() {
  captured = { strikeHeadingDeg: null, dipDeg: null, dipDirectionDeg: null };
  dipTickGroup.classList.add("hidden");
  setStep("strike");
}

function renderRecords() {
  const records = getRecords();
  recordsList.innerHTML = "";
  if (records.length === 0) {
    recordsList.innerHTML = '<p class="empty-note">아직 저장된 측정값이 없습니다.</p>';
    return;
  }
  for (const r of records) {
    const row = document.createElement("div");
    row.className = "record-row";

    const info = document.createElement("div");
    const main = document.createElement("div");
    main.textContent = `주향 ${formatDeg(r.strikeDeg)} · 경사 ${formatDeg(r.dipDeg)}`;
    const meta = document.createElement("div");
    meta.className = "meta";
    const time = new Date(r.timestamp).toLocaleString("ko-KR");
    meta.textContent = r.note ? `${time} · ${r.note}` : time;
    info.append(main, meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "삭제";
    deleteBtn.addEventListener("click", () => {
      deleteRecord(r.id);
      renderRecords();
    });

    row.append(info, deleteBtn);
    recordsList.appendChild(row);
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  }
}

el("start-btn").addEventListener("click", handleStart);
el("capture-strike-btn").addEventListener("click", handleCaptureStrike);
el("back-to-strike-btn").addEventListener("click", handleBackToStrike);
el("capture-dip-btn").addEventListener("click", handleCaptureDip);
el("save-btn").addEventListener("click", handleSave);
el("restart-btn").addEventListener("click", handleRestart);
el("export-csv-btn").addEventListener("click", exportCSV);
el("export-json-btn").addEventListener("click", exportJSON);

insecureWarning.classList.toggle("hidden", isSecureContextOk());
