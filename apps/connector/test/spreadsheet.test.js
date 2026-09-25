import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createSpreadsheetConnector } from '../src/connectors/spreadsheet.js';
import { plan, apply } from '../src/sync.js';
import { parseSpec } from '../src/spec.js';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'connector-'));
});

const spec = (source, target) =>
  parseSpec({
    source: { type: 'spreadsheet', ...source },
    target: { type: 'spreadsheet', ...target },
    key: ['id'],
    fields: {
      id: { from: 'ID', type: 'integer' },
      name: { from: 'Name', transform: ['collapseWhitespace'] },
      joined: { from: 'Joined', type: 'date' },
      active: { from: 'Active', type: 'boolean' },
    },
  });

const connectors = (s) => ({
  source: createSpreadsheetConnector(s.source, { baseDir: dir }),
  target: createSpreadsheetConnector(s.target, { baseDir: dir }),
});

describe('spreadsheet connector: CSV', () => {
  test('reads headers, skips blank rows, and reports 1-based line numbers', async () => {
    await writeFile(path.join(dir, 'in.csv'), 'ID,Name\n1,a\n,\n2,b\n');
    const table = await createSpreadsheetConnector({ path: 'in.csv' }, { baseDir: dir }).read();
    assert.deepEqual(table.columns, ['ID', 'Name']);
    assert.deepEqual(
      table.rows.map((r) => r.line),
      [2, 4],
    );
  });

  test('a missing file reads as not existing', async () => {
    const table = await createSpreadsheetConnector({ path: 'nope.csv' }, { baseDir: dir }).read();
    assert.equal(table.exists, false);
  });

  test('rejects duplicate headers', async () => {
    await writeFile(path.join(dir, 'in.csv'), 'ID,ID\n1,2\n');
    await assert.rejects(createSpreadsheetConnector({ path: 'in.csv' }, { baseDir: dir }).read(), /duplicate column header "ID"/);
  });

  test('CSV to CSV output is byte-identical across runs and source orderings', async () => {
    await writeFile(path.join(dir, 'a.csv'), 'ID,Name,Joined,Active\n2,Bo   B,2026-01-02,no\n1,Al,2026-01-01,yes\n');
    await writeFile(path.join(dir, 'b.csv'), 'ID,Name,Joined,Active\n1,Al,2026-01-01,yes\n2,Bo   B,2026-01-02,no\n');
    const sa = spec({ path: 'a.csv' }, { path: 'out-a.csv' });
    const sb = spec({ path: 'b.csv' }, { path: 'out-b.csv' });
    await apply({ spec: sa, ...connectors(sa) });
    await apply({ spec: sb, ...connectors(sb) });
    const a = await readFile(path.join(dir, 'out-a.csv'), 'utf8');
    assert.equal(a, 'id,name,joined,active\n1,Al,2026-01-01,true\n2,Bo B,2026-01-02,false\n');
    assert.equal(await readFile(path.join(dir, 'out-b.csv'), 'utf8'), a);
  });

  test('creates missing parent directories for the target', async () => {
    await writeFile(path.join(dir, 'in.csv'), 'ID,Name,Joined,Active\n1,Al,2026-01-01,yes\n');
    const s = spec({ path: 'in.csv' }, { path: 'nested/deeper/out.csv' });
    const result = await apply({ spec: s, ...connectors(s) });
    assert.equal(result.written, true);
    await readFile(path.join(dir, 'nested/deeper/out.csv'), 'utf8');
  });

  test('a new CSV target with headerRow > 1 puts the header on that row and converges', async () => {
    await writeFile(path.join(dir, 'in.csv'), 'ID,Name,Joined,Active\n1,Al,2026-01-01,yes\n');
    const s = spec({ path: 'in.csv' }, { path: 'out.csv', headerRow: 3 });
    await apply({ spec: s, ...connectors(s) });
    assert.equal(await readFile(path.join(dir, 'out.csv'), 'utf8'), '\n\nid,name,joined,active\n1,Al,2026-01-01,true\n');
    const again = await plan({ spec: s, ...connectors(s) });
    assert.deepEqual(again.errors, []);
    assert.deepEqual(again.summary, { create: 0, update: 0, delete: 0, unchanged: 1 });
  });

  test('keeps lines above a header row that is not row 1', async () => {
    await writeFile(path.join(dir, 'in.csv'), 'ID,Name,Joined,Active\n1,Al,2026-01-01,yes\n');
    await writeFile(path.join(dir, 'out.csv'), 'Exported by finance\nid,name,joined,active\n');
    const s = spec({ path: 'in.csv' }, { path: 'out.csv', headerRow: 2 });
    await apply({ spec: s, ...connectors(s) });
    assert.equal(
      await readFile(path.join(dir, 'out.csv'), 'utf8'),
      'Exported by finance\nid,name,joined,active\n1,Al,2026-01-01,true\n',
    );
  });
});

