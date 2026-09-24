import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, formatCsv } from '../src/lib/csv.js';

describe('parseCsv', () => {
  test('handles quotes, escaped quotes, embedded delimiters and newlines', () => {
    const text = 'a,b,c\n"x, y","say ""hi""","line1\nline2"\n';
    assert.deepEqual(parseCsv(text), [
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line1\nline2'],
    ]);
  });

  test('accepts CRLF, strips a BOM, and tolerates a missing final newline', () => {
    assert.deepEqual(parseCsv('﻿a,b\r\n1,2'), [
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  test('keeps empty fields', () => {
    assert.deepEqual(parseCsv('a,,c\n'), [['a', '', 'c']]);
  });

  test('rejects an unterminated quote', () => {
    assert.throws(() => parseCsv('a,"b\n'), /quoted field/);
  });

  test('supports other delimiters', () => {
    assert.deepEqual(parseCsv('a\tb\n', { delimiter: '\t' }), [['a', 'b']]);
  });
});

describe('formatCsv', () => {
  test('quotes only when needed and ends with a newline', () => {
    const out = formatCsv([
      ['plain', 'has,comma', 'has "quote"', ' padded', null],
    ]);
    assert.equal(out, 'plain,"has,comma","has ""quote"""," padded",\n');
  });

  test('round-trips through parseCsv', () => {
    const records = [
      ['k', 'v'],
      ['1', 'multi\nline'],
      ['2', '"quoted"'],
    ];
    assert.deepEqual(parseCsv(formatCsv(records)), records);
  });
});
