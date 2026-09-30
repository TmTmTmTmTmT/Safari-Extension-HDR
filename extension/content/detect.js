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

  globalThis.__sdrhdr.detect = { SELECTORS, isDrm, contentRect, canvasResolution, findMainVideo };
})();
