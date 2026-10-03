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
    fire(t, ...args) {
      [...(l[t] || [])].forEach((fn) => fn(...args));
    },
  };
}

function makeVideo(src) {
  const v = Object.assign(emitter(), { currentSrc: src, mediaKeys: null, webkitKeys: null });
  return v;
}

const BASE = {
  enabled: true,
  mode: 'itm',
  preset: 'balanced',
  strength: 0.5,
  sharpness: 0,
  saturation: 1,
  custom: { P: 2, k: 0.5, n: 2, g: 1, s: 1, hs: 1 },
  notify: true,
};

async function setup(mode = 'itm', enabled = true) {
  const calls = [];
  const intervals = [];
  const doc = Object.assign(emitter(), {
    fullscreenElement: null,
    hidden: false,
    visibilityState: 'visible',
    activeElement: null,
  });
  // browser.runtime 스텁: 배지 알림 전송과 getState 리스너를 기록한다 (PLAN M8-3).
  const sent = [];
  const rt = { listeners: [], reject: false };
  const browser = {
    runtime: {
      sendMessage: (m) => {
        sent.push(m);
        return rt.reject ? Promise.reject(new Error('no receiver')) : Promise.resolve();
      },
      onMessage: { addListener: (fn) => rt.listeners.push(fn) },
    },
  };
  const win = emitter(); // window: blur 이벤트용
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
    browser,
    addEventListener: win.addEventListener,
  });
  for (const f of manifest.content_scripts[0].js) {
    if (f === 'content/main.js') continue;
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const ns = ctx.__sdrhdr;
  ns.params.readSettings = async () => ({
    enabled,
    mode,
    preset: 'balanced',
    strength: 0.5,
    sharpness: 0,
    saturation: 1,
    notify: true,
  });
  ns.params.subscribe = (cb) => (settingsCb = cb);
  const enabledWrites = [];
  ns.params.setEnabled = async (v) => {
    enabledWrites.push(v);
  };
  let diagReqCb = null;
  ns.params.subscribeDiagRequest = (cb) => (diagReqCb = cb);
  const t = { intervals, diag: null, diagWrites: 0 };
  ns.params.writeDiag = async (d) => {
    t.diag = d;
    t.diagWrites += 1;
  };
  const renderers = [];
  // 상태 칩도 스텁으로 바꾼다 (PLAN M8-3).
  t.chips = [];
  ns.hud.createChip = (container) => {
    const c = { container, shown: [], destroyed: 0 };
    c.show = (text) => c.shown.push(text);
    c.destroy = () => {
      c.destroyed += 1;
    };
    t.chips.push(c);
    return c;
  };
  // 페이지 HUD는 DOM이 없는 vm 환경이라 스텁으로 바꾼다 (PLAN M5-3).
  t.huds = [];
  ns.hud.createHud = (container) => {
    const h = { container, lines: null, destroyed: 0 };
    h.update = (lines) => {
      h.lines = lines;
    };
    h.destroy = () => {
      h.destroyed += 1;
    };
    t.huds.push(h);
    return h;
  };
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
      undecided: false,
      start: () => calls.push('start'),
      stop: () => calls.push('stop'),
      setMode: (m) => calls.push('setMode:' + m),
      setParams: (v) => calls.push('setParams:' + JSON.stringify(v)),
      restartSource: () => calls.push('restartSource'),
      setBypass: (on) => calls.push('setBypass:' + on),
      destroy: () => calls.push('destroy'),
      getStats: () => ({
        mode,
        path: 'ext',
        frames: 0,
        api: {},
        colorSpace: r.colorSpace,
        preset: 'balanced',
        strength: 0.5,
        sharpness: 0,
        saturation: 1,
        effectivePeak: 2,
        devicesCreated: 1,
        gpuBusySkipped: 4,
        sameFrameSkipped: 7,
        undecided: r.undecided,
        frameTimesMs: [],
        loopTimestamps: [],
      }),
    };
    renderers.push(r);
    return r;
  };
  vm.runInContext(fs.readFileSync(path.join(root, 'content/main.js'), 'utf8'), ctx, {
    filename: 'content/main.js',
  });
  await ns.main.start();
  return Object.assign(t, {
    ctx,
    ns,
    doc,
    dom,
    calls,
    renderers,
    win,
    rt,
    sent,
    enabledWrites,
    settings: (s) => settingsCb(s),
    diagRequest: () => diagReqCb(),
  });
}

