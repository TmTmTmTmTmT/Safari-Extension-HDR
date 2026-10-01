'use strict';
(function () {
  // YouTube 셀렉터는 이 파일에만 둔다 (GUIDELINES 2.3-1).
  const SELECTORS = {
    player: '#movie_player',
    container: '.html5-video-container',
    video: 'video.html5-main-video',
  };

  // YouTube 이벤트·클래스 이름도 셀렉터와 같이 이 파일에만 둔다 (GUIDELINES 2.7-1).
  const NAV_EVENT = 'yt-navigate-finish';
  const PIP_EVENTS = [
    'enterpictureinpicture',
    'leavepictureinpicture',
    'webkitpresentationmodechanged',
  ];
  const AD_CLASS = 'ad-showing';
  const PIP_PRESENTATION_MODE = 'picture-in-picture';
  const HDR_TRANSFERS = ['pq', 'hlg'];
  // [미확인] 아래 셀렉터는 추측값이다 (GUIDELINES 2.7-4). 2026-10-01 스냅샷(PLAN M3-8)에는 조상에 ytd-watch-flexy가
  // 없어 theater·miniplayer를 확인하지 못했고, HDR 영상의 설정 버튼도 ytp-4k-quality-badge였다.
  // hdrBadge는 ytp-<품질>-quality-badge 패턴에 맞춘 추정이며 판정(main.js)에는 쓰지 않고 진단에만 쓴다.
  const MODE_SELECTORS = {
    theater: 'ytd-watch-flexy[theater]',
    miniplayer: 'ytd-miniplayer[active]',
    hdrBadge: '.ytp-settings-button.ytp-hdr-quality-badge',
  };

  // 순수: DRM 신호가 하나라도 있으면 true (GUIDELINES 2.4).
  function isDrm(sig) {
    const s = sig || {};
    return !!(s.mediaKeys || s.webkitKeys || s.sawEncryptedEvent);
  }

  // 순수: object-fit contain 가정의 콘텐츠 사각형(box 내부 좌표). 입력이 유효하지 않으면 0 크기.
  function contentRect(boxW, boxH, videoW, videoH) {
    const ok = [boxW, boxH, videoW, videoH].every((v) => typeof v === 'number' && v > 0);
    if (!ok) return { x: 0, y: 0, w: 0, h: 0 };
    const scale = Math.min(boxW / videoW, boxH / videoH);
    const w = videoW * scale;
    const h = videoH * scale;
    return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
  }

  // 순수: 캔버스 해상도 = min(원본, 표시 크기 x DPR), 종횡비 유지 (PLAN C절, probe canvasResolution과 같은 규칙).
  function canvasResolution(srcW, srcH, cssW, cssH, dpr) {
    if (![srcW, srcH, cssW, cssH, dpr].every((v) => typeof v === 'number' && v > 0)) return null;
    const scale = Math.min(1, (cssW * dpr) / srcW, (cssH * dpr) / srcH);
    return {
      width: Math.max(1, Math.round(srcW * scale)),
      height: Math.max(1, Math.round(srcH * scale)),
    };
  }

  const BLACK_EXT_MAX = 2; // ext가 이 값 미만이면 검음
  const BLACK_REF_MIN = 8; // c2d/copy가 이 값 이상이면 원본은 검지 않음
  const BLACK_STREAK_LIMIT = 2; // 연속 판정 횟수 (FIX_GUIDE N2)

  // 순수: frameProbe로 오버레이가 검은 화면인지 판단. 값이 없으면(예외 등) 판단하지 않고 false.
  function isBlackOverlay(probe) {
    const p = probe || {};
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!num(p.ext) || p.ext >= BLACK_EXT_MAX) return false;
    return (num(p.c2d) && p.c2d >= BLACK_REF_MIN) || (num(p.copy) && p.copy >= BLACK_REF_MIN);
  }

  const VF_MIN = 2; // ext/vf가 이 값 이상이면 비검정
  const NONE_STREAK_LIMIT = BLACK_STREAK_LIMIT; // none 연속 판정 횟수 (FIX_GUIDE R2-2)
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  // 순수: 입력 경로 선택 (PLAN C절, FIX_GUIDE R2). 순서 ext -> vf -> copy.
  // 'pending': 기준 경로(c2d)가 8 미만이거나 값이 없어 검정 여부를 판단할 수 없음.
  // 'none': 기준은 정상인데 ext·vf·copy가 모두 검음. 2회 연속일 때만 detach한다(호출자가 연속 횟수를 센다).
  function choosePath(probe) {
    const p = probe || {};
    if (!isNum(p.c2d) || p.c2d < BLACK_REF_MIN) return 'pending';
    if (isNum(p.ext) && p.ext >= BLACK_EXT_MAX) return 'ext';
    if (isNum(p.vf) && p.vf >= VF_MIN) return 'vf';
    if (isNum(p.copy) && p.copy >= BLACK_REF_MIN) return 'copy';
    return 'none';
  }

  // 순수: none 연속 횟수 갱신. none이 아니면 0.
  function nextNoneStreak(streak, chosen) {
    return chosen === 'none' ? (streak || 0) + 1 : 0;
  }

  // 순수: 결정 후 경로 전환. 선택 경로가 검고(<2) 다음 단계 경로가 밝을 때만 한 단계 아래로 (ext->vf, vf->copy).
  // 위로는 가지 않는다. 전환 조건이 아니면 현재 경로를 그대로 돌려준다.
  function stepDownPath(path, probe) {
    const p = probe || {};
    const black = (v) => isNum(v) && v < BLACK_EXT_MAX;
    if (path === 'ext' && black(p.ext) && isNum(p.vf) && p.vf >= VF_MIN) return 'vf';
    if (path === 'vf' && black(p.vf) && isNum(p.copy) && p.copy >= BLACK_REF_MIN) return 'copy';
    return path;
  }

  // 순수: 선택된 경로의 출력이 검은지. ext는 isBlackOverlay, vf는 vf 자체가 검고 c2d/copy가 정상일 때,
  // copy는 copy 자체가 검고 c2d가 정상일 때 (FIX_GUIDE P2-4, R2).
  function isBlackSelected(probe, path) {
    const p = probe || {};
    if (path === 'vf')
      return (
        isNum(p.vf) &&
        p.vf < BLACK_EXT_MAX &&
        ((isNum(p.c2d) && p.c2d >= BLACK_REF_MIN) || (isNum(p.copy) && p.copy >= BLACK_REF_MIN))
      );
    if (path !== 'copy') return isBlackOverlay(probe);
    return isNum(p.copy) && p.copy < BLACK_EXT_MAX && isNum(p.c2d) && p.c2d >= BLACK_REF_MIN;
  }

  // 순수: 연속 횟수 갱신. 검지 않거나 판단 불가면 0으로 되돌린다. path 생략 시 ext 기준.
  function nextBlackStreak(streak, probe, path) {
    return isBlackSelected(probe, path) ? (streak || 0) + 1 : 0;
  }

  // DOM: 플레이어 루트. MutationObserver 범위를 #movie_player로 한정하는 데 쓴다 (GUIDELINES 2.7-3). 실패 시 null.
  function findPlayer(doc) {
    try {
      return doc.querySelector(SELECTORS.player) || null;
    } catch (e) {
      return null;
    }
  }

  // DOM: 메인 플레이어 video와 container. 실패 시 예외 없이 null (GUIDELINES 2.3-2).
  function findMainVideo(doc) {
    try {
      const player = doc.querySelector(SELECTORS.player);
      if (!player) return null;
      const container = player.querySelector(SELECTORS.container);
      if (!container) return null;
      const video = container.querySelector(SELECTORS.video);
      if (!video) return null;
      return { video, container, player };
    } catch (e) {
      return null;
    }
  }

  // 순수: HDR 원본 판정 (PLAN D-M3 M3-2). 1순위 VideoFrame.colorSpace.transfer, 정보가 없을 때만 2순위 DOM 배지.
  // primaries가 bt2020이어도 SDR transfer면 HDR이 아니다.
  function isHdrSource(input) {
    const i = input || {};
    const cs = i.frameColorSpace;
    const transfer = cs && typeof cs === 'object' ? cs.transfer : null;
    if (typeof transfer === 'string' && transfer) return HDR_TRANSFERS.includes(transfer);
    return i.badge === true;
  }

  // 순수: 화면 모드 우선순위 fullscreen > miniplayer > theater > default (진단용).
  function playerMode(flags) {
    const f = flags || {};
    if (f.isFullscreen) return 'fullscreen';
    if (f.isMiniplayer) return 'miniplayer';
    if (f.isTheater) return 'theater';
    return 'default';
  }

  // 순수: PiP 여부. Safari webkitPresentationMode 또는 표준 pictureInPictureElement.
  function isPipActive(video, doc) {
    try {
      if (!video) return false;
      return (
        video.webkitPresentationMode === PIP_PRESENTATION_MODE ||
        (!!doc && doc.pictureInPictureElement === video)
      );
    } catch (e) {
      return false;
    }
  }

  // DOM: 광고 재생 중 여부. 실패 시 false.
  function isAdShowing(doc) {
    try {
      const player = doc.querySelector(SELECTORS.player);
      return !!player && player.classList.contains(AD_CLASS);
    } catch (e) {
      return false;
    }
  }

  // DOM: 화면 모드·광고·HDR 배지 플래그. 셀렉터가 실패하면 해당 값은 false.
  function readPlayerFlags(doc) {
    const has = (sel) => {
      try {
        return !!doc.querySelector(sel);
      } catch (e) {
        return false;
      }
    };
    let isFullscreen = false;
    try {
      isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    } catch (e) {
      isFullscreen = false;
    }
    return {
      isTheater: has(MODE_SELECTORS.theater),
      isMiniplayer: has(MODE_SELECTORS.miniplayer),
      isFullscreen,
      adShowing: isAdShowing(doc),
      hdrBadge: has(MODE_SELECTORS.hdrBadge),
    };
  }

  // 순수: 수명주기 상태 전이 표 (PLAN D-M3 M3-1). st={state, skip}, ev는 문자열. 입력 st는 바꾸지 않는다.
  // drm은 요소 단위로 영구: srcChange로 풀리지 않는다. blackFrame·hdrSource는 srcChange로 풀리고 pip은 pipLeave로 풀린다.
  const STICKY_SKIPS = ['drm', 'noGpu', 'disabled'];
  function nextLifecycle(st, ev) {
    const cur = { state: (st && st.state) || 'idle', skip: (st && st.skip) || null };
    const next = (state, skip) => ({ state, skip: skip || null });
    const sticky = cur.state === 'skipped' && STICKY_SKIPS.includes(cur.skip);
    const live = cur.state === 'probing' || cur.state === 'active';
    switch (ev) {
      case 'attach':
        return sticky ? cur : next('probing');
      case 'srcChange':
        if (sticky || (cur.state === 'skipped' && cur.skip === 'pip')) return cur;
        return cur.state === 'idle' ? cur : next('probing');
      case 'decided':
        return cur.state === 'probing' ? next('active') : cur;
      case 'drm':
        return next('skipped', 'drm');
      case 'error':
        return cur.skip === 'drm' ? cur : next('skipped', 'noGpu');
      case 'black':
        return live ? next('skipped', 'blackFrame') : cur;
      case 'hdr':
        return live ? next('skipped', 'hdrSource') : cur;
      case 'pipEnter':
        return sticky ? cur : next('skipped', 'pip');
      case 'pipLeave':
        return cur.state === 'skipped' && cur.skip === 'pip' ? next('probing') : cur;
      case 'disable':
        return cur.skip === 'drm' ? cur : next('skipped', 'disabled');
      case 'enable':
        return cur.skip === 'disabled' ? next('idle') : cur;
      case 'videoGone':
        return next('idle');
      default:
        return cur;
    }
  }

  globalThis.__sdrhdr.detect = {
    SELECTORS,
    MODE_SELECTORS,
    NAV_EVENT,
    PIP_EVENTS,
    AD_CLASS,
    isHdrSource,
    playerMode,
    isPipActive,
    isAdShowing,
    readPlayerFlags,
    BLACK_STREAK_LIMIT,
    NONE_STREAK_LIMIT,
    isDrm,
    isBlackOverlay,
    isBlackSelected,
    choosePath,
    nextNoneStreak,
    stepDownPath,
    nextBlackStreak,
    contentRect,
    canvasResolution,
    findMainVideo,
    findPlayer,
    nextLifecycle,
  };
})();
