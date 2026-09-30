'use strict';
(function () {
  const MAX_ERRORS = 20;

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
    if (ts.length >= 2) {
      const span = ts[ts.length - 1] - ts[0];
      if (span > 0) loopFps = ((ts.length - 1) * 1000) / span;
    }
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
  function displayMissRate(loopTimes, windowStart, windowEnd, displayHz) {
    if (!Array.isArray(loopTimes)) return null;
    if (!(displayHz > 0) || !(windowEnd > windowStart)) return null;
    const ts = loopTimes.filter(
      (v) => typeof v === 'number' && Number.isFinite(v) && v >= windowStart && v <= windowEnd,
    );
    if (ts.length < 2) return null;
    const limitMs = 1500 / displayHz;
    let missed = 0;
    for (let i = 1; i < ts.length; i++) {
      const gap = ts[i] - ts[i - 1];
      if (gap > limitMs) missed += Math.max(0, Math.round((gap * displayHz) / 1000) - 1);
    }
    return missed / (((windowEnd - windowStart) / 1000) * displayHz);
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
      copy: round2(numOrNull(p.copy)),
      c2d: round2(numOrNull(p.c2d)),
      ms: round2(numOrNull(p.ms)),
      extSyncMs: round2(numOrNull(p.extSyncMs)),
      copySyncMs: round2(numOrNull(p.copySyncMs)),
      c2dSyncMs: round2(numOrNull(p.c2dSyncMs)),
      extErr: nameOrNull(p.extErr),
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
    const copyTimes = Array.isArray(render.copyTimesMs) ? render.copyTimesMs : [];
    return {
      schemaVersion: 3,
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
      },
      canvas: {
        width: orNull(canvas.width),
        height: orNull(canvas.height),
        cssWidth: orNull(canvas.cssWidth),
        cssHeight: orNull(canvas.cssHeight),
      },
      render: {
        mode: orNull(render.mode),
        frames: typeof render.frames === 'number' ? render.frames : sum.frames,
        loopFps: sum.loopFps,
        jsP50: sum.jsP50,
        jsP95: sum.jsP95,
        path: render.path === 'ext' || render.path === 'copy' ? render.path : null,
        displayHz,
        displayMissRate: miss === null ? null : Math.round(miss * 1e5) / 1e5,
        copyMsP50: round2(percentile(copyTimes, 50)),
        copyMsP95: round2(percentile(copyTimes, 95)),
        copySkipped: numOrNull(render.copySkipped),
        videoDropped: numOrNull(render.videoDropped),
        videoTotal: numOrNull(render.videoTotal),
      },
      frameProbe: normalizeFrameProbe(s.frameProbe),
      flags: {
        drm: !!flags.drm,
        attached: !!flags.attached,
        fullscreen: !!flags.fullscreen,
        blackFrame: !!flags.blackFrame,
      },
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
    normalizeFrameProbe,
    buildDiag,
  };
})();