// popup 진단 요청을 흉내 내 lifecycle 상태를 읽는다 (FIX_GUIDE T2).
async function diagOf(t) {
  t.diagRequest();
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

test('셰이더 설정: attach 시 hooks.settings로 전달, 변경은 바뀐 값만 setParams로(재attach 없음)', async () => {
  const t = await setup();
  assert.strictEqual(t.renderers[0].hooks.settings.strength, 0.5);
  const base = {
    enabled: true,
    mode: 'itm',
    preset: 'balanced',
    strength: 0.5,
    sharpness: 0,
    saturation: 1,
  };
  t.settings({ ...base, strength: 0.8 });
  assert.ok(t.calls.includes('setParams:{"strength":0.8}'));
  assert.strictEqual(t.renderers.length, 1);
  assert.ok(!t.calls.includes('destroy'));
  t.settings({ ...base, strength: 0.8, sharpness: 0.4, saturation: 1.2, preset: 'vivid' });
  const last = t.calls.filter((c) => c.startsWith('setParams')).at(-1);
  assert.deepStrictEqual(JSON.parse(last.slice('setParams:'.length)), {
    preset: 'vivid',
    sharpness: 0.4,
    saturation: 1.2,
  });
  const n = t.calls.filter((c) => c.startsWith('setParams')).length;
  t.settings({ ...base, strength: 0.8, sharpness: 0.4, saturation: 1.2, preset: 'vivid' }); // 같은 값은 무시
  assert.strictEqual(t.calls.filter((c) => c.startsWith('setParams')).length, n);
});

test('custom 곡선·프리셋 변경은 setParams로 custom을 함께 전달한다 (M5)', async () => {
  const t = await setup();
  const base = {
    enabled: true,
    mode: 'itm',
    preset: 'balanced',
    strength: 0.5,
    sharpness: 0,
    saturation: 1,
    custom: { P: 2, k: 0.5, n: 2, g: 1, s: 1, hs: 1 },
  };
  t.settings(base);
  const n0 = t.calls.filter((c) => c.startsWith('setParams')).length;
  t.settings({
    ...base,
    preset: 'custom',
    custom: { P: 2.6, k: 0.5, n: 2.5, g: 1, s: 1.1, hs: 0.9 },
  });
  const last = JSON.parse(
    t.calls
      .filter((c) => c.startsWith('setParams'))
      .at(-1)
      .slice(10),
  );
  assert.strictEqual(last.preset, 'custom');
  assert.deepStrictEqual(last.custom, { P: 2.6, k: 0.5, n: 2.5, g: 1, s: 1.1, hs: 0.9 });
  assert.strictEqual(t.calls.filter((c) => c.startsWith('setParams')).length, n0 + 1);
  assert.strictEqual(t.renderers.length, 1);
  // custom만 바뀌어도(슬라이더 이동) 전달된다.
  t.settings({
    ...base,
    preset: 'custom',
    custom: { P: 3.1, k: 0.5, n: 2.5, g: 1, s: 1.1, hs: 0.9 },
  });
  const last2 = JSON.parse(
    t.calls
      .filter((c) => c.startsWith('setParams'))
      .at(-1)
      .slice(10),
  );
  assert.deepStrictEqual(Object.keys(last2), ['custom']);
  assert.strictEqual(last2.custom.P, 3.1);
});

test('HUD: 설정이 켜져 있으면 만들고 1초 주기로 갱신, 끄면 제거 (M5-3)', async () => {
  const t = await setup();
  assert.strictEqual(t.huds.length, 0, '기본은 꺼짐(setup 설정에 hud 없음)');
  t.settings({ ...BASE, hud: true });
  assert.strictEqual(t.huds.length, 1);
  assert.strictEqual(t.huds[0].container, t.dom.container);
  assert.ok(Array.isArray(t.huds[0].lines) && t.huds[0].lines.length === 5);
  assert.ok(t.huds[0].lines[0].startsWith('판정 중(원본 표시) (probing)'));
  assert.ok(t.huds[0].lines[1].startsWith('균형'));
  t.huds[0].lines = null;
  t.intervals.forEach((fn) => fn()); // 갱신 타이머
  assert.strictEqual(t.huds[0].lines.length, 5);
  t.settings({ ...BASE, hud: false });
  assert.strictEqual(t.huds[0].destroyed, 1);
  t.settings({ ...BASE, hud: true });
  assert.strictEqual(t.huds.length, 2);
});

test('HUD 수명 분리: DRM·꺼짐에서도 유지, 문구는 상태에 맞게 바뀐다 (UX-13)', async () => {
  const t = await setup();
  t.settings({ ...BASE, hud: true });
  const h = t.huds[0];
  t.dom.video.mediaKeys = {}; // 현재 소스에 DRM 신호
  t.dom.video.fire('encrypted'); // detach + skipped(drm)
  assert.ok(t.calls.includes('destroy'));
  assert.strictEqual(t.huds.length, 1);
  assert.strictEqual(h.destroyed, 0, 'DRM에서도 HUD 유지');
  assert.ok(h.lines[0].startsWith('DRM 영상: 변환하지 않음 (drm)'));
  // 신호가 사라지면 문구만 바뀌고 판정은 해제되지 않는다(읽기 전용).
  t.dom.video.mediaKeys = null;
  t.intervals.forEach((fn) => fn());
  assert.ok(h.lines[0].startsWith('이전 DRM 영상 때문에 이 탭에서는 변환 중지 (drm)'));
  assert.strictEqual(t.renderers.length, 1, '재attach 없음');
  t.settings({ ...BASE, hud: true, enabled: false });
  assert.strictEqual(h.destroyed, 0);
  assert.ok(h.lines[0].startsWith('꺼짐 ('));
  t.settings({ ...BASE, hud: false, enabled: false });
  assert.strictEqual(h.destroyed, 1);
});

test('HUD 수명 분리: 렌더 오류 detach 후에도 유지하고 오류 이름을 보인다', async () => {
  const t = await setup();
  t.settings({ ...BASE, hud: true });
  const e = new Error('x');
  e.name = 'GPUDeviceLostError';
  t.renderers[0].onError(e, 'init');
  assert.strictEqual(t.huds[0].destroyed, 0);
  assert.ok(t.huds[0].lines[0].startsWith('렌더 오류(GPUDeviceLostError) (noGpu)'));
});

test('HUD: container가 바뀔 때만 재생성하고 container가 없으면 제거한다', async () => {
  const t = await setup();
  t.settings({ ...BASE, hud: true });
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(t.huds.length, 1, '같은 container에서는 재생성 없음');
  t.dom.container = { id: 'c2' };
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.huds.length, 2);
  assert.strictEqual(t.huds[0].destroyed, 1);
  assert.strictEqual(t.huds[1].container, t.dom.container);
  t.dom.player = { querySelector: () => null };
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(t.huds[1].destroyed, 1, 'container 없음이면 HUD 없음');
});

