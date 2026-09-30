'use strict';
(function () {
  const GPU_TIMEOUT_MS = 5000; // 프로브 H1과 같은 방식: 응답 없는 요청을 끊는다.
  const RING = 600;
  // GUIDELINES 2.5-3 고정 설정.
  const FORMAT = 'rgba16float';
  const COLOR_SPACE = 'display-p3';
  const TONE_MAPPING = { mode: 'extended' };
  // N1 frameProbe: 64x36 rgba8unorm 되읽기. GPUTextureUsage/GPUBufferUsage 값 (WebGPU 스펙).
  const PROBE_W = 64;
  const PROBE_H = 36;
  const PROBE_FORMAT = 'rgba8unorm';
  const PROBE_INTERVAL_MS = 5000;
  const PROBE_POLL_MS = 500;
  const TEX_COPY_SRC = 0x01;
  const TEX_COPY_DST = 0x02;
  const TEX_RENDER_ATTACHMENT = 0x10;
  const BUF_MAP_READ = 0x01;
  const BUF_COPY_DST = 0x08;
  const MAP_READ = 0x01; // GPUMapMode.READ

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' 응답 없음 (' + ms + 'ms)')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function push(ring, v) {
    ring.push(v);
    if (ring.length > RING) ring.shift();
  }

  // hooks.onFrame: 프레임마다 호출(DRM 저비용 검사용). getStats: 진단용 읽기 전용 스냅샷.
  function createRenderer(canvas, video, onError, hooks) {
    const onFrame = hooks && typeof hooks.onFrame === 'function' ? hooks.onFrame : null;
    let mode = 'itm';
    let running = false;
    let destroyed = false;
    let initPromise = null;
    let device = null;
    let ctx = null;
    let sampler = null;
    let pipelines = null;
    let rafId = null;
    let frames = 0;
    const frameTimes = [];
    const loopTs = [];
    const api = { gpu: null, adapter: null, device: null, configure: null, configRead: null };
    const onProbe = hooks && typeof hooks.onProbe === 'function' ? hooks.onProbe : null;
    const createdAt = performance.now();
    let probeTimer = null;
    let probeBusy = false;
    let probeDue = 0;
    let probeN = 0;
    let probePipeline = null;
    let frameProbe = null;

    function fail(e, at) {
      running = false;
      cancel();
      if (destroyed) return;
      try {
        onError(e, at);
      } catch (err) {
        // 콜백 오류가 재생을 방해하지 않게 한다.
      }
    }

    function cancel() {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function kick() {
      if (!running || destroyed || rafId !== null || document.hidden) return;
      rafId = requestAnimationFrame(tick);
    }

    function makePipeline(module) {
      return device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: FORMAT }] },
        primitive: { topology: 'triangle-list' },
      });
    }

    async function init() {
      api.gpu = !!navigator.gpu;
      if (!api.gpu) throw Object.assign(new Error('navigator.gpu 없음'), { name: 'NoWebGPU' });
      const adapter = await withTimeout(
        navigator.gpu.requestAdapter(),
        GPU_TIMEOUT_MS,
        'requestAdapter',
      );
      api.adapter = !!adapter;
      if (!adapter) throw new Error('requestAdapter()가 null');
      device = await withTimeout(adapter.requestDevice(), GPU_TIMEOUT_MS, 'requestDevice');
      api.device = true;
      device.lost.then((info) => {
        if (!destroyed)
          fail(new Error('device.lost ' + info.reason + ' ' + info.message), 'device.lost');
      });
      device.addEventListener('uncapturederror', (ev) => fail(ev.error, 'uncapturederror'));
      if (destroyed) return;

      ctx = canvas.getContext('webgpu');
      try {
        ctx.configure({
          device,
          format: FORMAT,
          colorSpace: COLOR_SPACE,
          toneMapping: TONE_MAPPING,
        });
        api.configure = true;
      } catch (e) {
        api.configure = false;
        throw e;
      }
      if (typeof ctx.getConfiguration === 'function') {
        const c = ctx.getConfiguration();
        api.configRead = {
          format: (c && c.format) || null,
          colorSpace: (c && c.colorSpace) || null,
          // 스키마: string|null. 구현에 따라 객체({mode})나 문자열일 수 있어 문자열로 정규화한다.
          toneMapping:
            c && typeof c.toneMapping === 'string'
              ? c.toneMapping
              : (c && c.toneMapping && c.toneMapping.mode) || null,
        };
      }

      const shaders = globalThis.__sdrhdr.itm;
      pipelines = {
        stripes: makePipeline(device.createShaderModule({ code: shaders.STRIPES })),
        identity: makePipeline(device.createShaderModule({ code: shaders.VIDEO_IDENTITY })),
        itm: makePipeline(device.createShaderModule({ code: shaders.VIDEO_ITM })),
      };
      sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    }

    // 렌더 1회. video 모드에서 준비되지 않은 video는 그리지 않고 false.
    function renderOnce() {
      const isVideo = mode !== 'stripes';
      if (isVideo && video.readyState < 2) return false;
      const pipeline = pipelines[mode];
      const enc = device.createCommandEncoder();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: ctx.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          },
        ],
      });
      pass.setPipeline(pipeline);
      if (isVideo) {
        // 외부 텍스처는 재사용하지 않고 매번 import (GUIDELINES 2.5-1).
        const tex = device.importExternalTexture({ source: video });
        const bind = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource: tex },
          ],
        });
        pass.setBindGroup(0, bind);
      }
      pass.draw(3);
      pass.end();
      device.queue.submit([enc.finish()]);
      return true;
    }

    function tick(ts) {
      rafId = null;
      if (!running || destroyed) return;
      const t0 = performance.now();
      try {
        if (renderOnce()) {
          push(frameTimes, performance.now() - t0);
          push(loopTs, ts);
          frames += 1;
        }
      } catch (e) {
        fail(e, 'render');
        return;
      }
      if (onFrame) onFrame();
      if (!running || destroyed) return;
      // 재생 중일 때만 루프를 이어간다. 그 외에는 이번 1회 렌더 후 정지 (PLAN C절 렌더 루프).
      if (!video.paused && !video.ended) kick();
    }

    // ---- N1 frameProbe: 기존 캔버스 파이프라인·렌더 루프와 별개인 진단 경로 (FIX_GUIDE N1) ----

    function newProbeTarget() {
      return device.createTexture({
        size: [PROBE_W, PROBE_H],
        format: PROBE_FORMAT,
        usage: TEX_COPY_SRC | TEX_COPY_DST | TEX_RENDER_ATTACHMENT,
      });
    }

    // texture를 되읽어 평균 밝기를 구한다. buffer는 어떤 경우에도 unmap/destroy한다.
    async function readTextureMean(texture) {
      const hud = globalThis.__sdrhdr.hud;
      const bytesPerRow = hud.alignBytesPerRow(PROBE_W * 4);
      const buffer = device.createBuffer({
        size: bytesPerRow * PROBE_H,
        usage: BUF_MAP_READ | BUF_COPY_DST,
      });
      let mapped = false;
      try {
        const enc = device.createCommandEncoder();
        enc.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [PROBE_W, PROBE_H]);
        device.queue.submit([enc.finish()]);
        await withTimeout(buffer.mapAsync(MAP_READ), GPU_TIMEOUT_MS, 'mapAsync');
        mapped = true;
        const data = new Uint8Array(buffer.getMappedRange().slice(0));
        return hud.meanBrightness(data, PROBE_W, PROBE_H, bytesPerRow);
      } finally {
        try {
          if (mapped) buffer.unmap();
        } catch (e) {
          // 정리 중 오류는 무시한다.
        }
        buffer.destroy();
      }
    }

    async function probeExt() {
      if (!probePipeline) {
        const module = device.createShaderModule({ code: globalThis.__sdrhdr.itm.VIDEO_IDENTITY });
        probePipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format: PROBE_FORMAT }] },
          primitive: { topology: 'triangle-list' },
        });
      }
      const target = newProbeTarget();
      try {
        const enc = device.createCommandEncoder();
        const pass = enc.beginRenderPass({
          colorAttachments: [
            {
              view: target.createView(),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        });
        pass.setPipeline(probePipeline);
        const tex = device.importExternalTexture({ source: video });
        pass.setBindGroup(
          0,
          device.createBindGroup({
            layout: probePipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: tex },
            ],
          }),
        );
        pass.draw(3);
        pass.end();
        device.queue.submit([enc.finish()]);
        return await readTextureMean(target);
      } finally {
        target.destroy();
      }
    }

    async function probeCopy() {
      const vw = video.videoWidth || PROBE_W;
      const vh = video.videoHeight || PROBE_H;
      const origin = {
        x: Math.max(0, Math.floor((vw - PROBE_W) / 2)),
        y: Math.max(0, Math.floor((vh - PROBE_H) / 2)),
      };
      const target = newProbeTarget();
      try {
        device.queue.copyExternalImageToTexture({ source: video, origin }, { texture: target }, [
          PROBE_W,
          PROBE_H,
        ]);
        return await readTextureMean(target);
      } finally {
        target.destroy();
      }
    }

    async function probeC2d() {
      const c = new OffscreenCanvas(PROBE_W, PROBE_H);
      const c2 = c.getContext('2d', { willReadFrequently: true });
      c2.drawImage(video, 0, 0, PROBE_W, PROBE_H);
      const img = c2.getImageData(0, 0, PROBE_W, PROBE_H);
      return globalThis.__sdrhdr.hud.meanBrightness(img.data, PROBE_W, PROBE_H, PROBE_W * 4);
    }

    // 경로마다 예외를 따로 잡아 name만 기록한다. 한 경로 실패가 다른 경로를 막지 않는다.
    async function runPath(fn) {
      try {
        return { v: await fn(), err: null };
      } catch (e) {
        return { v: null, err: (e && e.name) || 'Error' };
      }
    }

    async function runProbe() {
      probeBusy = true;
      try {
        const ext = await runPath(probeExt);
        const copy = await runPath(probeCopy);
        const c2d = await runPath(probeC2d);
        if (destroyed) return;
        probeN += 1;
        frameProbe = {
          at: performance.now() - createdAt,
          n: probeN,
          ext: ext.v,
          copy: copy.v,
          c2d: c2d.v,
          extErr: ext.err,
          copyErr: copy.err,
          c2dErr: c2d.err,
        };
        if (onProbe) {
          try {
            onProbe(Object.assign({}, frameProbe));
          } catch (e) {
            // 콜백 오류가 재생을 방해하지 않게 한다.
          }
        }
      } finally {
        probeBusy = false;
      }
    }

    // 재생 중이고 readyState>=2일 때만 실행. 첫 회차는 즉시, 이후 5초마다. 실행 중이면 건너뜀.
    function probePoll() {
      if (probeBusy || destroyed || !running || !device) return;
      if (video.paused || video.ended || video.readyState < 2) return;
      const now = performance.now();
      if (now < probeDue) return;
      probeDue = now + PROBE_INTERVAL_MS;
      runProbe();
    }

    const onWake = () => kick();
    // 일시정지로 attach된 경우 첫 프레임용 (FIX_GUIDE L4). 1회 구독이며 detach에서도 해제한다.
    const onLoaded = () => kick();
    const onVisibility = () => {
      if (document.hidden) cancel();
      else kick();
    };

    function start() {
      if (destroyed || running) return initPromise || Promise.resolve();
      running = true;
      video.addEventListener('play', onWake);
      video.addEventListener('seeked', onWake);
      document.addEventListener('visibilitychange', onVisibility);
      if (!initPromise) {
        initPromise = init().catch((e) => fail(e, 'init'));
      }
      return initPromise.then(() => {
        if (!device || destroyed || !running) return;
        if (video.readyState >= 2) kick();
        else video.addEventListener('loadeddata', onLoaded, { once: true });
        if (probeTimer === null) probeTimer = setInterval(probePoll, PROBE_POLL_MS);
        probePoll();
      });
    }

    function removeListeners() {
      video.removeEventListener('play', onWake);
      video.removeEventListener('seeked', onWake);
      video.removeEventListener('loadeddata', onLoaded);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function stop() {
      running = false;
      cancel();
      removeListeners();
      if (probeTimer !== null) clearInterval(probeTimer);
      probeTimer = null;
    }

    function setMode(next) {
      if (next !== 'itm' && next !== 'identity' && next !== 'stripes') return;
      mode = next;
      // 정지 상태에서도 변경이 보이도록 1회 렌더.
      if (device) kick();
    }

    function destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      try {
        if (ctx) ctx.unconfigure();
        if (device) device.destroy();
      } catch (e) {
        // 정리 중 오류는 무시한다.
      }
    }

    function getStats() {
      return {
        mode,
        frames,
        api: Object.assign({}, api, {
          configRead: api.configRead && Object.assign({}, api.configRead),
        }),
        frameTimesMs: frameTimes.slice(),
        loopTimestamps: loopTs.slice(),
        frameProbe: frameProbe && Object.assign({}, frameProbe),
      };
    }

    return { start, stop, setMode, destroy, getStats };
  }

  globalThis.__sdrhdr.renderer = { createRenderer };
})();
