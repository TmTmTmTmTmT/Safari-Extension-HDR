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
  const PROBE_INTERVAL_MS = 30000; // 경로 선택 후 주기 (FIX_GUIDE P2-5)
  const PROBE_POLL_MS = 500;
  const PROBE_PENDING_MS = 1000; // 경로 보류 중 재시도 주기 (FIX_GUIDE Q1)
  const PENDING_MAX = 60; // 보류 결과가 이 횟수에 이르면 더 시도하지 않는다
  const VF_FAIL_LIMIT = 3; // VideoFrame 생성 실패가 연속 이 횟수에 이르면 errors에 기록하고 다음 경로로 전환 (FIX_GUIDE R3)
  const BUF_UNIFORM = 0x40;
  const UNIFORM_BYTES = 48; // ItmParams: f32 12개(필드 9 + 패딩 3), params.UNIFORM_FLOATS와 같다
  const TEX_COPY_SRC = 0x01;
  const TEX_COPY_DST = 0x02;
  const TEX_TEXTURE_BINDING = 0x04;
  const TEX_RENDER_ATTACHMENT = 0x10;
  const BUF_MAP_READ = 0x01;
  const BUF_COPY_DST = 0x08;
  const MAP_READ = 0x01; // GPUMapMode.READ
  // FIX_GUIDE TA: vf·copy 경로에서 같은 소스 프레임이면 재렌더·submit을 생략한다. false로 되돌릴 수 있다 (사용자 노출 설정 아님).
  const SKIP_SAME_FRAME = true;

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
    let uniformBuf = null;
    // 사용자 설정 중 셰이더에 쓰는 값(preset, strength, sharpness, saturation). hooks.settings는 attach 시 초기값이고
    // 이후 setParams로 유니폼만 갱신한다 (PLAN D-M4a·M4-E).
    let shaderSettings = Object.assign({}, hooks && hooks.settings);
    let pipelines = null;
    let rafId = null;
    let frames = 0;
    let sameFrameSkipped = 0;
    // TA: 다시 그려야 함 플래그. 첫 렌더(GPU 초기화 직후)는 항상 그린다.
    let dirty = true;
    let lastVfTs = null; // 직전에 실제로 그린 VideoFrame.timestamp
    let lastW = null;
    let lastH = null;
    // T1: 소스 세대 번호. restartSource·enterBaseline에서 증가해 진행 중인 이전 회차의 결과를 폐기한다.
    let sourceGen = 0;
    const frameTimes = [];
    const copyTimes = [];
    const vfTimes = [];
    const loopTs = [];
    // 렌더한 rAF마다 그린 소스 프레임 시각(초). loopTs와 같은 인덱스로 정렬된다 (FIX_GUIDE S2).
    const srcTs = [];
    let lastSrc = null;
    const api = { gpu: null, adapter: null, device: null, configure: null, configRead: null };
    const onProbe = hooks && typeof hooks.onProbe === 'function' ? hooks.onProbe : null;
    const onUndecided = hooks && typeof hooks.onUndecided === 'function' ? hooks.onUndecided : null;
    // 재생을 멈추지 않는 오류 기록용 (VideoFrame 실패 등). detach하지 않는다.
    const onWarn = hooks && typeof hooks.onWarn === 'function' ? hooks.onWarn : null;
    const createdAt = performance.now();
    let probeTimer = null;
    let probeBusy = false;
    let probeDue = 0;
    let probeN = 0;
    let probePipeline = null;
    let frameProbe = null;
    // vf 경로에서 얻은 마지막 VideoFrame.colorSpace (HDR 원본 판정용, PLAN D-M3 M3-2). 소스가 바뀌면 비운다.
    let colorSpace = null;
    // 입력 경로: null(첫 frameProbe 전) | 'pending'(판단 불가, 재시도 중) | 'none'(2회 연속, detach 대상) | 'ext' | 'vf' | 'copy'.
    // 결정 후에는 ext->vf, vf->copy로 한 단계씩만 내려가고 되돌리지 않는다 (FIX_GUIDE R2).
    let path = null;
    let pendingCount = 0;
    let noneStreak = 0;
    let vfCreateFails = 0;
    let undecided = false; // 보류 상한 도달: 더 시도하지 않고 캔버스를 숨긴 채 둔다
    let bypass = false; // 원본 보기: 캔버스만 숨기고 렌더는 유지한다 (PLAN D-M8 M8-2)
    let copyTex = null;
    let copyView = null;
    let copySize = null;
    let lastCopyTime = null;
    let copySkipped = 0;
    const copyPipelines = {};

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

    // video 모드에서 경로가 정해지기 전에는 렌더하지 않는다. stripes는 경로와 무관. baseline은 렌더하지 않는다.
    function pathReady() {
      if (mode === 'baseline') return false;
      return mode === 'stripes' || path === 'ext' || path === 'vf' || path === 'copy';
    }

    // 결정 전 video 모드와 baseline에서는 캔버스를 숨겨 원본 video가 보이게 한다.
    function updateVisibility() {
      if (canvas && canvas.style) canvas.style.visibility = pathReady() && !bypass ? '' : 'hidden';
    }

    function setBypass(on) {
      bypass = !!on;
      updateVisibility();
    }

    // baseline은 렌더 없이 rAF 루프만 돈다 (FIX_GUIDE S1).
    function loopReady() {
      return mode === 'baseline' || pathReady();
    }

    function kick() {
      if (!running || destroyed || rafId !== null || document.hidden || !loopReady()) return;
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
      dirty = true;
      const lostDevice = device;
      device.lost.then((info) => {
        // baseline 전환 등으로 우리가 해제한 device의 lost는 오류가 아니다.
        if (!destroyed && device === lostDevice)
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
      uniformBuf = device.createBuffer({ size: UNIFORM_BYTES, usage: BUF_UNIFORM | BUF_COPY_DST });
      writeParams();
    }

    function writeParams() {
      if (!device || !uniformBuf) return;
      const arr = globalThis.__sdrhdr.params.toUniformArray(shaderSettings);
      device.queue.writeBuffer(uniformBuf, 0, new Float32Array(arr));
    }

    function copyPipeline() {
      const key = mode === 'identity' ? 'identity' : 'itm';
      if (!copyPipelines[key]) {
        const shaders = globalThis.__sdrhdr.itm;
        const code = key === 'identity' ? shaders.VIDEO_IDENTITY_COPY : shaders.VIDEO_ITM_COPY;
        copyPipelines[key] = makePipeline(device.createShaderModule({ code }));
      }
      return copyPipelines[key];
    }

    function destroyCopyTexture() {
      if (copyTex) copyTex.destroy();
      copyTex = null;
      copyView = null;
      copySize = null;
      lastCopyTime = null;
    }

    // video 크기 텍스처를 유지하고, 같은 프레임(currentTime 동일)이면 재복사를 생략한다.
    // 반환: false(복사 불가) | 'copied' | 'same'(같은 프레임이라 복사 생략).
    function updateCopyTexture() {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!(w > 0 && h > 0)) return false;
      if (copyTex && (copySize[0] !== w || copySize[1] !== h)) destroyCopyTexture();
      if (!copyTex) {
        copyTex = device.createTexture({
          size: [w, h],
          format: PROBE_FORMAT,
          usage: TEX_TEXTURE_BINDING | TEX_COPY_DST | TEX_RENDER_ATTACHMENT,
        });
        copyView = copyTex.createView();
        copySize = [w, h];
      }
      const t = video.currentTime;
      if (lastCopyTime !== null && t === lastCopyTime) {
        copySkipped += 1;
        return 'same';
      }
      const c0 = performance.now();
      device.queue.copyExternalImageToTexture({ source: video }, { texture: copyTex }, [w, h]);
      push(copyTimes, performance.now() - c0);
      lastCopyTime = t;
      return 'copied';
    }

    function warn(e, at) {
      if (!onWarn) return;
      try {
        onWarn(e, at);
      } catch (err) {
        // 콜백 오류가 재생을 방해하지 않게 한다.
      }
    }

    // VideoFrame 미정의(isolated world 미지원 등)는 ReferenceError로 던진다.
    function createVideoFrame() {
      const VF = globalThis.VideoFrame;
      if (typeof VF !== 'function')
        throw Object.assign(new Error('VideoFrame 미정의'), { name: 'ReferenceError' });
      return new VF(video);
    }

    function readColorSpace(frame) {
      const cs = frame && frame.colorSpace;
      if (!cs) return null;
      const str = (v) => (typeof v === 'string' ? v : null);
      return {
        primaries: str(cs.primaries),
        transfer: str(cs.transfer),
        matrix: str(cs.matrix),
        fullRange: typeof cs.fullRange === 'boolean' ? cs.fullRange : null,
      };
    }

    function closeFrame(frame) {
      try {
        frame.close();
      } catch (e) {
        // 이미 닫힌 프레임 등은 무시한다.
      }
    }

    // vf 경로 실패 후 한 단계 아래(copy)로 1회 전환한다. copy는 vf로 되돌아오지 않는다.
    function fallBackFromVf(e, at) {
      warn(e, at);
      path = 'copy';
      dirty = true;
      updateVisibility();
    }

    // 이번에 그린 소스 프레임 시각(초). vf는 frame.timestamp(us), 그 외는 video.currentTime (FIX_GUIDE S2).
    function srcOf(frame) {
      const t = frame
        ? frame.timestamp === undefined
          ? NaN
          : frame.timestamp / 1e6
        : video.currentTime;
      return typeof t === 'number' && Number.isFinite(t) ? t : null;
    }

    // 렌더 1회. video 모드에서 준비되지 않은 video는 그리지 않고 false.
    // 반환: false(그리지 못함) | true(실제 렌더) | 'skip'(같은 소스 프레임이라 생략, TA).
    function renderOnce() {
      lastSrc = null;
      if (mode === 'baseline') return false;
      const isVideo = mode !== 'stripes';
      if (isVideo && (video.readyState < 2 || !pathReady())) return false;
      const useCopy = isVideo && path === 'copy';
      const useVf = isVideo && path === 'vf';
      const copyState = useCopy ? updateCopyTexture() : null;
      if (useCopy && !copyState) return false;
      if (canvas && (canvas.width !== lastW || canvas.height !== lastH)) dirty = true;
      if (SKIP_SAME_FRAME && useCopy && copyState === 'same' && !dirty) {
        lastSrc = srcOf(null);
        return 'skip';
      }
      let frame = null;
      let vf0 = 0;
      if (useVf) {
        // 프레임 생성 실패는 일시적일 수 있어 연속 3회까지 이번 프레임만 건너뛴다.
        vf0 = performance.now();
        try {
          frame = createVideoFrame();
        } catch (e) {
          vfCreateFails += 1;
          if (vfCreateFails >= VF_FAIL_LIMIT) {
            vfCreateFails = 0;
            fallBackFromVf(e, 'vf.create');
          }
          return false;
        }
        vfCreateFails = 0;
        if (
          SKIP_SAME_FRAME &&
          !dirty &&
          typeof frame.timestamp === 'number' &&
          frame.timestamp === lastVfTs
        ) {
          lastSrc = srcOf(frame);
          closeFrame(frame);
          return 'skip';
        }
      }
      try {
        const pipeline = useCopy ? copyPipeline() : pipelines[mode];
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
          // 외부 텍스처는 재사용하지 않고 매번 import (GUIDELINES 2.5-1). 복사 경로는 복사 텍스처 뷰를 쓴다.
          let resource;
          if (useCopy) resource = copyView;
          else if (useVf) {
            resource = device.importExternalTexture({ source: frame });
            push(vfTimes, performance.now() - vf0);
          } else resource = device.importExternalTexture({ source: video });
          // 강도 유니폼은 itm 파이프라인에만 있다(auto 레이아웃은 쓰는 바인딩만 갖는다).
          const entries = [
            { binding: 0, resource: sampler },
            { binding: 1, resource },
          ];
          if (mode === 'itm') entries.push({ binding: 2, resource: { buffer: uniformBuf } });
          const bind = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries,
          });
          pass.setBindGroup(0, bind);
        }
        pass.draw(3);
        pass.end();
        device.queue.submit([enc.finish()]);
        if (isVideo) lastSrc = srcOf(frame);
        dirty = false;
        lastW = canvas ? canvas.width : null;
        lastH = canvas ? canvas.height : null;
        lastVfTs = useVf && typeof frame.timestamp === 'number' ? frame.timestamp : null;
        return true;
      } finally {
        if (frame) closeFrame(frame);
      }
    }

    function tick(ts) {
      rafId = null;
      if (!running || destroyed) return;
      const t0 = performance.now();
      if (mode === 'baseline') {
        // 기준선: 루프 타이밍만 기록하고 import·렌더·submit은 하지 않는다 (FIX_GUIDE S1).
        push(loopTs, ts);
      } else {
        try {
          const res = renderOnce();
          if (res) {
            push(frameTimes, performance.now() - t0);
            push(loopTs, ts);
            push(srcTs, lastSrc);
            if (res === 'skip') sameFrameSkipped += 1;
            else frames += 1;
          }
        } catch (e) {
          if (path === 'vf') fallBackFromVf(e, 'vf.render');
          else {
            fail(e, 'render');
            return;
          }
        }
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

    // 진단 렌더: source를 외부 텍스처로 import해 64x36 대상에 그리고 submit한다. 되읽기는 호출자가 한다.
    function drawProbe(target, source) {
      if (!probePipeline) {
        const module = device.createShaderModule({ code: globalThis.__sdrhdr.itm.VIDEO_IDENTITY });
        probePipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format: PROBE_FORMAT }] },
          primitive: { topology: 'triangle-list' },
        });
      }
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
      const tex = device.importExternalTexture({ source });
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
    }

    async function probeExt() {
      const target = newProbeTarget();
      try {
        drawProbe(target, video);
        return await readTextureMean(target);
      } finally {
        target.destroy();
      }
    }

    // vf: new VideoFrame(video) -> importExternalTexture. frame은 submit 직후(되읽기 전) 닫고, 예외 시에도 닫는다.
    async function probeVf(gen) {
      const target = newProbeTarget();
      try {
        const frame = createVideoFrame();
        try {
          // 이전 세대의 프레임이 새 세대의 colorSpace를 덮지 않게 한다 (T1).
          if (gen === undefined || gen === sourceGen) colorSpace = readColorSpace(frame);
          drawProbe(target, frame);
        } finally {
          closeFrame(frame);
        }
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
    // syncMs: 함수 호출 후 첫 await까지의 동기 시간 (메인 스레드 점유 추정, FIX_GUIDE P3-2).
    async function runPath(fn, gen) {
      const t0 = performance.now();
      try {
        const pending = fn(gen);
        const syncMs = performance.now() - t0;
        return { v: await pending, err: null, syncMs };
      } catch (e) {
        return { v: null, err: (e && e.name) || 'Error', syncMs: performance.now() - t0 };
      }
    }

    // 측정하지 않은 경로의 결과 자리. 진단에는 null로 남는다.
    const NOT_MEASURED = { v: null, err: null, syncMs: null };
    const PROBE_FNS = { ext: probeExt, vf: probeVf, copy: probeCopy, c2d: probeC2d };

    // 정상 상태 단일 측정에서 선택 경로가 이 값 이상이면 검정이 아니다. detect의 BLACK_EXT_MAX/VF_MIN과 같은 값 (M6-1).
    const SINGLE_OK_MIN = 2;

    function buildFrameProbe(r, t0, probeMode, hdrEarly) {
      probeN += 1;
      return {
        at: performance.now() - createdAt,
        n: probeN,
        ext: r.ext.v,
        vf: r.vf.v,
        copy: r.copy.v,
        c2d: r.c2d.v,
        extErr: r.ext.err,
        vfErr: r.vf.err,
        copyErr: r.copy.err,
        c2dErr: r.c2d.err,
        ms: performance.now() - t0,
        extSyncMs: r.ext.syncMs,
        vfSyncMs: r.vf.syncMs,
        copySyncMs: r.copy.syncMs,
        c2dSyncMs: r.c2d.syncMs,
        colorSpace: colorSpace && Object.assign({}, colorSpace),
        mode: probeMode,
        hdrEarly,
      };
    }

    // 메인 스레드 점유를 줄이기 위해 회차마다 필요한 경로만 잰다 (PLAN D-M6 M6-1).
    // 결정 전: vf를 먼저 재서 HDR이면 나머지(4K에서 c2d 수백 ms)를 건너뛴다. 결정 후: 선택 경로만 재고 검을 때만 전체 측정.
    async function runProbe() {
      probeBusy = true;
      const gen = sourceGen;
      try {
        const t0 = performance.now();
        const detect = globalThis.__sdrhdr.detect;
        const r = { ext: NOT_MEASURED, vf: NOT_MEASURED, copy: NOT_MEASURED, c2d: NOT_MEASURED };
        const decided = path === 'ext' || path === 'vf' || path === 'copy';
        let probeMode = 'full';
        if (decided) {
          r[path] = await runPath(PROBE_FNS[path], gen);
          if (gen !== sourceGen) return; // 소스가 바뀌었으면 결과 폐기 (T1)
          const v = r[path].v;
          if (typeof v === 'number' && v >= SINGLE_OK_MIN) probeMode = 'single';
        } else {
          r.vf = await runPath(probeVf, gen);
          if (gen !== sourceGen) return; // 소스가 바뀌었으면 결과 폐기 (T1)
          if (destroyed || mode === 'baseline') return; // 진단 중 baseline으로 바뀌면 결과를 버린다
          if (detect.isHdrSource({ frameColorSpace: colorSpace })) {
            // 경로 결정·표시·pendingCount는 건드리지 않는다. main이 hdrSource로 suspend한다.
            frameProbe = buildFrameProbe(r, t0, 'full', true);
            if (onProbe) {
              try {
                onProbe(Object.assign({}, frameProbe), 'pending');
              } catch (e) {
                // 콜백 오류가 재생을 방해하지 않게 한다.
              }
            }
            return;
          }
        }
        if (probeMode === 'full') {
          for (const k of ['ext', 'vf', 'copy', 'c2d']) {
            if (r[k] === NOT_MEASURED) r[k] = await runPath(PROBE_FNS[k], gen);
            if (gen !== sourceGen) return; // 소스가 바뀌었으면 결과 폐기 (T1)
          }
        }
        if (gen !== sourceGen) return;
        if (destroyed || mode === 'baseline') return; // 진단 중 baseline으로 바뀌면 결과를 버린다
        frameProbe = buildFrameProbe(r, t0, probeMode, false);
        if (probeMode === 'single') {
          // 선택 경로가 검지 않으므로 전환 조건이 아니다. 경로·noneStreak 불변.
          if (onProbe) {
            try {
              onProbe(Object.assign({}, frameProbe), path);
            } catch (e) {
              // 콜백 오류가 재생을 방해하지 않게 한다.
            }
          }
          return;
        }
        // 경로가 정해지기 전(null/pending)에는 결과를 따른다. none은 2회 연속일 때만 확정(detach 대상)하고 그 전에는 보류로 재시도한다.
        // 결정 후에는 선택 경로가 검고 다음 단계가 밝을 때 한 단계 아래로만 전환한다 (FIX_GUIDE R2).
        const chosen = detect.choosePath(frameProbe);
        noneStreak = detect.nextNoneStreak(noneStreak, chosen);
        if (path === null || path === 'pending') {
          path = chosen === 'none' && noneStreak < detect.NONE_STREAK_LIMIT ? 'pending' : chosen;
          dirty = true;
          updateVisibility();
          kick();
          if (path === 'pending') {
            pendingCount += 1;
            probeDue = performance.now() + PROBE_PENDING_MS;
            if (pendingCount >= PENDING_MAX && !undecided) {
              undecided = true;
              if (onUndecided) {
                try {
                  onUndecided();
                } catch (e) {
                  // 콜백 오류가 재생을 방해하지 않게 한다.
                }
              }
            }
          }
        } else {
          const down = detect.stepDownPath(path, frameProbe);
          if (down !== path) {
            path = down;
            dirty = true;
            updateVisibility();
            kick();
          }
        }
        if (onProbe) {
          try {
            onProbe(Object.assign({}, frameProbe), path);
          } catch (e) {
            // 콜백 오류가 재생을 방해하지 않게 한다.
          }
        }
      } finally {
        probeBusy = false;
      }
    }

    // 경로 결정 전 첫 회차는 readyState>=2이면 즉시(일시정지 포함, 첫 프레임 표시용).
    // 보류 중에는 재생 중일 때만 1초마다(상한 있음), 결정 후에는 재생 중일 때만 30초마다.
    // stripes 모드와 실행 중에는 건너뜀.
    function probePoll() {
      if (probeBusy || destroyed || !running || !device) return;
      if (document.hidden) return; // 숨긴 탭에서는 측정하지 않는다. 타이머·probeDue는 유지 (T3)
      if (mode === 'stripes' || mode === 'baseline') return;
      if (undecided || path === 'none') return;
      if (video.readyState < 2) return;
      if (path !== null && (video.paused || video.ended)) return;
      const now = performance.now();
      if (now < probeDue) return;
      probeDue = now + PROBE_INTERVAL_MS;
      runProbe().catch(() => {});
    }

    // 일시정지·seek·비가시 구간이 측정 창에 섞이지 않도록 버퍼를 비운다 (FIX_GUIDE Q2).
    function clearRings() {
      frameTimes.length = 0;
      copyTimes.length = 0;
      vfTimes.length = 0;
      loopTs.length = 0;
      srcTs.length = 0;
    }
    const onWake = () => {
      dirty = true;
      clearRings();
      kick();
    };
    // 일시정지로 attach된 경우 첫 프레임용 (FIX_GUIDE L4). 1회 구독이며 detach에서도 해제한다.
    const onLoaded = () => kick();
    const onVisibility = () => {
      if (document.hidden) cancel();
      else {
        dirty = true;
        clearRings();
        kick();
      }
    };

    function start() {
      if (destroyed || running) return initPromise || Promise.resolve();
      running = true;
      updateVisibility();
      video.addEventListener('play', onWake);
      video.addEventListener('seeked', onWake);
      document.addEventListener('visibilitychange', onVisibility);
      if (mode === 'baseline') {
        kick();
        return Promise.resolve();
      }
      return startPipeline();
    }

    // GPU 초기화와 프레임 루프·frameProbe 시작. baseline에서는 호출하지 않는다.
    function startPipeline() {
      if (!initPromise) {
        initPromise = init().catch((e) => fail(e, 'init'));
      }
      return initPromise.then(() => {
        if (!device || destroyed || !running) return;
        if (mode === 'baseline') {
          // 초기화 중 baseline으로 바뀐 경우 방금 만든 GPU 자원을 바로 해제한다.
          releaseGpu();
          return;
        }
        if (video.readyState >= 2) kick();
        else video.addEventListener('loadeddata', onLoaded, { once: true });
        if (probeTimer === null) probeTimer = setInterval(probePoll, PROBE_POLL_MS);
        probePoll();
      });
    }

    function stopProbeTimer() {
      if (probeTimer !== null) clearInterval(probeTimer);
      probeTimer = null;
    }

    // 이전 모드의 GPU 자원 해제. 진행 중인 init은 건드리지 않는다(startPipeline이 끝난 뒤 처리).
    function releaseGpu() {
      if (!device) return;
      try {
        destroyCopyTexture();
        if (ctx) ctx.unconfigure();
        device.destroy();
      } catch (e) {
        // 정리 중 오류는 무시한다.
      }
      device = null;
      ctx = null;
      sampler = null;
      uniformBuf = null;
      pipelines = null;
      probePipeline = null;
      dirty = true;
      for (const k of Object.keys(copyPipelines)) delete copyPipelines[k];
      initPromise = null;
    }

    // baseline 진입: 파이프라인·frameProbe·경로 상태를 모두 정리한다 (FIX_GUIDE S1).
    function enterBaseline() {
      sourceGen += 1;
      cancel();
      stopProbeTimer();
      video.removeEventListener('loadeddata', onLoaded);
      releaseGpu();
      Object.assign(api, {
        gpu: null,
        adapter: null,
        device: null,
        configure: null,
        configRead: null,
      });
      path = null;
      frameProbe = null;
      pendingCount = 0;
      noneStreak = 0;
      vfCreateFails = 0;
      undecided = false;
      probeDue = 0;
      frames = 0;
      sameFrameSkipped = 0;
      copySkipped = 0;
      dirty = true;
      clearRings();
    }

    // 같은 video에서 소스가 바뀐 뒤 경로 결정부터 다시 한다 (PLAN D-M3 M3-1). GPU device·파이프라인은 재사용한다.
    function restartSource() {
      if (destroyed) return;
      sourceGen += 1;
      dirty = true;
      destroyCopyTexture();
      path = null;
      frameProbe = null;
      colorSpace = null;
      pendingCount = 0;
      noneStreak = 0;
      vfCreateFails = 0;
      undecided = false;
      probeDue = 0;
      frames = 0;
      sameFrameSkipped = 0;
      copySkipped = 0;
      lastSrc = null;
      lastCopyTime = null;
      clearRings();
      updateVisibility();
      probePoll();
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
      stopProbeTimer();
    }

    function setMode(next) {
      if (!['itm', 'identity', 'stripes', 'baseline'].includes(next)) return;
      const prev = mode;
      mode = next;
      dirty = true;
      if (next === 'baseline' && prev !== 'baseline') enterBaseline();
      updateVisibility();
      if (prev === 'baseline' && next !== 'baseline') {
        // baseline에서 나올 때는 이전 측정을 섞지 않고 GPU 초기화부터 다시 한다.
        clearRings();
        frames = 0;
        sameFrameSkipped = 0;
        if (running) startPipeline();
        return;
      }
      // 정지 상태에서도 변경이 보이도록 1회 렌더.
      if (device || next === 'baseline') kick();
    }

    // 유니폼 값만 갱신한다(파이프라인 재생성 금지). 정지 상태에서도 반영되도록 1회 렌더를 요청한다.
    // next: { preset, strength, sharpness, saturation } 중 바뀐 값만 담아도 된다(나머지는 유지).
    function setParams(next) {
      if (!next || typeof next !== 'object') return;
      shaderSettings = Object.assign({}, shaderSettings, next);
      writeParams();
      dirty = true;
      if (device && mode === 'itm') kick();
    }

    function destroy() {
      if (destroyed) return;
      stop();
      destroyed = true;
      try {
        destroyCopyTexture();
        if (ctx) ctx.unconfigure();
        if (device) device.destroy();
      } catch (e) {
        // 정리 중 오류는 무시한다.
      }
    }

    function getStats() {
      let vq = null;
      try {
        if (typeof video.getVideoPlaybackQuality === 'function')
          vq = video.getVideoPlaybackQuality();
      } catch (e) {
        // 품질 정보를 못 읽어도 진단은 계속한다.
      }
      return {
        mode,
        preset: shaderSettings.preset === undefined ? null : shaderSettings.preset,
        strength: typeof shaderSettings.strength === 'number' ? shaderSettings.strength : null,
        sharpness: typeof shaderSettings.sharpness === 'number' ? shaderSettings.sharpness : null,
        saturation:
          typeof shaderSettings.saturation === 'number' ? shaderSettings.saturation : null,
        custom:
          shaderSettings.preset === 'custom'
            ? Object.assign({}, globalThis.__sdrhdr.params.curveOf(shaderSettings))
            : null,
        effectivePeak:
          typeof shaderSettings.strength === 'number'
            ? globalThis.__sdrhdr.params.effectivePeak(shaderSettings)
            : null,
        path,
        undecided,
        bypass,
        frames,
        copyTimesMs: copyTimes.slice(),
        copySkipped,
        sameFrameSkipped,
        vfTimesMs: vfTimes.slice(),
        videoDropped: vq ? vq.droppedVideoFrames : null,
        videoTotal: vq ? vq.totalVideoFrames : null,
        api: Object.assign({}, api, {
          configRead: api.configRead && Object.assign({}, api.configRead),
        }),
        frameTimesMs: frameTimes.slice(),
        loopTimestamps: loopTs.slice(),
        srcTimes: srcTs.slice(),
        frameProbe: frameProbe && Object.assign({}, frameProbe),
        colorSpace: colorSpace && Object.assign({}, colorSpace),
      };
    }

    return { start, stop, setMode, setParams, setBypass, restartSource, destroy, getStats };
  }

  globalThis.__sdrhdr.renderer = { createRenderer };
})();
