'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const repo = path.join(__dirname, '..', '..');
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
  assert.deepStrictEqual(plain(MODES), ['itm', 'identity', 'stripes', 'baseline']);
  const def = {
    enabled: true,
    mode: 'itm',
    preset: 'custom',
    strength: 0.43,
    sharpness: 0,
    saturation: 1.05,
    custom: { P: 2, k: 0.4, n: 2, g: 1.22, s: 1.03, hs: 1.03 },
    hud: false,
    notify: true,
  };
  assert.deepStrictEqual(plain(normalizeSettings(undefined)), def);
  assert.deepStrictEqual(plain(normalizeSettings(null)), def);
  assert.deepStrictEqual(plain(normalizeSettings('x')), def);
  assert.deepStrictEqual(plain(normalizeSettings({})), def);
  assert.deepStrictEqual(
    plain(normalizeSettings({ [KEYS.enabled]: false, [KEYS.mode]: 'stripes' })),
    { ...def, enabled: false, mode: 'stripes' },
  );
  assert.deepStrictEqual(
    plain(normalizeSettings({ [KEYS.enabled]: true, [KEYS.mode]: 'baseline' })),
    { ...def, mode: 'baseline' },
  );
  assert.deepStrictEqual(
    plain(normalizeSettings({ [KEYS.enabled]: 'yes', [KEYS.mode]: 'bogus' })),
    def,
  );
  assert.deepStrictEqual(plain(normalizeSettings({ [KEYS.enabled]: 0, [KEYS.mode]: 3 })), def);
  assert.strictEqual(KEYS.enabled, 'sdrhdr.enabled');
  assert.strictEqual(KEYS.mode, 'sdrhdr.mode');
  assert.strictEqual(KEYS.strength, 'sdrhdr.strength');
  assert.strictEqual(KEYS.diag, 'sdrhdr.diag');
});

test('params: 프리셋 3종 확정값과 범위 (PLAN C절 표, M4)', () => {
  const P = ns.params;
  assert.deepStrictEqual(plain(P.PRESETS), {
    accurate: { P: 2.0, k: 0.5, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
    balanced: { P: 3.0, k: 0.45, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
    vivid: { P: 4.0, k: 0.45, n: 2.0, g: 1.0, s: 1.2, hs: 1.0 },
  });
  assert.deepStrictEqual(plain(P.PRESET_BALANCED), plain(P.PRESETS.balanced));
  assert.strictEqual(P.DEFAULT_PRESET, 'custom');
  assert.deepStrictEqual(plain(P.DEFAULT_CUSTOM), {
    P: 2,
    k: 0.4,
    n: 2,
    g: 1.22,
    s: 1.03,
    hs: 1.03,
  });
  assert.deepStrictEqual(plain(P.RANGES), {
    P: [1.0, 8.0],
    k: [0.4, 0.9],
    n: [2.0, 4],
    g: [0.8, 1.5],
    s: [0.8, 1.5],
    hs: [0.5, 1.5],
  });
  for (const preset of Object.values(P.PRESETS)) {
    for (const [key, v] of Object.entries(preset)) {
      const [lo, hi] = P.RANGES[key];
      assert.ok(v >= lo && v <= hi, key);
    }
  }
  // sim/presets.py와 같은 값 (한 곳 정의 원칙, GUIDELINES 3-5).
  const py = fs.readFileSync(path.join(repo, 'sim', 'presets.py'), 'utf8');
  const ids = { 정확: 'accurate', 균형: 'balanced', 선명: 'vivid' };
  for (const [ko, id] of Object.entries(ids)) {
    const m = new RegExp('"' + ko + '":\\s*Preset\\("' + ko + '",\\s*([^)]*)\\)').exec(py);
    assert.ok(m, ko);
    const kv = {};
    for (const part of m[1].split(',')) {
      const [k, v] = part.split('=').map((x) => x.trim());
      kv[k] = Number(v);
    }
    assert.deepStrictEqual(kv, plain(P.PRESETS[id]), ko);
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
    'lifecycle',
    'errors',
  ]);
  assert.strictEqual(d.schemaVersion, 13);
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
    'colorSpace',
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
    hdrSource: false,
    hud: false,
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
    hdrSource: false,
    hud: false,
  });
  assert.strictEqual(d.video.colorSpace, null);
  assert.strictEqual(d.lifecycle.state, null);
  assert.deepStrictEqual(d.lifecycle.events, []);
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
      vf: 7.777,
      vfErr: 'ReferenceError',
      vfSyncMs: 0.456,
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
    vf: 7.78,
    vfErr: 'ReferenceError',
    vfSyncMs: 0.46,
    copy: null,
    c2d: null,
    extErr: null,
    copyErr: 'SecurityError',
    c2dErr: null,
    ms: 12.35,
    extSyncMs: 1.23,
    copySyncMs: null,
    c2dSyncMs: null,
    mode: null,
    hdrEarly: null,
  });
});

