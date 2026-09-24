import { createHash } from 'node:crypto';

// JSON with object keys sorted at every level, so the same value always
// serializes to the same bytes regardless of insertion order.
export function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export function hash(value, length = 12) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, length);
}

// Total order over scalar values: null < boolean < number < string.
// Strings compare by UTF-16 code unit, never localeCompare, whose result
// depends on the ICU build and would make ordering machine-dependent.
const RANK = { object: 0, boolean: 1, number: 2, string: 3 };

export function compareValues(a, b) {
  const ra = RANK[typeof a];
  const rb = RANK[typeof b];
  if (ra !== rb) return ra - rb;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function compareTuples(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const c = compareValues(a[i] ?? null, b[i] ?? null);
    if (c !== 0) return c;
  }
  return 0;
}