const getState = (t) => t.rt.listeners[0]({ type: 'sdrhdr:getState' });
const HDR = { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false };

test('getState: {status, input} 응답, URL·제목 없음, 다른 메시지는 무시 (M8-3)', async () => {
  const t = await setup();
  assert.strictEqual(t.rt.listeners.length, 1);
  assert.strictEqual(t.rt.listeners[0]({ type: 'other' }), undefined);
  assert.strictEqual(t.rt.listeners[0](null), undefined);
  let r = plain(await getState(t));
  assert.deepStrictEqual(Object.keys(r).sort(), ['input', 'status']);
  assert.deepStrictEqual(Object.keys(r.input).sort(), [
    'bypass',
    'drmNow',
    'enabled',
    'errorName',
    'mode',
    'skip',
    'state',
    'undecided',
  ]);
  assert.deepStrictEqual(r.input, {
    enabled: true,
    mode: 'itm',
    state: 'probing',
    skip: null,
    undecided: false,
    errorName: null,
    drmNow: false,
    bypass: false,
  });
  assert.strictEqual(r.status.text, '판정 중(원본 표시)');
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  r = plain(await getState(t));
  assert.strictEqual(r.input.state, 'active');
  assert.strictEqual(r.status.text, 'HDR 변환 중');
  assert.strictEqual(r.status.level, 'ok');
});

