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
    'frameProbe',
    'flags',
    'errors',
  ]);
  assert.strictEqual(d.schemaVersion, 3);
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
  assert.deepStrictEqual(d.flags, {
    drm: false,
    attached: true,
    fullscreen: false,
    blackFrame: false,
  });
  assert.strictEqual(d.frameProbe, null);
  assert.strictEqual(d.errors.length, 20);
  assert.deepStrictEqual(Object.keys(d.errors[0]), ['at', 'name', 'message']);
});

test('buildDiag: api 타입 확정 (boolean|null, toneMapping string|null) - L5', () => {
  const api = (a) => plain(ns.hud.buildDiag({ api: a })).api;
  // 문자열·객체가 들어와도 boolean으로 변환, toneMapping 객체는 mode 문자열로.
  const d = api({
    gpu: true,
    adapter: { info: 1 },
    device: {},
    configure: 'ok',
    configRead: { toneMapping: { mode: 'extended' } },
  });
  for (const k of ['adapter', 'device', 'configure']) assert.strictEqual(d[k], true, k);
  assert.strictEqual(d.configRead.toneMapping, 'extended');
  assert.strictEqual(
    api({ configRead: { toneMapping: 'extended' } }).configRead.toneMapping,
    'extended',
  );
  assert.strictEqual(api({ configRead: { toneMapping: {} } }).configRead.toneMapping, null);
  // 시도 전은 null, 실패는 false.
  const n = api({ adapter: null, device: undefined, configure: false });
  assert.deepStrictEqual([n.adapter, n.device, n.configure], [null, null, false]);
  const e = plain(ns.hud.buildDiag({}));
  for (const k of ['adapter', 'device', 'configure']) assert.strictEqual(e.api[k], null, k);
});

test('buildDiag: 결과가 docs/result-schema-m2.json api 타입 선언과 일치', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'result-schema-m2.json'), 'utf8'),
  );
  const p = schema.properties.api.properties;
  for (const k of ['adapter', 'device', 'configure'])
    assert.deepStrictEqual(p[k].type, ['boolean', 'null'], k);
  assert.deepStrictEqual(p.configRead.properties.toneMapping.type, ['string', 'null']);
});

test('buildDiag: 빈 state에서도 모든 필드가 있고 값은 null/기본', () => {
  const d = plain(ns.hud.buildDiag({}));
  assert.strictEqual(d.page.url, null);
  assert.strictEqual(d.api.configRead, null);
  assert.strictEqual(d.video.videoWidth, null);
  assert.strictEqual(d.render.frames, 0);
  assert.strictEqual(d.render.loopFps, null);
  assert.deepStrictEqual(d.flags, {
    drm: false,
    attached: false,
    fullscreen: false,
    blackFrame: false,
  });
  assert.strictEqual(d.frameProbe, null);
  assert.deepStrictEqual(d.errors, []);
  assert.strictEqual(plain(ns.hud.buildDiag()).milestone, 'M2');
});

test('meanBrightness: RGB 평균, 알파 제외, 행 패딩 제거', () => {
  const { meanBrightness, alignBytesPerRow } = ns.hud;
  assert.strictEqual(alignBytesPerRow(256), 256);
  assert.strictEqual(alignBytesPerRow(64 * 4), 256);
  assert.strictEqual(alignBytesPerRow(257), 512);
  assert.strictEqual(alignBytesPerRow(12), 256);
  // 2x2, bytesPerRow 256. 픽셀 = (10,20,30,a) 4개, 패딩은 255로 채워 평균에 섞이지 않아야 한다.
  const data = new Uint8Array(256 * 2).fill(255);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++) data.set([10, 20, 30, 0], y * 256 + x * 4);
  near(meanBrightness(data, 2, 2, 256), 20);
  // 패딩 없는 조밀 버퍼(canvas getImageData 형태)
  near(meanBrightness(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 0]), 2, 1, 8), 127.5);
  // 마지막 행은 패딩 없이 끝나도 된다.
  near(meanBrightness(new Uint8Array(256 + 8).fill(100), 2, 2, 256), 100);
  assert.strictEqual(meanBrightness(new Uint8Array(4), 2, 2, 256), null); // 버퍼 부족
  assert.strictEqual(meanBrightness(new Uint8Array(16), 2, 2, 4), null); // bytesPerRow < width*4
  assert.strictEqual(meanBrightness(null, 2, 2, 8), null);
  assert.strictEqual(meanBrightness(new Uint8Array(16), 0, 2, 8), null);
});

