'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function load() {
  const ctx = vm.createContext({});
  for (const f of manifest.content_scripts[0].js) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.__sdrhdr;
}
const ns = load();
const plain = (o) => JSON.parse(JSON.stringify(o));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' != ' + b);

test('isDrm: 3신호 각각과 조합', () => {
  const { isDrm } = ns.detect;
  assert.strictEqual(isDrm({}), false);
  assert.strictEqual(isDrm(undefined), false);
  assert.strictEqual(isDrm({ mediaKeys: null, webkitKeys: null, sawEncryptedEvent: false }), false);
  assert.strictEqual(isDrm({ mediaKeys: {} }), true);
  assert.strictEqual(isDrm({ webkitKeys: {} }), true);
  assert.strictEqual(isDrm({ sawEncryptedEvent: true }), true);
  assert.strictEqual(isDrm({ mediaKeys: {}, webkitKeys: {}, sawEncryptedEvent: true }), true);
  assert.strictEqual(isDrm({ mediaKeys: null, webkitKeys: {}, sawEncryptedEvent: false }), true);
});

test('contentRect: letterbox 계산', () => {
  const { contentRect } = ns.detect;
  assert.deepStrictEqual(plain(contentRect(1920, 1080, 1920, 1080)), {
    x: 0,
    y: 0,
    w: 1920,
    h: 1080,
  });
  // 4:3 in 16:9 -> pillarbox
  assert.deepStrictEqual(plain(contentRect(1920, 1080, 640, 480)), {
    x: 240,
    y: 0,
    w: 1440,
    h: 1080,
  });
  // 21:9 in 16:9 -> letterbox
  const r = contentRect(1920, 1080, 2520, 1080);
  near(r.x, 0);
  near(r.w, 1920);
  near(r.h, 1920 * (1080 / 2520));
  near(r.y, (1080 - r.h) / 2);
  const zero = { x: 0, y: 0, w: 0, h: 0 };
  assert.deepStrictEqual(plain(contentRect(0, 1080, 1920, 1080)), zero);
  assert.deepStrictEqual(plain(contentRect(1920, 1080, 0, 0)), zero);
  assert.deepStrictEqual(plain(contentRect(undefined, 1, 1, 1)), zero);
});

test('canvasResolution: min(원본, 표시 x DPR) (probe와 같은 사례)', () => {
  const { canvasResolution } = ns.detect;
  assert.deepStrictEqual(plain(canvasResolution(3840, 2160, 1920, 1080, 2)), {
    width: 3840,
    height: 2160,
  });
  assert.deepStrictEqual(plain(canvasResolution(3840, 2160, 800, 450, 2)), {
    width: 1600,
    height: 900,
  });
  assert.deepStrictEqual(plain(canvasResolution(1920, 1080, 3000, 2000, 2)), {
    width: 1920,
    height: 1080,
  });
  assert.strictEqual(canvasResolution(0, 1080, 100, 100, 1), null);
});

test('normalizeSettings: 잘못된 값은 기본값', () => {
  const { normalizeSettings, KEYS, MODES } = ns.params;
  assert.deepStrictEqual(plain(MODES), ['itm', 'identity', 'stripes']);
  const def = { enabled: true, mode: 'itm' };
  assert.deepStrictEqual(plain(normalizeSettings(undefined)), def);
  assert.deepStrictEqual(plain(normalizeSettings(null)), def);
  assert.deepStrictEqual(plain(normalizeSettings('x')), def);
  assert.deepStrictEqual(plain(normalizeSettings({})), def);
  assert.deepStrictEqual(
    plain(normalizeSettings({ [KEYS.enabled]: false, [KEYS.mode]: 'stripes' })),
    { enabled: false, mode: 'stripes' },
  );
  assert.deepStrictEqual(
    plain(normalizeSettings({ [KEYS.enabled]: 'yes', [KEYS.mode]: 'bogus' })),
    def,
  );
  assert.deepStrictEqual(plain(normalizeSettings({ [KEYS.enabled]: 0, [KEYS.mode]: 3 })), def);
  assert.strictEqual(KEYS.enabled, 'sdrhdr.enabled');
  assert.strictEqual(KEYS.mode, 'sdrhdr.mode');
  assert.strictEqual(KEYS.diag, 'sdrhdr.diag');
});

test('params: 균형 프리셋과 범위 (PLAN C절 표)', () => {
  assert.deepStrictEqual(plain(ns.params.PRESET_BALANCED), {
    P: 3.0,
    k: 0.65,
    n: 2.5,
    g: 1.0,
    s: 1.05,
    hs: 0.95,
  });
  assert.deepStrictEqual(plain(ns.params.RANGES), {
    P: [1.0, 8.0],
    k: [0.4, 0.9],
    n: [1.5, 4],
    g: [0.8, 1.5],
    s: [0.8, 1.5],
    hs: [0.5, 1.5],
  });
  for (const [key, v] of Object.entries(ns.params.PRESET_BALANCED)) {
    const [lo, hi] = ns.params.RANGES[key];
    assert.ok(v >= lo && v <= hi, key);
  }
});

test('summarize', () => {
  const { summarize } = ns.hud;
  const empty = plain(summarize([], []));
  assert.deepStrictEqual(empty, { frames: 0, loopFps: null, jsP50: null, jsP95: null });
  assert.strictEqual(summarize(undefined, undefined).frames, 0);
  const s = summarize([1, 2, 3, 4, 100], [0, 1000 / 60, 2000 / 60, 3000 / 60, 4000 / 60]);
  assert.strictEqual(s.frames, 5);
  near(s.jsP50, 3);
  near(s.jsP95, 80.8);
  near(s.loopFps, 60);
  assert.strictEqual(summarize([1], [5]).loopFps, null);
  assert.strictEqual(summarize([1, 2], [5, 5]).loopFps, null);
});

