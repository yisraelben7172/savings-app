/**
 * RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and line breaks inside quotes,
 * CRLF or LF line endings, optional UTF-8 BOM. Returns rows of raw strings; blank lines are skipped.
 */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      quoted = true;
      i++;
    } else if (c === delimiter) {
      endField();
      i++;
    } else if (c === '\r' || c === '\n') {
      endRow();
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (quoted) throw new Error('The file ends inside a quoted field (an opening " has no closing ").');
  if (field !== '' || row.length) endRow();
  return rows;
}

/** Rows as objects keyed by lowercase, trimmed header names. Also returns each row's line number in the file. */
export function csvRecords(text: string): { headers: string[]; records: { line: number; data: Record<string, string> }[] } {
  const rows = parseCsv(text, detectDelimiter(text));
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const records = rows.slice(1).map((r, i) => ({
    line: i + 2,
    data: Object.fromEntries(headers.map((h, j) => [h, (r[j] ?? '').trim()])),
  }));
  return { headers, records };
}

/** Comma unless the header line clearly uses tabs or semicolons (common in spreadsheet exports). */
function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (d: string) => first.split(d).length - 1;
  const best = [',', '\t', ';'].sort((a, b) => count(b) - count(a))[0];
  return count(best) > 0 ? best : ',';
}
