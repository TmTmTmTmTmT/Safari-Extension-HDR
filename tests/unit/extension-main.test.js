'use strict';
// main.js 수명주기 통합: overlay·renderer·params를 stub으로 바꾸고 가짜 DOM으로 상태 전이와 호출을 본다. 실제 Safari 동작 검증이 아니다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const plain = (v) => JSON.parse(JSON.stringify(v));

function emitter() {
  const l = {};
  return {
    l,
    addEventListener(t, fn) {
      (l[t] = l[t] || new Set()).add(fn);
    },
    removeEventListener(t, fn) {
      if (l[t]) l[t].delete(fn);
    },
    fire(t) {
      [...(l[t] || [])].forEach((fn) => fn());
    },
  };
}

function makeVideo(src) {
  const v = Object.assign(emitter(), { currentSrc: src, mediaKeys: null, webkitKeys: null });
  return v;
}

async function setup(mode = 'itm') {
  const calls = [];
  const intervals = [];
  const doc = Object.assign(emitter(), { fullscreenElement: null });
  const dom = { video: makeVideo('blob:a'), container: { id: 'c' }, player: { id: 'p' } };
  doc.querySelector = (sel) => {
    if (!dom.player) return null;
    if (sel === '#movie_player') return dom.player;
    return null;
  };
  // findMainVideo는 player.querySelector를 쓴다.
  const mkPlayer = () => ({
    querySelector: (sel) => {
      if (sel === '.html5-video-container')
        return Object.assign(dom.container, {
          querySelector: (s) => (s === 'video.html5-main-video' ? dom.video : null),
        });
      return null;
    },
  });
  dom.player = mkPlayer();
  let settingsCb = null;
  const ctx = vm.createContext({
    document: doc,
    navigator: { userAgent: 'x' },
    location: { href: 'https://www.youtube.com/watch?v=abc' },
    screen: { width: 1, height: 1 },
    performance: { now: () => 0 },
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: (fn) => intervals.push(fn),
    Promise,
  });
  for (const f of manifest.content_scripts[0].js) {
    if (f === 'content/main.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const ns = ctx.__sdrhdr;
  ns.params.readSettings = async () => ({ enabled: true, mode, strength: 0.5 });
  ns.params.subscribe = (cb) => (settingsCb = cb);
  const t = { intervals, diag: null };
  ns.params.writeDiag = async (d) => {
    t.diag = d;
  };
  const renderers = [];
  ns.overlay.createOverlay = () => ({
    canvas: { style: {}, width: 0, height: 0 },
    update() {},
    destroy() {
      calls.push('overlay.destroy');
    },
  });
  ns.renderer.createRenderer = (canvas, video, onError, hooks) => {
    const r = {
      hooks,
      onError,
      colorSpace: null,
      start: () => calls.push('start'),
      stop: () => calls.push('stop'),
      setMode: (m) => calls.push('setMode:' + m),
      setStrength: (v) => calls.push('setStrength:' + v),
      restartSource: () => calls.push('restartSource'),
      destroy: () => calls.push('destroy'),
      getStats: () => ({ mode, path: 'ext', frames: 0, api: {}, colorSpace: r.colorSpace }),
    };
    renderers.push(r);
    return r;
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'content/main.js'), 'utf8'), ctx, {
    filename: 'content/main.js',
  });
  await ns.main.start();
  return Object.assign(t, { ctx, ns, doc, dom, calls, renderers, settings: (s) => settingsCb(s) });
}

// 진단 타이머를 수동으로 돌려 lifecycle 상태를 읽는다.
async function diagOf(t) {
  t.intervals.forEach((fn) => fn());
  await Promise.resolve();
  return plain(t.diag);
}

test('attach: 설정 읽고 video가 있으면 probing으로 시작하고 renderer를 시작한다', async () => {
  const t = await setup();
  assert.deepStrictEqual(
    t.calls.filter((c) => c === 'start' || c === 'setMode:itm'),
    ['setMode:itm', 'start'],
  );
  assert.strictEqual(t.renderers.length, 1);
});

test('소스 변경(loadstart, currentSrc 변경): restartSource, 같은 src나 빈 src는 무시', async () => {
  const t = await setup();
  const v = t.dom.video;
  v.fire('loadstart'); // 같은 src
  v.currentSrc = '';
  v.fire('emptied'); // 빈 src는 loadstart를 기다림
  assert.ok(!t.calls.includes('restartSource'));
  v.currentSrc = 'blob:b';
  v.fire('loadstart');
  assert.strictEqual(t.calls.filter((c) => c === 'restartSource').length, 1);
  assert.strictEqual(t.renderers.length, 1, 'GPU·renderer 재생성 없음');
});

