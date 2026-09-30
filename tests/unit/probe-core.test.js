'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(file) {
  const ctx = vm.createContext({});
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'probe', file), 'utf8');
  vm.runInContext(src, ctx, { filename: file });
  return ctx;
}

const core = load('probe-core.js').__probeCore;
const shaders = load('shaders.js').__probeShaders;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' != ' + b);

test('percentile: 선형 보간, 빈 배열 null, 비수치 제외', () => {
  assert.strictEqual(core.percentile([], 50), null);
  assert.strictEqual(core.percentile([5], 95), 5);
  near(core.percentile([1, 2, 3, 4, 5], 50), 3);
  near(core.percentile([1, 2, 3, 4], 50), 2.5);
  near(core.percentile([0, 10], 95), 9.5);
  near(core.percentile([3, NaN, 1, null, 2], 50), 2);
  near(core.percentile([1, 2, 3], 200), 3);
});

test('summarize: p50/p95/mean/max', () => {
  const s = core.summarize([1, 2, 3, 4, 100]);
  assert.strictEqual(s.n, 5);
  near(s.p50, 3);
  near(s.p95, 80.8);
  near(s.mean, 22);
  assert.strictEqual(s.max, 100);
  assert.strictEqual(core.summarize([]).p50, null);
});

test('computeDropRate: 기대 프레임 대비', () => {
  // 1초 구간 60fps: 기대 61개
  near(core.computeDropRate({ frames: 61, mediaTimeSpan: 1, fps: 60 }), 0);
  near(core.computeDropRate({ frames: 55, mediaTimeSpan: 1, fps: 60 }), 6 / 61);
  assert.strictEqual(core.computeDropRate({ frames: 70, mediaTimeSpan: 1, fps: 60 }), 0);
  assert.strictEqual(core.computeDropRate({ frames: 0, mediaTimeSpan: 1, fps: 60 }), null);
  assert.strictEqual(core.computeDropRate({ frames: 10, mediaTimeSpan: 1, fps: 0 }), null);
  assert.strictEqual(core.computeDropRate({ frames: 10, fps: 60 }), null);
});

test('dropRateFromPresented: 건너뛴 프레임 비율', () => {
  assert.strictEqual(core.dropRateFromPresented([1]), null);
  near(core.dropRateFromPresented([1, 2, 3, 4]), 0);
  // 1,2,4,5 -> 1개 건너뜀, 총 4구간 중
  near(core.dropRateFromPresented([1, 2, 4, 5]), 1 / 4);
});

test('canvasResolution: min(원본, 표시x DPR)', () => {
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(core.canvasResolution(3840, 2160, 1920, 1080, 2))),
    {
      width: 3840,
      height: 2160,
    },
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(core.canvasResolution(3840, 2160, 800, 450, 2))),
    {
      width: 1600,
      height: 900,
    },
  );
  // 원본보다 커지지 않는다
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(core.canvasResolution(1920, 1080, 3000, 2000, 2))),
    {
      width: 1920,
      height: 1080,
    },
  );
  assert.strictEqual(core.canvasResolution(0, 1080, 100, 100, 1), null);
});

test('parseSafariVersion', () => {
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15';
  assert.strictEqual(core.parseSafariVersion(ua), '27.2');
  assert.strictEqual(core.parseSafariVersion('Chrome/120'), null);
  assert.strictEqual(core.parseSafariVersion(undefined), null);
});

test('buildRun: 필드 계산', () => {
  const run = core.buildRun({
    fixture: 'ramp-2160p60',
    itm: true,
    srcW: 3840,
    srcH: 2160,
    canvasW: 3024,
    canvasH: 1701,
    fullscreen: true,
    frames: 600,
    wallSeconds: 10,
    dropRate: 0.004,
    dropRatePresented: 0,
    jsTimes: [1, 2, 3],
    gpuTimes: [4, 6],
  });
  assert.strictEqual(run.srcRes, '3840x2160');
  assert.strictEqual(run.canvasRes, '3024x1701');
  assert.strictEqual(run.fps, 60);
  assert.strictEqual(run.jsP50, 2);
  assert.strictEqual(run.gpuMs, 5);
  assert.strictEqual(run.gpuSamples, 2);
  const nogpu = core.buildRun({ fixture: 'x', frames: 0, wallSeconds: 0, jsTimes: [] });
  assert.strictEqual(nogpu.gpuMs, null);
  assert.strictEqual(nogpu.fps, null);
  assert.strictEqual(nogpu.jsP95, null);
});

test('buildResult: E절 최상위 키와 마지막 run 요약', () => {
  const runs = [
    core.buildRun({ fixture: 'a', frames: 60, wallSeconds: 1, jsTimes: [1], gpuTimes: [2] }),
    core.buildRun({
      fixture: 'b',
      frames: 120,
      wallSeconds: 2,
      jsTimes: [3],
      srcW: 1920,
      srcH: 1080,
    }),
  ];
  const r = core.buildResult({
    now: '2026-09-30T00:00:00.000Z',
    env: { macOS: '27.2', safari: '27.2', power: 'ac', sdrBrightness: 'max' },
    api: { navigatorGpu: true },
    edr: { maxDistinctStep: 4, encodingMatch: 'nonlinear' },
    perfRuns: runs,
    flags: { fullscreen: true },
    errors: ['x'],
  });
  for (const k of ['env', 'api', 'edr', 'perf', 'flags', 'errors']) assert.ok(k in r, k);
  assert.strictEqual(r.perf.srcRes, '1920x1080');
  assert.strictEqual(r.perf.jsP50, 3);
  assert.ok(!('gpuMs' in r.perf));
  assert.strictEqual(r.perf.runs.length, 2);
  assert.strictEqual(r.edr.maxDistinctStep, 4);
  assert.strictEqual(r.flags.drm, false);
  assert.strictEqual(r.flags.fullscreen, true);
  assert.strictEqual(r.env.chip, null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.errors)), ['x']);
  // 직렬화 가능
  JSON.parse(JSON.stringify(r));
});

test('buildResult: 빈 입력에도 스키마 필수 키 유지', () => {
  const r = core.buildResult({});
  assert.strictEqual(r.perf.runs.length, 0);
  assert.strictEqual(r.perf.fps, null);
  assert.strictEqual(r.edr.maxDistinctStep, null);
});

test('resultFileName', () => {
  assert.strictEqual(
    core.resultFileName('2026-09-30', 'M1', {
      power: 'ac',
      sdrBrightness: 'low',
      windowMode: 'window',
    }),
    'result-M1-20260930-ac-low-window.json',
  );
  assert.strictEqual(core.resultFileName('2026-09-30', 'M1', {}), 'result-M1-20260930.json');
});

test('shaders: 스트라이프 단계는 PLAN B절 P0-2와 일치, 진입점 존재', () => {
  assert.deepStrictEqual(Array.from(shaders.STEPS), [1, 1.25, 1.5, 2, 3, 4, 6, 8, 16]);
  for (const k of ['STRIPES', 'PATCH', 'VIDEO_IDENTITY', 'VIDEO_ITM']) {
    assert.ok(shaders[k].includes('@vertex fn vs'), k);
    assert.ok(shaders[k].includes('@fragment fn fs'), k);
  }
  assert.ok(shaders.STRIPES.includes('1.00, 1.25, 1.50, 2.00, 3.00, 4.00, 6.00, 8.00, 16.00'));
});
