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

// ---- U1: 설정 백업·복원 ----
const paramsKeys = (() => {
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['ns.js', 'params.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', '..', 'extension', 'content', f), 'utf8'),
      ctx,
    );
  }
  return JSON.parse(JSON.stringify(ctx.__sdrhdr.params.BACKUP_KEYS));
})();
const RESTORED = 'sdrhdr.restoredAt';

// store: storage.local 내용, backup: backup:get 응답(생략 시 native 미지원), 타이머 주입
function setupU1({
  store = {},
  getReply,
  sendMode = 'ok',
  noRuntimeEvents = false,
  setFails = 0,
} = {}) {
  const sent = [];
  const sets = [];
  const removes = [];
  const warns = [];
  let failLeft = setFails;
  const timers = [];
  const cleared = [];
  const h = {};
  const runtime = { onMessage: { addListener: () => {} } };
  if (!noRuntimeEvents) {
    runtime.onStartup = { addListener: (f) => (h.startup = f) };
    runtime.onInstalled = { addListener: (f) => (h.installed = f) };
  }
  if (sendMode !== 'absent') {
    runtime.sendNativeMessage = (id, msg) => {
      sent.push({ id, msg });
      if (sendMode === 'throw') throw new Error('x');
      if (sendMode === 'reject') return Promise.reject(new Error('x'));
      return Promise.resolve(msg.type === 'backup:get' ? getReply : { ok: true });
    };
  }
  const browser = {
    runtime,
    storage: {
      local: {
        get: async (keys) => {
          const o = {};
          for (const k of [].concat(keys)) if (k in store) o[k] = store[k];
          return o;
        },
        set: async (o) => {
          sets.push(JSON.parse(JSON.stringify(o)));
          if (failLeft > 0) {
            failLeft -= 1;
            throw new Error('Disk I/O error');
          }
          Object.assign(store, o);
        },
        remove: async (keys) => {
          removes.push([].concat(keys));
        },
      },
      onChanged: { addListener: (f) => (h.changed = f) },
    },
  };
  const sandbox = {
    browser,
    Date,
    console: { warn: (m) => warns.push(m) },
    setTimeout: (fn, ms) => (timers.push({ fn, ms }), timers.length),
    clearTimeout: (id) => cleared.push(id),
  };
  vm.runInNewContext(src, sandbox);
  return { h, sent, sets, removes, warns, timers, cleared, store };
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test('background U1: 연속 변경 -> 1초 디바운스, 마지막 값 1회 전송', async () => {
  const r = setupU1({ store: { 'sdrhdr.strength': 0.1 } });
  await tick();
  r.h.changed({ 'sdrhdr.strength': { newValue: 0.1 } }, 'local');
  r.store['sdrhdr.strength'] = 0.9;
  r.h.changed({ 'sdrhdr.strength': { newValue: 0.9 } }, 'local');
  assert.strictEqual(r.timers.length, 2);
  assert.strictEqual(r.timers[1].ms, 1000);
  assert.deepStrictEqual(r.cleared, [1]); // 앞 타이머 취소 -> 실제 활성 타이머 1개
  r.timers[1].fn();
  await tick();
  const sets = r.sent.filter((s) => s.msg.type === 'backup:set');
  assert.strictEqual(sets.length, 1);
  assert.strictEqual(sets[0].id, 'io.github.tmtmtmtmtmt.SDRHDR');
  assert.deepStrictEqual(plain(sets[0].msg.data), { 'sdrhdr.strength': 0.9 });
});

test('background U1: 백업 대상 키만 반응', () => {
  const r = setupU1();
  for (const k of ['mode', 'diag', 'diagRequest', 'customPrev', 'restoredAt']) {
    r.h.changed({ ['sdrhdr.' + k]: { newValue: 1 } }, 'local');
  }
  r.h.changed({ 'sdrhdr.hud': { newValue: 1 } }, 'sync');
  assert.strictEqual(r.timers.length, 0);
  r.h.changed({ 'sdrhdr.hud': { newValue: false } }, 'local');
  assert.strictEqual(r.timers.length, 1);
});

test('background U1: 전송 data는 BACKUP_KEYS 안의 키만, 없는 키 생략, 빈 객체 허용', async () => {
  const store = { 'sdrhdr.mode': 'diag', 'sdrhdr.diag': { a: 1 }, 'sdrhdr.hud': true };
  const r = setupU1({ store });
  await tick();
  r.h.changed({ 'sdrhdr.hud': { newValue: true } }, 'local');
  r.timers[0].fn();
  await tick();
  assert.deepStrictEqual(plain(r.sent.at(-1).msg), {
    type: 'backup:set',
    data: { 'sdrhdr.hud': true },
  });
  delete store['sdrhdr.hud'];
  r.h.changed({ 'sdrhdr.hud': {} }, 'local');
  r.timers.at(-1).fn();
  await tick();
  assert.deepStrictEqual(plain(r.sent.at(-1).msg), { type: 'backup:set', data: {} });
});

test('background U1: 저장소 비고 백업 있음 -> 허용 키 + restoredAt set', async () => {
  const backup = { 'sdrhdr.preset': 'vivid', 'sdrhdr.strength': 0.7 };
  const r = setupU1({ getReply: { ok: true, data: backup } });
  await tick();
  await tick();
  assert.deepStrictEqual(plain(r.sent), [
    { id: 'io.github.tmtmtmtmtmt.SDRHDR', msg: { type: 'backup:get' } },
  ]);
  assert.strictEqual(r.sets.length, 1);
  const o = plain(r.sets[0]);
  assert.strictEqual(typeof o[RESTORED], 'number');
  delete o[RESTORED];
  assert.deepStrictEqual(o, backup);
});

test('background U1: 저장소에 키가 하나라도 있으면 복원 안 함(백업 조회도 안 함)', async () => {
  const r = setupU1({
    store: { 'sdrhdr.notify': false },
    getReply: { ok: true, data: { 'sdrhdr.preset': 'x' } },
  });
  await tick();
  await tick();
  assert.strictEqual(r.sets.length, 0);
});

test('background U1: 백업 null·빈 객체·비객체·ok 아님이면 복원 안 함', async () => {
  for (const reply of [
    { ok: true, data: null },
    { ok: true, data: {} },
    { ok: true, data: 'str' },
    { ok: true, data: [1] },
    { ok: false },
    { ok: true },
    null,
    undefined,
    'x',
  ]) {
    const r = setupU1({ getReply: reply });
    await tick();
    await tick();
    assert.strictEqual(r.sets.length, 0, JSON.stringify(reply));
  }
});

test('background U1: 백업의 허용 밖 키는 복원하지 않음', async () => {
  const r = setupU1({
    getReply: {
      ok: true,
      data: { 'sdrhdr.mode': 'diag', 'sdrhdr.diag': {}, 'sdrhdr.hud': false, evil: 1 },
    },
  });
  await tick();
  await tick();
  const o = plain(r.sets[0]);
  assert.deepStrictEqual(Object.keys(o).sort(), ['sdrhdr.hud', RESTORED].sort());
  const r2 = setupU1({ getReply: { ok: true, data: { 'sdrhdr.mode': 'diag', evil: 1 } } });
  await tick();
  await tick();
  assert.strictEqual(r2.sets.length, 0);
});

test('background U1: 복원은 이벤트가 여러 번 와도 1회', async () => {
  const r = setupU1({ getReply: { ok: true, data: { 'sdrhdr.hud': true } } });
  r.h.startup();
  r.h.installed({ reason: 'install' });
  await tick();
  await tick();
  r.h.startup();
  await tick();
  await tick();
  assert.strictEqual(r.sent.filter((s) => s.msg.type === 'backup:get').length, 1);
  assert.strictEqual(r.sets.length, 1);
});

test('background U1: sendNativeMessage 없음·예외·reject는 무시하고 배지·아이콘 정상', async () => {
  const seen = [];
  const on = (e) => seen.push(e);
  process.on('unhandledRejection', on);
  for (const sendMode of ['absent', 'throw', 'reject']) {
    const r = setupU1({ sendMode, getReply: { ok: true, data: { 'sdrhdr.hud': true } } });
    await tick();
    await tick();
    assert.strictEqual(r.sets.length, 0, sendMode);
    assert.doesNotThrow(() => r.h.changed({ 'sdrhdr.hud': { newValue: 1 } }, 'local'));
    assert.doesNotThrow(() => r.timers[0].fn());
    await tick();
  }
  const r = setupU1({ noRuntimeEvents: true });
  await tick();
  process.off('unhandledRejection', on);
  assert.strictEqual(seen.length, 0);
});

test('background U1: BACKUP_KEYS는 params.BACKUP_KEYS와 같은 목록(전송 data 순서로 검증)', async () => {
  const store = {};
  for (const k of paramsKeys) store[k] = 1;
  const r = setupU1({ store });
  await tick();
  r.h.changed({ [paramsKeys[0]]: { newValue: 1 } }, 'local');
  r.timers[0].fn();
  await tick();
  assert.deepStrictEqual(Object.keys(r.sent.at(-1).msg.data), paramsKeys);
  // 각 params 키가 개별로 백업을 트리거
  for (const k of paramsKeys) {
    const n = r.timers.length;
    r.h.changed({ [k]: { newValue: 1 } }, 'local');
    assert.strictEqual(r.timers.length, n + 1, k);
  }
  // 복원 쪽도 같은 목록만 허용
  const backup = {};
  for (const k of paramsKeys) backup[k] = 2;
  backup['sdrhdr.extra'] = 3;
  const r2 = setupU1({ getReply: { ok: true, data: backup } });
  await tick();
  await tick();
  assert.deepStrictEqual(Object.keys(r2.sets[0]).sort(), [...paramsKeys, RESTORED].sort());
});

const drain = async (n = 8) => {
  for (let i = 0; i < n; i++) await tick();
};
const BACKUP = { ok: true, data: { 'sdrhdr.strength': 0.7, 'sdrhdr.userPresets': [{ id: 'a' }] } };

test('background V1: 이전 진단 키 2개를 시작 시 1회 remove', async () => {
  const t = setupU1({ store: { 'sdrhdr.strength': 0.5 } });
  await drain();
  assert.deepStrictEqual(plain(t.removes), [['sdrhdr.diag', 'sdrhdr.diagRequest']]);
});

test('background V1: 복원 쓰기 실패 -> 1·5·15초 재시도, 성공하면 멈춤', async () => {
  const t = setupU1({ getReply: BACKUP, setFails: 2 });
  await drain();
  assert.strictEqual(t.sets.length, 1);
  assert.deepStrictEqual(
    t.timers.map((x) => x.ms),
    [1000],
  );
  t.timers.shift().fn();
  await drain();
  assert.strictEqual(t.sets.length, 2);
  assert.deepStrictEqual(
    t.timers.map((x) => x.ms),
    [5000],
  );
  t.timers.shift().fn();
  await drain();
  assert.strictEqual(t.sets.length, 3, '세 번째 시도에서 성공');
  assert.strictEqual(t.store['sdrhdr.strength'], 0.7);
  assert.strictEqual(t.timers.length, 0);
  assert.strictEqual(t.warns.length, 0);
});

test('background V1: 재시도 모두 실패하면 경고 1줄(원문 없음)로 중단', async () => {
  const t = setupU1({ getReply: BACKUP, setFails: 99 });
  await drain();
  for (const ms of [1000, 5000, 15000]) {
    assert.strictEqual(t.timers[0].ms, ms);
    t.timers.shift().fn();
    await drain();
  }
  assert.strictEqual(t.sets.length, 4);
  assert.strictEqual(t.timers.length, 0);
  assert.strictEqual(t.warns.length, 1);
  assert.ok(!t.warns[0].includes('Disk'));
});

test('background V1: 재시도 사이 사용자가 값을 쓰면 복원 중단(사용자 값 우선)', async () => {
  const t = setupU1({ getReply: BACKUP, setFails: 1 });
  await drain();
  t.store['sdrhdr.preset'] = 'balanced'; // popup이 쓴 값
  t.timers.shift().fn();
  await drain();
  assert.strictEqual(t.sets.length, 1, '재시도 쓰기 없음');
});

test('background V1: 복원 미완료 동안 백업은 네이티브 백업에 저장소 값을 덮어 보낸다(내 프리셋 보존)', async () => {
  const t = setupU1({ getReply: BACKUP, setFails: 1 });
  await drain();
  t.store['sdrhdr.preset'] = 'balanced';
  t.h.changed({ 'sdrhdr.preset': { newValue: 'balanced' } }, 'local');
  const deb =
    t.timers.find((x) => x.ms === 1000 && x !== t.timers[0]) || t.timers[t.timers.length - 1];
  deb.fn();
  await drain();
  const set = t.sent.filter((x) => x.msg.type === 'backup:set').pop();
  assert.deepStrictEqual(plain(set.msg.data), {
    'sdrhdr.preset': 'balanced',
    'sdrhdr.strength': 0.7,
    'sdrhdr.userPresets': [{ id: 'a' }],
  });
});

test('background V1: 복원 성공 뒤 백업은 저장소 기준', async () => {
  const t = setupU1({ getReply: BACKUP });
  await drain();
  delete t.store['sdrhdr.userPresets'];
  t.h.changed({ 'sdrhdr.strength': { newValue: 0.7 } }, 'local');
  t.timers[t.timers.length - 1].fn();
  await drain();
  const set = t.sent.filter((x) => x.msg.type === 'backup:set').pop();
  assert.ok(!('sdrhdr.userPresets' in set.msg.data));
});