test('normalizeFrameProbe: mode·hdrEarly 정규화 (M6-1, schemaVersion 10)', () => {
  const n = (p) => plain(ns.hud.normalizeFrameProbe(p));
  assert.deepStrictEqual(
    [n({ mode: 'single', hdrEarly: false }).mode, n({ mode: 'single', hdrEarly: false }).hdrEarly],
    ['single', false],
  );
  assert.strictEqual(n({ mode: 'full', hdrEarly: true }).hdrEarly, true);
  assert.strictEqual(n({ mode: 'bogus', hdrEarly: 'x' }).mode, null);
  assert.strictEqual(n({ mode: 'bogus', hdrEarly: 'x' }).hdrEarly, null);
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

test('choosePath 경계 표 (FIX_GUIDE R2)', () => {
  const { choosePath } = ns.detect;
  const table = [
    // [probe, 기대값]
    [{ ext: 0, vf: 0, copy: 97.8, c2d: 145 }, 'copy'],
    [{ ext: 1.9, vf: 1.9, copy: 8, c2d: 8 }, 'copy'],
    [{ ext: 1.9, copy: 8, c2d: 20 }, 'copy'], // vf 값 없음(v3 이전 probe)
    [{ ext: 1.9, vf: 1.9, copy: 7.9, c2d: 145 }, 'none'], // 모두 검음, c2d만 정상
    [{ ext: 0, vf: null, copy: null, c2d: 60 }, 'none'],
    [{ ext: 0, vf: 0, copy: 0, c2d: 8 }, 'none'],
    [{ ext: 1.9, vf: 1.9, copy: 7.9, c2d: 7.9 }, 'pending'], // 기준 c2d 8 미만
    [{ ext: 0, vf: 0, copy: 0, c2d: 0 }, 'pending'],
    [{ ext: 100, vf: 100, copy: 100, c2d: 7.9 }, 'pending'], // 경로가 밝아도 기준이 어두우면 보류
    [{ ext: 100, vf: 100, copy: 100, c2d: null }, 'pending'],
    [{ ext: 100, vf: 100, copy: 100, c2d: undefined }, 'pending'],
    [{ ext: 100, vf: 100, copy: 100, c2d: NaN }, 'pending'],
    [{ ext: 2, vf: 60, copy: 60, c2d: 60 }, 'ext'],
    [{ ext: 2, vf: 0, copy: 0, c2d: 8 }, 'ext'],
    [{ ext: 40, copy: 60, c2d: 60 }, 'ext'],
    [{ ext: 1.9, vf: 2, copy: 60, c2d: 60 }, 'vf'], // ext 검음, vf 경계 2
    [{ ext: null, vf: 2, copy: 0, c2d: 60 }, 'vf'], // ext 예외
    [{ ext: 0, vf: 1.9, copy: 8, c2d: 60 }, 'copy'], // vf 경계 1.9
    [{ ext: 0, vf: null, copy: 7.9, c2d: 60 }, 'none'],
    [{ ext: null, vf: null, copy: null, c2d: null }, 'pending'],
    [{}, 'pending'],
    [null, 'pending'],
    [undefined, 'pending'],
  ];
  for (const [probe, want] of table)
    assert.strictEqual(choosePath(probe), want, JSON.stringify(probe));
});

test('nextNoneStreak: none 2회 연속에서만 한도, 다른 결과는 0', () => {
  const { nextNoneStreak, NONE_STREAK_LIMIT } = ns.detect;
  assert.strictEqual(NONE_STREAK_LIMIT, 2);
  let n = nextNoneStreak(0, 'none');
  assert.ok(n < NONE_STREAK_LIMIT);
  n = nextNoneStreak(n, 'none');
  assert.ok(n >= NONE_STREAK_LIMIT);
  for (const c of ['pending', 'ext', 'vf', 'copy']) assert.strictEqual(nextNoneStreak(1, c), 0, c);
  assert.strictEqual(nextNoneStreak(undefined, 'none'), 1);
});

test('stepDownPath: 선택 경로 검음 + 다음 단계 밝음일 때만 한 단계 아래로', () => {
  const { stepDownPath } = ns.detect;
  assert.strictEqual(stepDownPath('ext', { ext: 0, vf: 2, copy: 60, c2d: 60 }), 'vf');
  assert.strictEqual(stepDownPath('ext', { ext: 1.9, vf: 100, copy: 0, c2d: 0 }), 'vf');
  assert.strictEqual(stepDownPath('ext', { ext: 2, vf: 100, copy: 60, c2d: 60 }), 'ext');
  assert.strictEqual(stepDownPath('ext', { ext: 0, vf: 1.9, copy: 60, c2d: 60 }), 'ext'); // 두 단계 건너뛰지 않음
  assert.strictEqual(stepDownPath('ext', { ext: null, vf: 100, copy: 60, c2d: 60 }), 'ext');
  assert.strictEqual(stepDownPath('vf', { ext: 100, vf: 0, copy: 8, c2d: 60 }), 'copy');
  assert.strictEqual(stepDownPath('vf', { ext: 100, vf: 0, copy: 7.9, c2d: 60 }), 'vf');
  assert.strictEqual(stepDownPath('vf', { ext: 0, vf: 2, copy: 60, c2d: 60 }), 'vf');
  assert.strictEqual(stepDownPath('copy', { ext: 100, vf: 100, copy: 0, c2d: 60 }), 'copy'); // 위로 가지 않음
  assert.strictEqual(stepDownPath('ext', null), 'ext');
  assert.strictEqual(stepDownPath('none', { ext: 100, vf: 100, copy: 100 }), 'none');
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
  assert.strictEqual(isBlackSelected({ ext: 50, vf: 1.9, copy: 0, c2d: 8 }, 'vf'), true);
  assert.strictEqual(isBlackSelected({ ext: 50, vf: 1.9, copy: 8, c2d: 0 }, 'vf'), true);
  assert.strictEqual(isBlackSelected({ ext: 50, vf: 1.9, copy: 7.9, c2d: 7.9 }, 'vf'), false);
  assert.strictEqual(isBlackSelected({ ext: 0, vf: 2, copy: 50, c2d: 50 }, 'vf'), false);
  assert.strictEqual(isBlackSelected({ ext: 0, vf: null, copy: 50, c2d: 50 }, 'vf'), false);
  assert.strictEqual(nextBlackStreak(1, { ext: 0, copy: 0, c2d: 50 }, 'copy'), 2);
  assert.strictEqual(nextBlackStreak(1, { ext: 0, copy: 50, c2d: 50 }, 'copy'), 0);
  assert.strictEqual(nextBlackStreak(1, { ext: 50, vf: 0, copy: 0, c2d: 50 }, 'vf'), 2);
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

test('displayMissRate Q2: 500ms 초과 간격은 누락 수와 분모에서 제외', () => {
  const { displayMissRate, summarize } = ns.hud;
  // 60Hz 규칙 시퀀스 중간에 2초 공백 1회 -> 누락 0
  const a = seq(1000 / 60, 301);
  const b = seq(1000 / 60, 301).map((v) => v + a[300] + 2000);
  const t = a.concat(b);
  assert.strictEqual(displayMissRate(t, t[0], t[t.length - 1], 60), 0);
  // 공백 전후의 실제 누락은 그대로 센다 (33 ms 공백 1회 + 2초 공백 1회 -> 1/(측정 초 x 60))
  const c = t.filter((_, i) => i !== 100);
  const measuredSec = (c[c.length - 1] - c[0] - 2000) / 1000;
  near(displayMissRate(c, c[0], c[c.length - 1], 60), 1 / (measuredSec * 60));
  // 500ms 경계: 정확히 500ms는 끊김이 아니라 누락으로 센다 (round(0.5 x 60) - 1 = 29)
  assert.strictEqual(displayMissRate([0, 500], 0, 1000, 60), 29 / 60);
  // 전부 끊김이면 계산 불가
  assert.strictEqual(displayMissRate([0, 2000], 0, 2000, 60), null);
  // loopFps도 끊김 간격 제외: 60fps 구간 + 2초 공백 -> 여전히 60
  near(summarize([], t).loopFps, 60);
  near(summarize([], [0, 2000, 2000 + 1000 / 60, 2000 + 2000 / 60]).loopFps, 60);
  assert.strictEqual(summarize([], [0, 2000]).loopFps, null);
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
        vfTimesMs: [0.5, 1, 1.5, 2, 2.5],
        copySkipped: 7,
        sameFrameSkipped: 12,
        videoDropped: 3,
        videoTotal: 100,
      },
      frameProbe: { n: 1, ms: 9.5, extSyncMs: 1, copySyncMs: 2, c2dSyncMs: 3, vf: 50, vfErr: null },
    }),
  );
  assert.strictEqual(d.schemaVersion, 13);
  assert.strictEqual(d.render.sameFrameSkipped, 12);
  assert.strictEqual(d.render.path, 'copy');
  assert.strictEqual(d.render.displayHz, 120);
  assert.strictEqual(d.render.displayMissRate, 0);
  assert.strictEqual(d.render.copyMsP50, 3);
  assert.strictEqual(d.render.copyMsP95, 4.8);
  assert.deepStrictEqual([d.render.vfMsP50, d.render.vfMsP95], [1.5, 2.4]);
  assert.strictEqual(d.frameProbe.vf, 50);
  assert.deepStrictEqual(
    [d.render.copySkipped, d.render.videoDropped, d.render.videoTotal],
    [7, 3, 100],
  );
  for (const k of Object.keys(d.render)) assert.ok(k in schema.properties.render.properties, k);
  for (const k of Object.keys(d.frameProbe))
    assert.ok(k in schema.properties.frameProbe.properties, k);
  assert.deepStrictEqual(schema.properties.render.properties.path.enum, [
    'ext',
    'vf',
    'copy',
    'pending',
    null,
  ]);
  assert.strictEqual(plain(ns.hud.buildDiag({ render: { path: 'vf' } })).render.path, 'vf');
  assert.strictEqual(
    plain(ns.hud.buildDiag({ render: { path: 'pending' } })).render.path,
    'pending',
  );
  assert.strictEqual(plain(ns.hud.buildDiag({ render: { path: 'none' } })).render.path, null);
  assert.ok(!schema.properties.render.required.includes('path'));
  const e = plain(ns.hud.buildDiag({}));
  assert.deepStrictEqual(
    [
      e.render.path,
      e.render.displayHz,
      e.render.displayMissRate,
      e.render.copyMsP50,
      e.render.vfMsP50,
    ],
    [null, null, null, null, null],
  );
});

