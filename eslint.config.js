'use strict';

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'xcode/**',
      'fixtures/**',
      'results/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    files: ['extension/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        globalThis: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        browser: 'readonly',
      },
    },
    rules: { 'no-var': 'error', 'prefer-const': 'error' },
  },
  {
    files: ['**/*.js'],
    ignores: ['extension/**'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
  },
];
