import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export const TYPES = ['string', 'integer', 'number', 'boolean', 'date', 'datetime'];
export const TRANSFORMS = ['trim', 'lower', 'upper', 'collapseWhitespace', 'stripCommas'];

const endpoint = z.looseObject({ type: z.string() });

const field = z.strictObject({
  from: z.string().min(1).optional(),
  type: z.enum(TYPES).default('string'),
  transform: z.array(z.enum(TRANSFORMS)).default([]),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  enum: z.array(z.string()).optional(),
  // Only for type "date": how to read text cells, e.g. "MM/DD/YYYY".
  format: z.string().optional(),
});

export const specSchema = z
  .strictObject({
    source: endpoint,
    target: endpoint,
    key: z.array(z.string()).min(1),
    fields: z.record(z.string(), field),
    onMissing: z.enum(['keep', 'delete']).default('keep'),
  })
  .superRefine((spec, ctx) => {
    for (const k of spec.key) {
      if (!(k in spec.fields)) {
        ctx.addIssue({ code: 'custom', path: ['key'], message: `key field "${k}" is not defined in fields` });
      }
    }
  });

// Parses and normalizes a spec. Every field gets an explicit `from`, and key
// fields are forced to required, so downstream code has no implicit rules.
export function parseSpec(raw) {
  const result = specSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid connector spec:\n${detail}`);
  }
  const spec = result.data;
  for (const [name, f] of Object.entries(spec.fields)) {
    f.from ??= name;
    if (spec.key.includes(name)) f.required = true;
  }
  return spec;
}

// Relative paths in the spec resolve against the spec file's directory, not
// the working directory, so a spec behaves the same wherever it is run from.
export async function loadSpec(specPath) {
  const text = await readFile(specPath, 'utf8');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new Error(`${specPath} is not valid JSON: ${err.message}`);
  }
  return { spec: parseSpec(raw), baseDir: path.dirname(path.resolve(specPath)) };
}
