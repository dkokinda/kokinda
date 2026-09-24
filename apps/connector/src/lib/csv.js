// RFC 4180 CSV, with two deliberate choices: input may use LF or CRLF, and
// output always uses LF with a trailing newline, so writes are byte-stable.

export function parseCsv(text, { delimiter = ',' } = {}) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i++;
    } else if (ch === delimiter) {
      endField();
      i++;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRecord();
      i += 2;
    } else if (ch === '\n') {
      endRecord();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || record.length > 0) endRecord();
  return records;
}

export function formatCsv(records, { delimiter = ',' } = {}) {
  const needsQuotes = (s) => s.includes(delimiter) || /["\r\n]/.test(s) || s !== s.trim();
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return needsQuotes(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return records.map((r) => r.map(cell).join(delimiter)).join('\n') + (records.length ? '\n' : '');
}
