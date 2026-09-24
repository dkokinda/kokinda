import dotenv from 'dotenv';

// quiet: dotenv otherwise prints a banner to stdout, which would corrupt
// `--json` output piped into another tool.
dotenv.config({ quiet: true });

export const config = {
  // Spec used when the CLI is not given one explicitly.
  specPath: process.env.CONNECTOR_SPEC ?? 'connector.json',
};