test('normalizeFrameProbe: 숫자 2자리 반올림, 예외는 name 문자열만', () => {
  const { normalizeFrameProbe } = ns.hud;
  assert.strictEqual(normalizeFrameProbe(null), null);
  assert.strictEqual(normalizeFrameProbe(undefined), null);
  const p = plain(
    normalizeFrameProbe({
      at: 5000.126,
      n: 2,
      ext: 0.123456,
      copy: undefined,
      c2d: NaN,
      extErr: null,
      copyErr: 'SecurityError',
      c2dErr: { name: 'x' },
      ms: 12.3456,
      extSyncMs: 1.234,
      pixels: [1, 2, 3],
    }),
  );
  assert.deepStrictEqual(p, {
    at: 5000.13,
    n: 2,
    ext: 0.12,
    copy: null,
    c2d: null,
    extErr: null,
    copyErr: 'SecurityError',
    c2dErr: null,
    ms: 12.35,
    extSyncMs: 1.23,
    copySyncMs: null,
    c2dSyncMs: null,
  });
});

test('isBlackOverlay: 경계값 (ext<2 이고 c2d 또는 copy>=8)', () => {
  const { isBlackOverlay } = ns.detect;
  assert.strictEqual(isBlackOverlay({ ext: 0, copy: 60, c2d: 60 }), true);
  assert.strictEqual(isBlackOverlay({ ext: 1.9, copy: null, c2d: 8 }), true);
  assert.strictEqual(isBlackOverlay({ ext: 1.9, copy: 8, c2d: null }), true);
  assert.strictEqual(isBlackOverlay({ ext: 2, copy: 60, c2d: 60 }), false);
  assert.strictEqual(isBlackOverlay({ ext: 0, copy: 7.9, c2d: 7.9 }), false);
  assert.strictEqual(isBlackOverlay({ ext: 0, copy: 7.9, c2d: 8 }), true);
  // 예외로 값이 없으면 판단하지 않음
  assert.strictEqual(isBlackOverlay({ ext: null, copy: 60, c2d: 60 }), false);
  assert.strictEqual(isBlackOverlay({ ext: 0, copy: null, c2d: null }), false);
  assert.strictEqual(isBlackOverlay({ copy: 60, c2d: 60 }), false);
  assert.strictEqual(isBlackOverlay(null), false);
  assert.strictEqual(isBlackOverlay(undefined), false);
});

test('nextBlackStreak: 2회 연속일 때만 한도 도달, 아니면 리셋', () => {
  const { nextBlackStreak, BLACK_STREAK_LIMIT } = ns.detect;
  const black = { ext: 0, copy: 50, c2d: 50 };
  const ok = { ext: 40, copy: 50, c2d: 50 };
  const unknown = { ext: null, copy: 50, c2d: 50 };
  assert.strictEqual(BLACK_STREAK_LIMIT, 2);
  let s = nextBlackStreak(0, black);
  assert.strictEqual(s, 1);
  assert.ok(s < BLACK_STREAK_LIMIT);
  s = nextBlackStreak(s, black);
  assert.ok(s >= BLACK_STREAK_LIMIT);
  assert.strictEqual(nextBlackStreak(1, ok), 0);
  assert.strictEqual(nextBlackStreak(1, unknown), 0);
  assert.strictEqual(nextBlackStreak(undefined, black), 1);
});

