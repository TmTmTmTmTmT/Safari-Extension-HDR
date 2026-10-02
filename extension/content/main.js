'use strict';
(function () {
  const ns = globalThis.__sdrhdr;
  const FIND_INTERVAL_MS = 1000;
  const FIND_MAX_TRIES = 30;
  const HUD_INTERVAL_MS = 1000; // 페이지 HUD 갱신 주기 (PLAN M5-3). 렌더 루프와 무관하게 통계만 읽는다.
  const MUTATION_DEBOUNCE_MS = 250;
  const MAX_ERRORS = 20;
  const MAX_EVENTS = 30;
  // 단축키 (PLAN D-M8 M8-0 (e)). 문자열은 이 상수 한 곳에서만 쓴다.
  const KEY_CODE = 'KeyH'; // Option+H: 누르는 동안 원본 보기, Option+Shift+H: 켜기/끄기
  const BYPASS_STATES = ['active', 'probing']; // 원본 보기를 허용하는 수명주기 상태
  const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
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
  let hudState = null; // { container, hud }: attach와 독립 수명 (PLAN M8-3, UX-13)
  let chipState = null; // { container, chip }
  let lastVideo = null; // 마지막으로 본 메인 video. cur가 없을 때 DRM 신호를 읽기만 하려는 용도
  let bypass = false; // 원본 보기 (Option+H 누르는 동안)
  let lastSentKey = null; // background에 마지막으로 보낸 상태 (같은 상태 연속 미전송)
  let lastChipText = null; // 칩이 마지막으로 다룬 상태 문구

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
    if (!quiet) {
      logEvent(ev);
      if (lc.state === 'skipped' && (prev.state !== 'skipped' || prev.skip !== lc.skip))
        logEvent('skip:' + lc.skip);
    }
    refreshUi();
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
    bypass = false; // renderer가 사라지므로 원본 보기도 끝난다
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

  // 현재 상태 입력 (PLAN M8-3). URL·제목은 넣지 않는다 (GUIDELINES 2.6-1).
  // drmNow는 현재 video의 DRM 신호를 읽기만 한다. sawEncrypted는 보지 않고 markDrm도 부르지 않는다 (GUIDELINES 2.4-5).
  function currentStatusInput() {
    const v = cur ? cur.video : lastVideo;
    const drmNow = v
      ? ns.detect.isDrm({
          mediaKeys: v.mediaKeys,
          webkitKeys: v.webkitKeys,
          sawEncryptedEvent: false,
        })
      : false;
    return {
      enabled: settings ? settings.enabled : undefined,
      mode: settings ? settings.mode : undefined,
      state: lc.state,
      skip: lc.skip,
      undecided: cur ? !!cur.renderer.getStats().undecided : false,
      errorName: errors.length > 0 ? errors[errors.length - 1].name : null,
      drmNow,
      bypass,
    };
  }

  function destroyHud() {
    if (!hudState) return;
    hudState.hud.destroy();
    hudState = null;
  }

  function destroyChip() {
    if (!chipState) return;
    chipState.chip.destroy();
    chipState = null;
  }

  // HUD·칩은 attach가 아니라 container에 묶는다. cur가 없어도(DRM·오류·꺼짐) 유지하고, container가 바뀔 때만 다시 만든다.
  // 요소 조회는 detect 함수로만 한다 (GUIDELINES 2.3-1).
  function syncUi() {
    if (!settings) return null;
    const found = ns.detect.findMainVideo(document);
    if (found) lastVideo = found.video;
    const container = found ? found.container : null;
    if (settings.hud && container) {
      if (!hudState || hudState.container !== container) {
        destroyHud();
        hudState = { container, hud: ns.hud.createHud(container) };
      }
    } else {
      destroyHud();
    }
    if (chipState && chipState.container !== container) destroyChip();
    return container;
  }

  function showChip(container, label) {
    if (!container) return;
    if (!chipState) chipState = { container, chip: ns.hud.createChip(container) };
    chipState.chip.show(label);
  }

  function hudInfo() {
    const a = cur;
    const st = a ? a.renderer.getStats() : last.render || {};
    const sum = ns.hud.summarize(st.frameTimesMs, st.loopTimestamps);
    const loopTs = Array.isArray(st.loopTimestamps) ? st.loopTimestamps : [];
    const hz = ns.hud.estimateDisplayHz(loopTs);
    // 측정 불가(null)를 0%로 바꾸지 않는다 (PLAN M7-2).
    const missRate =
      hz === null ? null : ns.hud.displayMissRate(loopTs, loopTs[0], loopTs[loopTs.length - 1], hz);
    const miss = missRate === null ? null : missRate * 100;
    const input = currentStatusInput();
    const lv = last.video;
    return {
      state: lc.state,
      skipReason: lc.skip,
      mode: input.mode,
      enabled: input.enabled,
      paused: a ? a.video.paused : false,
      undecided: input.undecided,
      drmNow: input.drmNow,
      bypass: input.bypass,
      errorName: input.errorName,
      path: st.path,
      preset: st.preset,
      strength: st.strength,
      sharpness: st.sharpness,
      saturation: st.saturation,
      effectivePeak: st.effectivePeak,
      loopFps: sum.loopFps,
      jsP95: sum.jsP95,
      missPct: miss,
      videoW: a ? a.video.videoWidth : lv ? lv.videoWidth : null,
      videoH: a ? a.video.videoHeight : lv ? lv.videoHeight : null,
    };
  }

  function tickHud() {
    if (document.hidden || !hudState) return; // 숨긴 탭은 HUD를 갱신하지 않는다 (FIX_GUIDE T)
    hudState.hud.update(ns.hud.hudLines(hudInfo()));
  }

  // browser.runtime이 없는 환경(테스트)에서도 죽지 않는다. 실패·거부는 무시한다 (GUIDELINES 2.1-5).
  function notifyBackground(status) {
    const key = status.text + '|' + JSON.stringify(status.badge);
    if (key === lastSentKey) return;
    lastSentKey = key;
    try {
      const p = browser.runtime.sendMessage({
        type: ns.params.MSG.state,
        badge: status.badge,
        level: status.level,
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {
      // 배지 알림 실패는 무시한다.
    }
  }

  // 상태 문구가 바뀌면 칩을 보이고(notify), background에 알린다. force는 단축키 피드백용(notify 무관).
  function refreshUi(opts) {
    try {
      refreshUiNow(opts);
    } catch (e) {
      // HUD·칩·배지 실패가 수명주기나 재생을 방해하지 않는다.
    }
  }

  function refreshUiNow(opts) {
    if (!settings) return;
    const o = opts || {};
    if (bypass && !BYPASS_STATES.includes(lc.state)) setBypass(false); // 렌더가 멈추면 원본 보기도 끝
    const container = syncUi();
    tickHud();
    const status = ns.params.statusOf(currentStatusInput());
    if (status.text !== lastChipText) {
      if (!settings.notify) lastChipText = status.text;
      else if (container) {
        lastChipText = status.text;
        if (!o.silentChip) showChip(container, status.text);
      }
    }
    notifyBackground(status);
  }

  function setBypass(on) {
    if (bypass === on) return;
    bypass = on;
    if (cur) cur.renderer.setBypass(on);
  }

  // 단축키 피드백: notify와 무관하게 칩을 보이고 같은 문구의 일반 알림은 중복시키지 않는다.
  function feedback(label) {
    refreshUi({ silentChip: true });
    showChip(syncUi(), label);
  }

  function isTyping(e) {
    const els = [e && e.target, document.activeElement];
    return els.some(
      (el) =>
        el && (TYPING_TAGS.includes(String(el.tagName).toUpperCase()) || el.isContentEditable),
    );
  }

  function onKeyDown(e) {
    if (!settings || e.code !== KEY_CODE || !e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.repeat || isTyping(e)) return;
    if (e.shiftKey) {
      e.preventDefault();
      const next = !settings.enabled;
      try {
        const p = ns.params.setEnabled(next);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (err) {
        // 저장 실패는 무시한다.
      }
      feedback(next ? 'HDR 변환 켜짐' : 'HDR 변환 꺼짐');
      return;
    }
    if (!cur || !BYPASS_STATES.includes(lc.state)) return;
    e.preventDefault();
    setBypass(true);
    feedback(ns.params.statusOf(currentStatusInput()).text);
  }

  function releaseBypass() {
    if (!bypass) return;
    setBypass(false);
    feedback(ns.params.statusOf(currentStatusInput()).text);
  }

  function onKeyUp(e) {
    if (e.code === KEY_CODE || e.key === 'Alt' || String(e.code).startsWith('Alt')) releaseBypass();
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
          refreshUi();
        },
      },
    );
    cur = a;
    bypass = false; // 새 attach는 항상 변환 표시로 시작
    refreshUi();
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
    refreshUi(); // hud·notify·mode 변경 반영
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
    // 보이지 않는 탭은 다른 탭의 진단을 덮어쓰지 않는다 (PLAN M7-2, GUIDELINES 2.6-2).
    if (document.visibilityState !== 'visible') return;
    pollMode();
    const diag = ns.hud.buildDiag(collectState());
    const key = JSON.stringify(Object.assign({}, diag, { createdAt: null }));
    if (key === lastDiagKey) return;
    lastDiagKey = key;
    ns.params.writeDiag(diag).catch(() => {});
  }

  // popup 진단 요청 (FIX_GUIDE T2): 보이는 탭만 응답한다. 숨긴 탭은 쓰지 않는다.
  function onDiagRequest() {
    if (document.visibilityState !== 'visible') return;
    try {
      writeDiagIfChanged();
    } catch (e) {
      // 진단 실패는 무시한다.
    }
  }

  // 유일한 부작용 시작점. 로드 시점 접근을 피하려고 마이크로태스크로 미룬다.
  async function start() {
    if (started) return;
    started = true;
    try {
      startedAt = performance.now();
      settings = await ns.params.readSettings();
      ns.params.subscribe(onSettings);
      ns.params.subscribeDiagRequest(onDiagRequest);
      document.addEventListener(ns.detect.NAV_EVENT, onNav);
      document.addEventListener('fullscreenchange', pollMode);
      document.addEventListener('webkitfullscreenchange', pollMode);
      if (settings.enabled) scheduleAttach();
      else {
        // 꺼진 채 시작할 때는 '꺼짐' 칩을 띄우지 않는다. 이후 상태 변화부터 알린다.
        lastChipText = ns.params.statusOf({ enabled: false }).text;
        dispatch('disable', true); // 꺼진 채 시작하면 idle이 아니라 skipped(disabled)로 기록 (PLAN M7-2)
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') {
          releaseBypass(); // 탭을 떠나면 원본 보기 해제
          return;
        }
        // 탭이 다시 보이면 비교 키를 비우고 즉시 1회 기록하고, 배지 상태도 다시 보낸다.
        lastDiagKey = null;
        lastSentKey = null;
        try {
          writeDiagIfChanged();
        } catch (e) {
          // 진단 실패는 무시한다.
        }
        try {
          refreshUi();
        } catch (e) {
          // 상태 알림 실패는 무시한다.
        }
      });
      // 단축키는 capture 단계에서 받는다 (PLAN M8-0 (e)). 원본 보기는 keyup·blur·hidden에서 해제한다.
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('keyup', onKeyUp, true);
      if (typeof globalThis.addEventListener === 'function')
        globalThis.addEventListener('blur', releaseBypass);
      try {
        browser.runtime.onMessage.addListener((msg) => {
          if (!msg || msg.type !== ns.params.MSG.getState) return undefined;
          const input = currentStatusInput();
          return Promise.resolve({ status: ns.params.statusOf(input), input });
        });
      } catch (e) {
        // runtime 메시지가 없는 환경에서는 popup 상태 줄만 쓰지 못한다.
      }
      setInterval(() => {
        try {
          refreshUi(); // HUD 갱신·container 변경 추적·undecided 전환 알림
        } catch (e) {
          // HUD 갱신 실패는 무시한다.
        }
      }, HUD_INTERVAL_MS);
      lastSentKey = null;
      refreshUi(); // start 직후 1회 재전송
    } catch (e) {
      // 페이지 재생은 방해하지 않되 원인은 diag errors에 남긴다.
      addError('main.start', e);
    }
  }

  ns.main = { start };
  Promise.resolve().then(start);
})();
