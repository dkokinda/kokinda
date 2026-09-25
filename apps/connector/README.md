# connector

A deterministic, spec-driven sync between systems. You describe the mapping
once in a JSON spec; the connector reads the source, shows you exactly what it
would change in the target (`plan`), and changes exactly that (`apply`). No
model or heuristic runs at sync time: the same inputs always produce the same
plan, byte for byte, and applying it twice changes nothing the second time.

The first connector is **spreadsheets**: CSV, TSV and XLSX, as source or
target, in any combination.

## Quick start

```bash
npm install
cd example
node ../src/cli.js plan     # what would change
node ../src/cli.js apply    # write example/out/customers.xlsx
node ../src/cli.js plan     # 0 to create, 0 to update, 3 unchanged
```

`example/customers.csv` is deliberately messy: padded, mixed-case emails,
`"1,200"` seat counts, US-style dates, blank rows. `example/connector.json`
shows how the spec cleans each of those up.

## Commands

```bash
npm run plan  -- [spec.json] [--json]
npm run apply -- [spec.json] [--json] [--expect <planId>]
```

The spec defaults to `CONNECTOR_SPEC` (see `.env.example`), else
`connector.json` in the current directory.

`plan` prints something like:

```
Plan 89a90c8d06e5: 0 to create, 1 to update, 0 to delete, 2 unchanged
  ~ "grace@example.com"
      seats: 12 → 15
```

The plan ID is a hash of the changes. To make sure what gets written is what
you reviewed, pass it back: `apply --expect 89a90c8d06e5` refuses to write if
either side has changed since then. `--json` prints the full plan for another
tool to consume.

Exit codes: `0` success, `1` validation errors or a refused apply, `2` bad
usage.

## The spec

```json
{
  "source": { "type": "spreadsheet", "path": "customers.csv" },
  "target": { "type": "spreadsheet", "path": "out/customers.xlsx", "sheet": "Customers" },
  "key": ["email"],
  "fields": {
    "email":    { "from": "Customer Email", "transform": ["trim", "lower"] },
    "seats":    { "from": "Seats", "type": "integer", "transform": ["stripCommas"] },
    "signedUp": { "from": "Signed Up", "type": "date", "format": "M/D/YYYY" },
    "active":   { "from": "Active", "type": "boolean", "default": false }
  },
  "onMissing": "keep"
}
```

| Key | Meaning |
| --- | --- |
| `source`, `target` | Endpoints; `type` picks the connector. Relative paths resolve against the spec file's directory. |
| `key` | Field(s) that identify a record. Key fields are always required, and a duplicate key is an error, never last-one-wins. |
| `fields` | Output field name → how to fill it. The target's columns are these names, in this order. |
| `onMissing` | `keep` (default) leaves target rows that are absent from the source alone; `delete` removes them. |

Each field takes:

| Option | Values |
| --- | --- |
| `from` | Source column header. Defaults to the field name. |
| `type` | `string` (default), `integer`, `number`, `boolean`, `date`, `datetime` |
| `transform` | Applied in order to text before typing: `trim`, `lower`, `upper`, `collapseWhitespace`, `stripCommas` |
| `required` | Empty is an error. |
| `default` | Used when the cell is empty. |
| `enum` | Allowed string values. |
| `format` | For `date` text: tokens `YYYY`, `MM`, `DD`, `M`, `D`; default `YYYY-MM-DD`. |

### Rules that keep it deterministic

- **Nothing ambiguous is guessed.** `"1,234"` is not a number unless you add
  `stripCommas`; `02/03/2026` is not a date unless you say which format; a
  `datetime` without a UTC offset is rejected rather than read as local time.
  Booleans accept only `true/false/yes/no/y/n/1/0`.
- **All errors are reported at once**, with the sheet row number and field,
  and `apply` refuses to write anything while any exist.
- **Output is sorted by key**, compared by value (numbers numerically,
  strings by code unit, never by locale), so row order in the source doesn't
  matter.
- **Dates normalize** to `YYYY-MM-DD`, datetimes to UTC ISO 8601.
- **No change, no write.** If the plan is empty the target file isn't touched.

### Spreadsheet endpoints

| Option | Meaning |
| --- | --- |
| `path` | `.csv`, `.tsv` or `.xlsx` |
| `format` | `csv` or `xlsx`, when the extension doesn't say |
| `sheet` | XLSX worksheet name; default the first sheet |
| `headerRow` | 1-based row holding the headers (default `1`). Rows above it are preserved on write. |
| `delimiter` | CSV delimiter (default `,`, or tab for `.tsv`) |

Reading: fully blank rows are skipped; blank header columns are ignored;
duplicate headers are an error. In XLSX, formulas contribute their cached
result, rich text is flattened, and a cell holding an Excel error (`#N/A`,
`#DIV/0!`) is reported with its address.

Writing: files are written to a temp file and renamed, so a crash never
leaves a half-written file. In an existing workbook only the target sheet
changes; other sheets are left alone. Target columns the spec doesn't
manage are carried over untouched, after the managed ones. A target whose
headers don't include the spec's fields is refused rather than overwritten.
CSV output uses LF line endings and quotes only where needed, so it is
byte-identical run to run.

## Adding a system

A connector is an object with two methods (see `src/connectors/index.js`):

```js
read()  // -> { exists, columns: string[], rows: [{ line, values }] }
write({ columns, rows, types })  // replace the stored rows
```

Register its factory in `connectors` and it works as a source or target, with
the same typing, diffing and plan/apply behavior.

## Tests

```bash
npm test
```

No network. Spreadsheet tests write real CSV and XLSX files into a temp
directory; the sync engine is also tested against in-memory fakes.
