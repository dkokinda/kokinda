import { compareTuples, canonicalJson } from './lib/canonical.js';

const TRANSFORM_FNS = {
  trim: (s) => s.trim(),
  lower: (s) => s.toLowerCase(),
  upper: (s) => s.toUpperCase(),
  collapseWhitespace: (s) => s.replace(/\s+/g, ' ').trim(),
  stripCommas: (s) => s.replaceAll(',', ''),
};

const TRUE = new Set(['true', 'yes', 'y', '1']);
const FALSE = new Set(['false', 'no', 'n', '0']);

class CoercionError extends Error {}

const pad = (n, w = 2) => String(n).padStart(w, '0');

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new CoercionError(`${y}-${pad(m)}-${pad(d)} is not a real date`);
  }
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

// Turns "MM/DD/YYYY"-style formats into a regex. Only YYYY, MM, DD, M and D
// are tokens; everything else must match literally.
function parseDateWithFormat(text, format) {
  const order = [];
  const source = format.replace(/YYYY|MM|DD|M|D|[.*+?^${}()|[\]\\]/g, (tok) => {
    if (tok === 'YYYY') return order.push('y'), '(\\d{4})';
    if (tok === 'MM' || tok === 'DD') return order.push(tok[0].toLowerCase()), '(\\d{2})';
    if (tok === 'M' || tok === 'D') return order.push(tok.toLowerCase()), '(\\d{1,2})';
    return `\\${tok}`;
  });
  const match = new RegExp(`^${source}$`).exec(text);
  if (!match) throw new CoercionError(`"${text}" does not match date format ${format}`);
  const parts = {};
  order.forEach((k, i) => (parts[k] = Number(match[i + 1])));
  return isoDate(parts.y, parts.m, parts.d);
}

function toNumber(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CoercionError(`${value} is not a finite number`);
    return value;
  }
  if (typeof value === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) {
    return Number(value);
  }
  throw new CoercionError(`"${value}" is not a number`);
}

// Coerces one cell to a field's type. Values come out as string, number,
// boolean or null only; dates become ISO strings so they compare with ===.
// Anything ambiguous is an error rather than a guess.
export function coerce(value, field) {
  if (typeof value === 'string') {
    for (const t of field.transform) value = TRANSFORM_FNS[t](value);
    if (value === '') value = null;
  }
  if (value === null || value === undefined) value = field.default ?? null;
  if (value === null) {
    if (field.required) throw new CoercionError('is required but empty');
    return null;
  }

  switch (field.type) {
    case 'string': {
      const s = value instanceof Date ? value.toISOString() : String(value);
      if (field.enum && !field.enum.includes(s)) {
        throw new CoercionError(`"${s}" is not one of ${field.enum.join(', ')}`);
      }
      return s;
    }
    case 'number':
      return toNumber(value);
    case 'integer': {
      const n = toNumber(value);
      if (!Number.isSafeInteger(n)) throw new CoercionError(`${n} is not an integer`);
      return n;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const s = String(value).trim().toLowerCase();
      if (TRUE.has(s)) return true;
      if (FALSE.has(s)) return false;
      throw new CoercionError(`"${value}" is not a boolean`);
    }
    case 'date': {
      if (value instanceof Date) {
        return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
      }
      return parseDateWithFormat(String(value), field.format ?? 'YYYY-MM-DD');
    }
    case 'datetime': {
      if (value instanceof Date) return value.toISOString();
      const s = String(value);
      // A timestamp without an offset means different instants on different
      // machines, so it is rejected instead of read as local time.
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(s)) {
        throw new CoercionError(`"${s}" is not an ISO 8601 timestamp with an offset`);
      }
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new CoercionError(`"${s}" is not a valid timestamp`);
      return d.toISOString();
    }
    default:
      throw new CoercionError(`unknown type ${field.type}`);
  }
}

// Maps raw connector rows to typed records keyed by the spec's key fields.
// `columnOf(name, field)` picks which input column feeds each field, so the
// same code reads the source (via `from`) and the target (via field name).
// Returns every error rather than stopping at the first.
export function mapRows(table, spec, { label, columnOf }) {
  const errors = [];
  const records = new Map();
  const available = new Set(table.columns);

  for (const [name, field] of Object.entries(spec.fields)) {
    const col = columnOf(name, field);
    if (!available.has(col)) {
      errors.push({ where: label, message: `column "${col}" (field ${name}) not found; columns are: ${table.columns.join(', ')}` });
    }
  }
  if (errors.length) return { records, errors };

  for (const row of table.rows) {
    const record = {};
    let ok = true;
    for (const [name, field] of Object.entries(spec.fields)) {
      const col = columnOf(name, field);
      try {
        record[name] = coerce(row.values[col], field);
      } catch (err) {
        if (!(err instanceof CoercionError)) throw err;
        errors.push({ where: `${label} row ${row.line}`, field: name, message: err.message });
        ok = false;
      }
    }
    if (!ok) continue;
    const keyValues = spec.key.map((k) => record[k]);
    const id = keyId(keyValues);
    const existing = records.get(id);
    if (existing) {
      errors.push({ where: `${label} row ${row.line}`, message: `duplicate key ${id} (first seen on row ${existing.line})` });
      continue;
    }
    records.set(id, { key: keyValues, line: row.line, record, extra: row.values });
  }
  return { records, errors };
}

export function keyId(keyValues) {
  return canonicalJson(keyValues);
}

export function sortedEntries(records) {
  return [...records.values()].sort((a, b) => compareTuples(a.key, b.key));
}
