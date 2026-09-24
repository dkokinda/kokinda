import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { coerce, mapRows } from '../src/mapping.js';
import { parseSpec } from '../src/spec.js';

const f = (over = {}) => ({ type: 'string', transform: [], required: false, ...over });

describe('coerce', () => {
  test('applies transforms in order and turns empty text into null', () => {
    assert.equal(coerce('  Ada@Example.COM ', f({ transform: ['trim', 'lower'] })), 'ada@example.com');
    assert.equal(coerce('   ', f({ transform: ['trim'] })), null);
  });

  test('uses the default for empty cells and enforces required', () => {
    assert.equal(coerce(null, f({ default: 'n/a' })), 'n/a');
    assert.throws(() => coerce('', f({ required: true })), /required/);
  });

  test('numbers and integers', () => {
    assert.equal(coerce('1,234.5', f({ type: 'number', transform: ['stripCommas'] })), 1234.5);
    assert.equal(coerce(7, f({ type: 'integer' })), 7);
    assert.throws(() => coerce('1,234', f({ type: 'number' })), /not a number/);
    assert.throws(() => coerce('12abc', f({ type: 'number' })), /not a number/);
    assert.throws(() => coerce('1.5', f({ type: 'integer' })), /not an integer/);
  });

  test('booleans accept a fixed vocabulary only', () => {
    assert.equal(coerce('Yes', f({ type: 'boolean' })), true);
    assert.equal(coerce(0, f({ type: 'boolean' })), false);
    assert.throws(() => coerce('maybe', f({ type: 'boolean' })), /not a boolean/);
  });

  test('dates: ISO by default, explicit formats, real calendar dates only', () => {
    assert.equal(coerce('2026-02-03', f({ type: 'date' })), '2026-02-03');
    assert.equal(coerce('2/3/2026', f({ type: 'date', format: 'M/D/YYYY' })), '2026-02-03');
    assert.equal(coerce(new Date(Date.UTC(2026, 1, 3)), f({ type: 'date' })), '2026-02-03');
    assert.throws(() => coerce('2026-02-30', f({ type: 'date' })), /not a real date/);
    assert.throws(() => coerce('02/03/2026', f({ type: 'date' })), /does not match/);
  });

  test('datetimes require an explicit offset and normalize to UTC', () => {
    assert.equal(coerce('2026-01-01T10:00:00+02:00', f({ type: 'datetime' })), '2026-01-01T08:00:00.000Z');
    assert.throws(() => coerce('2026-01-01T10:00:00', f({ type: 'datetime' })), /with an offset/);
  });

  test('enum restricts string values', () => {
    assert.equal(coerce('open', f({ enum: ['open', 'closed'] })), 'open');
    assert.throws(() => coerce('pending', f({ enum: ['open', 'closed'] })), /not one of/);
  });
});

describe('parseSpec', () => {
  test('fills in from, makes key fields required, and applies defaults', () => {
    const spec = parseSpec({
      source: { type: 'spreadsheet', path: 'a.csv' },
      target: { type: 'spreadsheet', path: 'b.csv' },
      key: ['id'],
      fields: { id: { type: 'integer' }, name: { from: 'Full Name' } },
    });
    assert.equal(spec.fields.id.from, 'id');
    assert.equal(spec.fields.id.required, true);
    assert.equal(spec.fields.name.type, 'string');
    assert.equal(spec.onMissing, 'keep');
  });

  test('rejects unknown keys, types, and undefined key fields', () => {
    const base = { source: { type: 'x' }, target: { type: 'x' }, key: ['id'], fields: { id: {} } };
    assert.throws(() => parseSpec({ ...base, extra: 1 }), /Invalid connector spec/);
    assert.throws(() => parseSpec({ ...base, fields: { id: { type: 'money' } } }), /fields\.id\.type/);
    assert.throws(() => parseSpec({ ...base, key: ['nope'] }), /key field "nope"/);
  });
});

describe('mapRows', () => {
  const spec = parseSpec({
    source: { type: 'x' },
    target: { type: 'x' },
    key: ['id'],
    fields: { id: { from: 'ID', type: 'integer' }, name: { from: 'Name' } },
  });
  const opts = { label: 'src', columnOf: (_n, field) => field.from };

  test('reports a missing column with the columns that do exist', () => {
    const { errors } = mapRows({ columns: ['ID'], rows: [] }, spec, opts);
    assert.match(errors[0].message, /column "Name".*columns are: ID/);
  });

  test('collects every row error and rejects duplicate keys', () => {
    const table = {
      columns: ['ID', 'Name'],
      rows: [
        { line: 2, values: { ID: '1', Name: 'a' } },
        { line: 3, values: { ID: 'x', Name: 'b' } },
        { line: 4, values: { ID: '1', Name: 'c' } },
      ],
    };
    const { records, errors } = mapRows(table, spec, opts);
    assert.equal(records.size, 1);
    assert.deepEqual(
      errors.map((e) => e.where),
      ['src row 3', 'src row 4'],
    );
    assert.match(errors[1].message, /duplicate key \[1\] \(first seen on row 2\)/);
  });
});
