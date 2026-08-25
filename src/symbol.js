// 측정된 주향/경사 값을 지질도 표준 기호(SVG)로 그리는 함수.
// 수평층: ⊕ / 일반: 긴 선(주향) + 짧은 눈금(경사방향) + 각도 / 수직층: 긴 선만.
import { HORIZONTAL_DIP_THRESHOLD, VERTICAL_DIP_THRESHOLD } from "./geology.js";

const STROKE = "#e2e8f0";
const NUM_COLOR = "#94a3b8";

function toXY(centerX, centerY, bearingDeg, length) {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    x: centerX + Math.sin(rad) * length,
    y: centerY - Math.cos(rad) * length,
  };
}

// strikeLineDeg: 0~180 (주향선의 두 방위 중 하나), dipDirectionDeg: 0~360 (경사가 내려가는 방향)
export function strikeDipSymbolSVG(strikeLineDeg, dipDeg, dipDirectionDeg, size = 64) {
  const c = size / 2;
  const lineHalf = size * 0.38;

  if (typeof dipDeg !== "number") {
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"></svg>`;
  }

  if (dipDeg <= HORIZONTAL_DIP_THRESHOLD) {
    const r = lineHalf * 0.6;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="${c - r}" y1="${c}" x2="${c + r}" y2="${c}" stroke="${STROKE}" stroke-width="2.5"/>
      <line x1="${c}" y1="${c - r}" x2="${c}" y2="${c + r}" stroke="${STROKE}" stroke-width="2.5"/>
    </svg>`;
  }

  const p1 = toXY(c, c, strikeLineDeg, lineHalf);
  const p2 = toXY(c, c, strikeLineDeg + 180, lineHalf);
  const lineSvg = `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${STROKE}" stroke-width="2.5"/>`;

  const tickLen = lineHalf * 0.55;

  if (dipDeg >= VERTICAL_DIP_THRESHOLD) {
    // 수직층: 경사가 내려가는 쪽이 없으므로 눈금을 주향선 양쪽에 대칭으로 그린다 (USGS/FGDC 관례).
    const tickA = toXY(c, c, dipDirectionDeg, tickLen);
    const tickB = toXY(c, c, dipDirectionDeg + 180, tickLen);
    const bothTicksSvg = `<line x1="${tickA.x.toFixed(1)}" y1="${tickA.y.toFixed(1)}" x2="${tickB.x.toFixed(1)}" y2="${tickB.y.toFixed(1)}" stroke="${STROKE}" stroke-width="2.5"/>`;
    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${lineSvg}${bothTicksSvg}</svg>`;
  }

  const tick = toXY(c, c, dipDirectionDeg, tickLen);
  const tickSvg = `<line x1="${c}" y1="${c}" x2="${tick.x.toFixed(1)}" y2="${tick.y.toFixed(1)}" stroke="${STROKE}" stroke-width="2.5"/>`;
  const numPos = toXY(c, c, dipDirectionDeg, tickLen * 1.45);
  const numSvg = `<text x="${numPos.x.toFixed(1)}" y="${numPos.y.toFixed(1)}" fill="${NUM_COLOR}" font-size="11" text-anchor="middle" dominant-baseline="middle">${Math.round(dipDeg)}</text>`;

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${lineSvg}${tickSvg}${numSvg}</svg>`;
}
