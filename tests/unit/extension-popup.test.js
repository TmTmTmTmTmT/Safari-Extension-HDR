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
    children: [],
    replaceChildren(...c) {
      this.children = c;
    },
  };
}

// opts: getFails, clipboard, setResult(o) -> 반환값, now(ms), tabs({query, sendMessage}), noInterval
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
  const intervalMs = [];
  const blobs = [];
  const changed = [];
  const globalHandlers = {};
  const clock = { now: opts.now || Date.parse('2026-10-02T05:00:00Z') };
  const body = makeEl();
  const document = {
    getElementById: (id) => els[id],
    createElement: () => makeEl(),
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
  if (opts.tabs) browser.tabs = opts.tabs;
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
    Blob: class {
      constructor(parts) {
        blobs.push(parts.join(''));
      }
    },
    addEventListener: (t, fn) => (globalHandlers[t] = globalHandlers[t] || []).push(fn),
    setTimeout: (fn) => timers.push(fn) - 1,
    clearTimeout: (i) => {
      timers[i] = null;
    },
    setInterval: (fn, ms) => {
      intervalMs.push(ms);
      return intervals.push(fn) - 1;
    },
    clearInterval: (i) => {
      intervals[i] = () => {};
    },
  });
  if (opts.noInterval) delete ctx.setInterval;
  for (const f of ['content/ns.js', 'content/params.js', 'popup/popup.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  await new Promise((r) => setImmediate(r));
  const runTimers = () => {
    const t = timers.splice(0);
    t.forEach((fn) => fn && fn());
  };
  const tick = () => intervals.forEach((fn) => fn());
  const emitStore = (key, newValue) =>
    changed.forEach((fn) => fn({ [key]: { newValue } }, 'local'));
  const flush = () => new Promise((r) => setImmediate(r));
  return {
    els,
    sets,
    removes,
    timers,
    runTimers,
    tick,
    intervalMs,
    blobs,
    clock,
    document,
    body,
    emitStore,
    fireGlobal: (t) => (globalHandlers[t] || []).forEach((fn) => fn()),
    changed,
    flush,
    params: ctx.__sdrhdr.params,
  };
}

const pad = (n) => String(n).padStart(2, '0');
const hms = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const flushN = async (n = 5) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};
const NONE_TEXT = '이 탭에서는 동작하지 않음';
const NONE_HINT =
  '대상: www.youtube.com 영상 페이지(임베드·music.youtube.com 제외). 영상 페이지인데 이 문구가 보이면 Safari 설정 › 확장 › SDR HDR에서 www.youtube.com 접근을 허용한 뒤 새로고침하세요';
