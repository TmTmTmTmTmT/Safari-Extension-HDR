'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');

// 스텁 환경에서 ns, detect, overlay만 로드한다.
function setup(videoOpts = {}) {
  const docListeners = {};
  const observers = [];
  const rafs = new Map();
  let rafSeq = 0;
  const canvas = {
    style: {},
    removed: false,
    widthSets: 0,
    _w: 0,
    _h: 0,
    get width() {
      return this._w;
    },
    set width(v) {
      this.widthSets += 1;
      this._w = v;
    },
    get height() {
      return this._h;
    },
    set height(v) {
      this._h = v;
    },
    remove() {
      this.removed = true;
    },
  };
  const vListeners = {};
  const video = Object.assign(
    {
      offsetWidth: 1280,
      offsetHeight: 720,
      offsetLeft: 0,
      offsetTop: 0,
      videoWidth: 1920,
      videoHeight: 1080,
      nextSibling: null,
      addEventListener(n, f) {
        (vListeners[n] = vListeners[n] || new Set()).add(f);
      },
      removeEventListener(n, f) {
        if (vListeners[n]) vListeners[n].delete(f);
      },
    },
    videoOpts,
  );
  const container = { insertBefore() {} };
  class FakeRO {
    constructor(cb) {
      this.cb = cb;
      this.targets = [];
      this.disconnected = false;
      observers.push(this);
    }
    observe(t) {
      this.targets.push(t);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const ctx = vm.createContext({
    document: {
      createElement: () => canvas,
      addEventListener(n, f) {
        (docListeners[n] = docListeners[n] || new Set()).add(f);
      },
      removeEventListener(n, f) {
        if (docListeners[n]) docListeners[n].delete(f);
      },
    },
    ResizeObserver: FakeRO,
    devicePixelRatio: 1,
    requestAnimationFrame(cb) {
      rafSeq += 1;
      rafs.set(rafSeq, cb);
      return rafSeq;
    },
    cancelAnimationFrame(id) {
      rafs.delete(id);
    },
  });
  for (const f of ['ns.js', 'detect.js', 'overlay.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'content', f), 'utf8'), ctx, { filename: f });
  }
  const overlay = ctx.__sdrhdr.overlay.createOverlay(container, video);
  const flush = () => {
    const cbs = [...rafs.values()];
    rafs.clear();
    cbs.forEach((cb) => cb());
  };
  const count = (set) => (set ? set.size : 0);
  return { overlay, canvas, video, observers, rafs, docListeners, vListeners, flush, count };
}

test('같은 프레임의 다중 트리거는 계산 1회로 합쳐진다', () => {
  const s = setup();
  s.overlay.update();
  const base = s.canvas.widthSets;
  s.video.offsetWidth = 640;
  s.video.offsetHeight = 360;
  let reads = 0;
  Object.defineProperty(s.video, 'offsetWidth', {
    configurable: true,
    get() {
      reads += 1;
      return 640;
    },
  });
  s.observers[0].cb();
  s.observers[1].cb();
  for (const f of s.docListeners.fullscreenchange) f();
  for (const f of s.vListeners.resize) f();
  assert.strictEqual(s.rafs.size, 1);
  assert.strictEqual(reads, 0);
  s.flush();
  assert.strictEqual(reads, 1);
  assert.ok(s.canvas.widthSets > base);
  assert.strictEqual(s.rafs.size, 0);
});

test('fullscreenchange와 webkitfullscreenchange 모두 반응한다', () => {
  const s = setup();
  for (const name of ['fullscreenchange', 'webkitfullscreenchange']) {
    assert.strictEqual(s.count(s.docListeners[name]), 1, name);
    for (const f of s.docListeners[name]) f();
    assert.strictEqual(s.rafs.size, 1, name);
    s.flush();
  }
});

test('video와 container 두 Observer가 observe된다', () => {
  const s = setup();
  assert.strictEqual(s.observers.length, 2);
  assert.ok(s.observers.every((o) => o.targets.length === 1));
  assert.notStrictEqual(s.observers[0].targets[0], s.observers[1].targets[0]);
});

test('loadedmetadata와 resize가 갱신을 예약한다', () => {
  const s = setup();
  for (const name of ['loadedmetadata', 'resize']) {
    for (const f of s.vListeners[name]) f();
    assert.strictEqual(s.rafs.size, 1, name);
    s.flush();
  }
});

test('동기 update는 예약된 rAF를 취소하고 결과를 반환한다', () => {
  const s = setup();
  s.observers[0].cb();
  assert.strictEqual(s.rafs.size, 1);
  const res = s.overlay.update();
  assert.strictEqual(s.rafs.size, 0);
  assert.ok(res && res.width > 0);
  s.video.videoWidth = 0;
  assert.strictEqual(s.overlay.update(), null);
});

test('destroy는 rAF·리스너·Observer를 해제하고 canvas를 제거한다', () => {
  const s = setup();
  s.observers[0].cb();
  s.overlay.destroy();
  assert.strictEqual(s.rafs.size, 0);
  assert.ok(s.observers.every((o) => o.disconnected));
  for (const set of Object.values(s.docListeners)) assert.strictEqual(set.size, 0);
  for (const set of Object.values(s.vListeners)) assert.strictEqual(set.size, 0);
  assert.strictEqual(s.canvas.removed, true);
});

test('크기가 같으면 canvas.width를 재대입하지 않는다', () => {
  const s = setup();
  s.overlay.update();
  const n = s.canvas.widthSets;
  assert.ok(n >= 1);
  s.overlay.update();
  s.observers[0].cb();
  s.flush();
  assert.strictEqual(s.canvas.widthSets, n);
});
