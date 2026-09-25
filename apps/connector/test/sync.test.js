import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plan, apply, PlanError } from '../src/sync.js';
import { parseSpec } from '../src/spec.js';

// In-memory connector: a table plus a log of writes.
function fakeConnector(columns, rows, { exists = true } = {}) {
  const state = { columns, rows: rows.map((values, i) => ({ line: i + 2, values })), exists, writes: [] };
  return {
    state,
    describe: () => 'fake',
    async read() {
      return { exists: state.exists, columns: state.columns, rows: state.rows };
    },
    async write({ columns: cols, rows: out }) {
      state.writes.push({ columns: cols, rows: out });
      state.exists = true;
      state.columns = cols;
      state.rows = out.map((values, i) => ({ line: i + 2, values }));
    },
  };
}

const spec = (over = {}) =>
  parseSpec({
    source: { type: 'fake' },
    target: { type: 'fake' },
    key: ['email'],
    fields: {
      email: { from: 'Email', transform: ['trim', 'lower'] },
      amount: { from: 'Amount', type: 'number' },
    },
    ...over,
  });

const source = () =>
  fakeConnector(
    ['Email', 'Amount'],
    [
      { Email: ' C@x.com', Amount: '3' },
      { Email: 'a@x.com', Amount: '1' },
      { Email: 'B@x.com', Amount: '2' },
    ],
  );

describe('plan', () => {
  test('into an empty target, everything is a create, sorted by key', async () => {
    const p = await plan({ spec: spec(), source: source(), target: fakeConnector([], [], { exists: false }) });
    assert.deepEqual(p.summary, { create: 3, update: 0, delete: 0, unchanged: 0 });
    assert.deepEqual(
      p.changes.map((c) => c.key[0]),
      ['a@x.com', 'b@x.com', 'c@x.com'],
    );
  });

  test('detects updates field by field, and leaves missing rows alone by default', async () => {
    const target = fakeConnector(
      ['email', 'amount'],
      [
        { email: 'a@x.com', amount: 1 },
        { email: 'b@x.com', amount: 20 },
        { email: 'z@x.com', amount: 9 },
      ],
    );
    const p = await plan({ spec: spec(), source: source(), target });
    assert.deepEqual(p.summary, { create: 1, update: 1, delete: 0, unchanged: 1 });
    const update = p.changes.find((c) => c.op === 'update');
    assert.deepEqual(update.fields, ['amount']);
    assert.equal(update.before.amount, 20);
    assert.equal(update.after.amount, 2);
  });

  test('onMissing "delete" removes target rows absent from the source', async () => {
    const target = fakeConnector(['email', 'amount'], [{ email: 'z@x.com', amount: 9 }]);
    const p = await plan({ spec: spec({ onMissing: 'delete' }), source: source(), target });
    assert.deepEqual(
      p.changes.filter((c) => c.op === 'delete').map((c) => c.key),
      [['z@x.com']],
    );
  });

  test('planId is independent of source row order and changes with content', async () => {
    const empty = () => fakeConnector([], [], { exists: false });
    const a = await plan({ spec: spec(), source: source(), target: empty() });
    const reordered = source();
    reordered.state.rows.reverse();
    const b = await plan({ spec: spec(), source: reordered, target: empty() });
    assert.equal(a.planId, b.planId);

    const edited = source();
    edited.state.rows[0].values.Amount = '4';
    const c = await plan({ spec: spec(), source: edited, target: empty() });
    assert.notEqual(a.planId, c.planId);
  });
});

describe('apply', () => {
  test('writes sorted rows, then a second apply is a no-op', async () => {
    const target = fakeConnector([], [], { exists: false });
    const first = await apply({ spec: spec(), source: source(), target });
    assert.equal(first.written, true);
    assert.deepEqual(target.state.writes[0].rows, [
      { email: 'a@x.com', amount: 1 },
      { email: 'b@x.com', amount: 2 },
      { email: 'c@x.com', amount: 3 },
    ]);

    const second = await apply({ spec: spec(), source: source(), target });
    assert.equal(second.written, false);
    assert.equal(second.changes.length, 0);
    assert.equal(target.state.writes.length, 1);
  });

  test('preserves columns the spec does not manage', async () => {
    const target = fakeConnector(
      ['notes', 'email', 'amount'],
      [{ notes: 'keep me', email: 'a@x.com', amount: 100 }],
    );
    await apply({ spec: spec(), source: source(), target });
    const { columns, rows } = target.state.writes[0];
    assert.deepEqual(columns, ['email', 'amount', 'notes']);
    assert.deepEqual(rows[0], { email: 'a@x.com', amount: 1, notes: 'keep me' });
    assert.equal(rows[1].notes, null);
  });

  test('refuses to write when there are validation errors', async () => {
    const bad = source();
    bad.state.rows[1].values.Amount = 'lots';
    const target = fakeConnector([], [], { exists: false });
    await assert.rejects(apply({ spec: spec(), source: bad, target }), (err) => {
      assert.ok(err instanceof PlanError);
      assert.match(err.plan.errors[0].message, /"lots" is not a number/);
      return true;
    });
    assert.equal(target.state.writes.length, 0);
  });

  test('refuses to write when the plan differs from the expected one', async () => {
    const target = fakeConnector([], [], { exists: false });
    const reviewed = await plan({ spec: spec(), source: source(), target });
    await assert.rejects(apply({ spec: spec(), source: source(), target, expect: 'deadbeef0000' }), /plan changed/);
    assert.equal(target.state.writes.length, 0);
    const ok = await apply({ spec: spec(), source: source(), target, expect: reviewed.planId });
    assert.equal(ok.written, true);
  });
});