// ---- S2 cadenceStats: 순수 함수. hold[i]는 i번째 소스 프레임을 그린 갱신 수. ----
function holdSeq(fps, displayHz, holds) {
  const src = [];
  const loop = [];
  let k = 0;
  holds.forEach((h, i) => {
    for (let j = 0; j < h; j++) {
      src.push(i / fps);
      loop.push((k++ * 1000) / displayHz);
    }
  });
  return { src, loop };
}

test('cadenceStats: 24fps 소스 60Hz 3·2 반복 -> irregular 0', () => {
  const holds = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 3 : 2));
  const { src, loop } = holdSeq(24, 60, holds);
  const c = plain(ns.hud.cadenceStats(src, loop, 60));
  near(c.srcFps, 24);
  assert.strictEqual(c.srcFpsNominal, 24);
  assert.strictEqual(c.irregular, 0);
  assert.strictEqual(c.skipped, 0);
  assert.deepStrictEqual(c.holdHist, { 1: 0, 2: 19, 3: 19, 4: 0, '5+': 0 });
});

test('cadenceStats: 3·3·1이 섞인 시퀀스 -> 이상 유지 비율', () => {
  // 가장자리(처음·마지막 유지)는 제외되므로 안쪽 16개 중 1이 2개.
  const holds = [3, 2, 3, 2, 3, 3, 1, 3, 2, 3, 2, 3, 2, 3, 3, 1, 2, 3];
  const { src, loop } = holdSeq(24, 60, holds);
  const c = plain(ns.hud.cadenceStats(src, loop, 60));
  assert.strictEqual(c.irregular, 2 / 16);
  assert.strictEqual(c.holdHist['1'], 2);
});

