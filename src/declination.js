// GPS 좌표로부터 자편각(자북-진북 차이)을 계산한다. World Magnetic Model 2025-2030 기반.
// dpyeates/magvar(MIT License, https://github.com/dpyeates/magvar)의 계산 로직을
// 이 프로젝트의 ES 모듈 구조에 맞게 옮겨온 것.
import { gnmWmm, gtnmWmm, hnmWmm, htnmWmm, julianDaysCOF } from "./wmm-coefficients.js";

const DEG_TO_RAD = 0.017453292519943295;
const RAD_TO_DEG = 57.29577951308232;

const globe = {
  a: 6378.137, // WGS84 타원체 적도 반지름(km)
  b: 6356.7523142, // WGS84 타원체 극 반지름(km)
  r0: 6371.2, // 구면조화함수용 "평균 반지름"(km)
};

function zeroArray2D(rows, columns) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

function gregorianToJulian(year, month, day) {
  return new Date(year, month, day).valueOf() / 86400000 + 2440587.5;
}

const P = zeroArray2D(13, 13);
const DP = zeroArray2D(13, 13);
const gnm = zeroArray2D(13, 13);
const hnm = zeroArray2D(13, 13);
const sm = new Float32Array(13);
const cm = new Float32Array(13);
const root = new Float32Array(13);
const roots = zeroArray2D(13, 13).map((row) => row.map(() => new Float32Array(2)));

for (let n = 2; n <= 12; n++) {
  root[n] = Math.sqrt((2.0 * n - 1) / (2.0 * n));
}
for (let m = 0; m <= 12; m++) {
  const mm = m * m;
  for (let n = Math.max(m + 1, 2); n <= 12; n++) {
    roots[m][n][0] = Math.sqrt((n - 1) * (n - 1) - mm);
    roots[m][n][1] = 1.0 / Math.sqrt(n * n - mm);
  }
}

// 위도/경도(도)와 해발고도(km)로 자편각(도, 동편각 +)을 계산한다.
export function calculateDeclination(latitude, longitude, altitude = 0) {
  const now = new Date();
  const julianDays = gregorianToJulian(now.getFullYear(), now.getMonth(), now.getDate());

  const latRad = latitude * DEG_TO_RAD;
  const lonRad = longitude * DEG_TO_RAD;
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sr = Math.sqrt(globe.a ** 2 * cosLat ** 2 + globe.b ** 2 * sinLat ** 2);
  const theta = Math.atan2(
    cosLat * (altitude * sr + globe.a ** 2),
    sinLat * (altitude * sr + globe.b ** 2)
  );
  const r = Math.sqrt(
    altitude ** 2 +
      2 * altitude * sr +
      (globe.a ** 4 - (globe.a ** 4 - globe.b ** 4) * sinLat ** 2) /
        (globe.a ** 2 - (globe.a ** 2 - globe.b ** 2) * sinLat ** 2)
  );
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const invS = 1 / (s + (s === 0 ? 1e-8 : 0));

  P[0][0] = 1.0;
  P[1][1] = s;
  DP[0][0] = 0.0;
  DP[1][1] = c;
  P[1][0] = c;
  DP[1][0] = -s;

  for (let n = 2; n <= 12; n++) {
    P[n][n] = P[n - 1][n - 1] * s * root[n];
    DP[n][n] = (DP[n - 1][n - 1] * s + P[n - 1][n - 1] * c) * root[n];
  }
  for (let m = 0; m <= 12; m++) {
    for (let n = Math.max(m + 1, 2); n <= 12; n++) {
      P[n][m] = (P[n - 1][m] * c * (2 * n - 1) - P[n - 2][m] * roots[m][n][0]) * roots[m][n][1];
      DP[n][m] =
        ((DP[n - 1][m] * c - P[n - 1][m] * s) * (2 * n - 1) - DP[n - 2][m] * roots[m][n][0]) *
        roots[m][n][1];
    }
  }

  const yearFrac = (julianDays - julianDaysCOF) / 365.25;
  for (let n = 1; n <= 12; n++) {
    for (let m = 0; m <= 12; m++) {
      gnm[n][m] = gnmWmm[n][m] + yearFrac * gtnmWmm[n][m];
      hnm[n][m] = hnmWmm[n][m] + yearFrac * htnmWmm[n][m];
    }
  }
  for (let m = 0; m <= 12; m++) {
    sm[m] = Math.sin(m * lonRad);
    cm[m] = Math.cos(m * lonRad);
  }

  let BR = 0.0;
  let BTheta = 0.0;
  let BPhi = 0.0;
  const fn0 = globe.r0 / r;
  let fn = fn0 ** 2;

  for (let n = 1; n <= 12; n++) {
    let c1n = 0;
    let c2n = 0;
    let c3n = 0;
    for (let m = 0; m <= n; m++) {
      const tmp = gnm[n][m] * cm[m] + hnm[n][m] * sm[m];
      c1n += tmp * P[n][m];
      c2n += tmp * DP[n][m];
      c3n += m * (gnm[n][m] * sm[m] - hnm[n][m] * cm[m]) * P[n][m];
    }
    fn *= fn0;
    BR += (n + 1) * c1n * fn;
    BTheta -= c2n * fn;
    BPhi += c3n * fn * invS;
  }

  const psi = theta - (Math.PI / 2 - latRad);
  const sinPsi = Math.sin(psi);
  const cosPsi = Math.cos(psi);
  const X = -BTheta * cosPsi - BR * sinPsi;
  const Y = BPhi;

  if (X === 0.0 && Y === 0.0) return 0.0;
  return Math.round(Math.atan2(Y, X) * RAD_TO_DEG * 100) / 100;
}