test('getState: 꺼짐·DRM·hdr·undecided 입력과 문구', async () => {
  const t = await setup();
  // undecided
  t.renderers[0].undecided = true;
  let r = plain(await getState(t));
  assert.strictEqual(r.input.undecided, true);
  assert.strictEqual(r.status.level, 'error');
  assert.strictEqual(r.status.badge.text, '!');
  t.renderers[0].undecided = false;
  // hdr
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100, colorSpace: HDR }, 'ext');
  r = plain(await getState(t));
  assert.deepStrictEqual([r.input.state, r.input.skip], ['skipped', 'hdrSource']);
  assert.strictEqual(r.status.text, '이미 HDR 영상: 원본 표시');
  // 꺼짐
  t.settings({ ...BASE, enabled: false });
  r = plain(await getState(t));
  assert.strictEqual(r.input.enabled, false);
  assert.strictEqual(r.status.level, 'off');
});

test('getState: DRM 현재 신호 읽기만(drmNow), 요소 단위 no-op은 그대로', async () => {
  const t = await setup();
  t.dom.video.mediaKeys = {};
  t.dom.video.fire('encrypted');
  let r = plain(await getState(t));
  assert.deepStrictEqual([r.input.skip, r.input.drmNow], ['drm', true]);
  assert.strictEqual(r.status.text, 'DRM 영상: 변환하지 않음');
  t.dom.video.mediaKeys = null;
  r = plain(await getState(t));
  assert.strictEqual(r.input.drmNow, false);
  assert.strictEqual(r.status.hint, '새로고침(⌘R)하면 다시 동작');
  t.dom.video.fire('loadstart');
  assert.strictEqual(t.renderers.length, 1, '판정 해제·재attach 없음');
  // 요소가 아예 없으면(마지막 video 참조도 없는 새 탭 상태) false
});

test('상태 알림: 시작 직후 1회, 같은 상태 연속은 보내지 않고, 바뀌면 보낸다 (M8-3)', async () => {
  const t = await setup();
  const n0 = t.sent.length;
  assert.ok(n0 >= 1);
  assert.deepStrictEqual(plain(t.sent[0]), {
    type: 'sdrhdr:state',
    badge: { text: '…', color: plain(t.sent[0].badge).color },
    level: 'wait',
  });
  t.intervals.forEach((fn) => fn());
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(t.sent.length, n0, '같은 상태는 다시 보내지 않음');
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  assert.strictEqual(t.sent.length, n0 + 1);
  assert.strictEqual(t.sent.at(-1).level, 'ok');
  assert.strictEqual(t.sent.at(-1).badge.text, '');
  // dispatch(decided)로 같은 text가 반복돼도 재전송 없음
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  assert.strictEqual(t.sent.length, n0 + 1);
  // 설정 변경(꺼짐)
  t.settings({ ...BASE, enabled: false });
  assert.strictEqual(t.sent.at(-1).level, 'off');
  // undecided 전환은 HUD tick 시점에 알린다
  t.settings({ ...BASE, enabled: true });
  t.renderers.at(-1).undecided = true;
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(t.sent.at(-1).level, 'error');
});

test('탭이 다시 보이면 같은 상태도 1회 재전송한다', async () => {
  const t = await setup();
  const n = t.sent.length;
  t.doc.visibilityState = 'hidden';
  t.doc.fire('visibilitychange');
  assert.strictEqual(t.sent.length, n);
  t.doc.visibilityState = 'visible';
  t.doc.fire('visibilitychange');
  assert.strictEqual(t.sent.length, n + 1);
});

test('sendMessage 거부·예외는 무시한다', async () => {
  const t = await setup();
  t.rt.reject = true;
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  await new Promise((r) => setImmediate(r)); // unhandled rejection이 없어야 한다
  t.ctx.browser.runtime.sendMessage = () => {
    throw new Error('boom');
  };
  assert.doesNotThrow(() => t.settings({ ...BASE, enabled: false }));
  assert.strictEqual((await diagOf(t)).lifecycle.state, 'skipped');
});

test('browser.runtime이 없는 환경에서도 죽지 않는다', async () => {
  const t = await setup();
  t.ctx.browser = undefined;
  assert.doesNotThrow(() => t.settings({ ...BASE, enabled: false }));
  assert.doesNotThrow(() => t.intervals.forEach((fn) => fn()));
});

