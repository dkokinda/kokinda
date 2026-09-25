import { createSpreadsheetConnector } from './spreadsheet.js';

// Every connector exposes the same two calls, which is all the sync engine
// relies on:
//   read()  -> { exists, columns: string[], rows: [{ line, values }] }
//   write({ columns, rows: object[], types }) -> replaces the stored rows
// Adding a system means adding a factory here; nothing else changes.
export const connectors = {
  spreadsheet: createSpreadsheetConnector,
};

export function createConnector(endpoint, options) {
  const factory = connectors[endpoint.type];
  if (!factory) {
    throw new Error(`Unknown connector type "${endpoint.type}"; available: ${Object.keys(connectors).join(', ')}`);
  }
  return factory(endpoint, options);
}
