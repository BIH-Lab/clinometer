// 기기 방향/나침반 센서를 iOS·Android 차이를 감춘 하나의 인터페이스로 노출한다.
// iOS Safari: webkitCompassHeading(이미 자북 보정, 시계방향 증가)를 사용.
// Android Chrome: deviceorientationabsolute 이벤트의 alpha(absolute===true)를 사용.

let activeHandler = null;
let absoluteEventSeen = false;

export function isSecureContextOk() {
  return window.isSecureContext === true;
}

// 이 기기/브라우저가 기기 방향 이벤트 자체를 아예 지원하지 않는지 즉시 확인한다
// (센서 값이 하나도 안 들어와서 몇 초 기다려봐야 아는 것과 별개로, API 자체의 부재는 바로 알 수 있음).
export function hasOrientationSupport() {
  return typeof DeviceOrientationEvent !== "undefined";
}

export function needsIOSPermission() {
  return typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";
}

// iOS에서는 반드시 사용자의 탭(클릭) 핸들러 안에서 호출해야 한다.
export async function requestPermission() {
  if (!needsIOSPermission()) return true;
  try {
    const result = await DeviceOrientationEvent.requestPermission();
    return result === "granted";
  } catch (err) {
    return false;
  }
}

function normalizeHeading(event) {
  if (typeof event.webkitCompassHeading === "number") {
    // iOS: 이미 0~360, 시계방향=동쪽 규약.
    return event.webkitCompassHeading;
  }
  // event.absolute가 true일 때만 alpha가 실제 자북 기준 방위다. false/누락이면
  // "전원 켤 때 방향" 기준의 상대각일 뿐이라 나침반 값으로 쓸 수 없다 —
  // 그럴듯한 숫자를 보여주는 대신 null을 반환해 "지원 안 됨"으로 처리한다.
  if (event.absolute === true && typeof event.alpha === "number") {
    // W3C 규약: alpha는 반시계 증가이므로 시계방향 규약으로 뒤집는다.
    return (360 - event.alpha) % 360;
  }
  return null;
}

function normalizeAccuracy(event) {
  if (typeof event.webkitCompassAccuracy === "number") {
    return event.webkitCompassAccuracy >= 0 ? event.webkitCompassAccuracy : null;
  }
  return null; // Android는 웹에 정확도를 노출하지 않음.
}

function buildReading(event) {
  return {
    heading: normalizeHeading(event),
    tilt: typeof event.gamma === "number" ? event.gamma : null,
    frontBack: typeof event.beta === "number" ? event.beta : null,
    accuracy: normalizeAccuracy(event),
    isAbsolute: event.absolute === true || typeof event.webkitCompassHeading === "number",
  };
}

// onReading(reading) 콜백을 주기적으로 호출한다. stopListening()으로 해제.
export function startListening(onReading) {
  stopListening();
  absoluteEventSeen = false;

  // deviceorientationabsolute가 한 번이라도 오면(Android) 그것만 신뢰하고,
  // 없으면(iOS 등) deviceorientation의 webkitCompassHeading으로 계속 동작한다.
  const relativeHandler = (event) => {
    if (absoluteEventSeen && typeof event.webkitCompassHeading !== "number") return;
    onReading(buildReading(event));
  };
  const absoluteHandler = (event) => {
    absoluteEventSeen = true;
    onReading(buildReading(event));
  };

  activeHandler = { relativeHandler, absoluteHandler };
  window.addEventListener("deviceorientation", relativeHandler);
  window.addEventListener("deviceorientationabsolute", absoluteHandler);
}

export function stopListening() {
  if (activeHandler) {
    window.removeEventListener("deviceorientation", activeHandler.relativeHandler);
    window.removeEventListener("deviceorientationabsolute", activeHandler.absoluteHandler);
    activeHandler = null;
  }
}
