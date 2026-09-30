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

const J = (x) => JSON.parse(JSON.stringify(x));
const ov = (srcRes, mode, missRate, jsP95, extra) =>
  Object.assign(
    { srcRes, mode, layout: 'overlay', fullscreen: true, missRate, jsP95 },
    extra || {},
  );

test('g3Summary: 해상도별 R0/R3 기준선 대비, overlay 전체화면 전원 연결 run만', () => {
  const runs = [
    ov('1920x1080', 'R0', 0.02, 0.1, { gpuMs: null }),
    ov('1920x1080', 'R2', 0.05, 0.5, { gpuMs: 0.8 }),
    ov('1920x1080', 'R3', 0.025, 1.5, { loopFps: 60.1, videoPresentedFps: 59.8, gpuMs: 1.2 }),
    ov('1920x1080', 'V3', 0.48, 0.9, { gpuMs: 1.0 }),
    // 대상 아님: 창, split 배치
    ov('1920x1080', 'R3', 0.9, 9, { fullscreen: false }),
    ov('1920x1080', 'R3', 0.9, 9, { layout: 'split' }),
    ov('3840x2160', 'R0', 0.1, 0.2),
    ov('3840x2160', 'R2', 0.2, 1),
  ];
  assert.deepStrictEqual(J(core.g3Summary(runs, 'ac')), {
    '1920x1080': {
      baselineMiss: 0.02,
      itmMiss: 0.025,
      delta: 0.005,
      rvfcMiss: 0.48,
      loopFps: 60.1,
      videoPresentedFps: 59.8,
      jsP95Max: 1.5,
      gpuMsMax: 1.2,
    },
    '3840x2160': null,
  });
  assert.strictEqual(core.g3Summary(runs, 'battery'), null);
  assert.strictEqual(core.g3Summary([], 'ac'), null);
  // v1/v2 형태(layout 없음)는 대상이 아니다
  assert.strictEqual(core.g3Summary([{ srcRes: 'a', fullscreen: true, missRate: 0 }], 'ac'), null);
});

test('g3Summary: 같은 모드 재실행은 마지막 run, missRate null이면 delta null, V3 없으면 rvfcMiss null', () => {
  const runs = [
    ov('1920x1080', 'R0', 0.5, 1),
    ov('1920x1080', 'R0', 0.01, 0.2),
    ov('1920x1080', 'R3', null, 0.3),
  ];
  assert.deepStrictEqual(J(core.g3Summary(runs, 'ac')), {
    '1920x1080': {
      baselineMiss: 0.01,
      itmMiss: null,
      delta: null,
      rvfcMiss: null,
      loopFps: null,
      videoPresentedFps: null,
      jsP95Max: 1,
      gpuMsMax: null,
    },
  });
  assert.strictEqual(core.hasG3OverlayRun(runs, 'ac'), true);
  assert.strictEqual(core.hasG3OverlayRun([{ fullscreen: true }], 'ac'), false);
  // v3 모드(B0/B3)만 있으면 v4 요약은 해당 해상도 null
  assert.deepStrictEqual(J(core.g3Summary([ov('a', 'B0', 0), ov('a', 'B3', 0)], 'ac')), {
    a: null,
  });
});

test('withTimeout: 통과, 원래 reject 전달, 시간 초과는 TimeoutError', async () => {
  const timers = { setTimeout, clearTimeout };
  assert.strictEqual(await core.withTimeout(Promise.resolve(7), 1000, 'x', timers), 7);
  await assert.rejects(
    core.withTimeout(Promise.reject(new Error('boom')), 1000, 'x', timers),
    (e) => e.message === 'boom' && !core.isTimeoutError(e),
  );
  await assert.rejects(
    core.withTimeout(new Promise(() => {}), 20, 'requestAdapter', timers),
    (e) =>
      e.name === 'TimeoutError' &&
      core.isTimeoutError(e) &&
      e.message.includes('requestAdapter') &&
      e.message.includes('20ms'),
  );
  assert.strictEqual(core.GPU_TIMEOUT_MS, 5000);
  assert.ok(core.GPU_HINT.includes('Safari를 종료 후 재시작'));
});

test('withTimeout: 완료되면 타이머를 해제한다', async () => {
  const cleared = [];
  const timers = {
    setTimeout: () => 42,
    clearTimeout: (id) => cleared.push(id),
  };
  await core.withTimeout(Promise.resolve(1), 1000, 'x', timers);
  assert.deepStrictEqual(cleared, [42]);
});

