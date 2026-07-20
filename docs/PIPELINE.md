# Merge pipeline

## How Adobe's InDesign data merge actually works

InDesign's data merge is CSV-driven, not JSON-driven:

1. **`export_idml`** — export the source `.indd` template to IDML so its text/image
   frames can be inspected.
2. **`generate_indd_mapping_prompt`** — given the IDML (or frame analysis) and a sample
   CSV, produces structured guidance for mapping CSV columns to template frames.
3. **`prepare_indd_merge_template`** — applies a confirmed mapping to the `.indd`,
   inserting merge placeholders (`@column_name`) at the right frames. Returns an updated
   `.indd` ready for merge.
4. **`document_merge_data_layout`** — batch-merges CSV rows into the prepared template,
   producing one output document per row (or repeating records per page, depending on
   the template's data merge layout), exported as PDF / PNG / JPEG / INDD.

All of the above require **presigned/public HTTPS URLs** for inputs — not local file
paths — so templates and CSVs need to be uploaded/hosted somewhere reachable first.

## Why the schemas in this repo are JSON, not CSV

The canonical data (`schemas/*.schema.json`, `data/examples/*.example.json`) is kept as
structured JSON because that's the natural shape of the source data (nested sections,
line items, packages) and the eventual real data source (JSON/API from a PMS or CMS).

Each collateral type needs a **flatten step** turning that JSON into the flat CSV rows
InDesign's merge actually consumes:

| Collateral | Merge shape |
|---|---|
| Event/promo flyer | Single record — one JSON object flattens to exactly one CSV row, one output document. |
| Rate/room-type sheet | One row per `room_types[]` entry (+ optional rows for `packages[]`), merged as repeating records on one page. |
| Restaurant/room-service menu | One row per item across all `sections[].items[]`, with a `section_heading` column, merged as repeating records on one page. |
| In-room directory | One row per entry across all `sections[].entries[]`, with a `section_heading` column, merged as repeating records on one page. |

The flatten script isn't written yet — the exact CSV column names must match whatever
frame-mapping comes out of step 2/3 above, which is template-specific. Writing it before
seeing a real template's frame names would just mean rewriting it once we do.

## What's needed to run this end-to-end

1. An INDD template (or IDML export of one) for at least one collateral type, uploaded
   into the session or hosted at a reachable HTTPS URL.
2. Real or representative data for that collateral type (the `data/examples/` files
   stand in for now).
3. Run steps 1-4 above; commit the flatten script for that collateral type once the
   frame mapping is known.

## Status

- [x] JSON schemas for all four collateral types (`schemas/`)
- [x] Example/placeholder data (`data/examples/`)
- [ ] Template uploaded and frame-mapped
- [ ] Flatten-to-CSV script(s)
- [ ] End-to-end merge run (PDF + INDD output)