const okStatus = { level: 'ok', text: 'HDR 변환 중', hint: '', badge: null };
const tabsStub = (res, tabList = [{ id: 7 }]) => {
  const calls = { query: [], send: [] };
  return {
    calls,
    query: async (q) => {
      calls.query.push(q);
      return tabList;
    },
    sendMessage: async (id, msg) => {
      calls.send.push([id, msg]);
      return typeof res === 'function' ? res(id, msg) : res;
    },
  };
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
  // 진단 영역이 자동으로 열려도 진단은 메시지로만 묻는다(저장소 쓰기 없음). 저장은 mode뿐.
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
  assert.strictEqual(d.notify, true);
  assert.ok(/id="notify"[^>]*\bchecked\b/.test(html));
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

const SAVE_FAIL = '저장 실패(Safari 저장소 오류). Safari를 완전히 종료 후 다시 여세요';

test('storage.set 실패: 1초 뒤 1회 재시도, 성공이면 문구 없음 (V1 b)', async () => {
  let n = 0;
  const { els, sets, flush, runTimers } = await setup(
    {},
    { setResult: () => (++n === 1 ? Promise.reject(new Error('x')) : Promise.resolve()) },
  );
  els.hud.checked = true;
  els.hud.fire('change');
  await flush();
  assert.strictEqual(sets.length, 1, '재시도는 타이머 뒤');
  assert.strictEqual(els['save-status'].textContent, '');
  runTimers();
  await flush();
  assert.strictEqual(sets.length, 2);
  assert.deepStrictEqual(sets[1], sets[0]);
  assert.strictEqual(els['save-status'].textContent, '');
});

test('storage.set 재시도도 실패: 새 문구, 이후 성공하면 지움, undefined 반환도 안전', async () => {
  let fail = true;
  const { els, sets, flush, runTimers } = await setup(
    {},
    { setResult: () => (fail ? Promise.reject(new Error('x')) : Promise.resolve()) },
  );
  els.hud.checked = true;
  els.hud.fire('change');
  await flush();
  runTimers();
  await flush();
  assert.strictEqual(sets.length, 2);
  assert.strictEqual(els['save-status'].textContent, SAVE_FAIL);
  fail = false;
  els.hud.fire('change');
  await flush();
  assert.strictEqual(els['save-status'].textContent, '');
  const plainSet = await setup();
  plainSet.els.hud.fire('change'); // set이 undefined를 반환해도 예외 없음
  await plainSet.flush();
  assert.strictEqual(plainSet.els['save-status'].textContent, '');
  const throwing = await setup(
    {},
    {
      setResult: () => {
        throw new Error('sync');
      },
    },
  );
  throwing.els.hud.fire('change');
  await throwing.flush();
  throwing.runTimers();
  await throwing.flush();
  assert.strictEqual(throwing.els['save-status'].textContent, SAVE_FAIL);
});

const DIAG = {
  createdAt: '2026-10-02T05:00:00.000Z',
  lifecycle: { state: 'active' },
  page: { path: '/watch', v: 'abc' },
};
const withState = (state, extra) => Object.assign({}, DIAG, { lifecycle: { state } }, extra);
const isGetDiag = (msg) => msg && msg.type === 'sdrhdr:getDiag';
// getDiag에는 box.diag(없으면 무응답)로 답한다. getState에는 ok 상태.
const diagBox = (diag) => {
  const box = { diag };
  box.tabs = tabsStub((id, msg) => (isGetDiag(msg) ? box.diag : { status: okStatus }));
  return box;
};
const getDiagCalls = (tabs) => tabs.calls.send.filter(([, m]) => isGetDiag(m));
async function openDiag(ctx) {
  ctx.els['diag-section'].open = true;
  ctx.els['diag-section'].fire('toggle');
  await flushN();
}

test('진단 출처 줄: 기록 시각·경과·상태, 30초 넘으면 흐림, URL·제목 없음', async () => {
  const t0 = Date.parse(DIAG.createdAt);
  const ctx = await setup({}, { now: t0 + 12000, tabs: diagBox(DIAG).tabs });
  const { els, tick, clock } = ctx;
  await openDiag(ctx);
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
  const ctx = await setup({}, { clipboard, tabs: diagBox(DIAG).tabs });
  const { els, flush, runTimers } = ctx;
  await openDiag(ctx);
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
  const none = await setup();
  none.els.copy.fire('click');
  assert.strictEqual(none.els.diag.selected, true);
  assert.strictEqual(none.els['copy-status'].textContent, 'Command-C를 누르세요');
  const clipboard = { writeText: () => Promise.reject(new Error('denied')) };
  const bad = await setup({}, { clipboard });
  bad.els.copy.fire('click');
  await bad.flush();
  assert.strictEqual(bad.els.diag.selected, true);
  assert.strictEqual(bad.els['copy-status'].textContent, 'Command-C를 누르세요');
});

test('textarea 포커스 중에는 진단 갱신 보류, 갱신 버튼으로 반영하고 scrollTop 복원', async () => {
  const box = diagBox(DIAG);
  const ctx = await setup({}, { tabs: box.tabs });
  const { els, document, tick } = ctx;
  await openDiag(ctx);
  const before = els.diag.value;
  assert.ok(before.includes('active'));
  document.activeElement = els.diag;
  els.diag.scrollTop = 40;
  box.diag = withState('probing');
  tick();
  await flushN();
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
  box.diag = withState('idle');
  tick();
  await flushN();
  assert.ok(!els.diag.value.includes('idle'));
  assert.strictEqual(els['diag-refresh'].hidden, false);
  // 포커스·선택이 없으면 즉시 갱신
  els.diag.selectionEnd = 0;
  box.diag = withState('active', { n: 2 });
  tick();
  await flushN();
  assert.ok(els.diag.value.includes('"n": 2'));
});

test('상태 줄: 성공 응답은 level 클래스·text·hint를 표시, 탭 id만 질의', async () => {
  const st = { level: 'skip', text: '이미 HDR 영상: 원본 표시', hint: '힌트', badge: null };
  const tabs = tabsStub({ status: st, input: {} });
  const { els, params } = await setup({}, { tabs });
  await flushN();
  assert.deepStrictEqual(plain(tabs.calls.query), [{ active: true, currentWindow: true }]);
  assert.deepStrictEqual(plain(tabs.calls.send), [[7, { type: params.MSG.getState }]]);
  assert.strictEqual(els['status-text'].textContent, '이미 HDR 영상: 원본 표시');
  assert.strictEqual(els['status-hint'].textContent, '힌트');
  assert.strictEqual(els.status.cls.has('status-skip'), true);
  assert.strictEqual(els.status.cls.has('status-none'), false);
  assert.ok(/id="status"[^>]*role="status"/.test(read('popup/popup.html')));
  assert.ok(/id="status"[^>]*title="현재 탭 기준 상태"/.test(read('popup/popup.html')));
});

test('상태 줄: level이 바뀌면 이전 클래스를 지운다', async () => {
  let res = { status: okStatus };
  const tabs = tabsStub(() => res);
  const { els, tick } = await setup({}, { tabs });
  await flushN();
  assert.strictEqual(els.status.cls.has('status-ok'), true);
  res = { status: { level: 'error', text: 'x', hint: 'y' } };
  tick();
  await flushN();
  assert.strictEqual(els.status.cls.has('status-ok'), false);
  assert.strictEqual(els.status.cls.has('status-error'), true);
});

test('상태 줄: 요청 거부·무응답·잘못된 응답은 동작하지 않음 + 권한 안내', async () => {
  const cases = [
    {
      query: async () => [{ id: 1 }],
      sendMessage: async () => {
        throw new Error('Could not establish connection');
      },
    },
    tabsStub(undefined),
    tabsStub({ status: 'oops' }),
    tabsStub({ status: { level: 'bogus', text: 'x' } }),
  ];
  for (const tabs of cases) {
    const { els } = await setup({}, { tabs });
    await flushN();
    assert.strictEqual(els['status-text'].textContent, NONE_TEXT);
    assert.strictEqual(els['status-hint'].textContent, NONE_HINT);
    assert.strictEqual(els.status.cls.has('status-none'), true);
    assert.strictEqual(els.status.cls.has('status-off'), false);
  }
});

test('상태 줄: 탭 없음·id 없음·browser.tabs 없음에서도 죽지 않음', async () => {
  for (const tabs of [
    tabsStub({ status: okStatus }, []),
    tabsStub({ status: okStatus }, [{}]),
    null,
  ]) {
    const { els } = await setup({}, tabs ? { tabs } : {});
    await flushN();
    assert.strictEqual(els['status-text'].textContent, NONE_TEXT);
    assert.strictEqual(els.status.cls.has('status-none'), true);
  }
});

test('상태 줄: 늦게 도착한 이전 응답은 새 결과를 덮지 않음', async () => {
  const resolvers = [];
  const tabs = {
    query: async () => [{ id: 3 }],
    sendMessage: () => new Promise((r) => resolvers.push(r)),
  };
  const { els, tick } = await setup({}, { tabs });
  await flushN();
  tick();
  await flushN();
  assert.strictEqual(resolvers.length, 2);
  resolvers[1]({ status: { level: 'ok', text: '새 결과', hint: '' } });
  await flushN();
  resolvers[0]({ status: { level: 'wait', text: '옛 결과', hint: '' } });
  await flushN();
  assert.strictEqual(els['status-text'].textContent, '새 결과');
  assert.strictEqual(els.status.cls.has('status-ok'), true);
});

test('상태 줄: URL은 읽지 않고 DOM 어디에도 나오지 않음', async () => {
  const tabs = tabsStub({ status: okStatus }, [
    { id: 7, url: 'https://www.youtube.com/watch?v=SECRET', title: 'SECRET_TITLE' },
  ]);
  const { els } = await setup({}, { tabs });
  await flushN();
  for (const id of Object.keys(els)) {
    assert.ok(!/SECRET|youtube\.com\/watch/.test(String(els[id].textContent)), id);
  }
  const src = read('popup/popup.js');
  assert.ok(!/\.url\b|\.title\b/.test(src));
});

test('켜기 스위치 직후: 응답 전에 꺼짐·켜는 중을 즉시 표시, 다음 폴링에서 확정', async () => {
  const tabs = tabsStub({ status: okStatus });
  const { els, tick, params } = await setup({}, { tabs });
  await flushN();
  els.enabled.checked = false;
  els.enabled.fire('change');
  const off = params.statusOf({ enabled: false });
  assert.strictEqual(els['status-text'].textContent, off.text);
  assert.strictEqual(els['status-hint'].textContent, off.hint);
  assert.strictEqual(els.status.cls.has('status-off'), true);
  els.enabled.checked = true;
  els.enabled.fire('change');
  assert.strictEqual(els['status-text'].textContent, '켜는 중…');
  assert.strictEqual(els.status.cls.has('status-wait'), true);
  tick();
  await flushN();
  assert.strictEqual(els['status-text'].textContent, 'HDR 변환 중');
  assert.strictEqual(els.status.cls.has('status-ok'), true);
});

test('켜기 스위치 직후: 진행 중이던 이전 응답이 즉시 표시를 덮지 않음', async () => {
  const resolvers = [];
  const tabs = {
    query: async () => [{ id: 3 }],
    sendMessage: () => new Promise((r) => resolvers.push(r)),
  };
  const { els } = await setup({}, { tabs });
  await flushN();
  els.enabled.checked = false;
  els.enabled.fire('change');
  resolvers[0]({ status: okStatus });
  await flushN();
  assert.strictEqual(els.status.cls.has('status-off'), true);
});

test('상태 폴링: 1초 간격으로 등록, setInterval이 없으면 건너뜀', async () => {
  const tabs = tabsStub({ status: okStatus });
  const { intervalMs } = await setup({}, { tabs });
  assert.deepStrictEqual(intervalMs, [1000, 1000]);
  const none = await setup({}, { tabs: tabsStub({ status: okStatus }), noInterval: true });
  assert.deepStrictEqual(none.intervalMs, []);
  assert.ok(none.els['status-text']);
});

test('상태 알림 체크박스: 초기값 cur.notify, 변경 시 boolean 저장, 복원 후 true', async () => {
  const { els, sets, flush } = await setup({ 'sdrhdr.notify': false });
  assert.strictEqual(els.notify.checked, false);
  els.notify.checked = true;
  els.notify.fire('change');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.notify': true }]);
  els.notify.checked = false;
  els.notify.fire('change');
  assert.deepStrictEqual(sets[1], { 'sdrhdr.notify': false });
  els.reset.fire('click');
  els.reset.fire('click');
  await flush();
  assert.strictEqual(els.notify.checked, true);
  assert.strictEqual((await setup()).els.notify.checked, true);
});

test('단축키 안내 문구와 진단 없음 개정 문구', async () => {
  const html = read('popup/popup.html');
  assert.ok(html.includes('Option+H 누르는 동안 원본 · Option+Shift+H 켜기/끄기'));
  const { els } = await setup();
  els['diag-section'].open = true;
  els['diag-section'].fire('toggle');
  assert.strictEqual(
    els.diag.value,
    '아직 상태 정보가 없습니다. ① www.youtube.com 영상 페이지에서 재생 ② Safari 설정 › 확장 › SDR HDR에서 www.youtube.com 접근 허용 ③ 새로고침. 이 창은 자동으로 갱신됩니다',
  );
});

const NO_DIAG_TEXT =
  '아직 상태 정보가 없습니다. ① www.youtube.com 영상 페이지에서 재생 ② Safari 설정 › 확장 › SDR HDR에서 www.youtube.com 접근 허용 ③ 새로고침. 이 창은 자동으로 갱신됩니다';

test('진단 영역이 닫혀 있으면 getDiag 0회, textarea 불변, 2초 타이머 없음 (V1 a)', async () => {
  const box = diagBox(DIAG);
  const { els, sets, intervalMs, tick } = await setup({}, { tabs: box.tabs });
  await flushN();
  assert.strictEqual(getDiagCalls(box.tabs).length, 0);
  assert.ok(!intervalMs.includes(2000));
  tick();
  await flushN();
  assert.strictEqual(getDiagCalls(box.tabs).length, 0);
  assert.strictEqual(els.diag.value, '', '닫힌 동안 textarea를 건드리지 않는다');
  assert.strictEqual(sets.length, 0);
});

test('진단 영역 열기: 즉시 1회 + 2초마다 getDiag 1회, 저장소 쓰기 0회, 닫으면 중단', async () => {
  const box = diagBox(withState('probing'));
  const ctx = await setup({}, { tabs: box.tabs });
  const { els, sets, intervalMs, tick } = ctx;
  await openDiag(ctx);
  assert.strictEqual(getDiagCalls(box.tabs).length, 1);
  assert.ok(els.diag.value.includes('probing'));
  assert.strictEqual(intervalMs.filter((ms) => ms === 2000).length, 1);
  tick();
  await flushN();
  assert.ok(getDiagCalls(box.tabs).length >= 2);
  // 탭 id만 사용: 질의는 {active, currentWindow}, 메시지는 {type}만
  for (const q of box.tabs.calls.query)
    assert.deepStrictEqual(plain(q), { active: true, currentWindow: true });
  for (const [id, m] of getDiagCalls(box.tabs)) {
    assert.strictEqual(id, 7);
    assert.deepStrictEqual(plain(m), { type: 'sdrhdr:getDiag' });
  }
  els['diag-section'].open = false;
  els['diag-section'].fire('toggle');
  const n = getDiagCalls(box.tabs).length;
  tick();
  await flushN();
  assert.strictEqual(getDiagCalls(box.tabs).length, n, '닫으면 요청 중단');
  assert.strictEqual(sets.length, 0, '진단 때문에 저장소에 쓰지 않는다');
});

test('진단 영역 열린 동안 pagehide에 요청 중단', async () => {
  const box = diagBox(DIAG);
  const ctx = await setup({}, { tabs: box.tabs });
  await openDiag(ctx);
  assert.strictEqual(getDiagCalls(box.tabs).length, 1);
  ctx.fireGlobal('pagehide');
  ctx.tick();
  await flushN();
  assert.strictEqual(getDiagCalls(box.tabs).length, 1);
});

test('getDiag 무응답·reject·탭 없음: 안내 문구, 같은 문구면 다시 그리지 않음', async () => {
  const cases = [
    ['무응답', (box) => (box.diag = undefined), [{ id: 7 }]],
    ['reject', null, [{ id: 7 }]],
    ['탭 없음', (box) => (box.diag = undefined), []],
  ];
  for (const [name, mut, list] of cases) {
    const box = { diag: undefined };
    box.tabs = tabsStub((id, msg) => {
      if (!isGetDiag(msg)) return { status: okStatus };
      if (name === 'reject') throw new Error('no receiver');
      return box.diag;
    }, list);
    if (mut) mut(box);
    const ctx = await setup({}, { tabs: box.tabs });
    await openDiag(ctx);
    assert.strictEqual(ctx.els.diag.value, NO_DIAG_TEXT, name);
    assert.strictEqual(ctx.els['diag-source'].textContent, '', name);
    if (name === '탭 없음') assert.strictEqual(getDiagCalls(box.tabs).length, 0);
  }
  // 이미 같은 문구면 textarea에 다시 쓰지 않는다
  const box = diagBox(undefined);
  const ctx = await setup({}, { tabs: box.tabs });
  await openDiag(ctx);
  ctx.els.diag.scrollTop = 33;
  let writes = 0;
  let v = ctx.els.diag.value;
  Object.defineProperty(ctx.els.diag, 'value', {
    get: () => v,
    set: (x) => {
      writes++;
      v = x;
    },
  });
  ctx.tick();
  await flushN();
  assert.strictEqual(writes, 0);
  // 진단이 있다가 응답이 끊기면 안내 문구로
  box.diag = DIAG;
  ctx.tick();
  await flushN();
  assert.ok(v.includes('active'));
  box.diag = undefined;
  ctx.tick();
  await flushN();
  assert.strictEqual(v, NO_DIAG_TEXT);
});

test('늦게 도착한 이전 getDiag 응답은 무시', async () => {
  const waiters = [];
  const tabs = {
    calls: { query: [], send: [] },
    query: async () => [{ id: 7 }],
    sendMessage: (id, msg) => {
      if (!isGetDiag(msg)) return Promise.resolve({ status: okStatus });
      return new Promise((r) => waiters.push(r));
    },
  };
  const ctx = await setup({}, { tabs });
  await openDiag(ctx); // 요청 1
  ctx.tick();
  await flushN(); // 요청 2
  assert.strictEqual(waiters.length, 2);
  waiters[1](withState('new'));
  await flushN();
  assert.ok(ctx.els.diag.value.includes('new'));
  waiters[0](withState('old'));
  await flushN();
  assert.ok(ctx.els.diag.value.includes('new'));
  assert.ok(!ctx.els.diag.value.includes('old'));
});

test('storage.onChanged의 sdrhdr.diag는 무시, 초기 표시도 저장소 진단을 읽지 않음', async () => {
  const ctx = await setup({ 'sdrhdr.diag': DIAG });
  await openDiag(ctx);
  assert.strictEqual(ctx.els.diag.value, NO_DIAG_TEXT);
  ctx.emitStore('sdrhdr.diag', withState('probing'));
  assert.strictEqual(ctx.els.diag.value, NO_DIAG_TEXT);
});

test('Blob은 JSON 저장 클릭 시에만 만들고 마지막 응답을 담는다', async () => {
  const box = diagBox(withState('probing'));
  const ctx = await setup({}, { tabs: box.tabs });
  await openDiag(ctx);
  assert.strictEqual(ctx.blobs.length, 0);
  ctx.els.save.fire('click');
  assert.strictEqual(ctx.blobs.length, 1);
  assert.ok(ctx.blobs[0].includes('probing'));
});

test('복원 안내: restoredAt이 있으면 진단 영역에 한 줄, 없으면 숨김, 변경 시 갱신 (U1)', async () => {
  const none = await setup({});
  assert.strictEqual(none.els['restored-note'].hidden, true);
  const ms = new Date(2026, 9, 3, 9, 5).getTime();
  const { els } = await setup({ 'sdrhdr.restoredAt': ms });
  assert.strictEqual(els['restored-note'].hidden, false);
  assert.strictEqual(
    els['restored-note'].textContent,
    '10월 3일 09:05 재시작 후 설정을 백업에서 복원함',
  );
  assert.ok(!els['restored-note'].textContent.includes('watch'));
});

test('복원 안내: 저장소 변경 이벤트로 나중에 생겨도 표시', async () => {
  const { els, changed } = await setup({});
  changed.forEach((fn) =>
    fn({ 'sdrhdr.restoredAt': { newValue: new Date(2026, 9, 3, 23, 59).getTime() } }, 'local'),
  );
  assert.strictEqual(els['restored-note'].hidden, false);
  assert.ok(els['restored-note'].textContent.startsWith('10월 3일 23:59'));
});

const RESET_NOTE =
  '설정을 읽지 못했거나 초기화됨. 내 프리셋에서 다시 불러오거나 Safari를 재시작하세요';
const oneUp = [{ id: 'a', name: 'A', createdAt: 1, values: { strength: 0.5 } }];

test('초기화 안내: 설정 키가 모두 비고 내 프리셋이 있으면 표시 (V1 b0)', async () => {
  const { els } = await setup({ 'sdrhdr.userPresets': oneUp });
  assert.strictEqual(els['restored-note'].hidden, false);
  assert.strictEqual(els['restored-note'].textContent, RESET_NOTE);
});

test('초기화 안내: 내 프리셋이 없으면(처음 설치) 표시하지 않음', async () => {
  const { els } = await setup({});
  assert.strictEqual(els['restored-note'].hidden, true);
});

test('초기화 안내: 설정 키가 하나라도 있으면 표시하지 않음', async () => {
  const { els } = await setup({ 'sdrhdr.userPresets': oneUp, 'sdrhdr.strength': 0.6 });
  assert.strictEqual(els['restored-note'].hidden, true);
});

test('초기화 안내: restoredAt이 있으면 복원 문구가 우선', async () => {
  const { els } = await setup({
    'sdrhdr.userPresets': oneUp,
    'sdrhdr.restoredAt': new Date(2026, 9, 3, 9, 5).getTime(),
  });
  assert.strictEqual(
    els['restored-note'].textContent,
    '10월 3일 09:05 재시작 후 설정을 백업에서 복원함',
  );
});

test('초기화 안내: 이후 설정 키가 생기면 숨김', async () => {
  const { els, emitStore } = await setup({ 'sdrhdr.userPresets': oneUp });
  assert.strictEqual(els['restored-note'].hidden, false);
  emitStore('sdrhdr.hud', true);
  assert.strictEqual(els['restored-note'].hidden, true);
  assert.strictEqual(els['restored-note'].textContent, '');
});

// ---- 내 프리셋 (PLAN D-M9 M9-3) ----
const UP_KEY = 'sdrhdr.userPresets';
const vals = (o = {}) => ({
  P: 3,
  k: 0.45,
  n: 2,
  g: 1.1,
  s: 1,
  hs: 1,
  strength: 0.6,
  sharpness: 0.2,
  saturation: 1.1,
  ...o,
});
const entry = (id, name, o) => ({ id, name, createdAt: 1000, values: vals(o) });
const upSets = (sets) => sets.filter((o) => UP_KEY in o);

test('내 프리셋: init 목록·summary 개수, 비면 단일 비활성 옵션과 버튼 비활성', async () => {
  const a = await setup({ [UP_KEY]: [entry('u1', 'A'), entry('u2', 'B')] });
  assert.strictEqual(a.els['up-summary'].textContent, '내 프리셋 (2)');
  assert.deepStrictEqual(
    a.els['up-list'].children.map((o) => [o.value, o.textContent]),
    [
      ['u1', 'A'],
      ['u2', 'B'],
    ],
  );
  assert.strictEqual(a.els['up-load'].disabled, false);
  assert.strictEqual(a.els['up-delete'].disabled, false);
  assert.strictEqual(read('popup/popup.html').includes('<details id="my-presets">'), true);
  assert.strictEqual(a.els['my-presets'].open, false);

  const b = await setup();
  assert.strictEqual(b.els['up-summary'].textContent, '내 프리셋 (0)');
  const ch = b.els['up-list'].children;
  assert.strictEqual(ch.length, 1);
  assert.strictEqual(ch[0].disabled, true);
  assert.strictEqual(ch[0].textContent, '저장된 프리셋 없음');
  assert.strictEqual(b.els['up-load'].disabled, true);
  assert.strictEqual(b.els['up-delete'].disabled, true);
  assert.strictEqual(b.els['up-save'].disabled, false);
  // 빈 목록에서 눌러도 저장 호출 없음
  b.els['up-load'].fire('click');
  b.els['up-delete'].fire('click');
  assert.strictEqual(b.sets.length, 0);
});

test('내 프리셋 저장: snapshotValues 값으로 신규 저장, 선택·저장됨 2초·입력 비움', async () => {
  const { els, sets, runTimers, params, clock } = await setup({
    'sdrhdr.preset': 'balanced',
    'sdrhdr.strength': 0.7,
    'sdrhdr.saturation': 1.2,
  });
  els['up-name'].value = '  내 설정  ';
  els['up-save'].fire('click');
  const w = upSets(sets);
  assert.strictEqual(w.length, 1);
  const list = w[0][UP_KEY];
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].name, '내 설정');
  assert.strictEqual(list[0].createdAt, clock.now);
  assert.deepStrictEqual(
    list[0].values,
    plain(
      params.snapshotValues({
        preset: 'balanced',
        custom: params.DEFAULT_CUSTOM,
        strength: 0.7,
        sharpness: 0,
        saturation: 1.2,
      }),
    ),
  );
  assert.strictEqual(els['up-list'].value, list[0].id);
  assert.strictEqual(els['up-summary'].textContent, '내 프리셋 (1)');
  assert.strictEqual(els['up-status'].textContent, '저장됨');
  assert.strictEqual(els['up-name'].value, '');
  runTimers();
  assert.strictEqual(els['up-status'].textContent, '');
});