test('cadenceStats: 60fps 소스 60Hz -> holdHist 1에 집중, 29.97은 가장 가까운 값으로', () => {
  const { src, loop } = holdSeq(60, 60, Array(100).fill(1));
  const c = plain(ns.hud.cadenceStats(src, loop, 60));
  assert.strictEqual(c.srcFpsNominal, 60);
  assert.deepStrictEqual(c.holdHist, { 1: 98, 2: 0, 3: 0, 4: 0, '5+': 0 });
  assert.strictEqual(c.irregular, 0);
  const t = holdSeq(30000 / 1001, 60, Array(60).fill(2));
  const c2 = plain(ns.hud.cadenceStats(t.src, t.loop, 60));
  assert.strictEqual(c2.srcFpsNominal, 29.97);
  near(c2.srcFps, 30000 / 1001, 1e-6);
  assert.strictEqual(c2.irregular, 0);
});

test('cadenceStats: 소스 프레임 건너뜀 1회 -> skipped 1', () => {
  const src = [];
  const loop = [];
  let k = 0;
  for (let i = 0; i < 100; i++) {
    if (i === 50) continue; // 그리지 못하고 지나간 소스 프레임
    src.push(i / 60);
    loop.push((k++ * 1000) / 60);
  }
  const c = plain(ns.hud.cadenceStats(src, loop, 60));
  assert.strictEqual(c.skipped, 1);
  assert.strictEqual(c.srcFpsNominal, 60);
});

test('cadenceStats: 500 ms 넘는 공백은 유지 길이에서 제외, 입력 부족은 null', () => {
  const a = holdSeq(
    24,
    60,
    Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 3 : 2)),
  );
  const b = holdSeq(
    24,
    60,
    Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? 3 : 2)),
  );
  // 두 구간 사이에 2초 공백. 공백에 걸친 유지(길게 늘어난 5+)가 집계되면 안 된다.
  const src = a.src.concat(b.src.map((v) => v + 100));
  const loop = a.loop.concat(b.loop.map((v) => v + 2000 + a.loop[a.loop.length - 1]));
  const c = plain(ns.hud.cadenceStats(src, loop, 60));
  assert.strictEqual(c.holdHist['5+'], 0);
  assert.strictEqual(c.irregular, 0);
  assert.strictEqual(c.skipped, 0);
  const e = plain(ns.hud.cadenceStats([], [], 60));
  assert.deepStrictEqual(e, {
    srcFps: null,
    srcFpsNominal: null,
    holdHist: null,
    irregular: null,
    skipped: null,
  });
  assert.strictEqual(plain(ns.hud.cadenceStats([1, 1, 1], [0, 16, 32], 60)).srcFps, null);
  const n = holdSeq(24, 60, [3, 2, 3, 2, 3, 2]);
  assert.strictEqual(plain(ns.hud.cadenceStats(n.src, n.loop, null)).irregular, null);
});

test('buildDiag v5: render.cadence와 baseline 모드, 스키마 선언 일치', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'result-schema-m2.json'), 'utf8'),
  );
  const { src, loop } = holdSeq(
    24,
    60,
    Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 3 : 2)),
  );
  const d = plain(
    ns.hud.buildDiag({ render: { mode: 'itm', frames: 75, srcTimes: src, loopTimestamps: loop } }),
  );
  assert.strictEqual(d.render.displayHz, 60);
  assert.strictEqual(d.render.cadence.srcFpsNominal, 24);
  assert.strictEqual(d.render.cadence.irregular, 0);
  assert.strictEqual(d.render.cadence.skipped, 0);
  const cp = schema.properties.render.properties.cadence.properties;
  for (const k of Object.keys(d.render.cadence)) assert.ok(k in cp, k);
  assert.deepStrictEqual(schema.properties.render.properties.mode.enum, [
    'itm',
    'identity',
    'stripes',
    'baseline',
    null,
  ]);
  assert.deepStrictEqual(
    schema.properties.render.properties.mode.enum.filter((m) => m).sort(),
    plain(ns.params.MODES).sort(),
  );
  // baseline: 소스 시각 없음 -> cadence null, loopFps는 그대로 계산
  const b = plain(
    ns.hud.buildDiag({
      render: { mode: 'baseline', frames: 0, loopTimestamps: seq(1000 / 60, 100) },
    }),
  );
  assert.strictEqual(b.render.cadence, null);
  assert.strictEqual(b.render.mode, 'baseline');
  near(b.render.loopFps, 60, 0.01);
  assert.strictEqual(plain(ns.hud.buildDiag({})).render.cadence, null);
});