describe('spreadsheet connector: XLSX', () => {
  async function writeSourceWorkbook(file) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('People');
    ws.addRow(['ID', 'Name', 'Joined', 'Active']);
    ws.addRow([2, { richText: [{ text: 'Bo ' }, { text: 'B' }] }, new Date(Date.UTC(2026, 0, 2)), false]);
    ws.addRow([{ formula: '0+1', result: 1 }, 'Al', '2026-01-01', 'yes']);
    await wb.xlsx.writeFile(file);
  }

  test('reads rich text, formula results and native dates', async () => {
    await writeSourceWorkbook(path.join(dir, 'in.xlsx'));
    const s = spec({ path: 'in.xlsx', sheet: 'People' }, { path: 'out.csv' });
    const p = await plan({ spec: s, ...connectors(s) });
    assert.deepEqual(p.errors, []);
    assert.deepEqual(
      p.changes.map((c) => c.after),
      [
        { id: 1, name: 'Al', joined: '2026-01-01', active: true },
        { id: 2, name: 'Bo B', joined: '2026-01-02', active: false },
      ],
    );
  });

  test('reports cells holding Excel errors with their address', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.addRow(['ID']);
    ws.addRow([{ formula: '1/0', result: { error: '#DIV/0!' } }]);
    await wb.xlsx.writeFile(path.join(dir, 'err.xlsx'));
    await assert.rejects(createSpreadsheetConnector({ path: 'err.xlsx' }, { baseDir: dir }).read(), /cell A2 contains the error #DIV\/0!/);
  });

  test('writes into an existing workbook without touching other sheets, and converges', async () => {
    await writeSourceWorkbook(path.join(dir, 'in.xlsx'));
    const outFile = path.join(dir, 'out.xlsx');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Summary').addRow(['do not touch']);
    await wb.xlsx.writeFile(outFile);

    const s = spec({ path: 'in.xlsx', sheet: 'People' }, { path: 'out.xlsx', sheet: 'Data' });
    const first = await apply({ spec: s, ...connectors(s) });
    assert.equal(first.errors.length, 0);
    assert.equal(first.written, true);

    const after = new ExcelJS.Workbook();
    await after.xlsx.readFile(outFile);
    assert.deepEqual(
      after.worksheets.map((w) => w.name),
      ['Summary', 'Data'],
    );
    assert.equal(after.getWorksheet('Summary').getCell('A1').value, 'do not touch');
    const data = after.getWorksheet('Data');
    assert.deepEqual(data.getRow(1).values.slice(1), ['id', 'name', 'joined', 'active']);
    assert.ok(data.getCell('C2').value instanceof Date, 'dates are written as real Excel dates');

    const second = await plan({ spec: s, ...connectors(s) });
    assert.deepEqual(second.summary, { create: 0, update: 0, delete: 0, unchanged: 2 });
  });

  test('refuses to overwrite a sheet whose headers do not match the spec', async () => {
    await writeSourceWorkbook(path.join(dir, 'in.xlsx'));
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Data').addRow(['something', 'else']);
    await wb.xlsx.writeFile(path.join(dir, 'out.xlsx'));

    const s = spec({ path: 'in.xlsx', sheet: 'People' }, { path: 'out.xlsx', sheet: 'Data' });
    await assert.rejects(apply({ spec: s, ...connectors(s) }), /refusing to apply/);
    const after = new ExcelJS.Workbook();
    await after.xlsx.readFile(path.join(dir, 'out.xlsx'));
    assert.equal(after.getWorksheet('Data').getCell('A1').value, 'something');
  });
});