test('내 프리셋 저장: 이름 공백·가득 참 오류 문구, 저장 없음', async () => {
  const { els, sets } = await setup();
  els['up-name'].value = '   ';
  els['up-save'].fire('click');
  assert.strictEqual(els['up-status'].textContent, '이름을 1~20자로 입력하세요');
  assert.strictEqual(upSets(sets).length, 0);
  const full = Array.from({ length: 20 }, (_, i) => entry('u' + i, 'N' + i));
  const b = await setup({ [UP_KEY]: full });
  b.els['up-name'].value = '새것';
  b.els['up-save'].fire('click');
  assert.strictEqual(
    b.els['up-status'].textContent,
    '최대 20개입니다. 하나를 삭제한 뒤 저장하세요',
  );
  assert.strictEqual(upSets(b.sets).length, 0);
  assert.strictEqual(b.els['up-summary'].textContent, '내 프리셋 (20)');
});

test('내 프리셋 저장: 같은 이름은 2단계 덮어쓰기, 3초 후·입력 변경 시 확인 해제, id 유지', async () => {
  const { els, sets, runTimers } = await setup({
    [UP_KEY]: [entry('u1', 'A', { strength: 0.1 })],
    'sdrhdr.strength': 0.9,
  });
  els['up-name'].value = 'A';
  els['up-save'].fire('click');
  assert.strictEqual(els['up-save'].textContent, '덮어쓰기 확인');
  assert.strictEqual(upSets(sets).length, 0);
  runTimers();
  assert.strictEqual(els['up-save'].textContent, '현재 설정 저장');
  els['up-save'].fire('click');
  assert.strictEqual(els['up-save'].textContent, '덮어쓰기 확인');
  els['up-name'].value = 'AB';
  els['up-name'].fire('input');
  assert.strictEqual(els['up-save'].textContent, '현재 설정 저장');
  els['up-name'].value = 'A';
  els['up-save'].fire('click');
  els['up-save'].fire('click');
  const w = upSets(sets);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0][UP_KEY].length, 1);
  assert.strictEqual(w[0][UP_KEY][0].id, 'u1');
  assert.strictEqual(w[0][UP_KEY][0].values.strength, 0.9);
  assert.strictEqual(els['up-save'].textContent, '현재 설정 저장');
});