test('buildDiag: lifecycle·colorSpace 정규화 (M3-4)', () => {
  const events = Array.from({ length: 40 }, (_, i) => ({ t: i + 0.123, ev: 'srcChange' }));
  const d = plain(
    ns.hud.buildDiag({
      video: {
        colorSpace: {
          primaries: 'bt2020',
          transfer: 'pq',
          matrix: 'bt2020-ncl',
          fullRange: false,
          x: 1,
        },
      },
      flags: { hdrSource: true },
      lifecycle: {
        state: 'skipped',
        skipReason: 'hdrSource',
        navCount: 2,
        srcChanges: 3.7,
        videoSwaps: 1,
        playerMode: 'theater',
        adShowing: false,
        pip: false,
        lastEvent: 'skip',
        lastEventAt: 12.345,
        events,
      },
    }),
  );
  assert.deepStrictEqual(d.video.colorSpace, {
    primaries: 'bt2020',
    transfer: 'pq',
    matrix: 'bt2020-ncl',
    fullRange: false,
  });
  assert.strictEqual(d.flags.hdrSource, true);
  assert.strictEqual(d.lifecycle.state, 'skipped');
  assert.strictEqual(d.lifecycle.srcChanges, 3);
  assert.strictEqual(d.lifecycle.lastEventAt, 12.35);
  assert.strictEqual(d.lifecycle.events.length, 30);
  assert.strictEqual(d.lifecycle.events[29].t, 39.12);
  assert.strictEqual(
    plain(ns.hud.buildDiag({ lifecycle: { state: 'bogus' } })).lifecycle.state,
    null,
  );
});

test('슬라이더 정규화: 강도·선명도·채도 범위·타입·step, 프리셋 id (M4a, M4-E)', () => {
  const {
    normalizeStrength,
    normalizeRange,
    normalizeSettings,
    KEYS,
    STRENGTH,
    SHARPNESS,
    SATURATION,
  } = ns.params;
  assert.deepStrictEqual(plain(STRENGTH), { min: 0, max: 1, step: 0.01, default: 0.43 });
  assert.deepStrictEqual(plain(SHARPNESS), { min: 0, max: 1, step: 0.01, default: 0 });
  assert.deepStrictEqual(plain(SATURATION), { min: 0.5, max: 1.5, step: 0.01, default: 1.05 });
  assert.strictEqual(normalizeStrength(0), 0);
  assert.strictEqual(normalizeStrength(1), 1);
  assert.strictEqual(normalizeStrength(0.337), 0.34);
  assert.strictEqual(normalizeStrength(-1), 0);
  assert.strictEqual(normalizeStrength(7), 1);
  for (const bad of [undefined, null, NaN, Infinity, '0.3', {}]) {
    assert.strictEqual(normalizeStrength(bad), 0.43, String(bad));
    assert.strictEqual(normalizeRange(SHARPNESS, bad), 0);
    assert.strictEqual(normalizeRange(SATURATION, bad), 1.05);
  }
  assert.strictEqual(normalizeRange(SATURATION, 0.1), 0.5);
  assert.strictEqual(normalizeRange(SATURATION, 9), 1.5);
  assert.strictEqual(normalizeRange(SATURATION, 1.234), 1.23);
  const s = normalizeSettings({
    [KEYS.strength]: 0.8,
    [KEYS.sharpness]: 0.3,
    [KEYS.saturation]: 1.2,
    [KEYS.preset]: 'vivid',
  });
  assert.deepStrictEqual(
    [s.strength, s.sharpness, s.saturation, s.preset],
    [0.8, 0.3, 1.2, 'vivid'],
  );
  assert.strictEqual(normalizeSettings({ [KEYS.preset]: '선명' }).preset, 'custom');
  assert.strictEqual(normalizeSettings({ [KEYS.strength]: 'x' }).strength, 0.43);
});

test('toUniformArray: UNIFORM_ORDER 순서·길이 12, 프리셋 값 반영, 잘못된 입력은 기본값 (M4-B)', () => {
  const P = ns.params;
  assert.deepStrictEqual(plain(P.UNIFORM_ORDER), [
    'strength',
    'P',
    'k',
    'n',
    'g',
    's',
    'hs',
    'sharp',
    'csat',
  ]);
  assert.strictEqual(P.UNIFORM_FLOATS, 12);
  const a = plain(
    P.toUniformArray({ preset: 'vivid', strength: 0.3, sharpness: 0.6, saturation: 1.1 }),
  );
  assert.deepStrictEqual(a, [0.3, 4, 0.45, 2, 1, 1.2, 1, 0.6, 1.1, 0, 0, 0]);
  const d = plain(P.toUniformArray(undefined));
  assert.deepStrictEqual(d, [0.43, 2, 0.4, 2, 1.22, 1.03, 1.03, 0, 1.05, 0, 0, 0]);
});

