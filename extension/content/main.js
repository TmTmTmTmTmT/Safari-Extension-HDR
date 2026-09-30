'use strict';
(function () {
  const ns = globalThis.__sdrhdr;
  const FIND_INTERVAL_MS = 1000;
  const FIND_MAX_TRIES = 30;
  const DIAG_INTERVAL_MS = 2000;
  const MAX_ERRORS = 20;

  const drmVideos = new WeakSet(); // DRM 판정된 video는 영구 no-op (GUIDELINES 2.4-2)
  const errors = [];
  let settings = null;
  let cur = null; // 현재 attach: { video, overlay, renderer, sawEncrypted, onEnc }
  let last = { render: null, canvas: null, video: null }; // detach 직전 스냅샷
  let drmFlag = false;
  let findTimer = null;
  let findTries = 0;
  let lastDiagKey = null;
  let started = false;

  function addError(at, e) {
    if (errors.length >= MAX_ERRORS) return;
    errors.push({
      at,
      name: (e && e.name) || 'Error',
      message: String((e && e.message) || e).slice(0, 200),
    });
  }

  function snapshot() {
    if (!cur) return;
    const v = cur.video;
    const c = cur.overlay.canvas;
    last = {
      render: cur.renderer.getStats(),
      video: {
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        srcIsBlob: String(v.currentSrc || '').startsWith('blob:'),
        paused: v.paused,
      },
      canvas: {
        width: c.width,
        height: c.height,
        cssWidth: parseFloat(c.style.width) || 0,
        cssHeight: parseFloat(c.style.height) || 0,
      },
    };
  }

  function detach() {
    if (!cur) return;
    snapshot();
    const a = cur;
    cur = null;
    a.video.removeEventListener('encrypted', a.onEnc);
    a.video.removeEventListener('webkitneedkey', a.onEnc);
    a.renderer.destroy();
    a.overlay.destroy();
  }

  function markDrm(video) {
    drmVideos.add(video);
    drmFlag = true;
    detach();
  }

  function checkDrm(video, sawEncryptedEvent) {
    return ns.detect.isDrm({
      mediaKeys: video.mediaKeys,
      webkitKeys: video.webkitKeys,
      sawEncryptedEvent,
    });
  }

  function onRenderError(e, at) {
    addError(at || 'renderer', e);
    detach(); // 페이지 재생은 그대로 두고 오버레이만 제거 (GUIDELINES 2.5-4)
  }

  function attach(found) {
    const { video, container } = found;
    const overlay = ns.overlay.createOverlay(container, video);
    overlay.update();
    const a = { video, overlay, renderer: null, sawEncrypted: false, onEnc: null };
    a.onEnc = () => {
      a.sawEncrypted = true;
      markDrm(video);
    };
    video.addEventListener('encrypted', a.onEnc);
    video.addEventListener('webkitneedkey', a.onEnc);
    a.renderer = ns.renderer.createRenderer(overlay.canvas, video, onRenderError, {
      onFrame: () => {
        if (cur === a && checkDrm(video, a.sawEncrypted)) markDrm(video);
      },
    });
    cur = a;
    a.renderer.setMode(settings.mode);
    a.renderer.start();
  }

  function tryAttach() {
    findTimer = null;
    if (cur || !settings || !settings.enabled) return;
    const found = ns.detect.findMainVideo(document);
    if (!found) {
      findTries += 1;
      if (findTries < FIND_MAX_TRIES) {
        findTimer = setTimeout(tryAttach, FIND_INTERVAL_MS);
      } else {
        addError('find', { name: 'NoVideo', message: '메인 video 셀렉터 실패 (재시도 소진)' });
      }
      return;
    }
    if (drmVideos.has(found.video)) return;
    if (checkDrm(found.video, false)) {
      markDrm(found.video);
      return;
    }
    attach(found);
  }

  function scheduleAttach() {
    if (findTimer !== null) clearTimeout(findTimer);
    findTries = 0;
    tryAttach();
  }

  function onSettings(next) {
    const prev = settings;
    settings = next;
    if (!next.enabled) {
      if (findTimer !== null) clearTimeout(findTimer);
      findTimer = null;
      detach();
      return;
    }
    if (!prev || !prev.enabled) {
      scheduleAttach();
      return;
    }
    if (cur && prev.mode !== next.mode) cur.renderer.setMode(next.mode);
  }

  function collectState() {
    const mm = (q) => !!(globalThis.matchMedia && globalThis.matchMedia(q).matches);
    let extVersion = null;
    try {
      extVersion = browser.runtime.getManifest().version;
    } catch (e) {
      // 버전을 못 읽어도 진단은 계속한다.
    }
    if (cur) snapshot();
    return {
      extVersion,
      createdAt: new Date().toISOString(),
      url: globalThis.location.href,
      env: {
        ua: navigator.userAgent,
        dpr: globalThis.devicePixelRatio,
        screen: { w: globalThis.screen.width, h: globalThis.screen.height },
        dynamicRangeHigh: mm('(dynamic-range: high)'),
        colorGamutP3: mm('(color-gamut: p3)'),
      },
      api: last.render ? last.render.api : null,
      video: last.video,
      canvas: last.canvas,
      render: last.render
        ? {
            mode: last.render.mode,
            frames: last.render.frames,
            frameTimesMs: last.render.frameTimesMs,
            loopTimestamps: last.render.loopTimestamps,
          }
        : { mode: settings ? settings.mode : null },
      flags: { drm: drmFlag, attached: !!cur, fullscreen: !!document.fullscreenElement },
      errors,
    };
  }

  function writeDiagIfChanged() {
    const diag = ns.hud.buildDiag(collectState());
    const key = JSON.stringify(Object.assign({}, diag, { createdAt: null }));
    if (key === lastDiagKey) return;
    lastDiagKey = key;
    ns.params.writeDiag(diag).catch(() => {});
  }

  // 유일한 부작용 시작점. 로드 시점 접근을 피하려고 마이크로태스크로 미룬다.
  async function start() {
    if (started) return;
    started = true;
    try {
      settings = await ns.params.readSettings();
      ns.params.subscribe(onSettings);
      if (settings.enabled) scheduleAttach();
      setInterval(() => {
        try {
          writeDiagIfChanged();
        } catch (e) {
          // 진단 실패는 무시한다.
        }
      }, DIAG_INTERVAL_MS);
    } catch (e) {
      // 페이지 재생은 방해하지 않되 원인은 diag errors에 남긴다.
      addError('main.start', e);
    }
  }

  ns.main = { start };
  Promise.resolve().then(start);
})();
