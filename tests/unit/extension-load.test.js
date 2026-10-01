'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// document / navigator / browser 접근 시 throw하고 횟수를 센다.
function loadAll() {
  const ctx = vm.createContext({});
  const hits = { count: 0 };
  for (const name of ['document', 'navigator', 'browser']) {
    Object.defineProperty(ctx, name, {
      configurable: true,
      get() {
        hits.count += 1;
        throw new Error(name + ' 접근');
      },
    });
  }
  for (const f of manifest.content_scripts[0].js) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  return { ctx, hits };
}

test('로드 시 document/navigator.gpu/browser 접근 없음, 네임스페이스 키 존재', async () => {
  const { ctx, hits } = loadAll();
  assert.strictEqual(hits.count, 0);
  const keys = Object.keys(ctx.__sdrhdr).sort();
  assert.deepStrictEqual(keys, ['detect', 'hud', 'itm', 'main', 'overlay', 'params', 'renderer']);
  // main.start는 마이크로태스크로 미뤄지며 실패해도 예외를 밖으로 내지 않는다.
  await new Promise((r) => setImmediate(r));
});

test('전역은 __sdrhdr 하나만 추가된다', () => {
  const { ctx } = loadAll();
  const own = Object.getOwnPropertyNames(ctx).filter(
    (k) => !['document', 'navigator', 'browser'].includes(k),
  );
  assert.deepStrictEqual(
    own.filter((k) => k.startsWith('__')),
    ['__sdrhdr'],
  );
});