test('buildDiag: render.strength는 소수 둘째 자리, 없으면 null (M4a)', () => {
  assert.strictEqual(
    plain(ns.hud.buildDiag({ render: { strength: 0.456 } })).render.strength,
    0.46,
  );
  assert.strictEqual(plain(ns.hud.buildDiag({})).render.strength, null);
});

test('normalizeCustom: 범위 클램프·step 반올림·누락은 정확 프리셋 값 (M5-1)', () => {
  const { normalizeCustom, DEFAULT_CUSTOM, DETAIL_STEPS, RANGES } = ns.params;
  assert.deepStrictEqual(plain(normalizeCustom(undefined)), plain(DEFAULT_CUSTOM));
  assert.deepStrictEqual(plain(normalizeCustom('x')), plain(DEFAULT_CUSTOM));
  const c = plain(
    normalizeCustom({ P: 99, k: 0.1, n: 1.5, g: 1.234, s: 'x', hs: 0.777, extra: 1 }),
  );
  assert.deepStrictEqual(c, { P: 8, k: 0.4, n: 2, g: 1.23, s: 1.03, hs: 0.78 });
  assert.deepStrictEqual(Object.keys(c), Object.keys(DETAIL_STEPS));
  for (const key of Object.keys(RANGES)) assert.ok(key in DETAIL_STEPS, key);
  assert.strictEqual(plain(normalizeCustom({ P: 3.04 })).P, 3);
  assert.strictEqual(plain(normalizeCustom({ P: 3.06 })).P, 3.1);
});

test('커스텀 프리셋: normalizeSettings·toUniformArray·curveOf·effectivePeak (M5-1)', () => {
  const P = ns.params;
  assert.ok(P.PRESET_IDS.includes('custom'));
  const raw = {
    [P.KEYS.preset]: 'custom',
    [P.KEYS.custom]: { P: 2.6, k: 0.5, n: 2.5, g: 1.0, s: 1.1, hs: 0.9 },
    [P.KEYS.strength]: 0.5,
    [P.KEYS.hud]: true,
  };
  const s = plain(P.normalizeSettings(raw));
  assert.strictEqual(s.preset, 'custom');
  assert.deepStrictEqual(s.custom, { P: 2.6, k: 0.5, n: 2.5, g: 1, s: 1.1, hs: 0.9 });
  assert.strictEqual(s.hud, true);
  const u = plain(P.toUniformArray(s));
  assert.deepStrictEqual(u.slice(0, 9), [0.5, 2.6, 0.5, 2.5, 1, 1.1, 0.9, 0, 1.05]);
  assert.deepStrictEqual(plain(P.curveOf(s)), s.custom);
  // 프리셋일 때는 custom 값이 무시된다.
  const v = plain(P.toUniformArray({ ...s, preset: 'vivid' }));
  assert.deepStrictEqual(v.slice(1, 7), [4, 0.45, 2, 1, 1.2, 1]);
  // 유효 피크: 1 + t (P g - 1)
  assert.ok(Math.abs(P.effectivePeak(s) - (1 + 0.5 * (2.6 - 1))) < 1e-12);
  assert.ok(Math.abs(P.effectivePeak({ preset: 'accurate', strength: 0.53 }) - 1.53) < 1e-12);
  assert.ok(Math.abs(P.effectivePeak({ preset: 'balanced', strength: 0.5 }) - 2) < 1e-12);
  assert.ok(Math.abs(P.effectivePeak({ preset: 'balanced', strength: 0 }) - 1) < 1e-12);
  // g>1: 셰이더가 g를 곡선 앞에서 곱하므로 f(g) (PLAN M7-1). P2 k0.4 n2 g1.5 t1 -> f(1.5) = 4.8611
  assert.ok(
    Math.abs(
      P.effectivePeak({ preset: 'custom', custom: { P: 2, g: 1.5 }, strength: 1 }) - 4.8611,
    ) < 1e-3,
  );
  // 기본 설정: 1 + 0.43 x (f(1.22) - 1) ~= 1.8977 (이전 공식 1.6192)
  assert.ok(Math.abs(P.effectivePeak(P.normalizeSettings({})) - 1.8977) < 1e-3);
  // M5 회신 설정 {P2.6 k0.4 n2 g1.11}, t0.53 -> 약 2.2457
  assert.ok(
    Math.abs(
      P.effectivePeak({
        preset: 'custom',
        custom: { P: 2.6, k: 0.4, n: 2, g: 1.11, s: 1, hs: 1.03 },
        strength: 0.53,
      }) - 2.2457,
    ) < 1e-3,
  );
});

