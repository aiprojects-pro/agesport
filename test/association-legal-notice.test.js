const { test } = require('node:test');
const assert = require('node:assert/strict');
const notice = require('../services/associationLegalNotice');
test('legal notice preserves an HTML document and explicit plain-text message', () => {
  const result = notice.append(
    '<html><body><a href="https://example.invalid/reset?t=abc">Restablecer</a></body></html>',
    'Restablecer: https://example.invalid/reset?t=abc'
  );
  assert.ok(result.html.indexOf('data-agesport-legal-notice') < result.html.indexOf('</body>'));
  assert.match(result.html, /https:\/\/example.invalid\/reset\?t=abc/);
  assert.match(result.html, /mailto:agesport@agesport.org/);
  assert.match(result.text, /Restablecer: https:\/\/example.invalid\/reset\?t=abc/);
  assert.match(result.text, /AVISO LEGAL|Aviso legal/);
  assert.match(result.text, /AGESPORT/);
  assert.ok(!result.text.includes('[indicar'));
});
test('fragments and repeated decoration produce exactly one notice in both formats', () => {
  const once = notice.append('<p>Invitación</p>', 'Invitación');
  assert.deepEqual(notice.append(once.html, once.text), once);
  assert.equal(once.html.split('data-agesport-legal-notice').length - 1, 1);
  assert.equal(once.text.split('Este mensaje y sus archivos adjuntos').length - 1, 1);
});