test('칩: notify가 true이면 상태 문구가 바뀔 때만 표시, 같은 문구 연속은 표시하지 않는다 (UX-23)', async () => {
  const t = await setup();
  assert.strictEqual(t.chips.length, 1);
  const shown = () => t.chips[0].shown;
  assert.deepStrictEqual(shown(), ['판정 중(원본 표시)']);
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  assert.deepStrictEqual(shown().at(-1), 'HDR 변환 중', '첫 attach 후 HDR 변환 중');
  const n = shown().length;
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(shown().length, n);
  t.settings({ ...BASE, enabled: false });
  assert.strictEqual(shown().at(-1), '꺼짐', 'popup 없이 꺼도 피드백');
  assert.strictEqual(t.chips.length, 1, '칩은 attach와 독립 수명(같은 container에서 유지)');
});

test('칩: notify가 false이면 표시하지 않고, 다시 켜도 같은 문구는 반복하지 않는다', async () => {
  const t = await setup();
  t.settings({ ...BASE, notify: false });
  const n = t.chips.reduce((a, c) => a + c.shown.length, 0);
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  assert.strictEqual(
    t.chips.reduce((a, c) => a + c.shown.length, 0),
    n,
  );
  t.settings({ ...BASE, notify: true });
  assert.strictEqual(
    t.chips.reduce((a, c) => a + c.shown.length, 0),
    n,
    '문구가 그대로면 표시 안 함',
  );
  t.settings({ ...BASE, notify: true, enabled: false });
  assert.strictEqual(t.chips.at(-1).shown.at(-1), '꺼짐');
});

test('칩: 꺼진 채 시작해도 로드 시 꺼짐 칩은 띄우지 않고, 켜면 알린다', async () => {
  const t = await setup('itm', false);
  assert.strictEqual(
    t.chips.reduce((a, c) => a + c.shown.length, 0),
    0,
  );
  t.settings(BASE);
  assert.ok(t.chips[0].shown.length >= 1);
});

test('칩: container가 바뀌면 이전 칩을 제거하고 새 container에 만든다', async () => {
  const t = await setup();
  t.dom.container = { id: 'c2' };
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.chips[0].destroyed, 1);
  t.renderers.at(-1).hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  assert.strictEqual(t.chips.at(-1).container, t.dom.container);
  assert.strictEqual(t.chips.at(-1).shown.at(-1), 'HDR 변환 중');
});

const keyEv = (o) => ({
  code: 'KeyH',
  altKey: true,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  target: { tagName: 'DIV' },
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
  ...o,
});
const down = (t, o) => {
  const e = keyEv(o);
  t.doc.fire('keydown', e);
  return e;
};
const up = (t, o) => t.doc.fire('keyup', keyEv(o));
const bypassCalls = (t) => t.calls.filter((c) => c.startsWith('setBypass'));
const chipTexts = (t) => t.chips.flatMap((c) => c.shown);

test('단축키: Option+H 누르는 동안 원본 보기, 떼면 복귀, 칩 피드백은 notify와 무관 (UX-22)', async () => {
  const t = await setup();
  t.settings({ ...BASE, notify: false });
  const e = down(t, {});
  assert.strictEqual(e.prevented, true);
  assert.deepStrictEqual(bypassCalls(t), ['setBypass:true']);
  assert.strictEqual(plain(await getState(t)).input.bypass, true);
  assert.strictEqual(plain(await getState(t)).status.text, '원본 보기 중');
  assert.ok(chipTexts(t).includes('원본 보기 중'));
  up(t, {});
  assert.deepStrictEqual(bypassCalls(t), ['setBypass:true', 'setBypass:false']);
  assert.strictEqual(plain(await getState(t)).input.bypass, false);
  assert.strictEqual(chipTexts(t).at(-1), '판정 중(원본 표시)');
});

test('단축키: active에서도 원본 보기, Alt 키를 먼저 떼도 해제', async () => {
  const t = await setup();
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100 }, 'ext');
  down(t, {});
  assert.deepStrictEqual(bypassCalls(t), ['setBypass:true']);
  up(t, { code: 'AltLeft', key: 'Alt', altKey: false });
  assert.deepStrictEqual(bypassCalls(t), ['setBypass:true', 'setBypass:false']);
  up(t, {}); // 이미 해제됨: 중복 호출 없음
  assert.strictEqual(bypassCalls(t).length, 2);
});

