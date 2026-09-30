'use strict';
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/dom',
  projects: [{ name: 'webkit', use: { browserName: 'webkit' } }],
});
