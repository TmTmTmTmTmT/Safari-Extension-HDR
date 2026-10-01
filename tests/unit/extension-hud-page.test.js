'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension', 'content');

function load() {
  const ctx = vm.createContext({});
  for (const f of ['ns.js', 'hud.js']) {
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
    'active  경로 vf',
    '정확 강도 53%  선명 0%  채도 105%',
    '유효 피크 ×1.53',
    'fps 60.0  JS p95 1.2ms  누락 0.0%',
    'video 1920x1080',
  ]);
});

test('hudLines: skipReason 표시', () => {
  assert.strictEqual(
    hudLines({ ...full, state: 'skipped', skipReason: 'hdrSource' })[0],
    'skipped(hdrSource)  경로 vf',
  );
});

test('hudLines: 전부 null/undefined/비객체', () => {
  const want = [
    '-  경로 -',
    '- 강도 -%  선명 -%  채도 -%',
    '유효 피크 ×-',
    'fps -  JS p95 -ms  누락 -%',
    'video -x-',
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
    '-  경로 -',
    '정확 강도 -%  선명 -%  채도 -%',
    '유효 피크 ×-',
    'fps -  JS p95 -ms  누락 -%',
    'video -x-',
  ]);
});

test('hudLines: 프리셋 라벨 4종과 그 외', () => {
  const label = (preset) => hudLines({ preset })[1].split(' ')[0];
  assert.strictEqual(hudLines({ preset: 'accurate' })[1].startsWith('정확 '), true);
  assert.strictEqual(hudLines({ preset: 'balanced' })[1].startsWith('균형 '), true);
  assert.strictEqual(hudLines({ preset: 'vivid' })[1].startsWith('선명 강도'), true);
  assert.strictEqual(hudLines({ preset: 'custom' })[1].startsWith('사용자 지정 강도'), true);
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
  assert.match(l[1], /강도 50%  선명 51%  채도 100%/);
  assert.strictEqual(l[2], '유효 피크 ×' + (1.005).toFixed(2));
  assert.strictEqual(
    l[3],
    'fps ' + (29.95).toFixed(1) + '  JS p95 ' + (0.05).toFixed(1) + 'ms  누락 -%',
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
