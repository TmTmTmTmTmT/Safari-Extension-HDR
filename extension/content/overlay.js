'use strict';
(function () {
  function createOverlay(container, video) {
    const detect = globalThis.__sdrhdr.detect;
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    // z-index는 지정하지 않는다: video 바로 뒤 DOM 순서로 컨트롤 아래를 유지 (GUIDELINES 2.3-3).
    container.insertBefore(canvas, video.nextSibling);

    let observer = null;

    // video 표시 상자 안의 콘텐츠 사각형에 맞춰 위치·크기·백킹 크기를 갱신한다.
    function update() {
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

    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => update());
      observer.observe(video);
    }
    document.addEventListener('fullscreenchange', update);
    // 메타데이터 로드·해상도 변경은 상자 크기가 그대로여서 ResizeObserver가 잡지 못한다.
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('resize', update);

    function destroy() {
      if (observer) observer.disconnect();
      observer = null;
      document.removeEventListener('fullscreenchange', update);
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('resize', update);
      canvas.remove();
    }

    return { canvas, update, destroy };
  }

  globalThis.__sdrhdr.overlay = { createOverlay };
})();
