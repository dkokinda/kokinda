import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assetEntry, extensionFor } from '../src/lib/assets.js';

describe('extensionFor', () => {
  test('extracts the file extension, ignoring query strings', () => {
    assert.equal(extensionFor('https://example.com/foo/bar.indt?sig=abc'), '.indt');
    assert.equal(extensionFor('https://example.com/data.csv'), '.csv');
  });

  test('returns empty string when there is no extension', () => {
    assert.equal(extensionFor('https://example.com/foo/bar'), '');
  });
});

describe('assetEntry', () => {
  test('builds an EXTERNAL storage asset descriptor', () => {
    const entry = assetEntry('https://example.com/template.indt', 'template');
    assert.deepEqual(entry, {
      source: { url: 'https://example.com/template.indt', storageType: 'EXTERNAL' },
      destination: 'template.indt',
    });
  });
});