test('단축키: window blur·visibilitychange(hidden)·detach·설정 꺼짐에서 해제', async () => {
  let t = await setup();
  down(t, {});
  t.win.fire('blur');
  assert.deepStrictEqual(bypassCalls(t), ['setBypass:true', 'setBypass:false']);
  down(t, {});
  t.doc.visibilityState = 'hidden';
  t.doc.fire('visibilitychange');
  assert.strictEqual(bypassCalls(t).at(-1), 'setBypass:false');
  t.doc.visibilityState = 'visible';
  t = await setup();
  down(t, {});
  t.settings({ ...BASE, enabled: false }); // detach
  assert.strictEqual(plain(await getState(t)).input.bypass, false);
  t = await setup();
  down(t, {});
  t.dom.video.fire('encrypted'); // detach
  assert.strictEqual(plain(await getState(t)).input.bypass, false);
});

test('단축키: 새 attach는 원본 보기 false로 시작한다', async () => {
  const t = await setup();
  down(t, {});
  t.dom.video = makeVideo('blob:z');
  t.doc.fire('yt-navigate-finish');
  assert.strictEqual(t.renderers.length, 2);
  assert.strictEqual(plain(await getState(t)).input.bypass, false);
});

test('단축키: 렌더가 스킵 상태가 되면 원본 보기를 끝낸다', async () => {
  const t = await setup();
  down(t, {});
  t.renderers[0].hooks.onProbe({ ext: 100, c2d: 100, colorSpace: HDR }, 'ext');
  assert.strictEqual(bypassCalls(t).at(-1), 'setBypass:false');
});

test('단축키: 입력창·contenteditable 포커스, repeat, 다른 수식키는 무시', async () => {
  const t = await setup();
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
    const e = down(t, { target: { tagName: tag } });
    assert.strictEqual(e.prevented, false);
  }
  assert.strictEqual(
    down(t, { target: { tagName: 'DIV', isContentEditable: true } }).prevented,
    false,
  );
  t.doc.activeElement = { tagName: 'DIV', isContentEditable: true };
  assert.strictEqual(down(t, {}).prevented, false);
  t.doc.activeElement = null;
  assert.strictEqual(down(t, { repeat: true }).prevented, false);
  assert.strictEqual(down(t, { altKey: false }).prevented, false);
  assert.strictEqual(down(t, { metaKey: true }).prevented, false);
  assert.strictEqual(down(t, { ctrlKey: true }).prevented, false);
  assert.strictEqual(down(t, { code: 'KeyJ' }).prevented, false);
  assert.deepStrictEqual(bypassCalls(t), []);
  assert.deepStrictEqual(t.enabledWrites, []);
  // 입력창 포커스에서도 해제(keyup)는 동작해야 한다
  down(t, {});
  up(t, { target: { tagName: 'INPUT' } });
  assert.strictEqual(bypassCalls(t).at(-1), 'setBypass:false');
});

test('단축키: Option+Shift+H는 setEnabled(!enabled)와 칩 피드백(notify 무관)', async () => {
  const t = await setup();
  t.settings({ ...BASE, notify: false });
  const e = down(t, { shiftKey: true });
  assert.strictEqual(e.prevented, true);
  assert.deepStrictEqual(t.enabledWrites, [false]);
  assert.strictEqual(chipTexts(t).at(-1), 'HDR 변환 꺼짐');
  assert.deepStrictEqual(bypassCalls(t), []);
  t.settings({ ...BASE, notify: false, enabled: false });
  down(t, { shiftKey: true });
  assert.deepStrictEqual(t.enabledWrites, [false, true]);
  assert.strictEqual(chipTexts(t).at(-1), 'HDR 변환 켜짐');
});

