const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const geocoding = require('../services/geocodingService');

test('geocoding providers terminate a request that never connects', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(https, 'get', () => {
    const request = new EventEmitter();
    request.destroy = error => { request.emit('error', error); request.emit('close'); };
    return request;
  });
  for (const method of ['geocodeWithNominatim', 'geocodeWithMapbox']) {
    const pending = assert.rejects(geocoding[method]('Sevilla'), /timeout/);
    t.mock.timers.tick(8000);
    await pending;
  }
});
