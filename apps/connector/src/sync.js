import { hash } from './lib/canonical.js';
import { keyId, mapRows, sortedEntries } from './mapping.js';

// The sync engine: compare what the source says against what the target
// holds, produce a plan, and apply exactly that plan. The same source and
// target always yield the same plan, byte for byte, and applying a plan
// twice changes nothing the second time.

function readSource(table, spec, label) {
  return mapRows(table, spec, { label, columnOf: (_name, field) => field.from });
}

// The target stores records under field names, not source headers.
function readTarget(table, spec, label) {
  if (!table.exists || table.columns.length === 0) return { records: new Map(), errors: [] };
  return mapRows(table, spec, { label, columnOf: (name) => name });
}

function changedFields(before, after, names) {
  return names.filter((n) => before[n] !== after[n]);
}

export async function plan({ spec, source, target }) {
  const [sourceTable, targetTable] = await Promise.all([source.read(), target.read()]);
  if (!sourceTable.exists) throw new Error(`source ${source.describe()} does not exist`);

  const src = readSource(sourceTable, spec, `source ${source.describe()}`);
  const tgt = readTarget(targetTable, spec, `target ${target.describe()}`);
  const errors = [...src.errors, ...tgt.errors];

  const names = Object.keys(spec.fields);
  const changes = [];
  let unchanged = 0;

  for (const entry of sortedEntries(src.records)) {
    const current = tgt.records.get(keyId(entry.key));
    if (!current) {
      changes.push({ op: 'create', key: entry.key, after: entry.record });
      continue;
    }
    const fields = changedFields(current.record, entry.record, names);
    if (fields.length === 0) {
      unchanged++;
      continue;
    }
    changes.push({ op: 'update', key: entry.key, fields, before: current.record, after: entry.record });
  }

  for (const entry of sortedEntries(tgt.records)) {
    if (src.records.has(keyId(entry.key))) continue;
    if (spec.onMissing === 'delete') {
      changes.push({ op: 'delete', key: entry.key, before: entry.record });
    }
  }

  const count = (op) => changes.filter((c) => c.op === op).length;
  return {
    // Identifies this exact set of changes; `apply --expect` compares it so a
    // reviewed plan is never silently swapped for a different one.
    planId: hash({ changes, errors }),
    summary: { create: count('create'), update: count('update'), delete: count('delete'), unchanged },
    changes,
    errors,
    // Kept off the public shape; apply needs the full target rows.
    _state: { source: src, target: tgt, targetColumns: targetTable.columns },
  };
}

export class PlanError extends Error {
  constructor(message, plan) {
    super(message);
    this.plan = plan;
  }
}

export async function apply({ spec, source, target, expect }) {
  const p = await plan({ spec, source, target });
  if (p.errors.length) throw new PlanError(`refusing to apply: ${p.errors.length} validation error(s)`, p);
  if (expect && expect !== p.planId) {
    throw new PlanError(`plan changed since review: expected ${expect}, got ${p.planId}`, p);
  }
  if (p.changes.length === 0) return { ...p, written: false };

  const names = Object.keys(spec.fields);
  // Columns the spec doesn't manage are carried over untouched, after the
  // managed ones, in the order the target already had them.
  const extraColumns = p._state.targetColumns.filter((c) => !names.includes(c));
  const deleted = new Set(p.changes.filter((c) => c.op === 'delete').map((c) => keyId(c.key)));

  const merged = new Map();
  for (const [id, entry] of p._state.target.records) {
    if (!deleted.has(id)) merged.set(id, entry);
  }
  for (const [id, entry] of p._state.source.records) {
    const existing = merged.get(id);
    merged.set(id, { ...entry, extra: existing?.extra ?? {} });
  }

  const rows = sortedEntries(merged).map((entry) => {
    const row = { ...entry.record };
    for (const c of extraColumns) row[c] = entry.extra[c] ?? null;
    return row;
  });
  const types = Object.fromEntries(names.map((n) => [n, spec.fields[n].type]));
  await target.write({ columns: [...names, ...extraColumns], rows, types });
  return { ...p, written: true };
}

export function publicPlan(p) {
  const { _state, ...rest } = p;
  return rest;
}