test('내 프리셋 불러오기: 한 번의 set에 5키+customPrev, 안내·UI 재표시, 되돌리기', async () => {
  const prev = { P: 5, k: 0.7, n: 3, g: 1.1, s: 0.9, hs: 0.8 };
  const { els, sets, params } = await setup({
    [UP_KEY]: [entry('u1', '밝게')],
    'sdrhdr.preset': 'custom',
    'sdrhdr.custom': prev,
  });
  els['up-list'].value = 'u1';
  els['up-load'].fire('click');
  assert.strictEqual(sets.length, 1);
  assert.deepStrictEqual(sets[0], {
    'sdrhdr.preset': 'custom',
    'sdrhdr.custom': { P: 3, k: 0.45, n: 2, g: 1.1, s: 1, hs: 1 },
    'sdrhdr.strength': 0.6,
    'sdrhdr.sharpness': 0.2,
    'sdrhdr.saturation': 1.1,
    'sdrhdr.customPrev': prev,
  });
  assert.strictEqual(els.preset.value, 'custom');
  assert.strictEqual(els.strength.value, '60');
  assert.strictEqual(els.sharpness.value, '20');
  assert.strictEqual(els.saturation.value, '110');
  assert.strictEqual(Number(els['d-P'].value), 3);
  assert.strictEqual(els['d-g-value'].textContent, '×1.10');
  const peak = params.effectivePeak({
    preset: 'custom',
    custom: { P: 3, k: 0.45, n: 2, g: 1.1, s: 1, hs: 1 },
    strength: 0.6,
  });
  assert.strictEqual(
    els['peak-value'].textContent,
    `유효 피크 ×${peak.toFixed(2)} (SDR 흰색 대비)`,
  );
  assert.strictEqual(els['backup-note'].hidden, false);
  assert.strictEqual(
    els['backup-text'].textContent,
    '이전 사용자 지정 곡선을 「밝게」 기준으로 바꿨습니다',
  );
  sets.length = 0;
  els['backup-undo'].fire('click');
  assert.deepStrictEqual(sets, [{ 'sdrhdr.preset': 'custom', 'sdrhdr.custom': prev }]);
  assert.strictEqual(Number(els['d-P'].value), 5);
  assert.strictEqual(els['backup-note'].hidden, true);
});

