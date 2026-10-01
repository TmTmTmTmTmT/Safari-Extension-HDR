'use strict';
(function () {
  const ns = globalThis.__sdrhdr;
  const FIND_INTERVAL_MS = 1000;
  const FIND_MAX_TRIES = 30;
  const DIAG_INTERVAL_MS = 2000;
  const MUTATION_DEBOUNCE_MS = 250;
  const MAX_ERRORS = 20;
  const MAX_EVENTS = 30;
  const NO_PROBE_MODES = ['stripes', 'baseline']; // frameProbe 경로 결정 없이 바로 그리는(또는 그리지 않는) 모드

  const drmVideos = new WeakSet(); // DRM 판정된 video는 요소 단위 영구 no-op (GUIDELINES 2.4-2, 2.4-4)
  let failVideos = new WeakSet(); // 렌더러 오류(GPU 초기화 등)로 detach된 요소. 설정 토글 전까지 재attach 안 함
  const errors = [];
  const events = [];
  let startedAt = 0; // start()에서 설정 (로드 시점 부작용 금지, GUIDELINES 2.1-3)
  let settings = null;
  let cur = null; // 현재 attach: { video, container, overlay, renderer, src, pip, sawEncrypted, blackStreak, cleanup }
  let lc = { state: 'idle', skip: null }; // 수명주기 상태 (detect.nextLifecycle)
  let last = { render: null, canvas: null, video: null }; // detach 직전 스냅샷
  let drmFlag = false;
  let blackFlag = false;
  let navCount = 0;
  let srcChanges = 0;
  let videoSwaps = 0;
  let lastMode = null;
  let lastEvent = null;
  let lastEventAt = null;
  let findTimer = null;
  let findTries = 0;
  let mutationTimer = null;
  let observer = null;
  let observedPlayer = null;
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

  function logEvent(ev) {
    lastEvent = ev;
    lastEventAt = Math.round(performance.now() - startedAt);
    events.push({ t: lastEventAt, ev });
    if (events.length > MAX_EVENTS) events.shift();
  }

  // 상태 전이는 detect.nextLifecycle 한 곳에서만 일어난다. quiet이면 이벤트 로그에 남기지 않는다.
  function dispatch(ev, quiet) {
    const prev = lc;
    lc = ns.detect.nextLifecycle(lc, ev);
    if (quiet) return;
    logEvent(ev);
    if (lc.state === 'skipped' && (prev.state !== 'skipped' || prev.skip !== lc.skip))
      logEvent('skip:' + lc.skip);
  }

  function snapshot() {
    if (!cur) return;
    const v = cur.video;
    const c = cur.overlay.canvas;
    const render = cur.renderer.getStats();
    last = {
      render,
      video: {
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        srcIsBlob: String(v.currentSrc || '').startsWith('blob:'),
        paused: v.paused,
        colorSpace: render.colorSpace,
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
    a.cleanup.forEach((fn) => fn());
    a.renderer.destroy();
    a.overlay.destroy();
  }

  // 렌더만 멈추고 캔버스를 숨긴다. overlay·renderer(GPU device 포함)와 video 리스너는 유지해 소스 변경·PiP 해제에서 재개한다.
  function suspend(a) {
    if (cur !== a) return;
    a.renderer.stop();
    a.overlay.canvas.style.visibility = 'hidden';
  }

  function resume(a) {
    if (cur !== a) return;
    a.blackStreak = 0;
    a.renderer.restartSource();
    a.renderer.start();
    if (NO_PROBE_MODES.includes(settings.mode)) dispatch('decided', true);
  }

  function markDrm(video) {
    drmVideos.add(video);
    drmFlag = true;
    detach();
    dispatch('drm');
  }

  function checkDrm(video, sawEncryptedEvent) {
    return ns.detect.isDrm({
      mediaKeys: video.mediaKeys,
      webkitKeys: video.webkitKeys,
      sawEncryptedEvent,
    });
  }

  function onRenderError(a, e, at) {
    if (cur !== a) return;
    addError(at || 'renderer', e);
    failVideos.add(a.video);
    detach(); // 페이지 재생은 그대로 두고 오버레이만 제거 (GUIDELINES 2.5-4)
    dispatch('error');
  }

  // 소스 단위 재시작 (PLAN D-M3 M3-1). currentSrc가 실제로 바뀔 때만 동작하고, ''는 이어지는 loadstart를 기다린다.
  function onSrc(a) {
    if (cur !== a) return;
    const src = String(a.video.currentSrc || '');
    if (src === '' || src === a.src) return;
    a.src = src;
    srcChanges += 1;
    if (checkDrm(a.video, a.sawEncrypted)) {
      markDrm(a.video);
      return;
    }
    const prev = lc;
    dispatch('srcChange');
    a.blackStreak = 0;
    if (lc.state !== 'probing') return;
    if (prev.state === 'skipped') resume(a);
    else a.renderer.restartSource();
  }

  function onPip(a) {
    if (cur !== a) return;
    const pip = ns.detect.isPipActive(a.video, document);
    if (pip === a.pip) return;
    a.pip = pip;
    if (pip) {
      dispatch('pipEnter');
      if (lc.skip === 'pip') suspend(a);
      return;
    }
    const prev = lc;
    dispatch('pipLeave');
    if (prev.skip === 'pip' && lc.state === 'probing') resume(a);
  }

  // frameProbe 결과 처리: HDR 원본 → skipped(hdrSource), 검은 화면 연속 → skipped(blackFrame), 경로 결정 → active.
  // 스킵은 detach 방향으로만 작동한다 (GUIDELINES 2.4-3). 둘 다 소스가 바뀌면 재판정한다.
  function onProbe(a, probe, path) {
    if (cur !== a || NO_PROBE_MODES.includes(settings && settings.mode)) {
      if (cur === a) a.blackStreak = 0;
      return;
    }
    // 배지(2순위)는 셀렉터 확정(M3-5) 전이라 쓰지 않는다.
    if (probe.colorSpace && ns.detect.isHdrSource({ frameColorSpace: probe.colorSpace })) {
      dispatch('hdr');
      if (lc.skip === 'hdrSource') suspend(a);
      return;
    }
    // 'pending'은 판단 보류(none 1회 포함)이므로 연속 횟수를 세지 않는다.
    // 'none'은 렌더러가 2회 연속 확인한 결과이므로 N2 가드와 같은 결과로 스킵한다 (FIX_GUIDE R2).
    if (path === 'pending') {
      a.blackStreak = 0;
      return;
    }
    a.blackStreak =
      path === 'none'
        ? ns.detect.BLACK_STREAK_LIMIT
        : ns.detect.nextBlackStreak(a.blackStreak, probe, path);
    if (a.blackStreak < ns.detect.BLACK_STREAK_LIMIT) {
      if (path !== 'none') dispatch('decided', true);
      return;
    }
    blackFlag = true;
    addError('blackFrame', {
      name: 'BlackFrame',
      message: 'selected path (' + path + ') output ≈0 while c2d/copy>0',
    });
    dispatch('black');
    if (lc.skip === 'blackFrame') suspend(a);
  }

  function listen(target, type, fn, cleanup) {
    target.addEventListener(type, fn);
    cleanup.push(() => target.removeEventListener(type, fn));
  }

  function attach(found) {
    const { video, container } = found;
    const overlay = ns.overlay.createOverlay(container, video);
    overlay.update();
    const cleanup = [];
    const a = {
      video,
      container,
      overlay,
      renderer: null,
      src: String(video.currentSrc || ''),
      pip: ns.detect.isPipActive(video, document),
      sawEncrypted: false,
      blackStreak: 0,
      cleanup,
    };
    const onEnc = () => {
      a.sawEncrypted = true;
      markDrm(video);
    };
    listen(video, 'encrypted', onEnc, cleanup);
    listen(video, 'webkitneedkey', onEnc, cleanup);
    listen(video, 'emptied', () => onSrc(a), cleanup);
    listen(video, 'loadstart', () => onSrc(a), cleanup);
    for (const ev of ns.detect.PIP_EVENTS) listen(video, ev, () => onPip(a), cleanup);
    a.renderer = ns.renderer.createRenderer(
      overlay.canvas,
      video,
      (e, at) => onRenderError(a, e, at),
      {
        settings: settings,
        onFrame: () => {
          if (cur === a && checkDrm(video, a.sawEncrypted)) markDrm(video);
        },
        onProbe: (probe, path) => onProbe(a, probe, path),
        onWarn: (e, at) => {
          if (cur === a) addError(at, e);
        },
        onUndecided: () => {
          if (cur === a)
            addError('path', {
              name: 'PathUndecided',
              message: 'frameProbe 60회 이상 경로 판단 불가 (캔버스 숨김 유지)',
            });
        },
      },
    );
    cur = a;
    a.renderer.setMode(settings.mode);
    if (NO_PROBE_MODES.includes(settings.mode)) dispatch('decided', true);
    if (a.pip) {
      dispatch('pipEnter');
      if (lc.skip === 'pip') {
        a.renderer.start();
        suspend(a);
        return;
      }
    }
    a.renderer.start();
  }

  function attachTo(found) {
    const { video } = found;
    if (drmVideos.has(video)) {
      lc = { state: 'skipped', skip: 'drm' };
      return;
    }
    if (failVideos.has(video)) {
      lc = { state: 'skipped', skip: 'noGpu' };
      return;
    }
    lc = { state: 'idle', skip: null };
    dispatch('attach');
    if (checkDrm(video, false)) {
      markDrm(video);
      return;
    }
    attach(found);
  }

  // #movie_player 범위로만 관찰하고 디바운스한다 (GUIDELINES 2.7-3). document 전체 관찰 금지.
  function observePlayer(player) {
    if (player === observedPlayer) return;
    if (observer) observer.disconnect();
    observer = null;
    observedPlayer = null;
    if (!player || typeof MutationObserver !== 'function') return;
    observer = new MutationObserver(() => {
      if (mutationTimer !== null) clearTimeout(mutationTimer);
      mutationTimer = setTimeout(() => {
        mutationTimer = null;
        ensureTarget();
      }, MUTATION_DEBOUNCE_MS);
    });
    observer.observe(player, { childList: true, subtree: true });
    observedPlayer = player;
  }

  function stopObserving() {
    if (mutationTimer !== null) clearTimeout(mutationTimer);
    mutationTimer = null;
    if (observer) observer.disconnect();
    observer = null;
    observedPlayer = null;
  }

  // 현재 대상 video가 DOM의 메인 video와 같은지 확인하고 다르면 교체한다 (PLAN D-M3 M3-1 요소 교체).
  function ensureTarget() {
    if (!settings || !settings.enabled) return;
    observePlayer(ns.detect.findPlayer(document));
    const found = ns.detect.findMainVideo(document);
    if (!found) {
      if (cur) {
        detach();
        dispatch('videoGone');
      }
      return;
    }
    if (cur && cur.video === found.video && cur.container === found.container) return;
    if (cur) {
      detach();
      videoSwaps += 1;
      logEvent('swap');
    } else if (lc.state === 'skipped' && lc.skip === 'drm' && drmVideos.has(found.video)) {
      return;
    }
    attachTo(found);
  }

  function tryAttach() {
    findTimer = null;
    if (!settings || !settings.enabled) return;
    const found = ns.detect.findMainVideo(document);
    if (!found) {
      if (cur) {
        ensureTarget();
        return;
      }
      findTries += 1;
      if (findTries < FIND_MAX_TRIES) {
        findTimer = setTimeout(tryAttach, FIND_INTERVAL_MS);
      } else {
        addError('find', { name: 'NoVideo', message: '메인 video 셀렉터 실패 (재시도 소진)' });
      }
      return;
    }
    ensureTarget();
  }

  function scheduleAttach() {
    if (findTimer !== null) clearTimeout(findTimer);
    findTries = 0;
    tryAttach();
  }

  function onNav() {
    navCount += 1;
    logEvent('nav');
    scheduleAttach();
  }

  function pollMode() {
    const mode = ns.detect.playerMode(ns.detect.readPlayerFlags(document));
    if (mode !== lastMode) {
      if (lastMode !== null) logEvent('mode:' + mode);
      lastMode = mode;
    }
  }

  function onSettings(next) {
    const prev = settings;
    settings = next;
    if (!next.enabled) {
      if (findTimer !== null) clearTimeout(findTimer);
      findTimer = null;
      stopObserving();
      detach();
      dispatch('disable');
      return;
    }
    if (!prev || !prev.enabled) {
      failVideos = new WeakSet();
      dispatch('enable');
      scheduleAttach();
      return;
    }
    if (cur) {
      // 셰이더 값(프리셋·강도·선명도·채도)은 바뀐 것만 유니폼으로 보낸다. 재attach 금지.
      const changed = {};
      for (const key of ['preset', 'strength', 'sharpness', 'saturation']) {
        if (next[key] !== undefined && prev[key] !== next[key]) changed[key] = next[key];
      }
      // custom은 객체라 값으로 비교한다.
      if (next.custom && JSON.stringify(prev.custom) !== JSON.stringify(next.custom))
        changed.custom = next.custom;
      if (Object.keys(changed).length > 0) cur.renderer.setParams(changed);
    }
    if (cur && prev.mode !== next.mode) {
      cur.renderer.setMode(next.mode);
      logEvent('mode:' + next.mode);
      if (lc.state === 'probing' && NO_PROBE_MODES.includes(next.mode)) dispatch('decided', true);
      // 경로 결정이 필요한 모드로 돌아오면 다시 probing으로 본다. 결정되면 onProbe가 active로 바꾼다.
      else if (lc.state === 'active' && NO_PROBE_MODES.includes(prev.mode))
        dispatch('srcChange', true);
    }
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
    const pf = ns.detect.readPlayerFlags(document);
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
            srcTimes: last.render.srcTimes,
            path: last.render.path,
            copyTimesMs: last.render.copyTimesMs,
            vfTimesMs: last.render.vfTimesMs,
            copySkipped: last.render.copySkipped,
            videoDropped: last.render.videoDropped,
            videoTotal: last.render.videoTotal,
            preset: last.render.preset,
            strength: last.render.strength,
            sharpness: last.render.sharpness,
            saturation: last.render.saturation,
            custom: last.render.custom,
            effectivePeak: last.render.effectivePeak,
          }
        : {
            mode: settings ? settings.mode : null,
            preset: settings ? settings.preset : null,
            strength: settings ? settings.strength : null,
            sharpness: settings ? settings.sharpness : null,
            saturation: settings ? settings.saturation : null,
            custom: settings && settings.preset === 'custom' ? ns.params.curveOf(settings) : null,
            effectivePeak: settings ? ns.params.effectivePeak(settings) : null,
          },
      frameProbe: last.render ? last.render.frameProbe : null,
      flags: {
        drm: drmFlag,
        attached: !!cur,
        fullscreen: !!document.fullscreenElement,
        blackFrame: blackFlag,
        hdrSource: lc.skip === 'hdrSource',
        hud: !!(settings && settings.hud),
      },
      lifecycle: {
        state: lc.state,
        skipReason: lc.skip,
        navCount,
        srcChanges,
        videoSwaps,
        playerMode: ns.detect.playerMode(pf),
        adShowing: pf.adShowing,
        pip: cur ? cur.pip : false,
        lastEvent,
        lastEventAt,
        events,
      },
      errors,
    };
  }

  function writeDiagIfChanged() {
    pollMode();
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
      startedAt = performance.now();
      settings = await ns.params.readSettings();
      ns.params.subscribe(onSettings);
      document.addEventListener(ns.detect.NAV_EVENT, onNav);
      document.addEventListener('fullscreenchange', pollMode);
      document.addEventListener('webkitfullscreenchange', pollMode);
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