test('curveY: g=1이면 f(1)=P, y<=k 항등, 미러(tonecurve.curveF)와 일치 (M7-1)', () => {
  const P = ns.params;
  for (const id of Object.keys(P.PRESETS)) {
    const c = P.PRESETS[id];
    assert.ok(Math.abs(P.curveY(1, c) - c.P) < 1e-12, id);
  }
  const c = { P: 2.6, k: 0.4, n: 2.5, g: 1, s: 1, hs: 1 };
  assert.strictEqual(P.curveY(0.3, c), 0.3);
  // tonecurve.js는 테스트 전용 미러라 manifest에 없다(FIX_GUIDE T). 따로 로드한다.
  const tc = vm.createContext({});
  for (const f of ['ns.js', 'tonecurve.js'])
    vm.runInContext(fs.readFileSync(path.join(root, 'content', f), 'utf8'), tc, { filename: f });
  for (let y = 0; y <= 1.5; y += 0.05) {
    assert.ok(
      Math.abs(P.curveY(y, c) - tc.__sdrhdr.tonecurve.curveF(y, c.P, c.k, c.n)) < 1e-6,
      String(y),
    );
  }
});

test('peakAdvice·HEADROOM_STEPS·RESETTABLE_KEYS (M7-1)', () => {
  const P = ns.params;
  assert.deepStrictEqual(plain(P.peakAdvice(1.5)), { clipAt: [], ok: true });
  assert.deepStrictEqual(plain(P.peakAdvice(2)), { clipAt: [], ok: true });
  assert.deepStrictEqual(plain(P.peakAdvice(2.25)), { clipAt: ['최대'], ok: false });
  assert.deepStrictEqual(plain(P.peakAdvice(3.5)), { clipAt: ['최대', '중간'], ok: false });
  assert.deepStrictEqual(plain(P.peakAdvice(5)).clipAt, ['최대', '중간', '낮음']);
  const keys = plain(P.RESETTABLE_KEYS);
  for (const k of [
    P.KEYS.preset,
    P.KEYS.custom,
    P.KEYS.strength,
    P.KEYS.sharpness,
    P.KEYS.saturation,
    P.KEYS.hud,
  ])
    assert.ok(keys.includes(k), k);
  for (const k of [P.KEYS.enabled, P.KEYS.mode, P.KEYS.diag, P.KEYS.customPrev])
    assert.ok(!keys.includes(k), k);
});

test('buildDiag v9: custom·effectivePeak·flags.hud (M5-4)', () => {
  const d = plain(
    ns.hud.buildDiag({
      render: {
        preset: 'custom',
        custom: { P: 2.6, k: 0.5, n: 2.5, g: 1, s: 1.1, hs: 0.9, extra: 3 },
        effectivePeak: 1.8049,
      },
      flags: { hud: true },
    }),
  );
  assert.strictEqual(d.schemaVersion, 13);
  assert.strictEqual(d.render.preset, 'custom');
  assert.deepStrictEqual(d.render.custom, { P: 2.6, k: 0.5, n: 2.5, g: 1, s: 1.1, hs: 0.9 });
  assert.strictEqual(d.render.effectivePeak, 1.8);
  assert.strictEqual(d.flags.hud, true);
  const e = plain(ns.hud.buildDiag({}));
  assert.strictEqual(e.render.custom, null);
  assert.strictEqual(e.render.effectivePeak, null);
  assert.strictEqual(e.flags.hud, false);
});

test('statusOf: 상태별 level·문구·배지 (M8-1)', () => {
  const st = (o) => plain(ns.params.statusOf({ enabled: true, mode: 'itm', ...o }));
  assert.deepStrictEqual(Object.keys(st({})), ['level', 'text', 'hint', 'badge']);
  assert.strictEqual(st({ enabled: false }).level, 'off');
  assert.strictEqual(st({ enabled: false }).text, '꺼짐');
  assert.strictEqual(st({ state: 'skipped', skip: 'disabled' }).level, 'off');
  // 꺼짐이 진단 모드보다 먼저다.
  assert.strictEqual(st({ enabled: false, mode: 'baseline' }).level, 'off');
  const d = st({ mode: 'baseline', state: 'active' });
  assert.strictEqual(d.level, 'diag');
  assert.strictEqual(d.badge.text, 'D');
  assert.ok(!d.text.includes('baseline'), '모드 이름은 일반 문구에 쓰지 않는다 (GUIDELINES 2.6-3)');
  assert.strictEqual(st({ state: 'active', bypass: true }).text, '원본 보기 중');
  assert.deepStrictEqual(st({ state: 'active' }), {
    level: 'ok',
    text: 'HDR 변환 중',
    hint: '',
    badge: { text: '' },
  });
  assert.strictEqual(st({ state: 'probing' }).text, '판정 중(원본 표시)');
  assert.strictEqual(st({ state: 'probing' }).level, 'wait');
  const u = st({ state: 'probing', undecided: true });
  assert.strictEqual(u.level, 'error');
  assert.strictEqual(u.badge.text, '!');
  assert.strictEqual(
    st({ state: 'skipped', skip: 'drm', drmNow: true }).text,
    'DRM 영상: 변환하지 않음',
  );
  const old = st({ state: 'skipped', skip: 'drm', drmNow: false });
  assert.ok(old.text.includes('이전 DRM 영상'));
  assert.ok(old.hint.includes('새로고침'));
  assert.strictEqual(st({ state: 'skipped', skip: 'hdrSource' }).badge.text, 'HDR');
  assert.strictEqual(st({ state: 'skipped', skip: 'pip' }).text, 'PiP 중: 원본 표시');
  assert.strictEqual(st({ state: 'skipped', skip: 'blackFrame' }).level, 'error');
  const g = st({ state: 'skipped', skip: 'noGpu', errorName: 'OperationError' });
  assert.strictEqual(g.text, '렌더 오류(OperationError)');
  assert.strictEqual(g.badge.color, '#ff3b30');
  assert.strictEqual(st({ state: 'skipped', skip: 'noGpu' }).text, '렌더 오류(?)');
  assert.strictEqual(st({ state: 'idle' }).text, '대상 영상을 찾는 중');
  assert.strictEqual(st({ state: 'skipped', skip: 'nope' }).level, 'wait');
  // 잘못된 입력에도 죽지 않는다. URL·제목 같은 필드는 결과에 나오지 않는다.
  assert.strictEqual(plain(ns.params.statusOf(null)).level, 'wait');
  assert.ok(
    !JSON.stringify(st({ state: 'active', url: '/watch?v=x', title: 'T' })).includes('watch'),
  );
});

