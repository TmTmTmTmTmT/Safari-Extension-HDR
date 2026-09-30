'use strict';
(function () {
  // YouTube 셀렉터는 이 파일에만 둔다 (GUIDELINES 2.3-1).
  const SELECTORS = {
    player: '#movie_player',
    container: '.html5-video-container',
    video: 'video.html5-main-video',
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

  // 순수: 입력 경로 선택 (PLAN C절, FIX_GUIDE Q1).
  // 'pending': 기준 경로(c2d/copy)가 모두 어둡거나 값이 없어 ext 검정 여부를 판단할 수 없음.
  // 'none': ext가 검고 copy도 검은데 c2d만 정상 (N2 가드와 같은 결과로 detach).
  function choosePath(probe) {
    const p = probe || {};
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    const copyOk = num(p.copy) && p.copy >= BLACK_REF_MIN;
    const c2dOk = num(p.c2d) && p.c2d >= BLACK_REF_MIN;
    if (!copyOk && !c2dOk) return 'pending';
    if (!num(p.ext) || p.ext >= BLACK_EXT_MAX) return 'ext';
    return copyOk ? 'copy' : 'none';
  }

  // 순수: 선택된 경로의 출력이 검은지. ext는 isBlackOverlay, copy는 copy 자체가 검고 c2d가 정상일 때 (FIX_GUIDE P2-4).
  function isBlackSelected(probe, path) {
    if (path !== 'copy') return isBlackOverlay(probe);
    const p = probe || {};
    const num = (v) => typeof v === 'number' && Number.isFinite(v);
    return num(p.copy) && p.copy < BLACK_EXT_MAX && num(p.c2d) && p.c2d >= BLACK_REF_MIN;
  }

  // 순수: 연속 횟수 갱신. 검지 않거나 판단 불가면 0으로 되돌린다. path 생략 시 ext 기준.
  function nextBlackStreak(streak, probe, path) {
    return isBlackSelected(probe, path) ? (streak || 0) + 1 : 0;
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
      return { video, container };
    } catch (e) {
      return null;
    }
  }

  globalThis.__sdrhdr.detect = {
    SELECTORS,
    BLACK_STREAK_LIMIT,
    isDrm,
    isBlackOverlay,
    isBlackSelected,
    choosePath,
    nextBlackStreak,
    contentRect,
    canvasResolution,
    findMainVideo,
  };
})();
