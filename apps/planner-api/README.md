# planner-api

A small REST API over **Microsoft Planner**, built directly on Microsoft Graph.

Graph exposes Planner, but awkwardly: assignments and checklists are keyed maps
rather than arrays, every update needs an `If-Match` etag you have to fetch
first, and `PATCH` returns an empty `204` unless you ask for the object back.
This service hides all of that behind ordinary REST.

## Account requirements — read this first

**Planner requires a work or school account.** It is a Microsoft 365 Groups
feature and is not available to personal Microsoft accounts, so
`d.kokinda@outlook.com` cannot be used here — Graph has no `/me/planner` for
consumer accounts and will return `403`. Use `derek@derekandthomas.com`.

If you want a tracker backed by the *personal* account instead, the equivalent
consumer-side API is Microsoft To Do (`/me/todo/lists`), which is a different
surface and is not implemented here.

## Setup

1. **Register an app** — [portal.azure.com](https://portal.azure.com) →
   Microsoft Entra ID → App registrations → New registration.
   - Supported account types: *Accounts in any organizational directory*.
   - Under **Authentication**, enable *Allow public client flows* (device code
     needs it).
2. **Add permissions** — API permissions → Microsoft Graph → Delegated:
   `User.Read`, `Tasks.ReadWrite`, `Group.Read.All`.
3. **Configure** — `cp .env.example .env`, set `GRAPH_CLIENT_ID` and
   `GRAPH_TENANT_ID` (your tenant GUID, or `organizations`).
4. **Sign in once**:
   ```bash
   npm install
   npm run login     # prints a code to enter at microsoft.com/devicelogin
   npm start
   ```

The refresh token is cached at `GRAPH_TOKEN_CACHE_PATH` (default `.tokens.json`,
gitignored, written `0600`), so the service runs unattended after that single
sign-in. Entra rotates refresh tokens on every use and the new one is persisted
automatically.

### App-only mode

For a scheduled job with no user, set `GRAPH_AUTH_MODE=client_credentials` plus
`GRAPH_CLIENT_SECRET`, and grant the **application** permission
`Tasks.ReadWrite.All` with tenant admin consent. Note that app-only tokens have
no "me", so `GET /api/plans` and `GET /api/tasks` require a `groupId` or an
explicit plan id instead. If app-only returns `403` on Planner endpoints, fall
back to `device_code` — Planner's application-permission support is narrower
than its delegated support.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | No Graph call |
| `GET` | `/me` | Confirms which identity the token carries |
| `GET` | `/api/plans` | Signed-in user's plans; `?groupId=` scopes to a group |
| `GET` | `/api/plans/:planId` | |
| `GET` | `/api/plans/:planId/buckets` | |
| `GET` | `/api/plans/:planId/tasks` | |
| `GET` | `/api/tasks` | Tasks assigned to the signed-in user |
| `POST` | `/api/tasks` | Create; takes `assignedTo: [userId]` |
| `GET` | `/api/tasks/:taskId` | |
| `GET` | `/api/tasks/:taskId/details` | Description + checklist |
| `PATCH` | `/api/tasks/:taskId` | Etag fetched automatically |
| `PATCH` | `/api/tasks/:taskId/details` | Takes `checklist: [{title, isChecked}]` |
| `DELETE` | `/api/tasks/:taskId` | Optional `If-Match` header |

All list endpoints follow `@odata.nextLink`, so you get every page.

### Examples

```bash
curl localhost:3100/api/plans

curl -X POST localhost:3100/api/tasks \
  -H 'content-type: application/json' \
  -d '{"planId":"PLAN_ID","title":"Chase Shari reply","dueDateTime":"2026-08-15T17:00:00Z"}'

curl -X PATCH localhost:3100/api/tasks/TASK_ID \
  -H 'content-type: application/json' \
  -d '{"percentComplete":100}'
```

Pass `etag` in a PATCH body (or `If-Match` on DELETE) to skip the extra read and
make the write fail loudly on a conflict instead of clobbering a concurrent
edit. Without it the service reads the current etag immediately before writing,
which is convenient but last-write-wins.

## Errors

Graph failures are passed through with their upstream status, so `412` means
someone else changed the task first and `403` almost always means a missing
scope or unconsented permission.

## Tests

```bash
npm test
```

No network: the identity endpoint and Graph are both stubbed.
