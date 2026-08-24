// localStorage 기반 측정 기록 저장/조회/삭제 + CSV/JSON 내보내기.

const STORAGE_KEY = "clinometer_records";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function writeAll(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getRecords() {
  return readAll().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function addRecord({ strikeDeg, dipDeg, dipDirectionDeg, note }) {
  const records = readAll();
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    strikeDeg,
    dipDeg,
    dipDirectionDeg,
    note: note || "",
  };
  records.push(record);
  writeAll(records);
  return record;
}

export function deleteRecord(id) {
  writeAll(readAll().filter((r) => r.id !== id));
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportJSON() {
  const records = getRecords();
  downloadBlob(
    JSON.stringify(records, null, 2),
    `clinometer-records-${Date.now()}.json`,
    "application/json"
  );
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportCSV() {
  const records = getRecords();
  const header = ["timestamp", "strikeLabel", "dipLabel", "strikeDeg", "dipDeg", "dipDirectionDeg", "note"];
  const lines = [header.join(",")];
  for (const r of records) {
    lines.push(header.map((key) => csvEscape(r[key])).join(","));
  }
  downloadBlob(lines.join("\n"), `clinometer-records-${Date.now()}.csv`, "text/csv");
}