test('matrixPlan: 픽스처별 R0->R2->R3->V3, 총 8 run (B1 제외)', () => {
  const plan = J(core.matrixPlan());
  assert.strictEqual(plan.length, 8);
  assert.deepStrictEqual(
    plan.map((p) => p.fixture + ':' + p.mode),
    [
      'ramp-1080p60:R0',
      'ramp-1080p60:R2',
      'ramp-1080p60:R3',
      'ramp-1080p60:V3',
      'ramp-2160p60:R0',
      'ramp-2160p60:R2',
      'ramp-2160p60:R3',
      'ramp-2160p60:V3',
    ],
  );
  assert.deepStrictEqual(J(core.MODES), ['R0', 'R2', 'R3', 'V3']);
  assert.ok(!plan.some((p) => p.mode === 'B1'));
  assert.strictEqual(core.progressText(3, 8, plan[2]), 'G3 진단 3 / 8 (ramp-1080p60 R3)');
});

test('modeConfig: R0 캔버스 없음(raf), R2/R3 raf + EDR, V3 rvfc + EDR ITM, B1 코드는 유지', () => {
  assert.strictEqual(core.modeConfig('R0').canvas, false);
  assert.strictEqual(core.modeConfig('B0').canvas, false);
  const b1 = core.modeConfig('B1');
  assert.strictEqual(b1.format, 'bgra8unorm');
  assert.strictEqual(b1.colorSpace, 'srgb');
  assert.strictEqual(b1.toneMapping, null);
  for (const m of ['R2', 'R3', 'V3', 'B2', 'B3']) {
    const c = core.modeConfig(m);
    assert.strictEqual(c.format, 'rgba16float');
    assert.strictEqual(c.colorSpace, 'display-p3');
    assert.strictEqual(c.toneMapping.mode, 'extended');
  }
  assert.deepStrictEqual(J(core.MODES.map((m) => core.modeConfig(m).itm)), [
    false,
    false,
    true,
    true,
  ]);
  assert.deepStrictEqual(J(core.MODES.map((m) => core.modeConfig(m).driver)), [
    'raf',
    'raf',
    'raf',
    'rvfc',
  ]);
  assert.deepStrictEqual(J(core.LEGACY_MODES.map((m) => core.modeConfig(m).itm)), [
    false,
    false,
    false,
    true,
  ]);
  assert.strictEqual(core.modeConfig('split'), null);
  // 사본이므로 변경이 원본에 영향 없음
  core.modeConfig('R2').format = 'x';
  core.modeConfig('R2').toneMapping.mode = 'x';
  assert.strictEqual(core.modeConfig('R2').format, 'rgba16float');
  assert.strictEqual(core.modeConfig('R2').toneMapping.mode, 'extended');
});

test('secondsSinceDraw: 정수 초, 음수 방지, 미기록은 null', () => {
  assert.strictEqual(core.secondsSinceDraw(1000, 31999), 30);
  assert.strictEqual(core.secondsSinceDraw(1000, 1000), 0);
  assert.strictEqual(core.secondsSinceDraw(2000, 1000), 0);
  assert.strictEqual(core.secondsSinceDraw(null, 1000), null);
  assert.strictEqual(core.secondsSinceDraw(1000, NaN), null);
});

test('buildFallbackApi: GPU 없이도 스키마 필수 키 유지, 오류를 configure.error에 담음', () => {
  const a = core.buildFallbackApi('requestAdapter 5000ms 초과', { navigatorGpu: true });
  assert.strictEqual(a.configure.ok, false);
  assert.strictEqual(a.configure.error, 'requestAdapter 5000ms 초과');
  assert.strictEqual(a.navigatorGpu, true);
  assert.strictEqual(a.getConfiguration.supported, false);
  assert.strictEqual(a.mediaQueries.colorGamutP3, false);
});

test('buildRun: mode/layout 기본은 split, 지정값 기록', () => {
  const d = core.buildRun({ fixture: 'x' });
  assert.strictEqual(d.mode, 'split');
  assert.strictEqual(d.layout, 'split');
  const r = core.buildRun({ fixture: 'x', mode: 'B3', layout: 'overlay' });
  assert.strictEqual(r.mode, 'B3');
  assert.strictEqual(r.layout, 'overlay');
  assert.strictEqual(core.buildRun({ fixture: 'x', mode: 'zzz', layout: 'q' }).mode, 'split');
  for (const m of ['R0', 'R2', 'R3', 'V3', 'B1']) {
    assert.strictEqual(core.buildRun({ fixture: 'x', mode: m }).mode, m);
  }
});

