'use strict';
(function () {
  function createOverlay(container, video) {
    const detect = globalThis.__sdrhdr.detect;
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    // z-index는 지정하지 않는다: video 바로 뒤 DOM 순서로 컨트롤 아래를 유지 (GUIDELINES 2.3-3).
    container.insertBefore(canvas, video.nextSibling);

    let videoObserver = null;
    let containerObserver = null;
    let rafId = null;

    // video 표시 상자 안의 콘텐츠 사각형에 맞춰 위치·크기·백킹 크기를 갱신한다.
    function update() {
      // 직접 호출이 예약 갱신을 대체하므로 같은 프레임의 중복 계산을 막는다.
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      const boxW = video.offsetWidth;
      const boxH = video.offsetHeight;
      const rect = detect.contentRect(boxW, boxH, video.videoWidth, video.videoHeight);
      if (rect.w <= 0 || rect.h <= 0) return null;
      canvas.style.left = video.offsetLeft + rect.x + 'px';
      canvas.style.top = video.offsetTop + rect.y + 'px';
      canvas.style.width = rect.w + 'px';
      canvas.style.height = rect.h + 'px';
      const res = detect.canvasResolution(
        video.videoWidth,
        video.videoHeight,
        rect.w,
        rect.h,
        globalThis.devicePixelRatio || 1,
      );
      // 백킹 크기 대입은 캔버스를 초기화하므로 바뀔 때만 한다.
      if (res && (canvas.width !== res.width || canvas.height !== res.height)) {
        canvas.width = res.width;
        canvas.height = res.height;
      }
      return res;
    }

    // 한 프레임에 여러 트리거(Observer, 전체화면, 메타데이터)가 겹쳐도 계산은 1회로 합친다.
    function schedule() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        update();
      });
    }

    if (typeof ResizeObserver === 'function') {
      videoObserver = new ResizeObserver(schedule);
      videoObserver.observe(video);
      containerObserver = new ResizeObserver(schedule);
      containerObserver.observe(container);
    }
    // Safari는 접두사 이벤트를 따로 보내는 경우가 있어 둘 다 듣는다.
    document.addEventListener('fullscreenchange', schedule);
    document.addEventListener('webkitfullscreenchange', schedule);
    // 메타데이터 로드·해상도 변경은 상자 크기가 그대로여서 ResizeObserver가 잡지 못한다.
    video.addEventListener('loadedmetadata', schedule);
    video.addEventListener('resize', schedule);

    function destroy() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      if (videoObserver) videoObserver.disconnect();
      if (containerObserver) containerObserver.disconnect();
      videoObserver = null;
      containerObserver = null;
      document.removeEventListener('fullscreenchange', schedule);
      document.removeEventListener('webkitfullscreenchange', schedule);
      video.removeEventListener('loadedmetadata', schedule);
      video.removeEventListener('resize', schedule);
      canvas.remove();
    }

    return { canvas, update, destroy };
  }

  globalThis.__sdrhdr.overlay = { createOverlay };
})();
