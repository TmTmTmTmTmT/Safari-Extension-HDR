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
  const attrs = {};
  const cls = new Set();
  return {
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    open: false,
    textContent: '',
    scrollTop: 0,
    attrs,
    cls,
    classList: {
      toggle(c, on) {
        if (on) cls.add(c);
        else cls.delete(c);
      },
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
    },
    setAttribute: (k, v) => {
      attrs[k] = String(v);
    },
    removeAttribute: (k) => {
      delete attrs[k];
    },
    addEventListener(t, fn) {
      (l[t] = l[t] || []).push(fn);
    },
    fire(t) {
      (l[t] || []).forEach((fn) => fn());
    },
    select() {
      this.selected = true;
    },
  };
}

// opts: getFails, clipboard, setResult(o) -> 반환값, now(ms)
async function setup(stored = {}, opts = {}) {
  // 없는 id는 처음 접근할 때 만든다(테스트와 popup이 같은 객체를 본다).
  const els = new Proxy(
    {},
    {
      get: (t, id) => (typeof id === 'string' ? (t[id] = t[id] || makeEl()) : undefined),
    },
  );
  // popup.html에서 처음부터 hidden인 요소를 반영한다.
  for (const m of read('popup/popup.html').matchAll(/id="([^"]+)"[^>]*\bhidden\b/g))
    els[m[1]].hidden = true;
  const sets = [];
  const removes = [];
  const timers = [];
  const intervals = [];
  const changed = [];
  const clock = { now: opts.now || Date.parse('2026-10-02T05:00:00Z') };
  const body = makeEl();
  const document = {
    getElementById: (id) => els[id],
    body,
    activeElement: null,
  };
  const browser = {
    storage: {
      local: {
        get: async () => {
          if (opts.getFails) throw new Error('boom');
          return stored;
        },
        set: (o) => {
          sets.push(plain(o));
          return opts.setResult ? opts.setResult(o) : undefined;
        },
        remove: async (keys) => {
          removes.push(plain(keys));
        },
      },
      onChanged: { addListener: (fn) => changed.push(fn) },
    },
  };
  const FakeDate = class extends Date {
    static now() {
      return clock.now;
    }
  };
  const ctx = vm.createContext({
    document,
    browser,
    navigator: opts.clipboard ? { clipboard: opts.clipboard } : {},
    Date: FakeDate,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Blob: class {},
    setTimeout: (fn) => timers.push(fn) - 1,
    clearTimeout: (i) => {
      timers[i] = null;
    },
    setInterval: (fn) => intervals.push(fn) - 1,
  });
  for (const f of ['content/ns.js', 'content/params.js', 'popup/popup.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  await new Promise((r) => setImmediate(r));
  const runTimers = () => {
    const t = timers.splice(0);
    t.forEach((fn) => fn && fn());
  };
  const tick = () => intervals.forEach((fn) => fn());
  const emitDiag = (diag) =>
    changed.forEach((fn) => fn({ 'sdrhdr.diag': { newValue: diag } }, 'local'));
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    els,
    sets,
    removes,
    timers,
    runTimers,
    tick,
    clock,
    document,
    body,
    emitDiag,
    flush,
    params: ctx.__sdrhdr.params,
  };
}

const pad = (n) => String(n).padStart(2, '0');
const hms = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const WARN_TAIL = '에서 하이라이트가 잘릴 수 있음(화면 밝기를 낮추거나 강도를 줄이세요)';
const DETAIL_IDS = ['d-P', 'd-k', 'd-n', 'd-g', 'd-s', 'd-hs'];

test('초기 표시값: 사용자 지정·43·0·105, 상세=기본 곡선, 유효 피크 1.90', async () => {
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
  assert.strictEqual(els['d-P-value'].textContent, '×2.0');
  assert.strictEqual(els['d-k-value'].textContent, '0.40');
  assert.strictEqual(els['d-n-value'].textContent, '2.0');
  assert.strictEqual(els['d-g-value'].textContent, '×1.22');
  assert.strictEqual(els['d-s-value'].textContent, '103%');
  assert.strictEqual(els['d-hs-value'].textContent, '103%');
  assert.strictEqual(els['peak-value'].textContent, '유효 피크 ×1.90 (SDR 흰색 대비)');
  assert.strictEqual(els['peak-warn'].textContent, '모든 화면 밝기에서 여유');
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
  assert.strictEqual(els['peak-value'].textContent, '유효 피크 ×2.70 (SDR 흰색 대비)');
  assert.ok(els['peak-warn'].textContent.startsWith('! 화면 밝기 최대에서'));
  // P가 기본값(2.0)과 다르면 흐린 기본값 표시
  assert.strictEqual(els['d-P-value'].textContent, '×3.0');
  assert.strictEqual(els['d-P-def'].textContent, '(기본 ×2.0)');
  assert.strictEqual(els['d-k-def'].textContent, '');
});

test('프리셋에서 처음 들어갈 때 그 프리셋 값을 복사해 시작', async () => {
  const { els, sets } = await setup({ 'sdrhdr.preset': 'vivid' });
  els['d-k'].value = '0.6';
  els['d-k'].fire('input');
  els['d-k'].fire('change');
  const written = sets.find((o) => 'sdrhdr.custom' in o);
  assert.deepStrictEqual(written['sdrhdr.custom'], {
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
  assert.strictEqual(els['d-P-value'].textContent, '×3.0');
  assert.strictEqual(els['d-P-def'].textContent, '');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.preset': 'balanced' }]);
  assert.strictEqual(els['peak-value'].textContent, '유효 피크 ×1.86 (SDR 흰색 대비)');
  els.preset.value = 'custom';
  els.preset.fire('change');
  assert.strictEqual(Number(els['d-P'].value), 5);
  assert.strictEqual(els['d-n-value'].textContent, '3.0');
  assert.strictEqual(els['d-n-def'].textContent, '(기본 2.0)');
  assert.deepStrictEqual(sets[1], { 'sdrhdr.preset': 'custom' });
});

test('peakAdvice 문구 3종: 여유 / 최대만 / 최대·중간', async () => {
  const { els } = await setup({ 'sdrhdr.preset': 'balanced' });
  assert.strictEqual(els['peak-value'].textContent, '유효 피크 ×1.86 (SDR 흰색 대비)');
  assert.strictEqual(els['peak-warn'].textContent, '모든 화면 밝기에서 여유');
  assert.strictEqual(els['peak-warn'].cls.has('warn'), false);
  els.strength.value = '60';
  els.strength.fire('input');
  assert.strictEqual(els['peak-value'].textContent, '유효 피크 ×2.20 (SDR 흰색 대비)');
  assert.strictEqual(els['peak-warn'].textContent, '! 화면 밝기 최대' + WARN_TAIL);
  assert.strictEqual(els['peak-warn'].cls.has('warn'), true);
  els.strength.value = '100';
  els.strength.fire('input');
  els.preset.value = 'vivid';
  els.preset.fire('change');
  assert.strictEqual(els['peak-value'].textContent, '유효 피크 ×4.00 (SDR 흰색 대비)');
  assert.strictEqual(els['peak-warn'].textContent, '! 화면 밝기 최대·중간' + WARN_TAIL);
});

test('mode가 itm이 아니면 컨트롤 비활성·진단 자동 펼침·안내, HUD는 활성', async () => {
  const { els } = await setup({ 'sdrhdr.mode': 'stripes' });
  for (const id of ['preset', 'strength', 'sharpness', 'saturation', ...DETAIL_IDS]) {
    assert.strictEqual(els[id].disabled, true, id);
    assert.strictEqual(els[id].attrs['aria-describedby'], 'locked-note', id);
  }
  assert.strictEqual(els.hud.disabled, false);
  assert.strictEqual(els['diag-section'].open, true);
  assert.strictEqual(els['diag-banner'].hidden, false);
  assert.strictEqual(els['locked-note'].hidden, false);
  // 일반 영역 안내에는 모드 이름이 없다(GUIDELINES 2.6-3)
  assert.ok(
    !/stripes|identity|baseline|itm/.test(
      read('popup/popup.html').match(/id="locked-note"[^>]*>([^<]*)</)[1],
    ),
  );
  els.mode.value = 'itm';
  els.mode.fire('change');
  assert.strictEqual(els.preset.disabled, false);
  assert.strictEqual(els['d-P'].disabled, false);
  assert.strictEqual(els['d-P'].attrs['aria-describedby'], undefined);
  assert.strictEqual(els['locked-note'].hidden, true);
});

test('mode가 itm이면 진단은 접힌 채, 안내 없음', async () => {
  const { els } = await setup();
  assert.strictEqual(els['diag-section'].open, false);
  assert.strictEqual(els['diag-banner'].hidden, true);
  assert.strictEqual(els['locked-note'].hidden, true);
});

test('[정상 모드로]: mode=itm 저장, 컨트롤 재활성, 안내 숨김', async () => {
  const { els, sets } = await setup({ 'sdrhdr.mode': 'baseline' });
  els['normal-mode'].fire('click');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.mode': 'itm' }]);
  assert.strictEqual(els.mode.value, 'itm');
  assert.strictEqual(els.preset.disabled, false);
  assert.strictEqual(els.strength.disabled, false);
  assert.strictEqual(els['diag-banner'].hidden, true);
  assert.strictEqual(els['locked-note'].hidden, true);
});

test('켜기 스위치: 꺼지면 body.off와 안내, 컨트롤은 잠그지 않음', async () => {
  const { els, sets, body } = await setup({ 'sdrhdr.enabled': false });
  assert.strictEqual(els.enabled.checked, false);
  assert.strictEqual(body.cls.has('off'), true);
  assert.strictEqual(els['enabled-state'].textContent, '꺼짐');
  assert.strictEqual(els['off-note'].hidden, false);
  assert.strictEqual(els.strength.disabled, false);
  els.enabled.checked = true;
  els.enabled.fire('change');
  assert.strictEqual(body.cls.has('off'), false);
  assert.strictEqual(els['enabled-state'].textContent, '켜짐');
  assert.strictEqual(els['off-note'].hidden, true);
  assert.deepStrictEqual(sets, [{ 'sdrhdr.enabled': true }]);
});

test('popup.html 버전 문자열은 manifest.version과 같고, 정적 초기값은 DEFAULTS와 같다', async () => {
  const html = read('popup/popup.html');
  const manifest = JSON.parse(read('manifest.json'));
  assert.strictEqual(html.match(/id="version">([^<]*)</)[1], 'v' + manifest.version);
  const { params } = await setup();
  const d = params.DEFAULTS;
  assert.ok(/id="enabled"[^>]*\bchecked\b/.test(html));
  assert.ok(new RegExp(`<option value="${d.preset}" selected>`).test(html));
  const val = (id) => html.match(new RegExp(`id="${id}"[^>]*value="([^"]*)"`))[1];
  assert.strictEqual(Number(val('strength')), Math.round(d.strength * 100));
  assert.strictEqual(Number(val('sharpness')), Math.round(d.sharpness * 100));
  assert.strictEqual(Number(val('saturation')), Math.round(d.saturation * 100));
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

test('단위·기본값 표시: 주 슬라이더, aria-valuetext가 표시 문자열과 같음', async () => {
  const { els } = await setup();
  els.strength.value = '60';
  els.strength.fire('input');
  assert.strictEqual(els['strength-value'].textContent, '60%');
  assert.strictEqual(els['strength-def'].textContent, '(기본 43%)');
  assert.strictEqual(els.strength.attrs['aria-valuetext'], '60%');
  assert.strictEqual(els['saturation-def'].textContent, '');
  for (const id of ['strength', 'sharpness', 'saturation', ...DETAIL_IDS]) {
    assert.strictEqual(els[id].attrs['aria-valuetext'], els[id + '-value'].textContent, id);
  }
});

test('곡선 백업: 프리셋에서 첫 상세 input에 기존 custom을 customPrev로 저장하고 안내', async () => {
  const stored = {
    'sdrhdr.preset': 'accurate',
    'sdrhdr.custom': { P: 5, k: 0.7, n: 3, g: 1.1, s: 0.9, hs: 0.8 },
  };
  const { els, sets } = await setup(stored);
  els['d-k'].value = '0.6';
  els['d-k'].fire('input');
  assert.deepStrictEqual(sets, [
    { 'sdrhdr.customPrev': { P: 5, k: 0.7, n: 3, g: 1.1, s: 0.9, hs: 0.8 } },
  ]);
  assert.strictEqual(els['backup-note'].hidden, false);
  assert.strictEqual(
    els['backup-text'].textContent,
    '이전 사용자 지정 곡선을 「정확」 기준으로 바꿨습니다',
  );
  // 같은 세션의 이후 입력은 다시 백업하지 않는다
  els['d-k'].value = '0.65';
  els['d-k'].fire('input');
  assert.strictEqual(sets.filter((o) => 'sdrhdr.customPrev' in o).length, 1);
});

test('되돌리기: customPrev -> custom, preset=custom을 한 번의 set으로 저장', async () => {
  const prev = { P: 5, k: 0.7, n: 3, g: 1.1, s: 0.9, hs: 0.8 };
  const { els, sets, runTimers } = await setup({
    'sdrhdr.preset': 'balanced',
    'sdrhdr.custom': prev,
  });
  els['d-P'].value = '2.5';
  els['d-P'].fire('input');
  sets.length = 0;
  els['backup-undo'].fire('click');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.preset': 'custom', 'sdrhdr.custom': prev }]);
  assert.strictEqual(els.preset.value, 'custom');
  assert.strictEqual(Number(els['d-P'].value), 5);
  assert.strictEqual(els['d-k-value'].textContent, '0.70');
  assert.strictEqual(els['backup-note'].hidden, true);
  // 대기 중이던 상세 저장이 되돌린 값을 덮지 않는다
  runTimers();
  assert.strictEqual(sets.length, 1);
});

test('저장된 custom이 프리셋과 같으면 백업·안내 없음', async () => {
  const { els, sets } = await setup({
    'sdrhdr.preset': 'balanced',
    'sdrhdr.custom': { P: 3.0, k: 0.45, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
  });
  els['d-k'].value = '0.6';
  els['d-k'].fire('input');
  els['d-k'].fire('change');
  assert.strictEqual(sets.filter((o) => 'sdrhdr.customPrev' in o).length, 0);
  assert.strictEqual(els['backup-note'].hidden, true);
});

test('기본값 복원: 첫 클릭은 확인 대기, 3초 후 원상, 두 번째 클릭에 RESETTABLE_KEYS remove', async () => {
  const { els, removes, runTimers, params, flush } = await setup({
    'sdrhdr.preset': 'vivid',
    'sdrhdr.strength': 0.9,
    'sdrhdr.hud': true,
    'sdrhdr.mode': 'stripes',
    'sdrhdr.enabled': false,
  });
  els.reset.fire('click');
  assert.strictEqual(els.reset.textContent, '한 번 더 눌러 확인');
  assert.strictEqual(removes.length, 0);
  runTimers(); // 3초 타이머
  assert.strictEqual(els.reset.textContent, '기본값으로 되돌리기');
  els.reset.fire('click');
  assert.strictEqual(removes.length, 0);
  els.reset.fire('click');
  await flush();
  assert.deepStrictEqual(removes, [plain(params.RESETTABLE_KEYS)]);
  assert.deepStrictEqual(
    removes[0],
    ['preset', 'custom', 'strength', 'sharpness', 'saturation', 'hud', 'notify'].map(
      (k) => 'sdrhdr.' + k,
    ),
  );
  // 기본값으로 다시 그리되 enabled·mode는 유지
  assert.strictEqual(els.preset.value, 'custom');
  assert.strictEqual(els.strength.value, '43');
  assert.strictEqual(els.hud.checked, false);
  assert.strictEqual(els.enabled.checked, false);
  assert.strictEqual(els.mode.value, 'stripes');
  assert.strictEqual(els.preset.disabled, true);
  assert.strictEqual(els.reset.textContent, '기본값으로 되돌리기');
});

test('init 실패: 안내 표시 + 컨트롤 비활성', async () => {
  const { els } = await setup({}, { getFails: true });
  assert.strictEqual(els['init-error'].hidden, false);
  assert.strictEqual(
    els['init-error'].textContent,
    '설정을 읽지 못했습니다. popup을 다시 열거나 Safari를 재시작하세요',
  );
  for (const id of ['enabled', 'preset', 'strength', 'd-P', 'hud', 'mode', 'reset']) {
    assert.strictEqual(els[id].disabled, true, id);
  }
});

test('storage.set 실패: 저장 실패 표시, 성공하면 지움, undefined 반환도 안전', async () => {
  let fail = true;
  const { els, flush } = await setup(
    {},
    { setResult: () => (fail ? Promise.reject(new Error('x')) : Promise.resolve()) },
  );
  els.hud.checked = true;
  els.hud.fire('change');
  await flush();
  assert.strictEqual(els['save-status'].textContent, '저장 실패');
  fail = false;
  els.hud.fire('change');
  await flush();
  assert.strictEqual(els['save-status'].textContent, '');
  const plainSet = await setup();
  plainSet.els.hud.fire('change'); // set이 undefined를 반환해도 예외 없음
  assert.strictEqual(plainSet.els['save-status'].textContent, '');
});

const DIAG = {
  createdAt: '2026-10-02T05:00:00.000Z',
  lifecycle: { state: 'active' },
  page: { path: '/watch', v: 'abc' },
};

test('진단 출처 줄: 기록 시각·경과·상태, 30초 넘으면 흐림, URL·제목 없음', async () => {
  const t0 = Date.parse(DIAG.createdAt);
  const { els, tick, clock } = await setup({ 'sdrhdr.diag': DIAG }, { now: t0 + 12000 });
  assert.strictEqual(
    els['diag-source'].textContent,
    `마지막 기록 ${hms(t0)}(12초 전) · 상태 active`,
  );
  assert.strictEqual(els['diag-source'].cls.has('stale'), false);
  clock.now = t0 + 31000;
  tick();
  assert.strictEqual(
    els['diag-source'].textContent,
    `마지막 기록 ${hms(t0)}(31초 전) · 상태 active`,
  );
  assert.strictEqual(els['diag-source'].cls.has('stale'), true);
  assert.ok(!/watch|abc/.test(els['diag-source'].textContent));
});

test('진단 없으면 출처 줄 생략', async () => {
  const { els } = await setup();
  assert.strictEqual(els['diag-source'].textContent, '');
});

test('복사 성공: 복사됨 (HH:MM:SS 진단) 표시 후 2초 뒤 비움', async () => {
  const written = [];
  const clipboard = { writeText: async (t) => written.push(t) };
  const { els, flush, runTimers } = await setup({ 'sdrhdr.diag': DIAG }, { clipboard });
  els.copy.fire('click');
  await flush();
  assert.strictEqual(written.length, 1);
  assert.strictEqual(
    els['copy-status'].textContent,
    `복사됨 (${hms(Date.parse(DIAG.createdAt))} 진단)`,
  );
  runTimers();
  assert.strictEqual(els['copy-status'].textContent, '');
});

test('복사 실패·clipboard 없음: textarea 선택 + Command-C 안내', async () => {
  const none = await setup({ 'sdrhdr.diag': DIAG });
  none.els.copy.fire('click');
  assert.strictEqual(none.els.diag.selected, true);
  assert.strictEqual(none.els['copy-status'].textContent, 'Command-C를 누르세요');
  const clipboard = { writeText: () => Promise.reject(new Error('denied')) };
  const bad = await setup({ 'sdrhdr.diag': DIAG }, { clipboard });
  bad.els.copy.fire('click');
  await bad.flush();
  assert.strictEqual(bad.els.diag.selected, true);
  assert.strictEqual(bad.els['copy-status'].textContent, 'Command-C를 누르세요');
});

test('textarea 포커스 중에는 진단 갱신 보류, 갱신 버튼으로 반영하고 scrollTop 복원', async () => {
  const { els, document, emitDiag } = await setup({ 'sdrhdr.diag': DIAG });
  const before = els.diag.value;
  document.activeElement = els.diag;
  els.diag.scrollTop = 40;
  emitDiag(Object.assign({}, DIAG, { lifecycle: { state: 'probing' } }));
  assert.strictEqual(els.diag.value, before);
  assert.strictEqual(els['diag-refresh'].hidden, false);
  els['diag-refresh'].fire('click');
  assert.ok(els.diag.value.includes('probing'));
  assert.strictEqual(els.diag.scrollTop, 40);
  assert.strictEqual(els['diag-refresh'].hidden, true);
  // 선택 범위가 있어도 보류
  document.activeElement = null;
  els.diag.selectionStart = 0;
  els.diag.selectionEnd = 5;
  emitDiag(Object.assign({}, DIAG, { lifecycle: { state: 'idle' } }));
  assert.ok(!els.diag.value.includes('idle'));
  assert.strictEqual(els['diag-refresh'].hidden, false);
  // 포커스·선택이 없으면 즉시 갱신
  els.diag.selectionEnd = 0;
  emitDiag(Object.assign({}, DIAG, { lifecycle: { state: 'active', n: 2 } }));
  assert.ok(els.diag.value.includes('"n": 2'));
});
