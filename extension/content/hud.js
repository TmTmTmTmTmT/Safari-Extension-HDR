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

  // 순수: 경로와 v 쿼리만 남긴다 (GUIDELINES 2.6-1). URL 전역이 없는 환경을 위해 정규식으로 파싱.
  function sanitizePageUrl(href) {
    const m = /^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?([^#]*))?/.exec(String(href || ''));
    if (!m) return null;
    const path = m[1] || '/';
    const v = /(?:^|&)v=([^&]*)/.exec(m[2] || '');
    return v ? path + '?v=' + v[1] : path;
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
    return {
      schemaVersion: 1,
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
      },
      flags: {
        drm: !!flags.drm,
        attached: !!flags.attached,
        fullscreen: !!flags.fullscreen,
      },
      errors: (Array.isArray(s.errors) ? s.errors : []).slice(0, MAX_ERRORS).map((e) => ({
        at: orNull(e && e.at),
        name: orNull(e && e.name),
        message: orNull(e && e.message),
      })),
    };
  }

  globalThis.__sdrhdr.hud = { summarize, sanitizePageUrl, buildDiag };
})();