test('단축키: cur가 없거나 변환 불가 상태면 원본 보기는 무시, 토글은 동작', async () => {
  const t = await setup();
  t.dom.video.fire('encrypted'); // DRM: cur 없음
  const e = down(t, {});
  assert.strictEqual(e.prevented, false);
  assert.deepStrictEqual(bypassCalls(t), []);
  down(t, { shiftKey: true });
  assert.deepStrictEqual(t.enabledWrites, [false]);
  // hdr 스킵(cur 있음, state skipped)
  const t2 = await setup();
  t2.renderers[0].hooks.onProbe({ ext: 100, c2d: 100, colorSpace: HDR }, 'ext');
  assert.strictEqual(down(t2, {}).prevented, false);
  assert.deepStrictEqual(bypassCalls(t2), []);
});

test('꺼진 채 시작하면 lifecycle은 idle이 아니라 skipped(disabled) (M7-2)', async () => {
  const t = await setup('itm', false);
  assert.strictEqual(t.renderers.length, 0);
  const d = await diagOf(t);
  assert.strictEqual(d.lifecycle.state, 'skipped');
  assert.strictEqual(d.lifecycle.skipReason, 'disabled');
  // 켜면 idle로 돌아와 attach한다.
  t.settings({
    enabled: true,
    mode: 'itm',
    preset: 'balanced',
    strength: 0.5,
    sharpness: 0,
    saturation: 1,
  });
  assert.strictEqual((await diagOf(t)).lifecycle.state === 'skipped', false);
});

test('보이지 않는 탭은 진단을 쓰지 않고, 다시 보이면 즉시 1회 기록한다 (M7-2)', async () => {
  const t = await setup();
  t.doc.visibilityState = 'hidden';
  t.intervals.forEach((fn) => fn());
  await Promise.resolve();
  assert.strictEqual(t.diag, null);
  t.doc.visibilityState = 'visible';
  t.doc.fire('visibilitychange');
  await Promise.resolve();
  assert.notStrictEqual(t.diag, null);
  assert.strictEqual(t.diag.lifecycle.state, 'probing');
});

test('진단은 popup 요청 때만 쓴다: 타이머 주기 저장 없음, 숨긴 탭은 무시 (FIX_GUIDE T2)', async () => {
  const t = await setup();
  t.intervals.forEach((fn) => fn());
  await Promise.resolve();
  assert.strictEqual(t.diagWrites, 0, '요청 없이는 0회');
  t.doc.hidden = true;
  t.doc.visibilityState = 'hidden';
  t.diagRequest();
  await Promise.resolve();
  assert.strictEqual(t.diagWrites, 0, '숨긴 탭은 응답하지 않는다');
  t.doc.hidden = false;
  t.doc.visibilityState = 'visible';
  t.diagRequest();
  await Promise.resolve();
  assert.strictEqual(t.diagWrites, 1);
});

test('HUD 갱신은 숨긴 탭에서 건너뛴다 (FIX_GUIDE T3)', async () => {
  const t = await setup();
  const base = {
    enabled: true,
    mode: 'itm',
    preset: 'balanced',
    strength: 0.5,
    sharpness: 0,
    saturation: 1,
    custom: { P: 2, k: 0.5, n: 2, g: 1, s: 1, hs: 1 },
  };
  t.settings({ ...base, hud: true });
  t.huds[0].lines = null;
  t.doc.hidden = true;
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(t.huds[0].lines, null, 'hidden이면 update 없음');
  t.doc.hidden = false;
  t.intervals.forEach((fn) => fn());
  assert.strictEqual(t.huds[0].lines.length, 5);
});

test('진단: devicesCreated는 detach된 renderer까지 누적, gpuBusySkipped·sameFrameSkipped·uptimeS 전달 (U2-B)', async () => {
  const t = await setup();
  let d = await diagOf(t);
  assert.strictEqual(d.render.devicesCreated, 1);
  assert.strictEqual(d.render.gpuBusySkipped, 4);
  assert.strictEqual(d.render.sameFrameSkipped, 7);
  assert.strictEqual(typeof d.render.uptimeS, 'number');
  const on = {
    enabled: true,
    mode: 'itm',
    preset: 'balanced',
    strength: 0.5,
    sharpness: 0,
    saturation: 1,
  };
  t.settings({ ...on, enabled: false });
  t.settings(on);
  assert.strictEqual(t.renderers.length, 2);
  d = await diagOf(t);
  assert.strictEqual(d.render.devicesCreated, 2, '이전 renderer의 1 + 현재 1');
});
