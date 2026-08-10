# kokinda

An Express service that wraps Adobe's InDesign API (Firefly Services) to
provide three document-automation pipelines:

- **Generate** — render a single document (PDF/JPEG/PNG/INDD) from an
  InDesign template, optionally filling merge fields with static values.
- **Convert** — turn a PDF into an editable INDD file.
- **Merge** — bulk data merge: one InDesign template + a CSV/JSON dataset →
  N rendered documents (Adobe's layout- or vector-based merge engine).

All three operations are asynchronous on Adobe's side. The service submits
the job, hands back a local job id immediately (`202 Accepted`), and polls
Adobe in the background; poll `GET /api/jobs/:id` for status/result.

## Setup

```bash
npm install
cp .env.example .env   # fill in ADOBE_CLIENT_ID / ADOBE_CLIENT_SECRET / ADOBE_ORG_ID
npm start               # or `npm run dev` for --watch
```

Credentials come from an Adobe Developer Console project with **InDesign
API (Firefly Services)** added, using **OAuth Server-to-Server**
credentials. See
[Authentication and Authorization for InDesign API](https://developer.adobe.com/firefly-services/docs/indesign-apis/getting-started/).

> **Note on operation paths:** Adobe's InDesign API exposes
> capability-bundle-scoped routes that can vary by Developer Console
> project/API version. The defaults in `.env.example`
> (`/v3/create-rendition`, `/v3/merge-data-tags`, `/v3/merge-data`,
> `/v3/convert-pdf-to-indd`, `/v3/status`) match the published API
> reference; verify them against your project's reference and override via
> the `ADOBE_OP_*` env vars if they differ.

## API

Every input file (template, PDF, dataset, fonts) is referenced by URL —
Adobe's API fetches it directly, so files must be reachable over HTTPS
(e.g. a presigned S3/Azure URL).

### `POST /api/templates/generate`

```json
{
  "templateUrl": "https://.../template.indt",
  "fields": { "firstName": "Ada", "orderTotal": "42.00" },
  "format": "pdf",
  "fonts": ["https://.../custom-font.ttf"]
}
```

→ `202 { "jobId": "...", "statusUrl": "/api/jobs/..." }`

### `POST /api/convert/pdf-to-indd`

```json
{ "pdfUrl": "https://.../source.pdf" }
```

→ `202 { "jobId": "...", "statusUrl": "/api/jobs/..." }`

### `POST /api/merge`

```json
{
  "templateUrl": "https://.../template.indt",
  "dataUrl": "https://.../records.csv",
  "mode": "layout",
  "format": "pdf"
}
```

`mode` is `"layout"` or `"vector"`, matching Adobe's two data-merge
engines. → `202 { "jobId": "...", "statusUrl": "/api/jobs/..." }`

### `POST /api/merge/tags`

Lists the merge fields (`{{firstName}}`, `{{orderTotal}}`, ...) present in
a template, so you can validate/build a dataset up front.

```json
{ "templateUrl": "https://.../template.indt" }
```

→ `200 { "tags": [...] }` (synchronous, no job)

### `GET /api/jobs/:id`

```json
{
  "id": "...",
  "kind": "generate | convert | merge",
  "status": "pending | succeeded | failed",
  "result": { "...": "Adobe's job payload once succeeded" },
  "error": "message, if failed"
}
```

Job state is kept in-memory per process — fine for a single instance;
swap `src/lib/jobStore.js` for a persistent store to scale horizontally or
survive restarts.

## Testing

```bash
npm test
```

Unit and route tests run against a mocked `fetch`, so no live Adobe
credentials are needed.
