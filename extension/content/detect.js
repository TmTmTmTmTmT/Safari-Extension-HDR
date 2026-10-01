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
  };
})();
