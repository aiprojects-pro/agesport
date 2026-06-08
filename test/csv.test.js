const { test } = require('node:test');
const assert = require('node:assert');
const csv = require('../services/csv');

test('csv.parseLine: simple comma-separated', () => {
  assert.deepStrictEqual(csv.parseLine('a,b,c'), ['a', 'b', 'c']);
});

test('csv.parseLine: empty fields', () => {
  assert.deepStrictEqual(csv.parseLine('a,,c'), ['a', '', 'c']);
  assert.deepStrictEqual(csv.parseLine(',,'), ['', '', '']);
});

test('csv.parseLine: quoted field with comma', () => {
  assert.deepStrictEqual(csv.parseLine('a,"b,c",d'), ['a', 'b,c', 'd']);
});

test('csv.parseLine: escaped double-quote inside quoted field', () => {
  assert.deepStrictEqual(csv.parseLine('a,"b""c",d'), ['a', 'b"c', 'd']);
});

test('csv.parseLine: trailing empty field', () => {
  assert.deepStrictEqual(csv.parseLine('a,b,'), ['a', 'b', '']);
});

test('csv.escape: plain string passes through', () => {
  assert.strictEqual(csv.escape('hello'), 'hello');
});

test('csv.escape: null/undefined become empty', () => {
  assert.strictEqual(csv.escape(null), '');
  assert.strictEqual(csv.escape(undefined), '');
});

test('csv.escape: comma triggers quoting', () => {
  assert.strictEqual(csv.escape('a,b'), '"a,b"');
});

test('csv.escape: double-quote is escaped and field quoted', () => {
  assert.strictEqual(csv.escape('say "hi"'), '"say ""hi"""');
});

test('csv.escape: newline triggers quoting', () => {
  assert.strictEqual(csv.escape('a\nb'), '"a\nb"');
  assert.strictEqual(csv.escape('a\r\nb'), '"a\r\nb"');
});

test('csv: round trip — escape then parseLine', () => {
  const fields = ['plain', 'has,comma', 'has "quote"', 'multi\nline', null];
  const line = fields.map(csv.escape).join(',');
  const parsed = csv.parseLine(line);
  assert.deepStrictEqual(parsed, ['plain', 'has,comma', 'has "quote"', 'multi\nline', '']);
});