test('buildRun: driver 기본 rvfc, missRate/loopFps/videoPresentedFps 기록', () => {
  const d = core.buildRun({ fixture: 'x' });
  assert.strictEqual(d.driver, 'rvfc');
  assert.strictEqual(d.missRate, null);
  assert.strictEqual(d.loopFps, null);
  assert.strictEqual(d.videoPresentedFps, null);
  const r = core.buildRun({
    fixture: 'x',
    driver: 'raf',
    missRate: 0.123456,
    loopFps: 59.987,
    videoPresentedFps: 55.5555,
  });
  assert.strictEqual(r.driver, 'raf');
  assert.strictEqual(r.missRate, 0.12346);
  assert.strictEqual(r.loopFps, 59.99);
  assert.strictEqual(r.videoPresentedFps, 55.56);
  assert.strictEqual(core.buildRun({ fixture: 'x', driver: 'zz' }).driver, 'rvfc');
  // 기존 필드 유지
  assert.ok('dropRate' in r && 'dropRatePresented' in r);
});

test('buildResult: env.refreshRate, edr.secondsSinceDraw 기록(없으면 null)', () => {
  const r = core.buildResult({
    env: { refreshRate: 'promotion' },
    edr: { maxDistinctStep: 3, secondsSinceDraw: 41 },
  });
  assert.strictEqual(r.env.refreshRate, 'promotion');
  assert.strictEqual(r.edr.secondsSinceDraw, 41);
  const e = core.buildResult({});
  assert.strictEqual(e.env.refreshRate, null);
  assert.strictEqual(e.edr.secondsSinceDraw, null);
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
  const mk = (mode, driver, missRate, js) =>
    core.buildRun({
      fixture: 'a',
      mode,
      driver,
      layout: 'overlay',
      srcW: 1920,
      srcH: 1080,
      fullscreen: true,
      missRate,
      loopFps: 60,
      videoPresentedFps: 58,
      jsTimes: [js],
      gpuTimes: [js / 2],
    });
  const r0 = mk('R0', 'raf', 0.02, 1);
  const r3 = mk('R3', 'raf', 0.03, 2);
  const v3 = mk('V3', 'rvfc', 0.5, 2);
  const ac = core.buildResult({
    now: '2026-09-30T00:00:00.000Z',
    env: { power: 'ac', sdrBrightness: 'mid', windowMode: 'window' },
    perfRuns: [fsRun, r0, r3, v3],
    visualJudder: 'sometimes',
  });
  assert.strictEqual(core.SCHEMA_VERSION, 4);
  assert.strictEqual(ac.schemaVersion, 4);
  assert.strictEqual(ac.env.windowMode, 'fullscreen');
  assert.strictEqual(ac.perf.visualJudder, 'sometimes');
  assert.deepStrictEqual(J(ac.perf.g3), {
    '1920x1080': {
      baselineMiss: 0.02,
      itmMiss: 0.03,
      delta: 0.01,
      rvfcMiss: 0.5,
      loopFps: 60,
      videoPresentedFps: 58,
      jsP95Max: 2,
      gpuMsMax: 1,
    },
  });
  assert.strictEqual(
    core.resultFileName('2026-09-30', 'M1', ac.env),
    'result-M1-20260930-ac-mid-fullscreen.json',
  );
  // split run만 있으면 G3 대상이 없다
  assert.strictEqual(core.buildResult({ env: { power: 'ac' }, perfRuns: [fsRun] }).perf.g3, null);
  const bat = core.buildResult({ env: { power: 'battery' }, perfRuns: [fsRun, r0, r3] });
  assert.strictEqual(bat.perf.g3, null);
  assert.strictEqual(core.buildResult({}).perf.g3, null);
  // 끊김 질문 미응답/잘못된 값은 null
  assert.strictEqual(core.buildResult({}).perf.visualJudder, null);
  assert.strictEqual(core.buildResult({ visualJudder: 'x' }).perf.visualJudder, null);
  assert.strictEqual(core.normalizeJudder(''), null);
  assert.deepStrictEqual(J(core.JUDDER_VALUES), ['none', 'sometimes', 'often']);
});

// ---------- J2: missRate ----------
const times = (n, stepMs, offsetMs) => Array.from({ length: n }, (_, i) => offsetMs + i * stepMs);