test('sanitizePageUrl: 경로와 v만', () => {
  const { sanitizePageUrl } = ns.hud;
  assert.strictEqual(
    sanitizePageUrl('https://www.youtube.com/watch?v=abc123&list=PLx&t=5s#frag'),
    '/watch?v=abc123',
  );
  assert.strictEqual(sanitizePageUrl('https://www.youtube.com/watch?list=PLx&v=zz'), '/watch?v=zz');
  assert.strictEqual(sanitizePageUrl('https://www.youtube.com/feed?x=1'), '/feed');
  assert.strictEqual(sanitizePageUrl('https://www.youtube.com'), '/');
  assert.strictEqual(sanitizePageUrl(undefined), null);
  assert.strictEqual(sanitizePageUrl('not a url'), null);
});

const isT = (v, ...types) => types.includes(v === null ? 'null' : typeof v);

test('buildDiag: M2-4 스키마 필드 존재·타입', () => {
  const d = plain(
    ns.hud.buildDiag({
      extVersion: '0.1.0',
      createdAt: '2026-09-30T00:00:00.000Z',
      url: 'https://www.youtube.com/watch?v=abc&list=x',
      env: {
        ua: 'UA',
        dpr: 2,
        screen: { w: 3024, h: 1964 },
        dynamicRangeHigh: true,
        colorGamutP3: true,
      },
      api: {
        gpu: true,
        adapter: true,
        device: true,
        configure: true,
        configRead: { format: 'rgba16float', colorSpace: 'display-p3', toneMapping: 'extended' },
      },
      video: { videoWidth: 3840, videoHeight: 2160, srcIsBlob: true, paused: false },
      canvas: { width: 1920, height: 1080, cssWidth: 960, cssHeight: 540 },
      render: { mode: 'itm', frames: 700, frameTimesMs: [1, 2, 3], loopTimestamps: [0, 16, 32] },
      flags: { drm: false, attached: true, fullscreen: false },
      errors: Array.from({ length: 25 }, (_, i) => ({ at: 'x', name: 'E' + i, message: 'm' })),
    }),
  );
  assert.deepStrictEqual(Object.keys(d), [
    'schemaVersion',
    'milestone',
    'extVersion',
    'createdAt',
    'page',
    'env',
    'api',
    'video',
    'canvas',
    'render',
    'flags',
    'errors',
  ]);
  assert.strictEqual(d.schemaVersion, 1);
  assert.strictEqual(d.milestone, 'M2');
  assert.strictEqual(typeof d.extVersion, 'string');
  assert.ok(!Number.isNaN(Date.parse(d.createdAt)));
  assert.deepStrictEqual(d.page, { url: '/watch?v=abc' });
  assert.ok(!('title' in d.page));
  assert.strictEqual(typeof d.env.ua, 'string');
  assert.strictEqual(typeof d.env.dpr, 'number');
  assert.strictEqual(typeof d.env.screen.w, 'number');
  assert.strictEqual(typeof d.env.screen.h, 'number');
  assert.strictEqual(typeof d.env.dynamicRangeHigh, 'boolean');
  assert.strictEqual(typeof d.env.colorGamutP3, 'boolean');
  for (const k of ['gpu', 'adapter', 'device', 'configure'])
    assert.strictEqual(typeof d.api[k], 'boolean');
  assert.deepStrictEqual(d.api.configRead, {
    format: 'rgba16float',
    colorSpace: 'display-p3',
    toneMapping: 'extended',
  });
  assert.deepStrictEqual(Object.keys(d.video), [
    'videoWidth',
    'videoHeight',
    'srcIsBlob',
    'paused',
  ]);
  assert.strictEqual(typeof d.video.videoWidth, 'number');
  assert.strictEqual(typeof d.video.srcIsBlob, 'boolean');
  assert.strictEqual(typeof d.video.paused, 'boolean');
  assert.deepStrictEqual(Object.keys(d.canvas), ['width', 'height', 'cssWidth', 'cssHeight']);
  assert.strictEqual(d.render.mode, 'itm');
  assert.strictEqual(d.render.frames, 700);
  assert.ok(isT(d.render.loopFps, 'number'));
  assert.ok(isT(d.render.jsP50, 'number'));
  assert.ok(isT(d.render.jsP95, 'number'));
  assert.deepStrictEqual(d.flags, { drm: false, attached: true, fullscreen: false });
  assert.strictEqual(d.errors.length, 20);
  assert.deepStrictEqual(Object.keys(d.errors[0]), ['at', 'name', 'message']);
});

test('buildDiag: 빈 state에서도 모든 필드가 있고 값은 null/기본', () => {
  const d = plain(ns.hud.buildDiag({}));
  assert.strictEqual(d.page.url, null);
  assert.strictEqual(d.api.configRead, null);
  assert.strictEqual(d.video.videoWidth, null);
  assert.strictEqual(d.render.frames, 0);
  assert.strictEqual(d.render.loopFps, null);
  assert.deepStrictEqual(d.flags, { drm: false, attached: false, fullscreen: false });
  assert.deepStrictEqual(d.errors, []);
  assert.strictEqual(plain(ns.hud.buildDiag()).milestone, 'M2');
});
