# kokinda

A monorepo of small, independent Node.js services. There is no workspace
root package.json and no shared toolchain — each app under `apps/` is
installed, tested, and run on its own.

## Layout

| App | Module system | Node | What it does |
| --- | --- | --- | --- |
| `apps/imessage-bot` | CommonJS (`require`) | >=18 | Replies to incoming iMessages with per-chat responses from Claude, via a BlueBubbles server. |
| `apps/indesign-pipeline` | ESM (`"type": "module"`) | >=20 | Wraps Adobe's InDesign API (Firefly Services) for template generation, PDF-to-INDD conversion, and data merge/render. |

The two apps do not import from each other. Match the module system of
whichever app you are editing — mixing `require` and `import` within an app
will break it.

## Commands

Always run from inside the app directory:

```bash
cd apps/<app-name>
npm install
npm test     # node:test, no live credentials needed
npm start
```

`npm test` runs `node --test` over that app's `test/` directory. A single
file: `node --test test/<name>.test.js`. There is no linter or formatter
configured; `node --check <file>` is the only static check available.

In Claude Code on the web, `.claude/hooks/session-start.sh` has already run
`npm install` in both apps, so tests are ready without setup.

CI (`.github/workflows/ci.yml`) runs `npm ci && npm test` for each app on
every pull request and push to `main`, on Node 20 and 22. The app list is a
hardcoded matrix there — when adding an app under `apps/`, add it to the
matrix too.

## Configuration

Both apps read all environment variables in exactly one module — every
`process.env` access lives there, and the rest of the code takes values as
constructor arguments or imports the config object:

- `apps/imessage-bot/src/config.js`
- `apps/indesign-pipeline/src/config.js`

Adding a setting means touching three files in that app: `src/config.js`,
`.env.example` (with a comment explaining the value), and the README. Do
not reach for `process.env` elsewhere.

Each app's config module calls `dotenv` at import time, so a `.env` in the
app directory is picked up automatically. `.env` is gitignored; real
credentials never go in the repo. The `.env.example` files are the
documented list of supported variables.

## Tests

Tests use `node:test` with `assert/strict` and hand-written fakes — no
mocking library. External collaborators (the Anthropic client, the
BlueBubbles client, `fetch`) are injected through constructor options so
tests can pass a fake; keep that seam when adding code. HTTP routes are
exercised with `supertest` against the exported `createApp`.
