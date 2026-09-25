import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { loadSpec } from './spec.js';
import { createConnector } from './connectors/index.js';
import { plan, apply, publicPlan, PlanError } from './sync.js';

const USAGE = `Usage:
  connector plan  [spec.json] [--json]
  connector apply [spec.json] [--json] [--expect <planId>]

spec.json defaults to CONNECTOR_SPEC (${config.specPath}).`;

function parseArgs(argv) {
  const args = { positional: [], json: false, expect: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--expect') {
      // A missing value must not silently disable the check it asks for.
      args.expect = argv[++i];
      if (!args.expect || args.expect.startsWith('-')) throw new Error('--expect needs a planId');
    }
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.positional.push(a);
  }
  return args;
}

const fmt = (v) => (v === null ? '∅' : JSON.stringify(v));

export function renderPlan(p) {
  const lines = [];
  const { create, update, unchanged } = p.summary;
  lines.push(`Plan ${p.planId}: ${create} to create, ${update} to update, ${p.summary.delete} to delete, ${unchanged} unchanged`);
  for (const c of p.changes) {
    const key = c.key.map(fmt).join(', ');
    if (c.op === 'create') lines.push(`  + ${key}`);
    if (c.op === 'delete') lines.push(`  - ${key}`);
    if (c.op === 'update') {
      lines.push(`  ~ ${key}`);
      for (const f of c.fields) lines.push(`      ${f}: ${fmt(c.before[f])} → ${fmt(c.after[f])}`);
    }
  }
  if (p.errors.length) {
    lines.push(`${p.errors.length} error(s):`);
    for (const e of p.errors) lines.push(`  ! ${e.where}${e.field ? ` (${e.field})` : ''}: ${e.message}`);
  }
  return lines.join('\n');
}

// Exit codes: 0 success, 1 failure, 2 usage error. Returns the code instead
// of exiting so tests can drive it.
export async function run(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    stderr.write(`${err.message}\n${USAGE}\n`);
    return 2;
  }
  const [command, specPath = config.specPath] = args.positional;
  if (args.help || !['plan', 'apply'].includes(command)) {
    (args.help ? stdout : stderr).write(`${USAGE}\n`);
    return args.help ? 0 : 2;
  }

  const print = (p, extra = {}) =>
    stdout.write(args.json ? `${JSON.stringify({ ...publicPlan(p), ...extra }, null, 2)}\n` : `${renderPlan(p)}\n`);

  try {
    const { spec, baseDir } = await loadSpec(specPath);
    const source = createConnector(spec.source, { baseDir });
    const target = createConnector(spec.target, { baseDir });

    if (command === 'plan') {
      const p = await plan({ spec, source, target });
      print(p);
      return p.errors.length ? 1 : 0;
    }
    const result = await apply({ spec, source, target, expect: args.expect });
    print(result, { written: result.written });
    if (!args.json) stdout.write(result.written ? `Applied to ${target.describe()}\n` : 'Nothing to do.\n');
    return 0;
  } catch (err) {
    if (err instanceof PlanError) print(err.plan);
    stderr.write(`error: ${err.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