test('내 프리셋 불러오기: 이름 있는 프리셋 상태에서도 저장된 custom이 다르면 백업', async () => {
  const prev = { P: 5, k: 0.7, n: 3, g: 1.1, s: 0.9, hs: 0.8 };
  const { els, sets } = await setup({
    [UP_KEY]: [entry('u1', 'X')],
    'sdrhdr.preset': 'vivid',
    'sdrhdr.custom': prev,
  });
  els['up-load'].fire('click');
  assert.strictEqual(sets.length, 1);
  assert.deepStrictEqual(sets[0]['sdrhdr.customPrev'], prev);
  assert.strictEqual(sets[0]['sdrhdr.preset'], 'custom');
  assert.strictEqual(els['backup-note'].hidden, false);
});

test('내 프리셋 불러오기: 현재 custom과 같은 곡선이면 백업·안내 없음(5키만)', async () => {
  const c = { P: 3, k: 0.45, n: 2, g: 1.1, s: 1, hs: 1 };
  const { els, sets } = await setup({
    [UP_KEY]: [entry('u1', 'X')],
    'sdrhdr.preset': 'custom',
    'sdrhdr.custom': c,
  });
  els['up-load'].fire('click');
  assert.strictEqual(sets.length, 1);
  assert.deepStrictEqual(Object.keys(sets[0]).sort(), [
    'sdrhdr.custom',
    'sdrhdr.preset',
    'sdrhdr.saturation',
    'sdrhdr.sharpness',
    'sdrhdr.strength',
  ]);
  assert.strictEqual(els['backup-note'].hidden, true);
});

