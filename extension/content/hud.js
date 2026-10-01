'use strict';
(function () {
  const MAX_ERRORS = 20;
  // 연속 콜백 간격이 이 값을 넘으면 일시정지·비가시 등 측정 창의 끊김으로 본다 (FIX_GUIDE Q2).
  const LOOP_BREAK_MS = 500;

  // 선형 보간 백분위. 비수치 제외, 빈 입력은 null.
  function percentile(values, p) {
    const a = values
      .filter((v) => typeof v === 'number' && Number.isFinite(v))
      .sort((x, y) => x - y);
    if (a.length === 0) return null;
    if (a.length === 1) return a[0];
    const pos = (Math.min(100, Math.max(0, p)) / 100) * (a.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return a[lo] + (a[hi] - a[lo]) * (pos - lo);
  }

  // 순수: 프레임당 JS 시간(ms)과 rAF 콜백 타임스탬프(ms) 요약.
  function summarize(frameTimesMs, loopTimestamps) {
    const times = Array.isArray(frameTimesMs) ? frameTimesMs : [];
    const ts = Array.isArray(loopTimestamps) ? loopTimestamps : [];
    let loopFps = null;
    // 끊김(>500 ms) 간격은 개수와 시간 모두에서 뺀다.
    let spanMs = 0;
    let gapCount = 0;
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      if (gap > LOOP_BREAK_MS) continue;
      spanMs += gap;
      gapCount += 1;
    }
    if (gapCount > 0 && spanMs > 0) loopFps = (gapCount * 1000) / spanMs;
    return {
      frames: times.length,
      loopFps,
      jsP50: percentile(times, 50),
      jsP95: percentile(times, 95),
    };
  }

  // 순수: 렌더 루프 콜백 간격의 중앙값으로 디스플레이 주사율을 60 또는 120으로 추정 (FIX_GUIDE P3/K1).
  function estimateDisplayHz(loopTimes) {
    const ts = (Array.isArray(loopTimes) ? loopTimes : []).filter(
      (v) => typeof v === 'number' && Number.isFinite(v),
    );
    const gaps = [];
    for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) gaps.push(ts[i] - ts[i - 1]);
    const med = percentile(gaps, 50);
    if (med === null || med <= 0) return null;
    const hz = 1000 / med;
    return Math.abs(hz - 60) <= Math.abs(hz - 120) ? 60 : 120;
  }

  // 순수: 측정 창(ms)에서 콜백 간격이 1.5/displayHz를 넘으면 round(간격 x hz) - 1개 갱신을 놓친 것으로 센다.
  // 결과 = 놓친 갱신 수 / (창 초 x displayHz). 계산 불가면 null (FIX_GUIDE P3/K1 정의).
  // 간격이 500 ms를 넘으면 끊김으로 보고 누락 수와 창 길이 모두에서 제외한다 (FIX_GUIDE Q2).
  function displayMissRate(loopTimes, windowStart, windowEnd, displayHz) {
    if (!Array.isArray(loopTimes)) return null;
    if (!(displayHz > 0) || !(windowEnd > windowStart)) return null;
    const ts = loopTimes.filter(
      (v) => typeof v === 'number' && Number.isFinite(v) && v >= windowStart && v <= windowEnd,
    );
    if (ts.length < 2) return null;
    const limitMs = 1500 / displayHz;
    let missed = 0;
    let excludedMs = 0;
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      if (gap > LOOP_BREAK_MS) {
        excludedMs += gap;
        continue;
      }
      if (gap > limitMs) missed += Math.max(0, Math.round((gap * displayHz) / 1000) - 1);
    }
    const measuredMs = windowEnd - windowStart - excludedMs;
    if (!(measuredMs > 0)) return null;
    return missed / ((measuredMs / 1000) * displayHz);
  }

  const NOMINAL_FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  const HOLD_KEYS = ['1', '2', '3', '4', '5+'];

  // 순수: 소스 프레임 시각(초)과 rAF 콜백 시각(ms)으로 샘플링 cadence를 요약한다 (FIX_GUIDE S2).
  // 두 배열은 같은 인덱스로 정렬된 렌더 1회분이다. 짝이 유효하지 않은 항목은 버린다.
  // 콜백 간격이 500 ms를 넘는 곳에서 구간을 나누고, 구간의 처음·마지막 유지 구간(경계에서 잘렸을 수 있음)은 holdHist에서 뺀다.
  // 이상 유지 길이 집합: displayHz/srcFps가 정수에 0.01 이내면 그 정수, 아니면 {floor, ceil}.
  function cadenceStats(srcTimes, loopTimes, displayHz) {
    const empty = {
      srcFps: null,
      srcFpsNominal: null,
      holdHist: null,
      irregular: null,
      skipped: null,
    };
    const src = Array.isArray(srcTimes) ? srcTimes : [];
    const loop = Array.isArray(loopTimes) ? loopTimes : [];
    const n = Math.min(src.length, loop.length);
    const ok = (v) => typeof v === 'number' && Number.isFinite(v);
    const segments = [];
    let seg = null;
    let prevLoop = null;
    for (let i = 0; i < n; i++) {
      if (!ok(src[i]) || !ok(loop[i])) continue;
      if (seg === null || (prevLoop !== null && loop[i] - prevLoop > LOOP_BREAK_MS)) {
        seg = [];
        segments.push(seg);
      }
      seg.push(src[i]);
      prevLoop = loop[i];
    }
    if (segments.length === 0) return empty;

    // 구간별 유지 길이(같은 소스 시각을 연속으로 그린 횟수)와 서로 다른 소스 시각 간격.
    const holdRuns = [];
    const diffs = [];
    for (const times of segments) {
      const runs = [];
      let count = 0;
      for (let i = 0; i < times.length; i++) {
        if (i > 0 && times[i] === times[i - 1]) {
          count += 1;
          continue;
        }
        if (i > 0) {
          runs.push(count);
          const d = times[i] - times[i - 1];
          if (d > 0 && d <= LOOP_BREAK_MS / 1000) diffs.push(d);
        }
        count = 1;
      }
      runs.push(count);
      if (runs.length > 2) holdRuns.push(...runs.slice(1, -1));
    }
    const med = percentile(diffs, 50);
    if (med === null) return empty;
    const srcFps = 1 / med;
    let nominal = NOMINAL_FPS[0];
    for (const f of NOMINAL_FPS) if (Math.abs(f - srcFps) < Math.abs(nominal - srcFps)) nominal = f;

    const holdHist = {};
    for (const k of HOLD_KEYS) holdHist[k] = 0;
    for (const h of holdRuns) holdHist[h >= 5 ? '5+' : String(h)] += 1;

    let irregular = null;
    if (holdRuns.length > 0 && displayHz > 0) {
      const r = displayHz / nominal;
      const allowed =
        Math.abs(r - Math.round(r)) < 0.01 ? [Math.round(r)] : [Math.floor(r), Math.ceil(r)];
      irregular = holdRuns.filter((h) => !allowed.includes(h)).length / holdRuns.length;
    }
    const skipped = diffs.filter((d) => d > 1.5 * med).length;
    return { srcFps, srcFpsNominal: nominal, holdHist, irregular, skipped };
  }

  // 순수: 경로와 v 쿼리만 남긴다 (GUIDELINES 2.6-1). URL 전역이 없는 환경을 위해 정규식으로 파싱.
  function sanitizePageUrl(href) {
    const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?([^#]*))?/.exec(String(href || ''));
    if (!m) return null;
    const path = m[1] || '/';
    const v = /(?:^|&)v=([^&]*)/.exec(m[2] || '');
    return v ? path + '?v=' + v[1] : path;
  }

  // 순수: WebGPU copyTextureToBuffer의 bytesPerRow는 256의 배수여야 한다.
  function alignBytesPerRow(rowBytes) {
    return Math.ceil(rowBytes / 256) * 256;
  }

  // 순수: RGBA 8bit 버퍼(행 패딩 포함)의 RGB 평균 밝기 0~255. 알파 제외, 패딩 바이트 제외.
  // 입력이 유효하지 않거나 버퍼가 모자라면 null (FIX_GUIDE N1).
  function meanBrightness(data, width, height, bytesPerRow) {
    const ok = [width, height, bytesPerRow].every((v) => Number.isInteger(v) && v > 0);
    if (!ok || !data || bytesPerRow < width * 4) return null;
    if (data.length < bytesPerRow * (height - 1) + width * 4) return null;
    let sum = 0;
    for (let y = 0; y < height; y++) {
      const row = y * bytesPerRow;
      for (let x = 0; x < width; x++) {
        const i = row + x * 4;
        sum += data[i] + data[i + 1] + data[i + 2];
      }
    }
    return sum / (width * height * 3);
  }

  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const round2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
  const nameOrNull = (v) => (typeof v === 'string' ? v : null);

  // 순수: frameProbe 진단 객체. 없으면 null. 밝기는 소수 둘째 자리 반올림 (픽셀 데이터는 저장하지 않는다).
  function normalizeFrameProbe(p) {
    if (!p || typeof p !== 'object') return null;
    return {
      at: round2(numOrNull(p.at)),
      n: numOrNull(p.n),
      ext: round2(numOrNull(p.ext)),
      vf: round2(numOrNull(p.vf)),
      copy: round2(numOrNull(p.copy)),
      c2d: round2(numOrNull(p.c2d)),
      ms: round2(numOrNull(p.ms)),
      extSyncMs: round2(numOrNull(p.extSyncMs)),
      vfSyncMs: round2(numOrNull(p.vfSyncMs)),
      copySyncMs: round2(numOrNull(p.copySyncMs)),
      c2dSyncMs: round2(numOrNull(p.c2dSyncMs)),
      extErr: nameOrNull(p.extErr),
      vfErr: nameOrNull(p.vfErr),
      copyErr: nameOrNull(p.copyErr),
      c2dErr: nameOrNull(p.c2dErr),
    };
  }

  const orNull = (v) => (v === undefined ? null : v);
  // M2 스키마 타입: api.adapter/device/configure는 boolean|null, configRead.toneMapping은 string|null.
  const boolOrNull = (v) => (v === undefined || v === null ? null : !!v);
  const strOrNull = (v) => {
    if (typeof v === 'string') return v;
    if (v && typeof v.mode === 'string') return v.mode;
    return null;
  };

  const LIFECYCLE_STATES = ['idle', 'probing', 'active', 'skipped'];
  const MAX_EVENTS = 30;
  const intOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null);

  // 순수: video.colorSpace 진단 객체. 없으면 null.
  function normalizeColorSpace(c) {
    if (!c || typeof c !== 'object') return null;
    return {
      primaries: nameOrNull(c.primaries),
      transfer: nameOrNull(c.transfer),
      matrix: nameOrNull(c.matrix),
      fullRange: typeof c.fullRange === 'boolean' ? c.fullRange : null,
    };
  }

  // 순수: M3-4 lifecycle 진단. 이벤트 로그는 최근 MAX_EVENTS개, 문자열은 짧게 자른다 (URL 등 미포함).
  function normalizeLifecycle(l) {
    const x = l && typeof l === 'object' ? l : {};
    const events = (Array.isArray(x.events) ? x.events : []).slice(-MAX_EVENTS).map((e) => ({
      t: round2(numOrNull(e && e.t)),
      ev: typeof (e && e.ev) === 'string' ? e.ev.slice(0, 40) : null,
    }));
    return {
      state: LIFECYCLE_STATES.includes(x.state) ? x.state : null,
      skipReason: nameOrNull(x.skipReason),
      navCount: intOrNull(x.navCount),
      srcChanges: intOrNull(x.srcChanges),
      videoSwaps: intOrNull(x.videoSwaps),
      playerMode: nameOrNull(x.playerMode),
      adShowing: typeof x.adShowing === 'boolean' ? x.adShowing : null,
      pip: typeof x.pip === 'boolean' ? x.pip : null,
      lastEvent: nameOrNull(x.lastEvent),
      lastEventAt: round2(numOrNull(x.lastEventAt)),
      events,
    };
  }

  // 순수: M2-4 스키마 진단 객체. state의 누락 값은 null.
  function buildDiag(state) {
    const s = state || {};
    const env = s.env || {};
    const screen = env.screen || {};
    const api = s.api || {};
    const cfg = api.configRead || null;
    const video = s.video || {};
    const canvas = s.canvas || {};
    const render = s.render || {};
    const flags = s.flags || {};
    const sum = summarize(render.frameTimesMs, render.loopTimestamps);
    const loopTs = Array.isArray(render.loopTimestamps) ? render.loopTimestamps : [];
    const displayHz = estimateDisplayHz(loopTs);
    const miss =
      displayHz === null
        ? null
        : displayMissRate(loopTs, loopTs[0], loopTs[loopTs.length - 1], displayHz);
    const cad = cadenceStats(render.srcTimes, loopTs, displayHz);
    const hasCadence = Array.isArray(render.srcTimes) && render.srcTimes.length > 0;
    const copyTimes = Array.isArray(render.copyTimesMs) ? render.copyTimesMs : [];
    const vfTimes = Array.isArray(render.vfTimesMs) ? render.vfTimesMs : [];
    return {
      schemaVersion: 8,
      milestone: 'M2',
      extVersion: orNull(s.extVersion),
      createdAt: orNull(s.createdAt),
      page: { url: sanitizePageUrl(s.url) },
      env: {
        ua: orNull(env.ua),
        dpr: orNull(env.dpr),
        screen: { w: orNull(screen.w), h: orNull(screen.h) },
        dynamicRangeHigh: orNull(env.dynamicRangeHigh),
        colorGamutP3: orNull(env.colorGamutP3),
      },
      api: {
        gpu: orNull(api.gpu),
        adapter: boolOrNull(api.adapter),
        device: boolOrNull(api.device),
        configure: boolOrNull(api.configure),
        configRead: cfg
          ? {
              format: orNull(cfg.format),
              colorSpace: orNull(cfg.colorSpace),
              toneMapping: strOrNull(cfg.toneMapping),
            }
          : null,
      },
      video: {
        videoWidth: orNull(video.videoWidth),
        videoHeight: orNull(video.videoHeight),
        srcIsBlob: orNull(video.srcIsBlob),
        paused: orNull(video.paused),
        colorSpace: normalizeColorSpace(video.colorSpace),
      },
      canvas: {
        width: orNull(canvas.width),
        height: orNull(canvas.height),
        cssWidth: orNull(canvas.cssWidth),
        cssHeight: orNull(canvas.cssHeight),
      },
      render: {
        mode: orNull(render.mode),
        preset: ['accurate', 'balanced', 'vivid'].includes(render.preset) ? render.preset : null,
        strength: round2(numOrNull(render.strength)),
        sharpness: round2(numOrNull(render.sharpness)),
        saturation: round2(numOrNull(render.saturation)),
        frames: typeof render.frames === 'number' ? render.frames : sum.frames,
        loopFps: sum.loopFps,
        jsP50: sum.jsP50,
        jsP95: sum.jsP95,
        path: ['ext', 'vf', 'copy', 'pending'].includes(render.path) ? render.path : null,
        displayHz,
        displayMissRate: miss === null ? null : Math.round(miss * 1e5) / 1e5,
        cadence: hasCadence
          ? {
              srcFps: cad.srcFps === null ? null : Math.round(cad.srcFps * 100) / 100,
              srcFpsNominal: cad.srcFpsNominal,
              holdHist: cad.holdHist,
              irregular: cad.irregular === null ? null : Math.round(cad.irregular * 1e4) / 1e4,
              skipped: cad.skipped,
            }
          : null,
        copyMsP50: round2(percentile(copyTimes, 50)),
        copyMsP95: round2(percentile(copyTimes, 95)),
        copySkipped: numOrNull(render.copySkipped),
        vfMsP50: round2(percentile(vfTimes, 50)),
        vfMsP95: round2(percentile(vfTimes, 95)),
        videoDropped: numOrNull(render.videoDropped),
        videoTotal: numOrNull(render.videoTotal),
      },
      frameProbe: normalizeFrameProbe(s.frameProbe),
      flags: {
        drm: !!flags.drm,
        attached: !!flags.attached,
        fullscreen: !!flags.fullscreen,
        blackFrame: !!flags.blackFrame,
        hdrSource: !!flags.hdrSource,
      },
      lifecycle: normalizeLifecycle(s.lifecycle),
      errors: (Array.isArray(s.errors) ? s.errors : []).slice(0, MAX_ERRORS).map((e) => ({
        at: orNull(e && e.at),
        name: orNull(e && e.name),
        message: orNull(e && e.message),
      })),
    };
  }

  globalThis.__sdrhdr.hud = {
    summarize,
    sanitizePageUrl,
    alignBytesPerRow,
    meanBrightness,
    estimateDisplayHz,
    displayMissRate,
    cadenceStats,
    normalizeFrameProbe,
    normalizeColorSpace,
    normalizeLifecycle,
    buildDiag,
  };
})();