test('missRate: 규칙적 60Hz 렌더는 60fps 소스에서 0', () => {
  near(core.missRate(times(600, 1000 / 60, 0), 0, 10000, 60), 0);
  // 슬롯 중앙에 놓여도 0
  near(core.missRate(times(600, 1000 / 60, 1000 / 120), 0, 10000, 60), 0);
});

test('missRate: 30Hz 렌더는 60fps 소스에서 0.5', () => {
  near(core.missRate(times(300, 1000 / 30, 0), 0, 10000, 60), 0.5);
});

test('missRate: 120Hz 렌더는 0 (한 슬롯에 2회 렌더돼도 누락 아님)', () => {
  near(core.missRate(times(1200, 1000 / 120, 0), 0, 10000, 60), 0);
});

test('missRate: 3프레임 공백 1회 -> 3/60', () => {
  const t = times(60, 1000 / 60, 1000 / 120).filter((_, i) => i < 10 || i > 12);
  assert.strictEqual(t.length, 57);
  near(core.missRate(t, 0, 1000, 60), 3 / 60);
});

test('missRate: 창 시작이 0이 아니어도 동일, 창 밖 시각은 무시, 끝의 불완전 슬롯은 버림', () => {
  const t = times(60, 1000 / 60, 5000 + 1000 / 120).concat([100, 99999]);
  near(core.missRate(t, 5000, 6000, 60), 0);
  // 창 1000.5ms = 슬롯 60개 + 불완전 0.5ms
  near(core.missRate(t, 5000, 6000.5, 60), 0);
});

test('missRate: 렌더 시각이 없으면 1, 잘못된 입력/슬롯 없음은 null', () => {
  near(core.missRate([], 0, 1000, 60), 1);
  assert.strictEqual(core.missRate(null, 0, 1000, 60), null);
  assert.strictEqual(core.missRate([1], 0, 1000, 0), null);
  assert.strictEqual(core.missRate([1], 1000, 1000, 60), null);
  assert.strictEqual(core.missRate([1], 0, 10, 60), null);
  assert.strictEqual(core.missRate([1], NaN, 1000, 60), null);
});

test('runStats: 구동 60Hz raf + 관측 rVFC 30회/s (Safari A20 형태)', () => {
  const loop = Array.from({ length: 840 }, (_, i) => ({
    t: 1000 + i * (1000 / 60),
    js: 1,
    gpu: i === 300 ? 0.5 : null,
  }));
  const obs = Array.from({ length: 420 }, (_, j) => ({
    t: 1000 + j * (1000 / 30),
    mediaTime: j / 30,
    presented: 2 * j,
  }));
  const st = core.runStats(loop, obs, { fps: 60 });
  assert.strictEqual(st.warmupSec, 1);
  assert.ok(Math.abs(st.loopFps - 60) < 0.2, String(st.loopFps));
  assert.ok(Math.abs(st.videoPresentedFps - 60) < 0.5, String(st.videoPresentedFps));
  assert.ok(st.missRate < 0.01, String(st.missRate));
  // 관측 rVFC 콜백은 표시 프레임의 절반 -> 기존 지표는 약 0.5로 유지 계산
  assert.ok(Math.abs(st.dropRate - 0.5) < 0.01, String(st.dropRate));
  near(st.dropRatePresented, 0.5, 0.01);
  assert.ok(st.windowSec > 9.9 && st.windowSec <= 10.01);
  assert.deepStrictEqual(Array.from(st.gpuTimes), [0.5]);
  assert.ok(st.jsTimes.every((v) => v === 1));
});

test('runStats: 30Hz 구동 루프는 missRate 0.5, 캔버스 없어도 콜백 시각으로 계산', () => {
  const loop = Array.from({ length: 420 }, (_, i) => ({ t: 500 + i * (1000 / 30), js: 0.1 }));
  const st = core.runStats(loop, [], { fps: 60 });
  assert.ok(Math.abs(st.missRate - 0.5) < 0.01, String(st.missRate));
  assert.ok(Math.abs(st.loopFps - 30) < 0.1);
  assert.strictEqual(st.videoPresentedFps, null);
  assert.strictEqual(st.dropRate, null);
});

test('runStats: 빈 입력은 null 집계', () => {
  const st = core.runStats([], [], { fps: 60 });
  assert.strictEqual(st.frames, 0);
  assert.strictEqual(st.missRate, null);
  assert.strictEqual(st.loopFps, null);
  assert.deepStrictEqual(Array.from(st.jsTimes), []);
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
