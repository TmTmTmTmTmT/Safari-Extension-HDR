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

// 50fps 소스: 콜백 t = 500 + 20i ms, mediaTime = i/50. 워밍업 1초 -> 창은 i=50..550.
function seq(n, skip, jsOf) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    out.push({ t: 500 + 20 * i, mediaTime: i / 50, js: jsOf(i), gpu: null, presented: i });
  }
  return out;
}

test('selectWindow: 첫 콜백 후 워밍업 제외, 최대 창 길이', () => {
  const s = seq(700, [], () => 1);
  const w = core.selectWindow(s, 1, 10);
  assert.strictEqual(w.length, 501);
  assert.strictEqual(w[0].t, 1500);
  assert.strictEqual(w[w.length - 1].t, 11500);
  assert.strictEqual(core.selectWindow([], 1, 10).length, 0);
});

test('windowStats: 워밍업 구간 드롭/느린 콜백은 제외, 창 내 드롭만 집계', () => {
  // 워밍업(i=5..15) 11개 누락 + 창 내(i=100..104) 5개 누락
  const skip = [];
  for (let i = 5; i <= 15; i++) skip.push(i);
  for (let i = 100; i <= 104; i++) skip.push(i);
  const s = seq(700, skip, (i) => (i < 30 ? 100 : 2));
  s.find((x) => x.mediaTime === 4).gpu = 0.2;
  s.find((x) => x.mediaTime === 20 / 50).gpu = 9; // 워밍업 구간
  const st = core.windowStats(s, { fps: 50 });
  assert.strictEqual(st.warmupSec, 1);
  assert.strictEqual(st.frames, 496);
  near(st.windowSec, 10);
  near(st.dropRate, 5 / 501);
  assert.ok(st.jsTimes.every((v) => v === 2));
  assert.strictEqual(core.summarize(st.jsTimes).max, 2);
  assert.deepStrictEqual(Array.from(st.gpuTimes), [0.2]);
  // 전체 구간으로 계산하면 기동 구간 드롭이 섞여 더 크다
  const whole = core.computeDropRate({ frames: s.length, mediaTimeSpan: 699 / 50, fps: 50 });
  assert.ok(whole > st.dropRate);
});

test('windowStats: 창 내 누락 없으면 0, 콜백 부족이면 null', () => {
  near(
    core.windowStats(
      seq(700, [], () => 1),
      { fps: 50 },
    ).dropRate,
    0,
  );
  const few = core.windowStats(
    seq(60, [], () => 1),
    { fps: 50 },
  );
  assert.strictEqual(few.frames, 10);
  assert.strictEqual(
    core.windowStats(
      seq(40, [], () => 1),
      { fps: 50 },
    ).dropRate,
    null,
  );
  assert.strictEqual(core.windowStats([], { fps: 50 }).dropRate, null);
});

test('windowStats: gpu는 창 안 샘플만 모은다', () => {
  const s = seq(700, [], () => 1);
  s[10].gpu = 5; // 워밍업
  s[200].gpu = 0.3;
  s[300].gpu = 0.5;
  assert.deepStrictEqual(Array.from(core.windowStats(s, { fps: 50 }).gpuTimes), [0.3, 0.5]);
});

test('isG3Run / hasG3Run: 전원 연결 + 전체화면', () => {
  assert.strictEqual(core.isG3Run({ fullscreen: true }, 'ac'), true);
  assert.strictEqual(core.isG3Run({ fullscreen: false }, 'ac'), false);
  assert.strictEqual(core.isG3Run({ fullscreen: true }, 'battery'), false);
  assert.strictEqual(core.isG3Run({ fullscreen: true }, null), false);
  assert.strictEqual(core.hasG3Run([{ fullscreen: false }, { fullscreen: true }], 'ac'), true);
  assert.strictEqual(core.hasG3Run([], 'ac'), false);
});

test('g3Worst: G3 대상 run만 해상도별 최악값, 없으면 null', () => {
  const runs = [
    { srcRes: '1920x1080', fullscreen: true, dropRate: 0.01, jsP95: 1 },
    { srcRes: '1920x1080', fullscreen: true, dropRate: 0.03, jsP95: 0.5 },
    { srcRes: '1920x1080', fullscreen: false, dropRate: 0.9, jsP95: 9 },
    { srcRes: '3840x2160', fullscreen: true, dropRate: null, jsP95: 2 },
  ];
  assert.deepStrictEqual(JSON.parse(JSON.stringify(core.g3Worst(runs, 'ac'))), {
    '1920x1080': { runs: 2, dropRateMax: 0.03, jsP95Max: 1 },
    '3840x2160': { runs: 1, dropRateMax: null, jsP95Max: 2 },
  });
  assert.strictEqual(core.g3Worst(runs, 'battery'), null);
  assert.strictEqual(core.g3Worst([runs[2]], 'ac'), null);
  assert.strictEqual(core.g3Worst([], 'ac'), null);
});

test('deriveWindowMode: run의 실제 전체화면 상태에서 파생', () => {
  assert.strictEqual(core.deriveWindowMode([]), null);
  assert.strictEqual(core.deriveWindowMode([{ fullscreen: true }]), 'fullscreen');
  assert.strictEqual(core.deriveWindowMode([{ fullscreen: false }]), 'window');
  assert.strictEqual(core.deriveWindowMode([{ fullscreen: true }, { fullscreen: false }]), 'mixed');
});

test('buildRun: warmupSec/windowSec/windowFrames 기록', () => {
  const run = core.buildRun({
    fixture: 'x',
    frames: 660,
    wallSeconds: 11,
    warmupSec: 1,
    windowSec: 10.004,
    windowFrames: 501,
  });
  assert.strictEqual(run.warmupSec, 1);
  assert.strictEqual(run.windowSec, 10);
  assert.strictEqual(run.windowFrames, 501);
  assert.strictEqual(core.buildRun({ fixture: 'x' }).windowSec, null);
});

test('buildResult: perf.g3와 env.windowMode 파생, 파일명 반영', () => {
  const fsRun = core.buildRun({
    fixture: 'a',
    srcW: 1920,
    srcH: 1080,
    fullscreen: true,
    frames: 1,
    wallSeconds: 1,
    dropRate: 0.02,
    jsTimes: [1],
  });
  const ac = core.buildResult({
    now: '2026-09-30T00:00:00.000Z',
    env: { power: 'ac', sdrBrightness: 'mid', windowMode: 'window' },
    perfRuns: [fsRun],
  });
  assert.strictEqual(core.SCHEMA_VERSION, 2);
  assert.strictEqual(ac.env.windowMode, 'fullscreen');
  assert.strictEqual(ac.perf.g3['1920x1080'].dropRateMax, 0.02);
  assert.strictEqual(
    core.resultFileName('2026-09-30', 'M1', ac.env),
    'result-M1-20260930-ac-mid-fullscreen.json',
  );
  const bat = core.buildResult({ env: { power: 'battery' }, perfRuns: [fsRun] });
  assert.strictEqual(bat.perf.g3, null);
  assert.strictEqual(core.buildResult({}).perf.g3, null);
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