test('내 프리셋 삭제: 2단계 확인, 3초 후 원상, 선택 변경 시 해제', async () => {
  const { els, sets, runTimers } = await setup({
    [UP_KEY]: [entry('u1', 'A'), entry('u2', 'B')],
  });
  els['up-list'].value = 'u2';
  els['up-delete'].fire('click');
  assert.strictEqual(els['up-delete'].textContent, '삭제 확인');
  assert.strictEqual(sets.length, 0);
  runTimers();
  assert.strictEqual(els['up-delete'].textContent, '삭제');
  els['up-delete'].fire('click');
  els['up-list'].value = 'u1';
  els['up-list'].fire('change');
  assert.strictEqual(els['up-delete'].textContent, '삭제');
  els['up-delete'].fire('click');
  els['up-delete'].fire('click');
  const w = upSets(sets);
  assert.strictEqual(w.length, 1);
  assert.deepStrictEqual(
    w[0][UP_KEY].map((e) => e.id),
    ['u2'],
  );
  assert.strictEqual(els['up-summary'].textContent, '내 프리셋 (1)');
  assert.strictEqual(els['up-status'].textContent, '삭제됨');
  assert.strictEqual(els['up-list'].value, 'u2');
});

test('내 프리셋: 항목을 고르면 이름 입력에 이름을 채움', async () => {
  const { els } = await setup({ [UP_KEY]: [entry('u1', 'A'), entry('u2', 'B')] });
  els['up-list'].value = 'u2';
  els['up-list'].fire('change');
  assert.strictEqual(els['up-name'].value, 'B');
});

