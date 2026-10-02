'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension', 'content');

function load() {
  const ctx = vm.createContext({});
  for (const f of ['ns.js', 'detect.js', 'params.js', 'hud.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.__sdrhdr.hud;
}
const { hudLines: rawLines, createHud } = load();
// vm context의 배열은 deepStrictEqual 프로토타입 비교에 걸리므로 현재 realm으로 복사한다.
const hudLines = (info) => Array.from(rawLines(info));

const full = {
  state: 'active',
  skipReason: null,
  path: 'vf',
  preset: 'accurate',
  strength: 0.53,
  sharpness: 0,
  saturation: 1.05,
  effectivePeak: 1.53,
  loopFps: 59.96,
  jsP95: 1.234,
  missPct: 0.04,
  videoW: 1920,
  videoH: 1080,
};

test('hudLines: 정상값', () => {
  assert.deepStrictEqual(hudLines(full), [
    'HDR 변환 중 (active)  경로 vf',
    '정확 · 강도 53%  선명도 0%  채도 105%',
    '유효 피크 ×1.53',
    '렌더 fps 60.0  JS p95 1.2ms  누락 0.0%',
    '영상 1920×1080',
  ]);
});

test('hudLines: skipReason 표시', () => {
  assert.strictEqual(
    hudLines({ ...full, state: 'skipped', skipReason: 'hdrSource' })[0],
    '이미 HDR 영상: 원본 표시 (hdrSource)  경로 vf',
  );
});

test('hudLines: 1줄은 statusOf 문구 + 원래 id (skip이 있으면 skip, 없으면 state)', () => {
  const line = (o) => hudLines({ ...full, ...o })[0];
  assert.strictEqual(line({ state: 'probing' }), '판정 중(원본 표시) (probing)  경로 vf');
  assert.strictEqual(
    line({ state: 'probing', undecided: true }),
    '입력 경로를 찾지 못해 원본 표시 (probing)  경로 vf',
  );
  assert.strictEqual(
    line({ state: 'skipped', skipReason: 'drm', drmNow: true }),
    'DRM 영상: 변환하지 않음 (drm)  경로 vf',
  );
  assert.strictEqual(
    line({ state: 'skipped', skipReason: 'drm', drmNow: false }),
    '이전 DRM 영상 때문에 이 탭에서는 변환 중지 (drm)  경로 vf',
  );
  assert.strictEqual(
    line({ state: 'skipped', skipReason: 'noGpu', errorName: 'GPUError' }),
    '렌더 오류(GPUError) (noGpu)  경로 vf',
  );
  assert.strictEqual(
    line({ enabled: false, state: 'skipped', skipReason: 'disabled' }),
    '꺼짐 (disabled)  경로 vf',
  );
  assert.strictEqual(line({ bypass: true }), '원본 보기 중 (active)  경로 vf');
});

test('hudLines: 진단 모드면 2·3줄 끝에 (미적용), 정상 모드·미지정에는 없다 (UX-15)', () => {
  const diag = hudLines({ ...full, mode: 'baseline' });
  assert.ok(diag[1].endsWith(' (미적용)'));
  assert.ok(diag[2].endsWith(' (미적용)'));
  assert.ok(!diag[3].includes('미적용') && !diag[4].includes('미적용'));
  assert.ok(diag[0].startsWith('진단 모드: HDR 변환 안 함 (active)'));
  for (const mode of ['itm', undefined]) {
    const l = hudLines({ ...full, mode });
    assert.ok(!l[1].includes('미적용') && !l[2].includes('미적용'));
  }
});

test('hudLines: 일시정지면 4줄 앞에 안내 (UX-15)', () => {
  assert.strictEqual(
    hudLines({ ...full, paused: true })[3],
    '일시정지: 정지 직전 값 · 렌더 fps 60.0  JS p95 1.2ms  누락 0.0%',
  );
  assert.ok(hudLines({ ...full, paused: false })[3].startsWith('렌더 fps'));
  assert.ok(hudLines(full)[3].startsWith('렌더 fps'));
});

test('hudLines: 전부 null/undefined/비객체', () => {
  const want = [
    '대상 영상을 찾는 중 (-)  경로 -',
    '- · 강도 -%  선명도 -%  채도 -%',
    '유효 피크 ×-',
    '렌더 fps -  JS p95 -ms  누락 -%',
    '영상 -×-',
  ];
  assert.deepStrictEqual(hudLines({}), want);
  assert.deepStrictEqual(hudLines(null), want);
  assert.deepStrictEqual(hudLines(undefined), want);
  const nulls = Object.fromEntries(Object.keys(full).map((k) => [k, null]));
  assert.deepStrictEqual(hudLines(nulls), want);
});

test('hudLines: NaN·문자열·Infinity는 -', () => {
  const bad = {
    state: 5,
    path: {},
    preset: 'accurate',
    strength: NaN,
    sharpness: '0.5',
    saturation: Infinity,
    effectivePeak: 'x',
    loopFps: NaN,
    jsP95: '1',
    missPct: -Infinity,
    videoW: '1920',
    videoH: NaN,
  };
  assert.deepStrictEqual(hudLines(bad), [
    '대상 영상을 찾는 중 (-)  경로 -',
    '정확 · 강도 -%  선명도 -%  채도 -%',
    '유효 피크 ×-',
    '렌더 fps -  JS p95 -ms  누락 -%',
    '영상 -×-',
  ]);
});

test('hudLines: 프리셋 라벨 4종과 그 외', () => {
  const label = (preset) => hudLines({ preset })[1].split(' ')[0];
  assert.strictEqual(hudLines({ preset: 'accurate' })[1].startsWith('정확 · '), true);
  assert.strictEqual(hudLines({ preset: 'balanced' })[1].startsWith('균형 · '), true);
  assert.strictEqual(hudLines({ preset: 'vivid' })[1].startsWith('강조 · 강도'), true);
  assert.strictEqual(hudLines({ preset: 'custom' })[1].startsWith('사용자 지정 · 강도'), true);
  assert.strictEqual(label('toString'), '-');
  assert.strictEqual(label('nope'), '-');
});

test('hudLines: 반올림', () => {
  const l = hudLines({
    strength: 0.504,
    sharpness: 0.505,
    saturation: 0.995,
    effectivePeak: 1.005,
    loopFps: 29.95,
    jsP95: 0.05,
  });
  assert.match(l[1], /강도 50%  선명도 51%  채도 100%/);
  assert.strictEqual(l[2], '유효 피크 ×' + (1.005).toFixed(2));
  assert.strictEqual(
    l[3],
    '렌더 fps ' + (29.95).toFixed(1) + '  JS p95 ' + (0.05).toFixed(1) + 'ms  누락 -%',
  );
  assert.strictEqual(hudLines(full).length, 5);
});

// 최소 DOM 스텁: 형제 순서와 textContent 대입 횟수만 관찰한다.
function makeDom() {
  let assigns = 0;
  const mk = () => {
    const el = {
      parentNode: null,
      nextSibling: null,
      style: { cssText: '' },
      children: [],
    };
    let tc = '';
    Object.defineProperty(el, 'textContent', {
      get: () => tc,
      set: (v) => {
        assigns += 1;
        tc = v;
      },
    });
    return el;
  };
  const doc = { createElement: mk };
  const parent = mk();
  const container = mk();
  const after = mk();
  container.ownerDocument = doc;
  parent.children.push(container, after);
  container.parentNode = after.parentNode = parent;
  parent.insertBefore = (el, ref) => {
    const idx = ref ? parent.children.indexOf(ref) : parent.children.length;
    parent.children.splice(idx, 0, el);
    el.parentNode = parent;
  };
  parent.removeChild = (el) => {
    parent.children.splice(parent.children.indexOf(el), 1);
    el.parentNode = null;
  };
  container.nextSibling = after;
  return { parent, container, after, assigns: () => assigns };
}

test('createHud: container 바로 뒤에 삽입, 스타일', () => {
  const d = makeDom();
  createHud(d.container);
  assert.strictEqual(d.parent.children.length, 3);
  const el = d.parent.children[1];
  assert.strictEqual(d.parent.children[0], d.container);
  assert.strictEqual(d.parent.children[2], d.after);
  assert.match(el.style.cssText, /pointer-events:none/);
  assert.match(el.style.cssText, /position:absolute/);
  assert.doesNotMatch(el.style.cssText, /z-index/);
});

test('createHud: update 같은 내용이면 대입 생략', () => {
  const d = makeDom();
  const hud = createHud(d.container);
  hud.update(['a', 'b']);
  hud.update(['a', 'b']);
  assert.strictEqual(d.assigns(), 1);
  assert.strictEqual(d.parent.children[1].textContent, 'a\nb');
  hud.update(['a', 'c']);
  assert.strictEqual(d.assigns(), 2);
});

test('createHud: destroy 멱등', () => {
  const d = makeDom();
  const hud = createHud(d.container);
  hud.destroy();
  assert.strictEqual(d.parent.children.length, 2);
  assert.doesNotThrow(() => hud.destroy());
  assert.strictEqual(d.parent.children.length, 2);
});

test('createHud: parentNode 없는 container는 no-op', () => {
  const hud = createHud({ parentNode: null });
  assert.doesNotThrow(() => {
    hud.update(['x']);
    hud.destroy();
  });
  assert.doesNotThrow(() => createHud(null).destroy());
});

// 칩: 타이머를 직접 돌리는 가짜 setTimeout을 vm 전역에 넣는다.
function loadChip() {
  const timers = new Map();
  let id = 0;
  const ctx = vm.createContext({
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, ms });
      return id;
    },
    clearTimeout: (t) => timers.delete(t),
  });
  for (const f of ['ns.js', 'detect.js', 'params.js', 'hud.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  return { chip: ctx.__sdrhdr.hud.createChip, timers };
}

test('createChip: container 바로 뒤 형제, 스타일(우상단·pointer-events none·z-index 없음)', () => {
  const d = makeDom();
  const { chip } = loadChip();
  chip(d.container);
  assert.strictEqual(d.parent.children.length, 3);
  const el = d.parent.children[1];
  assert.strictEqual(d.parent.children[0], d.container);
  assert.strictEqual(d.parent.children[2], d.after);
  assert.match(el.style.cssText, /position:absolute/);
  assert.match(el.style.cssText, /right:8px/);
  assert.match(el.style.cssText, /top:8px/);
  assert.match(el.style.cssText, /pointer-events:none/);
  assert.doesNotMatch(el.style.cssText, /z-index/);
  assert.match(el.style.cssText, /display:none/);
});

test('createChip: show는 문구를 보이고 기본 2500ms 뒤 비우며, 재호출은 이전 타이머를 취소한다', () => {
  const d = makeDom();
  const { chip, timers } = loadChip();
  const c = chip(d.container);
  const el = d.parent.children[1];
  c.show('HDR 변환 중');
  assert.strictEqual(el.textContent, 'HDR 변환 중');
  assert.strictEqual(el.style.display, 'block');
  assert.strictEqual(timers.size, 1);
  assert.strictEqual([...timers.values()][0].ms, 2500);
  c.show('꺼짐', 1000);
  assert.strictEqual(timers.size, 1, '이전 타이머 취소');
  assert.strictEqual(el.textContent, '꺼짐');
  assert.strictEqual([...timers.values()][0].ms, 1000);
  [...timers.values()][0].fn();
  assert.strictEqual(el.textContent, '');
  assert.strictEqual(el.style.display, 'none');
});

test('createChip: destroy는 멱등이고 타이머를 정리한다. parentNode 없으면 no-op', () => {
  const d = makeDom();
  const { chip, timers } = loadChip();
  const c = chip(d.container);
  c.show('x');
  c.destroy();
  assert.strictEqual(timers.size, 0);
  assert.strictEqual(d.parent.children.length, 2);
  assert.doesNotThrow(() => c.destroy());
  const n = chip({ parentNode: null });
  assert.doesNotThrow(() => {
    n.show('x');
    n.destroy();
  });
  assert.doesNotThrow(() => chip(null).destroy());
});
