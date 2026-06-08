const { test } = require('node:test');
const assert = require('node:assert');

test('smoke: node test runner wired up', () => {
  assert.strictEqual(1 + 1, 2);
});