test('schema v2: frameProbe 선택 필드와 flags.blackFrame 선언, required는 v1 그대로', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'result-schema-m2.json'), 'utf8'),
  );
  assert.ok(!schema.required.includes('frameProbe'));
  assert.ok(!schema.properties.flags.required.includes('blackFrame'));
  assert.deepStrictEqual(schema.properties.flags.properties.blackFrame.type, ['boolean', 'null']);
  const d = plain(ns.hud.buildDiag({ frameProbe: { n: 1, ext: 0 } }));
  for (const k of Object.keys(d.frameProbe))
    assert.ok(k in schema.properties.frameProbe.properties, k);
});

// ---- P2 choosePath / P3 displayMissRate·estimateDisplayHz ----

test('choosePath: ext 검음(<2) + copy>=8이면 copy, 그 외 ext', () => {
  const { choosePath } = ns.detect;
  assert.strictEqual(choosePath({ ext: 0, copy: 97.8, c2d: 145 }), 'copy');
  assert.strictEqual(choosePath({ ext: 1.9, copy: 8, c2d: null }), 'copy');
  assert.strictEqual(choosePath({ ext: 1.9, copy: 7.9, c2d: 145 }), 'ext'); // copy가 검으면 전환하지 않음
  assert.strictEqual(choosePath({ ext: 2, copy: 60, c2d: 60 }), 'ext');
  assert.strictEqual(choosePath({ ext: 40, copy: 60, c2d: 60 }), 'ext');
  assert.strictEqual(choosePath({ ext: null, copy: 60, c2d: 60 }), 'ext');
  assert.strictEqual(choosePath({ ext: 0, copy: null, c2d: 60 }), 'ext');
  assert.strictEqual(choosePath(null), 'ext');
  assert.strictEqual(choosePath(undefined), 'ext');
});

test('isBlackSelected/nextBlackStreak: 선택된 경로의 출력 기준', () => {
  const { isBlackSelected, nextBlackStreak } = ns.detect;
  assert.strictEqual(isBlackSelected({ ext: 0, copy: 50, c2d: 50 }, 'ext'), true);
  assert.strictEqual(isBlackSelected({ ext: 0, copy: 50, c2d: 50 }, undefined), true);
  assert.strictEqual(isBlackSelected({ ext: 0, copy: 50, c2d: 50 }, 'copy'), false);
  assert.strictEqual(isBlackSelected({ ext: 0, copy: 1.9, c2d: 8 }, 'copy'), true);
  assert.strictEqual(isBlackSelected({ ext: 0, copy: 1.9, c2d: 7.9 }, 'copy'), false);
  assert.strictEqual(isBlackSelected({ ext: 50, copy: 2, c2d: 50 }, 'copy'), false);
  assert.strictEqual(isBlackSelected({ ext: 0, copy: null, c2d: 50 }, 'copy'), false);
  assert.strictEqual(nextBlackStreak(1, { ext: 0, copy: 0, c2d: 50 }, 'copy'), 2);
  assert.strictEqual(nextBlackStreak(1, { ext: 0, copy: 50, c2d: 50 }, 'copy'), 0);
});

// 결정적 지터(+-jitter 교대)를 넣은 콜백 시각열 (ms).
function seq(periodMs, count, jitter = 0) {
  return Array.from({ length: count }, (_, i) => i * periodMs + (i % 2 ? jitter : -jitter));
}

test('displayMissRate: 60Hz 규칙 +-2ms 지터는 0, 120Hz도 0', () => {
  const { displayMissRate } = ns.hud;
  const t60 = seq(1000 / 60, 601, 2);
  assert.strictEqual(displayMissRate(t60, t60[0], t60[600], 60), 0);
  const t120 = seq(1000 / 120, 1201, 2);
  assert.strictEqual(displayMissRate(t120, t120[0], t120[1200], 120), 0);
});

