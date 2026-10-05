const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../public/assets/password-policy');
const format = require('../public/assets/policy-format');
test('shared password policy accepts all advertised ASCII symbols including period without truncation', () => {
  for (let n = 33; n <= 126; n++)
    assert.equal(policy.error('Seguro123' + String.fromCharCode(n)), null, String.fromCharCode(n));
  for (const bad of [
    'short',
    'onlyletters',
    'ONLY123456',
    'lowercase123',
    'SinDigito!',
    'Espacio 123',
    'Acentuáda123',
    'Ab1' + '.'.repeat(70),
  ])
    assert.ok(policy.error(bad), bad);
  assert.equal(policy.error('Ab1' + '.'.repeat(69)), null);
  const root = { document: { querySelectorAll: () => [] } };
  const sandbox = { window: root, document: root.document };
  vm.runInNewContext(
    fs.readFileSync(require.resolve('../public/assets/password-policy'), 'utf8'),
    sandbox
  );
  for (const v of ['Hola.123', 'Hola<123>', 'Espacio 123'])
    assert.equal(root.AgesportPassword.error(v), policy.error(v));
});
test('policy formatter escapes HTML and only emits safe links, headings and lists', () => {
  const html = format.render(
    '# Título\n- uno\n- dos\n[ver](https://example.invalid)\n[mal](javascript:alert(1))\n<img src=x onerror=alert(1)>'
  );
  assert.match(html, /<h2>Título<\/h2>/);
  assert.match(html, /<ul>\n<li>uno<\/li>/);
  assert.match(html, /href="https:\/\/example.invalid"/);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<script'));
});
