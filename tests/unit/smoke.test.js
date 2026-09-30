'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('smoke: node:test 동작', () => {
  assert.strictEqual(1 + 1, 2);
});
