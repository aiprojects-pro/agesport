const { test } = require('node:test');
const assert = require('node:assert');

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a-test-key-of-exactly-32-chars--';

const { encryptData, decryptData, filterSensitiveData } = require('../middleware/auth');

test('encryptData → decryptData roundtrip for phone numbers', () => {
  const phone = '+34 612 345 678';
  const encrypted = encryptData(phone);
  assert.ok(encrypted.includes(':'), 'encrypted format is "ivHex:cipherHex"');
  assert.notStrictEqual(encrypted, phone);
  assert.strictEqual(decryptData(encrypted), phone);
});

test('encryptData returns null for empty input', () => {
  assert.strictEqual(encryptData(null), null);
  assert.strictEqual(encryptData(''), null);
  assert.strictEqual(encryptData(undefined), null);
});

test('encryptData uses random IV per call (same input ≠ same cipher)', () => {
  const a = encryptData('600 000 000');
  const b = encryptData('600 000 000');
  assert.notStrictEqual(a, b);
  assert.strictEqual(decryptData(a), '600 000 000');
  assert.strictEqual(decryptData(b), '600 000 000');
});

test('filterSensitiveData: owner sees telefono, never sees telefono_encrypted', () => {
  const socio = {
    id: 1,
    telefono: '600 000 000',
    telefono_encrypted: 'iv:cipher',
    visible_telefono: false,
  };
  const result = filterSensitiveData(socio, true, false);
  assert.strictEqual(result.telefono, '600 000 000');
  assert.strictEqual(result.telefono_encrypted, undefined);
});

test('filterSensitiveData: admin sees telefono, never sees telefono_encrypted', () => {
  const socio = {
    id: 1,
    telefono: '600 000 000',
    telefono_encrypted: 'iv:cipher',
    visible_telefono: false,
  };
  const result = filterSensitiveData(socio, false, true);
  assert.strictEqual(result.telefono, '600 000 000');
  assert.strictEqual(result.telefono_encrypted, undefined);
});

test('filterSensitiveData: other socio with visible_telefono=true sees telefono', () => {
  const socio = {
    id: 1,
    telefono: '600 000 000',
    telefono_encrypted: 'iv:cipher',
    visible_telefono: true,
    visible_email_directo: false,
    visible_web_profesional: false,
    visible_linkedin: false,
    visible_direccion_completa: false,
  };
  const result = filterSensitiveData(socio, false, false);
  assert.strictEqual(result.telefono, '600 000 000');
  assert.strictEqual(result.telefono_encrypted, undefined);
});

test('filterSensitiveData: other socio with visible_telefono=false NO sees telefono', () => {
  const socio = {
    id: 1,
    telefono: '600 000 000',
    telefono_encrypted: 'iv:cipher',
    visible_telefono: false,
    visible_email_directo: false,
    visible_web_profesional: false,
    visible_linkedin: false,
    visible_direccion_completa: false,
  };
  const result = filterSensitiveData(socio, false, false);
  assert.strictEqual(result.telefono, undefined);
  assert.strictEqual(result.telefono_encrypted, undefined);
});

test('filterSensitiveData: other socio never sees dni_nie_encrypted nor email', () => {
  const socio = {
    id: 1,
    email: 'a@b.com',
    dni_nie_encrypted: 'iv:cipher',
    visible_telefono: true,
    visible_email_directo: true,
    visible_web_profesional: false,
    visible_linkedin: false,
    visible_direccion_completa: false,
  };
  const result = filterSensitiveData(socio, false, false);
  assert.strictEqual(result.dni_nie_encrypted, undefined);
  assert.strictEqual(result.email, undefined);
});
