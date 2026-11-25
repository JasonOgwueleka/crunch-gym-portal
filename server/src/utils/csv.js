function cell(value) {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Convert an array of row objects to CSV text using the given column list. */
export function toCsv(rows, columns) {
  const cols = columns || (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map(cell).join(',')];
  for (const row of rows) lines.push(cols.map((c) => cell(row[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
