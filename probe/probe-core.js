'use strict';
// 0a 프로브 순수 함수. DOM/GPU/시간에 의존하지 않는다. (PLAN B절 P0-1~P0-5, E절 회신 형식)
(function () {
  // v2: run에 warmupSec/windowSec/windowFrames, perf.g3 추가, env.windowMode를 run에서 파생. v1 파일도 요약 가능.
  // v3: run에 mode/layout, env.refreshRate, edr.secondsSinceDraw, perf.g3를 해상도별 {baselineDrop,itmDrop,delta,jsP95Max}로 개정. v1/v2 파일도 유효.
  // v4: run에 driver/missRate/loopFps/videoPresentedFps, mode R0/R2/R3/V3, perf.visualJudder, perf.g3를 {baselineMiss,itmMiss,delta,rvfcMiss,loopFps,videoPresentedFps,jsP95Max,gpuMsMax}로 개정. v1~v3 파일도 유효.
  const SCHEMA_VERSION = 4;
  // FIX_GUIDE H1: requestAdapter/requestDevice 각각의 타임아웃과 사용자 안내.
  const GPU_TIMEOUT_MS = 5000;
  const GPU_HINT = 'GPU 응답 없음, Safari를 종료 후 재시작';
  // FIX_GUIDE H2: G3 진단 일괄 측정 대상 픽스처와 모드 순서.
  const MATRIX_FIXTURES = ['ramp-1080p60', 'ramp-2160p60'];
  // FIX_GUIDE J3: 일괄 측정 모드. R0 기준선(raf, 캔버스 없음) / R2 raf + EDR identity / R3 raf + EDR ITM / V3 rvfc + EDR ITM(비교용).
  const MODES = ['R0', 'R2', 'R3', 'V3'];
  // B1~B3(rvfc 구동)은 코드만 남기고 매트릭스에서 제외한다(FIX_GUIDE J3). run 기록에는 계속 유효한 값이다.
  const LEGACY_MODES = ['B0', 'B1', 'B2', 'B3'];
  const ALL_MODES = MODES.concat(LEGACY_MODES);
  const DRIVERS = ['raf', 'rvfc'];
  const EDR_CANVAS = {
    canvas: true,
    format: 'rgba16float',
    colorSpace: 'display-p3',
    toneMapping: { mode: 'extended' },
  };
  // B1은 EDR 합성 비용 분리용 진단 설정이다. GUIDELINES 2.5-3(고정 설정)의 프로브 전용 예외.
  const MODE_CONFIG = {
    B0: {
      driver: 'rvfc',
      canvas: false,
      itm: false,
      format: null,
      colorSpace: null,
      toneMapping: null,
    },
    B1: {
      driver: 'rvfc',
      canvas: true,
      itm: false,
      format: 'bgra8unorm',
      colorSpace: 'srgb',
      toneMapping: null,
    },
    B2: Object.assign({ driver: 'rvfc', itm: false }, EDR_CANVAS),
    B3: Object.assign({ driver: 'rvfc', itm: true }, EDR_CANVAS),
    R0: {
      driver: 'raf',
      canvas: false,
      itm: false,
      format: null,
      colorSpace: null,
      toneMapping: null,
    },
    R2: Object.assign({ driver: 'raf', itm: false }, EDR_CANVAS),
    R3: Object.assign({ driver: 'raf', itm: true }, EDR_CANVAS),
    V3: Object.assign({ driver: 'rvfc', itm: true }, EDR_CANVAS),
  };
  const WARMUP_SEC = 1.0;
  const WINDOW_MAX_SEC = 10;

  function round(x, digits) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
    const m = Math.pow(10, digits);
    return Math.round(x * m) / m;
  }

  // 선형 보간 백분위수(p: 0-100). 빈 배열이면 null.
  function percentile(values, p) {
    const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (a.length === 0) return null;
    a.sort((x, y) => x - y);
    if (a.length === 1) return a[0];
    const pos = (Math.min(100, Math.max(0, p)) / 100) * (a.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }

  function summarize(values) {
    const a = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (a.length === 0) return { n: 0, p50: null, p95: null, mean: null, max: null };
    let sum = 0;
    let max = -Infinity;
    for (const v of a) {
      sum += v;
      if (v > max) max = v;
    }
    return {
      n: a.length,
      p50: percentile(a, 50),
      p95: percentile(a, 95),
      mean: sum / a.length,
      max,
    };
  }

  // 미디어 시간 구간에서 기대되는 프레임 수 대비 rVFC 콜백 수로 드롭률(0-1)을 계산한다.
  function computeDropRate(o) {
    const { frames, mediaTimeSpan, fps } = o;
    if (![frames, mediaTimeSpan, fps].every((v) => typeof v === 'number' && Number.isFinite(v))) {
      return null;
    }
    if (frames <= 0 || mediaTimeSpan < 0 || fps <= 0) return null;
    const expected = Math.round(mediaTimeSpan * fps) + 1;
    const dropped = Math.max(0, expected - frames);
    return dropped / expected;
  }

  // rVFC metadata.presentedFrames 시퀀스에서 건너뛴 프레임 비율(0-1)을 계산한다.
  function dropRateFromPresented(presented) {
    const a = presented.filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (a.length < 2) return null;
    let dropped = 0;
    for (let i = 1; i < a.length; i++) dropped += Math.max(0, a[i] - a[i - 1] - 1);
    return dropped / (dropped + a.length - 1);
  }

  // 측정 창 선택 (FIX_GUIDE F2). samples: rVFC 콜백 순서대로 {t(ms), mediaTime, js, gpu?, presented?}.
  // 첫 콜백 이후 warmupSec를 버리고 그 뒤 maxSec 이내의 콜백만 남긴다.
  function selectWindow(samples, warmupSec, maxSec) {
    const s = (samples || []).filter((x) => x && typeof x.t === 'number' && Number.isFinite(x.t));
    if (s.length === 0) return [];
    const start = s[0].t + warmupSec * 1000;
    const end = start + maxSec * 1000;
    return s.filter((x) => x.t >= start && x.t <= end);
  }

  function finiteOnly(a) {
    return a.filter((v) => typeof v === 'number' && Number.isFinite(v));
  }

  // 측정 창 기준 집계. 드롭률 = (기대 - 창 콜백 수) / 기대, 기대 = 창 mediaTime 구간 x fps.
  function windowStats(samples, o) {
    const warmupSec = o && typeof o.warmupSec === 'number' ? o.warmupSec : WARMUP_SEC;
    const maxSec = o && typeof o.maxSec === 'number' ? o.maxSec : WINDOW_MAX_SEC;
    const w = selectWindow(samples, warmupSec, maxSec);
    const media = finiteOnly(w.map((x) => x.mediaTime));
    const enough = w.length >= 2 && media.length >= 2;
    const span = enough ? Math.max(...media) - Math.min(...media) : null;
    return {
      warmupSec,
      frames: w.length,
      windowSec: w.length >= 2 ? (w[w.length - 1].t - w[0].t) / 1000 : null,
      dropRate: enough
        ? computeDropRate({ frames: w.length, mediaTimeSpan: span, fps: o.fps })
        : null,
      dropRatePresented: dropRateFromPresented(w.map((x) => x.presented)),
      jsTimes: finiteOnly(w.map((x) => x.js)),
      gpuTimes: finiteOnly(w.map((x) => x.gpu)),
    };
  }

  // FIX_GUIDE J2: 갱신 누락률(0-1). 측정 창 [windowStart, windowEnd)를 소스 프레임 간격(1000/srcFps ms) 슬롯으로
  // 나누고, 렌더 시각이 하나도 없는 슬롯의 비율. 끝의 불완전한 슬롯은 버린다. 시각 단위는 ms.
  // 캔버스 없는 기준선은 renderTimes에 같은 루프의 콜백 시각을 넣는다. 입력이 잘못됐거나 슬롯이 없으면 null.
  function missRate(renderTimes, windowStart, windowEnd, srcFps) {
    if (!Array.isArray(renderTimes)) return null;
    if (
      ![windowStart, windowEnd, srcFps].every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      return null;
    }
    if (srcFps <= 0 || windowEnd <= windowStart) return null;
    const slot = 1000 / srcFps;
    // 슬롯 경계에 정확히 놓인 시각이 부동소수 오차로 이웃 슬롯에 들어가지 않게 작은 여유를 준다.
    const EPS = 1e-9;
    const n = Math.floor((windowEnd - windowStart) / slot + EPS);
    if (n < 1) return null;
    const hit = new Uint8Array(n);
    for (const t of renderTimes) {
      if (typeof t !== 'number' || !Number.isFinite(t)) continue;
      const idx = Math.floor((t - windowStart) / slot + EPS);
      if (idx >= 0 && idx < n) hit[idx] = 1;
    }
    let miss = 0;
    for (let i = 0; i < n; i++) if (!hit[i]) miss++;
    return miss / n;
  }

  // FIX_GUIDE J1/J2: 구동 루프 샘플과 관측 rVFC 샘플에서 run 집계를 만든다.
  // loop: 구동 콜백마다 {t(ms), js, gpu?}. 캔버스 없는 R0도 콜백 시각을 넣는다.
  // obs: 관측 전용 rVFC마다 {t(ms), mediaTime, presented}. 창 기준은 구동 루프의 첫 콜백 + warmupSec.
  function runStats(loop, obs, o) {
    const warmupSec = o && typeof o.warmupSec === 'number' ? o.warmupSec : WARMUP_SEC;
    const maxSec = o && typeof o.maxSec === 'number' ? o.maxSec : WINDOW_MAX_SEC;
    const fps = o ? o.fps : null;
    const isT = (x) => x && typeof x.t === 'number' && Number.isFinite(x.t);
    const L = (loop || []).filter(isT);
    const empty = {
      warmupSec,
      frames: 0,
      windowSec: null,
      dropRate: null,
      dropRatePresented: null,
      missRate: null,
      loopFps: null,
      videoPresentedFps: null,
      jsTimes: [],
      gpuTimes: [],
    };
    if (L.length === 0) return empty;
    const start = L[0].t + warmupSec * 1000;
    const end = start + maxSec * 1000;
    const inWin = (x) => x.t >= start && x.t <= end;
    const w = L.filter(inWin);
    const ob = (obs || []).filter(isT).filter(inWin);
    const media = finiteOnly(ob.map((x) => x.mediaTime));
    const span = media.length >= 2 ? Math.max(...media) - Math.min(...media) : null;
    const presented = ob.filter(
      (x) => typeof x.presented === 'number' && Number.isFinite(x.presented),
    );
    const loopSpanSec = w.length >= 2 ? (w[w.length - 1].t - w[0].t) / 1000 : null;
    let presentedFps = null;
    if (presented.length >= 2) {
      const first = presented[0];
      const last = presented[presented.length - 1];
      const sec = (last.t - first.t) / 1000;
      if (sec > 0) presentedFps = (last.presented - first.presented) / sec;
    }
    return {
      warmupSec,
      frames: w.length,
      windowSec: loopSpanSec,
      dropRate:
        ob.length >= 2 && span !== null
          ? computeDropRate({ frames: ob.length, mediaTimeSpan: span, fps })
          : null,
      dropRatePresented: dropRateFromPresented(ob.map((x) => x.presented)),
      missRate:
        w.length > 0
          ? missRate(
              w.map((x) => x.t),
              start,
              Math.min(end, w[w.length - 1].t),
              fps,
            )
          : null,
      loopFps: loopSpanSec > 0 ? (w.length - 1) / loopSpanSec : null,
      videoPresentedFps: presentedFps,
      jsTimes: finiteOnly(w.map((x) => x.js)),
      gpuTimes: finiteOnly(w.map((x) => x.gpu)),
    };
  }

  // Promise에 타임아웃을 건다. 시간 초과 시 name='TimeoutError', isTimeout=true인 Error로 reject한다.
  // timers는 테스트용 주입(기본 globalThis.setTimeout/clearTimeout).
  function withTimeout(promise, ms, label, timers) {
    const st = (timers && timers.setTimeout) || globalThis.setTimeout;
    const ct = (timers && timers.clearTimeout) || globalThis.clearTimeout;
    return new Promise((resolve, reject) => {
      const id = st(() => {
        const e = new Error((label || 'operation') + ' ' + ms + 'ms 초과');
        e.name = 'TimeoutError';
        e.isTimeout = true;
        reject(e);
      }, ms);
      Promise.resolve(promise).then(
        (v) => {
          ct(id);
          resolve(v);
        },
        (e) => {
          ct(id);
          reject(e);
        },
      );
    });
  }

  function isTimeoutError(e) {
    return !!e && (e.isTimeout === true || e.name === 'TimeoutError');
  }

  // GPU 없이 export할 때 쓰는 최소 api 객체 (스키마 필수 키 유지). H1-3.
  function buildFallbackApi(message, flags) {
    const f = flags || {};
    return {
      secureContext: !!f.secureContext,
      navigatorGpu: !!f.navigatorGpu,
      adapter: null,
      timestampQuery: false,
      preferredFormat: null,
      configure: { ok: false, error: message || null },
      getConfiguration: {
        supported: false,
        format: null,
        colorSpace: null,
        toneMappingMode: null,
        error: null,
      },
      mediaQueries: { dynamicRangeHigh: false, colorGamutP3: false },
    };
  }

  function modeConfig(mode) {
    const c = MODE_CONFIG[mode];
    return c ? JSON.parse(JSON.stringify(c)) : null;
  }

  // 일괄 측정 순서: 픽스처별로 R0->R2->R3->V3.
  function matrixPlan(fixtures) {
    const out = [];
    for (const fixture of fixtures || MATRIX_FIXTURES) {
      for (const mode of MODES) out.push({ fixture, mode });
    }
    return out;
  }

  function progressText(index, total, step) {
    return (
      'G3 진단 ' + index + ' / ' + total + (step ? ' (' + step.fixture + ' ' + step.mode + ')' : '')
    );
  }

  // H4: 마지막 그리기 후 경과 초(정수). 그린 적 없으면 null.
  function secondsSinceDraw(drawMs, nowMs) {
    if (typeof drawMs !== 'number' || typeof nowMs !== 'number') return null;
    if (!Number.isFinite(drawMs) || !Number.isFinite(nowMs)) return null;
    return Math.max(0, Math.floor((nowMs - drawMs) / 1000));
  }

  // G3 대상 run = 전원 연결 + 전체화면 (FIX_GUIDE F3/F4).
  function isG3Run(run, power) {
    return power === 'ac' && !!run && run.fullscreen === true;
  }

  function hasG3Run(runs, power) {
    return (runs || []).some((r) => isG3Run(r, power));
  }

  function maxOrNull(values) {
    const a = finiteOnly(values);
    return a.length > 0 ? Math.max(...a) : null;
  }

  // v3 G3 대상 = 전원 연결 + 전체화면 + overlay 배치 run (FIX_GUIDE H3).
  function isG3OverlayRun(run, power) {
    return isG3Run(run, power) && run.layout === 'overlay';
  }

  function hasG3OverlayRun(runs, power) {
    return (runs || []).some((r) => isG3OverlayRun(r, power));
  }

  // 해상도별 {baselineMiss(R0), itmMiss(R3), delta(R3-R0), rvfcMiss(V3), loopFps(R3), videoPresentedFps(R3), jsP95Max, gpuMsMax}.
  // 같은 모드가 여러 번이면 마지막 run. R0 또는 R3가 없으면 해당 해상도는 null, 대상 run이 없으면 전체 null. 판정은 하지 않는다.
  function g3Summary(runs, power) {
    const targets = (runs || []).filter((r) => isG3OverlayRun(r, power));
    if (targets.length === 0) return null;
    const groups = {};
    for (const r of targets) {
      const key = r.srcRes || 'unknown';
      (groups[key] = groups[key] || []).push(r);
    }
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const res = {};
    for (const key of Object.keys(groups).sort()) {
      const byMode = {};
      for (const r of groups[key]) byMode[r.mode] = r;
      const r0 = byMode.R0;
      const r3 = byMode.R3;
      if (!r0 || !r3) {
        res[key] = null;
        continue;
      }
      const base = num(r0.missRate);
      const itm = num(r3.missRate);
      res[key] = {
        baselineMiss: base,
        itmMiss: itm,
        delta: base !== null && itm !== null ? round(itm - base, 5) : null,
        rvfcMiss: byMode.V3 ? num(byMode.V3.missRate) : null,
        loopFps: num(r3.loopFps),
        videoPresentedFps: num(r3.videoPresentedFps),
        jsP95Max: maxOrNull(groups[key].map((r) => r.jsP95)),
        gpuMsMax: maxOrNull(groups[key].map((r) => r.gpuMs)),
      };
    }
    return res;
  }

  // 끊김 질문 답(FIX_GUIDE J3). 허용값 외에는 null.
  const JUDDER_VALUES = ['none', 'sometimes', 'often'];
  function normalizeJudder(v) {
    return JUDDER_VALUES.includes(v) ? v : null;
  }

  // env.windowMode는 사용자 선택이 아니라 run의 실제 전체화면 상태에서 파생한다 (FIX_GUIDE F3).
  function deriveWindowMode(runs) {
    const a = runs || [];
    if (a.length === 0) return null;
    const fs = a.filter((r) => r.fullscreen === true).length;
    if (fs === a.length) return 'fullscreen';
    return fs === 0 ? 'window' : 'mixed';
  }

  // 캔버스 해상도 = min(원본, 표시 크기 x DPR), 종횡비 유지 (PLAN C절 content script 역할).
  function canvasResolution(srcW, srcH, cssW, cssH, dpr) {
    if (![srcW, srcH, cssW, cssH, dpr].every((v) => typeof v === 'number' && v > 0)) return null;
    const scale = Math.min(1, (cssW * dpr) / srcW, (cssH * dpr) / srcH);
    return {
      width: Math.max(1, Math.round(srcW * scale)),
      height: Math.max(1, Math.round(srcH * scale)),
    };
  }

  function parseSafariVersion(ua) {
    const m = /Version\/([\d.]+).*Safari\//.exec(ua || '');
    return m ? m[1] : null;
  }

  function resStr(w, h) {
    return typeof w === 'number' && typeof h === 'number' ? w + 'x' + h : null;
  }

  // 측정 1회분(run) 기록을 만든다. jsTimes는 ms 배열, gpuTimes는 ms 배열(없으면 빈 배열).
  function buildRun(o) {
    const js = summarize(o.jsTimes || []);
    const gpu = summarize(o.gpuTimes || []);
    const frames = o.frames || 0;
    const wall = o.wallSeconds;
    return {
      fixture: o.fixture,
      mode: ALL_MODES.includes(o.mode) ? o.mode : 'split',
      driver: DRIVERS.includes(o.driver) ? o.driver : 'rvfc',
      layout: o.layout === 'overlay' ? 'overlay' : 'split',
      itm: !!o.itm,
      srcRes: resStr(o.srcW, o.srcH),
      canvasRes: resStr(o.canvasW, o.canvasH),
      fullscreen: !!o.fullscreen,
      frames,
      durationSec: round(wall, 2),
      warmupSec: round(o.warmupSec, 2),
      windowSec: round(o.windowSec, 2),
      windowFrames: typeof o.windowFrames === 'number' ? o.windowFrames : null,
      fps: wall > 0 ? round(frames / wall, 2) : null,
      dropRate: round(o.dropRate, 5),
      dropRatePresented: round(o.dropRatePresented, 5),
      missRate: round(o.missRate, 5),
      loopFps: round(o.loopFps, 2),
      videoPresentedFps: round(o.videoPresentedFps, 2),
      jsP50: round(js.p50, 3),
      jsP95: round(js.p95, 3),
      jsMax: round(js.max, 3),
      gpuMs: gpu.n > 0 ? round(gpu.p50, 3) : null,
      gpuSamples: gpu.n,
      videoQuality: o.videoQuality || null,
    };
  }

  // E절 회신 형식: env, api, edr, perf, flags, errors.
  function buildResult(i) {
    const runs = i.perfRuns || [];
    const last = runs.length > 0 ? runs[runs.length - 1] : null;
    const env = i.env || {};
    const edr = i.edr || {};
    const perf = {
      srcRes: last ? last.srcRes : null,
      canvasRes: last ? last.canvasRes : null,
      fps: last ? last.fps : null,
      dropRate: last ? last.dropRate : null,
      jsP50: last ? last.jsP50 : null,
      jsP95: last ? last.jsP95 : null,
      g3: g3Summary(runs, env.power),
      visualJudder: normalizeJudder(i.visualJudder),
      runs,
    };
    if (last && last.gpuMs !== null && last.gpuMs !== undefined) perf.gpuMs = last.gpuMs;
    const flags = i.flags || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      milestone: i.milestone || 'M1',
      createdAt: i.now || null,
      env: {
        macOS: env.macOS || null,
        safari: env.safari || null,
        chip: env.chip || null,
        display: env.display || null,
        power: env.power || null,
        sdrBrightness: env.sdrBrightness || null,
        refreshRate: env.refreshRate || null,
        windowMode: deriveWindowMode(runs),
        ua: env.ua || null,
        screen: env.screen || null,
      },
      api: i.api || null,
      edr: {
        maxDistinctStep: typeof edr.maxDistinctStep === 'number' ? edr.maxDistinctStep : null,
        encodingMatch: edr.encodingMatch || null,
        refHdrImage: edr.refHdrImage || null,
        secondsSinceDraw:
          typeof edr.secondsSinceDraw === 'number' && Number.isFinite(edr.secondsSinceDraw)
            ? edr.secondsSinceDraw
            : null,
      },
      perf,
      flags: {
        drm: !!flags.drm,
        hdrSource: !!flags.hdrSource,
        fullscreen: !!flags.fullscreen,
      },
      errors: (i.errors || []).slice(),
    };
  }

  function resultFileName(dateStr, milestone, env) {
    const parts = ['result', milestone || 'M1', String(dateStr || '').replace(/-/g, '')];
    const e = env || {};
    for (const v of [e.power, e.sdrBrightness, e.windowMode]) if (v) parts.push(v);
    return parts.join('-') + '.json';
  }

  globalThis.__probeCore = {
    SCHEMA_VERSION,
    percentile,
    summarize,
    WARMUP_SEC,
    WINDOW_MAX_SEC,
    computeDropRate,
    selectWindow,
    windowStats,
    missRate,
    runStats,
    normalizeJudder,
    JUDDER_VALUES,
    isG3Run,
    hasG3Run,
    isG3OverlayRun,
    hasG3OverlayRun,
    g3Summary,
    GPU_TIMEOUT_MS,
    GPU_HINT,
    MATRIX_FIXTURES,
    MODES,
    LEGACY_MODES,
    ALL_MODES,
    DRIVERS,
    MODE_CONFIG,
    withTimeout,
    isTimeoutError,
    buildFallbackApi,
    modeConfig,
    matrixPlan,
    progressText,
    secondsSinceDraw,
    deriveWindowMode,
    dropRateFromPresented,
    canvasResolution,
    parseSafariVersion,
    buildRun,
    buildResult,
    resultFileName,
  };
})();
