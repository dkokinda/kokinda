import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from '../src/cli.js';

function sink() {
  const s = { text: '', write: (chunk) => (s.text += chunk) };
  return s;
}

async function cli(...argv) {
  const stdout = sink();
  const stderr = sink();
  const code = await run(argv, { stdout, stderr });
  return { code, out: stdout.text, err: stderr.text };
}

let dir;
let specPath;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'connector-cli-'));
  specPath = path.join(dir, 'connector.json');
  await writeFile(path.join(dir, 'in.csv'), 'SKU,Qty\nb-2,5\na-1,3\n');
  await writeFile(
    specPath,
    JSON.stringify({
      source: { type: 'spreadsheet', path: 'in.csv' },
      target: { type: 'spreadsheet', path: 'out.csv' },
      key: ['sku'],
      fields: { sku: { from: 'SKU' }, qty: { from: 'Qty', type: 'integer' } },
    }),
  );
});

describe('cli', () => {
  test('plan prints the changes and writes nothing', async () => {
    const { code, out } = await cli('plan', specPath);
    assert.equal(code, 0);
    assert.match(out, /^Plan [0-9a-f]{12}: 2 to create, 0 to update, 0 to delete, 0 unchanged/);
    assert.match(out, /\+ "a-1"\n {2}\+ "b-2"/);
    await assert.rejects(access(path.join(dir, 'out.csv')));
  });

  test('apply --expect with the reviewed planId writes; a rerun has nothing to do', async () => {
    const planned = JSON.parse((await cli('plan', specPath, '--json')).out);
    const applied = await cli('apply', specPath, '--expect', planned.planId);
    assert.equal(applied.code, 0);
    assert.match(applied.out, /Applied to/);
    assert.equal(await readFile(path.join(dir, 'out.csv'), 'utf8'), 'sku,qty\na-1,3\nb-2,5\n');

    const again = await cli('apply', specPath);
    assert.match(again.out, /0 to create, 0 to update, 0 to delete, 2 unchanged/);
    assert.match(again.out, /Nothing to do\./);
  });

  test('update output shows before and after', async () => {
    await cli('apply', specPath);
    await writeFile(path.join(dir, 'in.csv'), 'SKU,Qty\nb-2,6\na-1,3\n');
    const { out } = await cli('plan', specPath);
    assert.match(out, /~ "b-2"\n {6}qty: 5 → 6/);
  });

  test('validation errors exit 1 and say where', async () => {
    await writeFile(path.join(dir, 'in.csv'), 'SKU,Qty\nb-2,five\n');
    const { code, out, err } = await cli('apply', specPath);
    assert.equal(code, 1);
    assert.match(out, /! source .*in\.csv row 2 \(qty\): "five" is not a number/);
    assert.match(err, /refusing to apply/);
  });

  test('a mismatched --expect exits 1 without writing', async () => {
    const { code, err } = await cli('apply', specPath, '--expect', '000000000000');
    assert.equal(code, 1);
    assert.match(err, /plan changed since review/);
    await assert.rejects(access(path.join(dir, 'out.csv')));
  });

  test('bad usage exits 2', async () => {
    assert.equal((await cli('frobnicate')).code, 2);
    assert.equal((await cli('plan', '--nope')).code, 2);
  });
});