test('내 프리셋: onChanged로 목록·summary 갱신, 잘못된 값은 빈 목록', async () => {
  const { els, emitStore } = await setup({ [UP_KEY]: [entry('u1', 'A')] });
  emitStore(UP_KEY, [entry('u1', 'A'), entry('u3', 'C')]);
  assert.strictEqual(els['up-summary'].textContent, '내 프리셋 (2)');
  assert.strictEqual(els['up-list'].children.length, 2);
  emitStore(UP_KEY, undefined);
  assert.strictEqual(els['up-summary'].textContent, '내 프리셋 (0)');
  assert.strictEqual(els['up-load'].disabled, true);
});

test('내 프리셋: 진단 모드면 불러오기·저장·삭제 잠금, 정상 모드로 돌리면 해제', async () => {
  const { els } = await setup({
    [UP_KEY]: [entry('u1', 'A')],
    'sdrhdr.mode': 'stripes',
  });
  for (const id of ['up-load', 'up-save', 'up-delete']) {
    assert.strictEqual(els[id].disabled, true, id);
    assert.strictEqual(els[id].attrs['aria-describedby'], 'locked-note', id);
  }
  els.mode.value = 'itm';
  els.mode.fire('change');
  for (const id of ['up-load', 'up-save', 'up-delete'])
    assert.strictEqual(els[id].disabled, false, id);
});

test('내 프리셋: 기본값 복원은 목록을 지우지 않는다', async () => {
  const { els, removes, flush } = await setup({ [UP_KEY]: [entry('u1', 'A')] });
  els.reset.fire('click');
  els.reset.fire('click');
  await flush();
  assert.strictEqual(removes.length, 1);
  assert.ok(!removes[0].includes(UP_KEY));
  assert.strictEqual(els['up-summary'].textContent, '내 프리셋 (1)');
  assert.strictEqual(els['up-list'].children.length, 1);
});

test('내 프리셋: 이름은 textContent로만 들어가고 HTML로 해석되지 않는다', async () => {
  const { els } = await setup({ [UP_KEY]: [entry('u1', '<b>x</b>')] });
  const o = els['up-list'].children[0];
  assert.strictEqual(o.textContent, '<b>x</b>');
  assert.strictEqual('innerHTML' in o, false);
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(read('popup/popup.js')));
  els['up-list'].value = 'u1';
  els['up-load'].fire('click');
  assert.ok(els['backup-text'].textContent.includes('「<b>x</b>」'));
});
