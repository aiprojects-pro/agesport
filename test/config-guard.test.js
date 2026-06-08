const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const runConfig = (env) =>
  spawnSync(process.execPath, ['-e', "require('./config/config')"], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

const realSecrets = {
  JWT_SECRET: 'a-real-jwt-secret-of-many-chars-xx',
  ENCRYPTION_KEY: 'a-real-key-of-exactly-32-chars--',
  DB_PASSWORD: 'a-real-db-password',
};

test('config: refuses to load in production with default JWT_SECRET', () => {
  const res = runConfig({ NODE_ENV: 'production', ...realSecrets, JWT_SECRET: '' });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /JWT_SECRET/);
});

test('config: refuses to load in production with default ENCRYPTION_KEY', () => {
  const res = runConfig({ NODE_ENV: 'production', ...realSecrets, ENCRYPTION_KEY: '' });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /ENCRYPTION_KEY/);
});

test('config: refuses to load in production with default DB_PASSWORD', () => {
  const res = runConfig({ NODE_ENV: 'production', ...realSecrets, DB_PASSWORD: '' });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /DB_PASSWORD/);
});

test('config: reports every default in one go', () => {
  const res = runConfig({
    NODE_ENV: 'production',
    JWT_SECRET: '',
    ENCRYPTION_KEY: '',
    DB_PASSWORD: '',
  });
  assert.notStrictEqual(res.status, 0);
  assert.match(res.stderr, /JWT_SECRET, ENCRYPTION_KEY, DB_PASSWORD/);
});

test('config: loads in production with real secrets', () => {
  const res = runConfig({ NODE_ENV: 'production', ...realSecrets });
  assert.strictEqual(res.status, 0, res.stderr);
});

test('config: loads in development with defaults (no guard)', () => {
  const res = runConfig({
    NODE_ENV: 'development',
    JWT_SECRET: '',
    ENCRYPTION_KEY: '',
    DB_PASSWORD: '',
  });
  assert.strictEqual(res.status, 0, res.stderr);
});
