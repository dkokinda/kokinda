import { readFile, writeFile, rename, rm, access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { parseCsv, formatCsv } from '../lib/csv.js';

// A table is { exists, columns: string[], rows: [{ line, values }] } where
// `line` is the 1-based spreadsheet row number, for error messages.

function formatOf(endpoint, file) {
  if (endpoint.format) return endpoint.format;
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv' || ext === '.tsv') return 'csv';
  if (ext === '.xlsx') return 'xlsx';
  throw new Error(`Cannot tell the format of ${file}; set "format": "csv" or "xlsx"`);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// Write to a sibling temp file and rename, so a crash mid-write never leaves
// a half-written spreadsheet behind.
async function atomically(file, writeTo) {
  const tmp = `${file}.tmp-${process.pid}`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeTo(tmp);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

function headerColumns(cells, where) {
  const columns = [];
  const indexes = [];
  cells.forEach((cell, i) => {
    const name = cell === null || cell === undefined ? '' : String(cell).trim();
    if (name === '') return;
    if (columns.includes(name)) throw new Error(`${where}: duplicate column header "${name}"`);
    columns.push(name);
    indexes.push(i);
  });
  return { columns, indexes };
}

function buildTable(records, headerRow, where) {
  const header = records[headerRow - 1];
  if (!header) return { exists: true, columns: [], rows: [] };
  const { columns, indexes } = headerColumns(header, where);
  const rows = [];
  for (let r = headerRow; r < records.length; r++) {
    const cells = records[r] ?? [];
    const values = {};
    let blank = true;
    columns.forEach((col, i) => {
      const v = cells[indexes[i]] ?? null;
      values[col] = v;
      if (v !== null && v !== '') blank = false;
    });
    // Fully blank rows are skipped: spreadsheets routinely carry them and they
    // never mean "a record with every field empty".
    if (!blank) rows.push({ line: r + 1, values });
  }
  return { exists: true, columns, rows };
}

// Reduces an ExcelJS cell value to a plain scalar or Date.
function cellValue(value, address) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('error' in value) throw new Error(`cell ${address} contains the error ${value.error}`);
  if ('result' in value) return cellValue(value.result, address);
  if ('formula' in value || 'sharedFormula' in value) {
    throw new Error(`cell ${address} has a formula with no cached result; open and save it in Excel first`);
  }
  if (Array.isArray(value.richText)) return value.richText.map((p) => p.text).join('');
  if ('text' in value) return cellValue(value.text, address);
  throw new Error(`cell ${address} has an unsupported value`);
}

export function createSpreadsheetConnector(endpoint, { baseDir = process.cwd() } = {}) {
  if (!endpoint.path) throw new Error('spreadsheet endpoint needs a "path"');
  const file = path.resolve(baseDir, endpoint.path);
  const format = formatOf(endpoint, file);
  const headerRow = endpoint.headerRow ?? 1;
  const delimiter = endpoint.delimiter ?? (path.extname(file).toLowerCase() === '.tsv' ? '\t' : ',');
  const where = endpoint.sheet ? `${file} [${endpoint.sheet}]` : file;

  async function loadWorkbook() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    return workbook;
  }

  function findSheet(workbook) {
    if (endpoint.sheet) return workbook.getWorksheet(endpoint.sheet);
    return workbook.worksheets[0];
  }

  return {
    describe: () => where,

    async read() {
      if (!(await exists(file))) return { exists: false, columns: [], rows: [] };
      if (format === 'csv') {
        return buildTable(parseCsv(await readFile(file, 'utf8'), { delimiter }), headerRow, where);
      }
      const sheet = findSheet(await loadWorkbook());
      // A missing sheet is like a missing file: nothing there yet.
      if (!sheet) return { exists: false, columns: [], rows: [] };
      const records = [];
      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cells = [];
        for (let c = 1; c <= sheet.columnCount; c++) {
          const cell = row.getCell(c);
          cells.push(cellValue(cell.value, cell.address));
        }
        records.push(cells);
      }
      return buildTable(records, headerRow, where);
    },

    // `types` maps column -> field type, so dates land as real Excel dates.
    async write({ columns, rows, types = {} }) {
      if (format === 'csv') {
        const above = headerRow > 1 && (await exists(file))
          ? parseCsv(await readFile(file, 'utf8'), { delimiter }).slice(0, headerRow - 1)
          : [];
        const body = [columns, ...rows.map((r) => columns.map((c) => r[c]))];
        const text = formatCsv([...above, ...body], { delimiter });
        await atomically(file, (tmp) => writeFile(tmp, text, 'utf8'));
        return;
      }

      // Existing workbooks are edited in place: other sheets, and any rows
      // above the header (titles, notes), are left untouched.
      const workbook = (await exists(file)) ? await loadWorkbook() : new ExcelJS.Workbook();
      let sheet = findSheet(workbook);
      if (sheet) {
        if (sheet.rowCount >= headerRow) sheet.spliceRows(headerRow, sheet.rowCount - headerRow + 1);
      } else {
        sheet = workbook.addWorksheet(endpoint.sheet ?? 'Sheet1');
      }
      const toCell = (col, v) => {
        if (v === null || v === undefined) return null;
        if (types[col] === 'date') return new Date(`${v}T00:00:00.000Z`);
        return v;
      };
      sheet.getRow(headerRow).values = columns;
      rows.forEach((r, i) => {
        sheet.getRow(headerRow + 1 + i).values = columns.map((c) => toCell(c, r[c]));
      });
      columns.forEach((col, i) => {
        if (types[col] === 'date') sheet.getColumn(i + 1).numFmt = 'yyyy-mm-dd';
      });
      await atomically(file, (tmp) => workbook.xlsx.writeFile(tmp));
    },
  };
}
