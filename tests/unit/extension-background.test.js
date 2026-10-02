'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(
  path.join(__dirname, '..', '..', 'extension', 'content', 'background.js'),
  'utf8',
);

function setup({ action = true, enabled, reject = false } = {}) {
  const calls = { text: [], color: [], icon: [] };
  const wrap = (arr) => (a) => {
    arr.push(a);
    return reject ? Promise.reject(new Error('no tab')) : Promise.resolve();
  };
  const h = {};
  const browser = {
    runtime: { onMessage: { addListener: (f) => (h.msg = f) } },
    storage: {
      local: {
        get: async () => (enabled === undefined ? {} : { 'sdrhdr.enabled': enabled }),
      },
      onChanged: { addListener: (f) => (h.changed = f) },
    },
  };
  if (action) {
    browser.action = {
      setBadgeText: wrap(calls.text),
      setBadgeBackgroundColor: wrap(calls.color),
      setIcon: wrap(calls.icon),
    };
  }
  vm.runInNewContext(src, { browser });
  return { h, calls };
}

const tick = () => new Promise((r) => setImmediate(r));

test('background: state 메시지 -> 배지 텍스트·색', () => {
  const { h, calls } = setup();
  h.msg({ type: 'sdrhdr:state', badge: { text: 'HDR', color: '#888' } }, { tab: { id: 7 } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.text)), [{ tabId: 7, text: 'HDR' }]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls.color)), [{ tabId: 7, color: '#888' }]);
});

test('background: 4자 초과 자름, color 없으면 색 호출 없음, text 없으면 빈 문자열', () => {
  const { h, calls } = setup();
  h.msg({ type: 'sdrhdr:state', badge: { text: 'ABCDEFG' } }, { tab: { id: 1 } });
  assert.strictEqual(calls.text[0].text, 'ABCD');
  assert.strictEqual(calls.color.length, 0);
  h.msg({ type: 'sdrhdr:state', badge: {} }, { tab: { id: 1 } });
  assert.strictEqual(calls.text[1].text, '');
});

test('background: tab 없는 sender·다른 type·잘못된 입력 무시', () => {
  const { h, calls } = setup();
  h.msg({ type: 'sdrhdr:state', badge: { text: 'X' } }, {});
  h.msg({ type: 'sdrhdr:state', badge: { text: 'X' } }, { tab: {} });
  h.msg({ type: 'sdrhdr:state', badge: { text: 'X' } }, undefined);
  h.msg({ type: 'other', badge: { text: 'X' } }, { tab: { id: 1 } });
  h.msg(null, { tab: { id: 1 } });
  h.msg({ type: 'sdrhdr:state' }, { tab: { id: 1 } });
  assert.strictEqual(calls.text.length, 0);
});

test('background: 시작 시 enabled false -> off 아이콘, true/없음 -> on 아이콘', async () => {
  let r = setup({ enabled: false });
  await tick();
  assert.strictEqual(r.calls.icon[0].path[16], 'popup/icons/icon-off-16.png');
  assert.strictEqual(r.calls.icon[0].path[38], 'popup/icons/icon-off-38.png');
  r = setup({ enabled: true });
  await tick();
  assert.strictEqual(r.calls.icon[0].path[19], 'popup/icons/icon-19.png');
  r = setup();
  await tick();
  assert.strictEqual(r.calls.icon[0].path[32], 'popup/icons/icon-32.png');
});

test('background: storage.onChanged로 아이콘 전환, 다른 area·키 무시', () => {
  const { h, calls } = setup();
  h.changed({ 'sdrhdr.enabled': { newValue: false } }, 'local');
  assert.strictEqual(calls.icon.at(-1).path[16], 'popup/icons/icon-off-16.png');
  h.changed({ 'sdrhdr.enabled': { newValue: true } }, 'local');
  assert.strictEqual(calls.icon.at(-1).path[16], 'popup/icons/icon-16.png');
  const n = calls.icon.length;
  h.changed({ 'sdrhdr.enabled': { newValue: false } }, 'sync');
  h.changed({ 'sdrhdr.hud': { newValue: false } }, 'local');
  assert.strictEqual(calls.icon.length, n);
});

test('background: browser.action 미지원이어도 예외 없음', async () => {
  const { h } = setup({ action: false, enabled: false });
  await tick();
  assert.doesNotThrow(() =>
    h.msg({ type: 'sdrhdr:state', badge: { text: 'X' } }, { tab: { id: 1 } }),
  );
  assert.doesNotThrow(() => h.changed({ 'sdrhdr.enabled': { newValue: false } }, 'local'));
});

test('background: reject되는 호출은 unhandledRejection 없이 무시', async () => {
  const seen = [];
  const on = (e) => seen.push(e);
  process.on('unhandledRejection', on);
  const { h } = setup({ reject: true, enabled: false });
  h.msg({ type: 'sdrhdr:state', badge: { text: 'X', color: 'red' } }, { tab: { id: 1 } });
  await tick();
  await tick();
  process.off('unhandledRejection', on);
  assert.strictEqual(seen.length, 0);
});
