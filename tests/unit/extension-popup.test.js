'use strict';
// popup.js: 가짜 DOM·storage·타이머로 표시값과 저장 호출을 본다. 실제 Safari 팝업 동작 검증이 아니다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const plain = (v) => JSON.parse(JSON.stringify(v));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function makeEl() {
  const l = {};
  return {
    value: '',
    checked: false,
    disabled: false,
    textContent: '',
    addEventListener(t, fn) {
      (l[t] = l[t] || []).push(fn);
    },
    fire(t) {
      (l[t] || []).forEach((fn) => fn());
    },
    select() {},
  };
}

async function setup(stored = {}) {
  const els = {};
  const sets = [];
  const timers = [];
  const document = { getElementById: (id) => (els[id] = els[id] || makeEl()) };
  const browser = {
    storage: {
      local: {
        get: async () => stored,
        set: (o) => sets.push(plain(o)),
      },
      onChanged: { addListener() {} },
    },
  };
  const ctx = vm.createContext({
    document,
    browser,
    navigator: {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class {},
    setTimeout: (fn) => timers.push(fn) - 1,
    clearTimeout: (i) => {
      timers[i] = null;
    },
  });
  for (const f of ['content/ns.js', 'content/params.js', 'popup/popup.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  await new Promise((r) => setImmediate(r));
  const runTimers = () => {
    const t = timers.splice(0);
    t.forEach((fn) => fn && fn());
  };
  return { els, sets, timers, runTimers, params: ctx.__sdrhdr.params };
}

test('초기 표시값: 사용자 지정·43·0·105, 상세=기본 곡선, 유효 피크 1.62', async () => {
  const { els, params } = await setup();
  assert.strictEqual(els.preset.value, 'custom');
  assert.strictEqual(els.strength.value, '43');
  assert.strictEqual(els.sharpness.value, '0');
  assert.strictEqual(els.saturation.value, '105');
  for (const k of Object.keys(params.DEFAULT_CUSTOM)) {
    assert.strictEqual(Number(els['d-' + k].value), params.DEFAULT_CUSTOM[k]);
    const [min, max] = params.RANGES[k];
    assert.strictEqual(Number(els['d-' + k].min), min);
    assert.strictEqual(Number(els['d-' + k].max), max);
    assert.strictEqual(Number(els['d-' + k].step), params.DETAIL_STEPS[k]);
  }
  assert.strictEqual(els['d-P-value'].textContent, '2.0');
  assert.strictEqual(els['d-k-value'].textContent, '0.40');
  assert.strictEqual(els['d-g-value'].textContent, '1.22');
  assert.strictEqual(els['effective-peak'].textContent, '유효 피크 ×1.62');
});

test('상세 슬라이더 이동: preset custom + custom 전체를 한 번에 저장', async () => {
  const { els, sets, runTimers } = await setup();
  els['d-P'].value = '3.04';
  els['d-P'].fire('input');
  assert.strictEqual(els.preset.value, 'custom');
  assert.strictEqual(sets.length, 0);
  runTimers();
  assert.strictEqual(sets.length, 1);
  assert.deepStrictEqual(sets[0], {
    'sdrhdr.preset': 'custom',
    'sdrhdr.custom': { P: 3.0, k: 0.4, n: 2.0, g: 1.22, s: 1.03, hs: 1.03 },
  });
  assert.strictEqual(
    els['effective-peak'].textContent,
    '유효 피크 ×2.14 — 밝기 최대에서 하이라이트가 잘릴 수 있음',
  );
});

test('프리셋에서 처음 들어갈 때 그 프리셋 값을 복사해 시작', async () => {
  const { els, sets } = await setup({ 'sdrhdr.preset': 'vivid' });
  els['d-k'].value = '0.6';
  els['d-k'].fire('input');
  els['d-k'].fire('change');
  assert.deepStrictEqual(sets[0]['sdrhdr.custom'], {
    P: 4.0,
    k: 0.6,
    n: 2.0,
    g: 1.0,
    s: 1.2,
    hs: 1.0,
  });
});

test('프리셋 변경: 상세 슬라이더 갱신, preset만 저장, custom은 저장값 사용', async () => {
  const { els, sets } = await setup({
    'sdrhdr.custom': { P: 5, k: 0.7, n: 3, g: 1.1, s: 0.9, hs: 0.8 },
  });
  els.preset.value = 'balanced';
  els.preset.fire('change');
  assert.strictEqual(Number(els['d-P'].value), 3.0);
  assert.strictEqual(els['d-P-value'].textContent, '3.0');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.preset': 'balanced' }]);
  assert.strictEqual(els['effective-peak'].textContent, '유효 피크 ×1.86');
  els.preset.value = 'custom';
  els.preset.fire('change');
  assert.strictEqual(Number(els['d-P'].value), 5);
  assert.strictEqual(els['d-n-value'].textContent, '3.0');
  assert.deepStrictEqual(sets[1], { 'sdrhdr.preset': 'custom' });
});

test('유효 피크 2.0 초과 경고, 이하면 경고 없음', async () => {
  const { els } = await setup();
  els.strength.value = '50';
  els.strength.fire('input');
  assert.strictEqual(els['effective-peak'].textContent, '유효 피크 ×1.72');
  els.strength.value = '100';
  els.strength.fire('input');
  assert.strictEqual(
    els['effective-peak'].textContent,
    '유효 피크 ×2.44 — 밝기 최대에서 하이라이트가 잘릴 수 있음',
  );
  els.preset.value = 'vivid';
  els.preset.fire('change');
  assert.strictEqual(
    els['effective-peak'].textContent,
    '유효 피크 ×4.00 — 밝기 최대에서 하이라이트가 잘릴 수 있음',
  );
});

test('mode가 itm이 아니면 프리셋·슬라이더 비활성, HUD는 활성', async () => {
  const { els } = await setup({ 'sdrhdr.mode': 'stripes' });
  for (const id of [
    'preset',
    'strength',
    'sharpness',
    'saturation',
    'd-P',
    'd-k',
    'd-n',
    'd-g',
    'd-s',
    'd-hs',
  ]) {
    assert.strictEqual(els[id].disabled, true, id);
  }
  assert.strictEqual(els.hud.disabled, false);
  els.mode.value = 'itm';
  els.mode.fire('change');
  assert.strictEqual(els.preset.disabled, false);
  assert.strictEqual(els['d-P'].disabled, false);
});

test('HUD 체크박스: boolean 저장', async () => {
  const { els, sets } = await setup();
  els.hud.checked = true;
  els.hud.fire('change');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.hud': true }]);
});

test('throttle: 연속 입력은 타이머 1회에 마지막 값, change는 즉시 flush', async () => {
  const { els, sets, timers, runTimers } = await setup();
  els.strength.value = '60';
  els.strength.fire('input');
  els.strength.value = '70';
  els.strength.fire('input');
  assert.strictEqual(timers.length, 1);
  runTimers();
  assert.deepStrictEqual(sets, [{ 'sdrhdr.strength': 0.7 }]);
  els.sharpness.value = '20';
  els.sharpness.fire('input');
  els.sharpness.fire('change');
  assert.deepStrictEqual(sets[1], { 'sdrhdr.sharpness': 0.2 });
  runTimers();
  assert.strictEqual(sets.length, 2);
});
