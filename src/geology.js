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