test('HDR 원본: skipped(hdrSource)로 renderer 정지, 다음 소스에서 resume', async () => {
  const t = await setup();
  const r = t.renderers[0];
  const hdr = { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false };
  r.colorSpace = hdr;
  r.hooks.onProbe({ ext: 100, c2d: 100, colorSpace: hdr }, 'ext');
  assert.ok(t.calls.includes('stop'));
  let d = await diagOf(t);
  assert.strictEqual(d.lifecycle.state, 'skipped');
  assert.strictEqual(d.lifecycle.skipReason, 'hdrSource');
  assert.strictEqual(d.flags.hdrSource, true);
  assert.strictEqual(d.video.colorSpace.transfer, 'pq');
  r.colorSpace = null;
  t.dom.video.currentSrc = 'blob:b';
  t.dom.video.fire('loadstart');
  assert.ok(t.calls.lastIndexOf('restartSource') < t.calls.lastIndexOf('start'));
  d = await diagOf(t);
  assert.strictEqual(d.lifecycle.state, 'probing');
  assert.strictEqual(d.flags.hdrSource, false);
  assert.strictEqual(d.lifecycle.srcChanges, 1);
});

test('검은 프레임 연속: stop(소스 단위), 다음 소스에서 resume', async () => {
  const t = await setup();
  const r = t.renderers[0];
  const black = { ext: 0, vf: 0, copy: 0, c2d: 100 };
  r.hooks.onProbe(black, 'none');
  assert.ok(t.calls.includes('stop'));
  t.dom.video.currentSrc = 'blob:b';
  t.dom.video.fire('loadstart');
  assert.ok(t.calls.lastIndexOf('restartSource') < t.calls.lastIndexOf('start'));
  assert.strictEqual(t.renderers.length, 1);
});

test('DRM: encrypted 이벤트 → detach, 같은 요소의 다음 소스·nav에서도 재attach 없음', async () => {
  const t = await setup();
  t.dom.video.fire('encrypted');
  assert.ok(t.calls.includes('destroy'));
  t.dom.video.currentSrc = 'blob:b';
  t.dom.video.fire('loadstart');
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.renderers.length, 1);
  const d = await diagOf(t);
  assert.deepStrictEqual(
    [d.lifecycle.state, d.lifecycle.skipReason, d.flags.drm],
    ['skipped', 'drm', true],
  );
  assert.strictEqual(d.lifecycle.navCount, 1);
});

test('video 요소 교체: 이전 detach, 새 요소 attach (nav 이벤트)', async () => {
  const t = await setup();
  const old = t.dom.video;
  t.dom.video = makeVideo('blob:z');
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.renderers.length, 2);
  assert.ok(t.calls.includes('destroy'));
  assert.strictEqual(old.l.loadstart.size, 0, '이전 요소 리스너 해제');
  assert.strictEqual(t.dom.video.l.loadstart.size, 1);
  const d = await diagOf(t);
  assert.strictEqual(d.lifecycle.videoSwaps, 1);
  assert.strictEqual(d.lifecycle.state, 'probing');
});

test('DRM 요소가 교체되면 새 요소는 정상 attach', async () => {
  const t = await setup();
  t.dom.video.fire('encrypted');
  t.dom.video = makeVideo('blob:z');
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.renderers.length, 2);
});

test('PiP 진입은 stop, 해제는 restartSource+start', async () => {
  const t = await setup();
  const v = t.dom.video;
  v.webkitPresentationMode = 'picture-in-picture';
  v.fire('webkitpresentationmodechanged');
  assert.ok(t.calls.includes('stop'));
  v.webkitPresentationMode = 'inline';
  v.fire('webkitpresentationmodechanged');
  assert.ok(t.calls.lastIndexOf('restartSource') < t.calls.lastIndexOf('start'));
  assert.ok(t.calls.lastIndexOf('start') > t.calls.lastIndexOf('stop'));
  assert.strictEqual((await diagOf(t)).lifecycle.state, 'probing');
});

test('렌더러 오류(init): detach, 같은 요소 재attach 안 함, 설정 끄고 켜면 재시도', async () => {
  const t = await setup();
  t.renderers[0].onError(new Error('x'), 'init');
  assert.ok(t.calls.includes('destroy'));
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.renderers.length, 1);
  t.settings({ enabled: false, mode: 'itm' });
  t.settings({ enabled: true, mode: 'itm' });
  assert.strictEqual(t.renderers.length, 2);
});

test('disable: detach, 리스너 해제. 이후 nav에도 attach 안 함', async () => {
  const t = await setup();
  t.settings({ enabled: false, mode: 'itm' });
  assert.ok(t.calls.includes('destroy'));
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.renderers.length, 1);
});

test('video가 사라지면 detach', async () => {
  const t = await setup();
  t.dom.video = null;
  t.dom.player = { querySelector: () => null };
  t.doc.fire('yt-navigate-finish');
  assert.ok(t.calls.includes('destroy'));
  assert.deepStrictEqual(plain(t.renderers.length), 1);
});

test('강도: attach 시 hooks.strength로 전달, 설정 변경은 setStrength만(재attach 없음)', async () => {
  const t = await setup();
  assert.strictEqual(t.renderers[0].hooks.strength, 0.5);
  t.settings({ enabled: true, mode: 'itm', strength: 0.8 });
  assert.ok(t.calls.includes('setStrength:0.8'));
  assert.strictEqual(t.renderers.length, 1);
  assert.ok(!t.calls.includes('destroy'));
  const n = t.calls.filter((c) => c.startsWith('setStrength')).length;
  t.settings({ enabled: true, mode: 'itm', strength: 0.8 }); // 같은 값은 무시
  assert.strictEqual(t.calls.filter((c) => c.startsWith('setStrength')).length, n);
});