test('displayMissRate: 60Hz에서 33ms 공백 1회는 1/600', () => {
  const { displayMissRate } = ns.hud;
  const t = seq(1000 / 60, 601).filter((_, i) => i !== 300); // 한 슬롯 누락
  assert.strictEqual(displayMissRate(t, 0, 10000, 60), 1 / 600);
  // 긴 공백은 round(간격 x hz) - 1개로 센다 (100ms -> 5개)
  const g = [0, 100, 116.7];
  assert.strictEqual(displayMissRate(g, 0, 1000, 60), 5 / 60);
});

test('displayMissRate: 창 밖 시각은 무시, 계산 불가는 null', () => {
  const { displayMissRate } = ns.hud;
  const t = [-500, 0, 16.7, 33.4, 50.1, 5000];
  assert.strictEqual(displayMissRate(t, 0, 100, 60), 0);
  assert.strictEqual(displayMissRate([0], 0, 100, 60), null);
  assert.strictEqual(displayMissRate([], 0, 100, 60), null);
  assert.strictEqual(displayMissRate(null, 0, 100, 60), null);
  assert.strictEqual(displayMissRate([0, 16, 33], 0, 100, 0), null);
  assert.strictEqual(displayMissRate([0, 16, 33], 100, 100, 60), null);
});

test('estimateDisplayHz: 간격 중앙값으로 60/120 추정, 일시정지 공백에 강함', () => {
  const { estimateDisplayHz } = ns.hud;
  assert.strictEqual(estimateDisplayHz(seq(16.7, 100)), 60);
  assert.strictEqual(estimateDisplayHz(seq(8.3, 100)), 120);
  assert.strictEqual(estimateDisplayHz(seq(8.3, 100, 1)), 120);
  const withPause = seq(16.7, 100).map((v, i) => (i >= 50 ? v + 5000 : v));
  assert.strictEqual(estimateDisplayHz(withPause), 60);
  assert.strictEqual(estimateDisplayHz([0]), null);
  assert.strictEqual(estimateDisplayHz([]), null);
  assert.strictEqual(estimateDisplayHz(null), null);
});

test('buildDiag v3: render 비용 필드와 frameProbe 시간, 스키마 선언 일치', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'result-schema-m2.json'), 'utf8'),
  );
  const t = seq(1000 / 120, 1201);
  const d = plain(
    ns.hud.buildDiag({
      render: {
        mode: 'itm',
        path: 'copy',
        frames: 1201,
        frameTimesMs: [1, 2],
        loopTimestamps: t,
        copyTimesMs: [1, 2, 3, 4, 5],
        copySkipped: 7,
        videoDropped: 3,
        videoTotal: 100,
      },
      frameProbe: { n: 1, ms: 9.5, extSyncMs: 1, copySyncMs: 2, c2dSyncMs: 3 },
    }),
  );
  assert.strictEqual(d.schemaVersion, 3);
  assert.strictEqual(d.render.path, 'copy');
  assert.strictEqual(d.render.displayHz, 120);
  assert.strictEqual(d.render.displayMissRate, 0);
  assert.strictEqual(d.render.copyMsP50, 3);
  assert.strictEqual(d.render.copyMsP95, 4.8);
  assert.deepStrictEqual(
    [d.render.copySkipped, d.render.videoDropped, d.render.videoTotal],
    [7, 3, 100],
  );
  for (const k of Object.keys(d.render)) assert.ok(k in schema.properties.render.properties, k);
  for (const k of Object.keys(d.frameProbe))
    assert.ok(k in schema.properties.frameProbe.properties, k);
  assert.deepStrictEqual(schema.properties.render.properties.path.enum, ['ext', 'copy', null]);
  assert.ok(!schema.properties.render.required.includes('path'));
  const e = plain(ns.hud.buildDiag({}));
  assert.deepStrictEqual(
    [e.render.path, e.render.displayHz, e.render.displayMissRate, e.render.copyMsP50],
    [null, null, null, null],
  );
});
