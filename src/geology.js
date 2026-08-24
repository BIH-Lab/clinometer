// 원시 센서 값(나침반 방위, 좌우 기울기)을 주향/경사 값으로 정리하는 순수 함수 모음.

export const LEVEL_TOLERANCE_DEG = 2;

export function normalizeDeg(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

// 주향은 방향이 없는 선이므로 0~180 범위로 접어서 다룬다.
export function strikeLineDeg(headingDeg) {
  return normalizeDeg(headingDeg) % 180;
}

export function isLevel(tiltDeg, tolerance = LEVEL_TOLERANCE_DEG) {
  return typeof tiltDeg === "number" && Math.abs(tiltDeg) <= tolerance;
}

// 좌우 기울기(gamma)를 0~90도의 경사 각도로 변환.
export function dipAngleFromTilt(tiltDeg) {
  if (typeof tiltDeg !== "number") return null;
  return Math.min(90, Math.abs(tiltDeg));
}

// 0~360 방위를 N/E/S/W 8방위 근사 문자로 표시 (교육용 보조 표기).
export function compassLabel(headingDeg) {
  if (typeof headingDeg !== "number") return "--";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(normalizeDeg(headingDeg) / 45) % 8;
  return dirs[idx];
}

export function formatDeg(value, digits = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return `${value.toFixed(digits)}°`;
}

export const HORIZONTAL_DIP_THRESHOLD = 3;
export const VERTICAL_DIP_THRESHOLD = 85;

// 지질도 표기 관례에 맞춘 주향 표시: N60°E / N30°W, 남-북선은 N-S, 동-서선은 E-W.
export function strikeQuadrantLabel(headingDeg, tol = 1) {
  if (typeof headingDeg !== "number") return "--";
  const line = strikeLineDeg(headingDeg);
  if (line <= tol || line >= 180 - tol) return "N-S";
  if (Math.abs(line - 90) <= tol) return "E-W";
  if (line < 90) return `N${Math.round(line)}°E`;
  return `N${Math.round(180 - line)}°W`;
}

// 지질도 표기 관례에 맞춘 경사 표시: 30°SE, 완전 수평/수직은 별도 표기.
export function dipQuadrantLabel(dipDeg, dipDirectionDeg) {
  if (typeof dipDeg !== "number") return "--";
  if (dipDeg <= HORIZONTAL_DIP_THRESHOLD) return "0° (수평층)";
  if (dipDeg >= VERTICAL_DIP_THRESHOLD) return `${Math.round(dipDeg)}° (수직층)`;
  return `${Math.round(dipDeg)}°${compassLabel(dipDirectionDeg)}`;
}