test('MSG·notify·setEnabled (M8-1)', () => {
  const P = ns.params;
  assert.deepStrictEqual(plain(P.MSG), { getState: 'sdrhdr:getState', state: 'sdrhdr:state' });
  assert.strictEqual(P.normalizeSettings({}).notify, true);
  assert.strictEqual(P.normalizeSettings({ [P.KEYS.notify]: false }).notify, false);
  assert.strictEqual(P.normalizeSettings({ [P.KEYS.notify]: 'x' }).notify, true);
  assert.ok(P.RESETTABLE_KEYS.includes(P.KEYS.notify));
  // setEnabled는 storage에 enabled만 쓴다.
  const sets = [];
  const c2 = vm.createContext({ browser: { storage: { local: { set: (o) => sets.push(o) } } } });
  for (const f of ['ns.js', 'params.js'])
    vm.runInContext(fs.readFileSync(path.join(root, 'content', f), 'utf8'), c2, { filename: f });
  c2.__sdrhdr.params.setEnabled(0);
  c2.__sdrhdr.params.setEnabled(true);
  assert.deepStrictEqual(plain(sets), [{ 'sdrhdr.enabled': false }, { 'sdrhdr.enabled': true }]);
});

test('진단 요청 키 (FIX_GUIDE T2): requestDiag는 시각을 쓰고, subscribeDiagRequest는 그 키 변경에만 반응한다', async () => {
  const ctx = vm.createContext({});
  const written = [];
  let listener = null;
  ctx.browser = {
    storage: {
      local: { set: async (o) => written.push(o) },
      onChanged: {
        addListener: (fn) => (listener = fn),
        removeListener: (fn) => {
          if (listener === fn) listener = null;
        },
      },
    },
  };
  for (const f of manifest.content_scripts[0].js) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const p = ctx.__sdrhdr.params;
  assert.strictEqual(p.KEYS.diagRequest, 'sdrhdr.diagRequest');
  await p.requestDiag();
  assert.strictEqual(written.length, 1);
  assert.ok(typeof written[0]['sdrhdr.diagRequest'] === 'number');
  let n = 0;
  const off = p.subscribeDiagRequest(() => n++);
  listener({ 'sdrhdr.strength': {} }, 'local');
  listener({ 'sdrhdr.diagRequest': {} }, 'sync');
  assert.strictEqual(n, 0);
  listener({ 'sdrhdr.diagRequest': {} }, 'local');
  assert.strictEqual(n, 1);
  off();
  assert.strictEqual(listener, null);
});

test('BACKUP_KEYS: 설정 키만, 진단 모드·진단·곡선 백업·복원 시각 제외 (U1)', () => {
  const P = ns.params;
  const keys = plain(P.BACKUP_KEYS);
  for (const k of [
    P.KEYS.enabled,
    P.KEYS.preset,
    P.KEYS.custom,
    P.KEYS.strength,
    P.KEYS.sharpness,
    P.KEYS.saturation,
    P.KEYS.hud,
    P.KEYS.notify,
  ])
    assert.ok(keys.includes(k), k);
  for (const k of [
    P.KEYS.mode,
    P.KEYS.diag,
    P.KEYS.diagRequest,
    P.KEYS.customPrev,
    P.KEYS.restoredAt,
  ])
    assert.ok(!keys.includes(k), k);
  assert.strictEqual(P.KEYS.restoredAt, 'sdrhdr.restoredAt');
});

test('buildDiag v13: gpuBusySkipped·devicesCreated·uptimeS·sameFrameSkipped (U2-B)', () => {
  const d = plain(
    ns.hud.buildDiag({
      render: { gpuBusySkipped: 3, devicesCreated: 2, uptimeS: 90, sameFrameSkipped: 12 },
    }),
  );
  assert.strictEqual(d.schemaVersion, 13);
  assert.strictEqual(d.render.gpuBusySkipped, 3);
  assert.strictEqual(d.render.devicesCreated, 2);
  assert.strictEqual(d.render.uptimeS, 90);
  assert.strictEqual(d.render.sameFrameSkipped, 12);
  const e = plain(ns.hud.buildDiag({}));
  for (const k of ['gpuBusySkipped', 'devicesCreated', 'uptimeS'])
    assert.strictEqual(e.render[k], null);
});
