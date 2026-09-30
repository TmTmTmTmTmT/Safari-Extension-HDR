'use strict';
// 0a 프로브 페이지 UI/GPU 부작용 코드. 미검증(사용자 Mac에서만 동작 확인 가능). (PLAN B절)
(function () {
  const core = globalThis.__probeCore;
  const shaders = globalThis.__probeShaders;
  const FIXTURES = [
    'ramp-1080p60',
    'ramp-2160p60',
    'colorbars-1080p60',
    'colorbars-2160p60',
    'ramp-1080p60-vp9',
  ];
  // 픽스처 이름 -> 파일 경로. VP9 대조용(N3)은 webm이며 G3 일괄 측정(MATRIX_FIXTURES)에는 넣지 않는다.
  function fixtureUrl(name) {
    return '../fixtures/' + (name === 'ramp-1080p60-vp9' ? 'ramp-1080p60.webm' : name + '.mp4');
  }
  // 첫 rVFC 콜백 후 워밍업을 버리고 최대 WINDOW_MAX_SEC를 측정한다 (FIX_GUIDE F2).
  const RUN_MAX_SEC = core.WARMUP_SEC + core.WINDOW_MAX_SEC;
  const GPU_SAMPLE_EVERY = 10;
  const GAP_MS = 1000; // 일괄 측정 run 사이 간격
  // 게이트 대상 설정(B2/B3와 정적 패턴). GUIDELINES 2.5-3: 값 고정.
  const EDR_CFG = core.modeConfig('B2');
  const FORMAT = EDR_CFG.format;

  const state = {
    api: null,
    gpu: null,
    gpuPromise: null,
    errors: [],
    perfRuns: [],
    vp9Paths: [],
    vp9Files: {},
    fixtures: {},
    running: false,
    pending: false,
    contexts: new Set(),
    cancel: null, // 진행 중 run을 즉시 끝내는 함수
    aborted: false, // 일괄 측정 중단/페이지 이탈
    closing: false,
    lastDrawAt: null,
    stepSecondsSinceDraw: null,
    hangHint: false,
    judderResolve: null, // 전체화면 안 끊김 질문 대기 해제 함수
  };
  const $ = (id) => document.getElementById(id);

  function renderErrors() {
    $('errOut').textContent = state.errors.join('\n');
    const banner = $('errBanner');
    banner.hidden = state.errors.length === 0;
    const lines = state.errors.slice(-5);
    if (state.hangHint) lines.unshift(core.GPU_HINT);
    $('errBannerText').textContent = lines.join('\n');
  }

  function logError(where, e) {
    const msg = e && e.message ? e.message : String(e);
    if (core.isTimeoutError(e)) state.hangHint = true;
    state.errors.push(
      where + ': ' + msg + (core.isTimeoutError(e) ? ' (' + core.GPU_HINT + ')' : ''),
    );
    renderErrors();
  }

  // H1: 응답 없는 요청이 모든 기능을 막지 않도록 각 요청에 타임아웃을 둔다. 진행 중 요청은 공유한다.
  function getGpu() {
    if (state.gpu) return Promise.resolve(state.gpu);
    if (!state.gpuPromise) {
      state.gpuPromise = initGpu().catch((e) => {
        state.gpuPromise = null;
        throw e;
      });
    }
    return state.gpuPromise;
  }

  async function initGpu() {
    if (!navigator.gpu) throw new Error('navigator.gpu 없음');
    const adapter = await core.withTimeout(
      navigator.gpu.requestAdapter(),
      core.GPU_TIMEOUT_MS,
      'requestAdapter',
    );
    if (!adapter) throw new Error('requestAdapter()가 null');
    let device = null;
    let timestamps = false;
    if (adapter.features.has('timestamp-query')) {
      try {
        device = await core.withTimeout(
          adapter.requestDevice({ requiredFeatures: ['timestamp-query'] }),
          core.GPU_TIMEOUT_MS,
          'requestDevice(timestamp-query)',
        );
        timestamps = true;
      } catch (e) {
        logError('requestDevice(timestamp-query)', e);
        if (core.isTimeoutError(e)) throw e;
      }
    }
    if (!device) {
      device = await core.withTimeout(
        adapter.requestDevice(),
        core.GPU_TIMEOUT_MS,
        'requestDevice',
      );
    }
    device.lost.then((info) => {
      if (!state.closing) logError('device.lost', new Error(info.reason + ' ' + info.message));
    });
    device.addEventListener('uncapturederror', (ev) => logError('uncapturederror', ev.error));
    state.gpu = { adapter, device, timestamps };
    return state.gpu;
  }

  // cfg 기본값은 EDR 고정 설정. B1(bgra8unorm/srgb, toneMapping 없음)은 프로브 전용 진단 설정이다.
  function configureCanvas(canvas, device, cfg) {
    const c = cfg || EDR_CFG;
    const ctx = canvas.getContext('webgpu');
    const conf = { device, format: c.format, colorSpace: c.colorSpace };
    if (c.toneMapping) conf.toneMapping = c.toneMapping;
    ctx.configure(conf);
    state.contexts.add(ctx);
    return ctx;
  }

  function unconfigureCanvas(ctx) {
    if (!ctx) return;
    state.contexts.delete(ctx);
    try {
      ctx.unconfigure();
    } catch (e) {
      // 정리 중 오류는 무시한다.
    }
  }

  // video 디코더 해제: pause 후 src 제거 + load().
  function releaseVideo(video) {
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch (e) {
      // 정리 중 오류는 무시한다.
    }
  }

  // H1-2: pagehide에서 자원을 반납해 Safari GPU 프로세스에 남기지 않는다.
  function cleanup() {
    state.closing = true;
    state.aborted = true;
    if (state.cancel) state.cancel();
    if (state.judderResolve) state.judderResolve();
    clearInterval(state.ageTimer);
    for (const ctx of Array.from(state.contexts)) unconfigureCanvas(ctx);
    if (state.gpu) {
      try {
        state.gpu.device.destroy();
      } catch (e) {
        // 정리 중 오류는 무시한다.
      }
      state.gpu = null;
    }
    releaseVideo($('origVideo'));
  }

  // ---------- P0-1 ----------
  async function collectApi() {
    const api = {
      secureContext: !!globalThis.isSecureContext,
      navigatorGpu: !!navigator.gpu,
      adapter: null,
      timestampQuery: false,
      preferredFormat: null,
      configure: { ok: null, error: null },
      getConfiguration: {
        supported: false,
        format: null,
        colorSpace: null,
        toneMappingMode: null,
        error: null,
      },
      mediaQueries: {
        dynamicRangeHigh: matchMedia('(dynamic-range: high)').matches,
        colorGamutP3: matchMedia('(color-gamut: p3)').matches,
      },
      canvas2dFloat16: { supported: false, colorType: null, error: null },
      webgl: { webgl2: false, drawingBufferStorage: false, error: null },
      batteryApi: typeof navigator.getBattery === 'function',
    };
    try {
      const gpu = await getGpu();
      const info = gpu.adapter.info || {};
      api.adapter = {
        features: Array.from(gpu.adapter.features).sort(),
        vendor: info.vendor || null,
        architecture: info.architecture || null,
        device: info.device || null,
        description: info.description || null,
      };
      api.timestampQuery = gpu.adapter.features.has('timestamp-query');
      api.preferredFormat = navigator.gpu.getPreferredCanvasFormat();
      const canvas = document.createElement('canvas');
      let ctx = null;
      try {
        ctx = configureCanvas(canvas, gpu.device);
        api.configure.ok = true;
        if (typeof ctx.getConfiguration === 'function') {
          api.getConfiguration.supported = true;
          try {
            const c = ctx.getConfiguration();
            api.getConfiguration.format = c ? c.format || null : null;
            api.getConfiguration.colorSpace = c ? c.colorSpace || null : null;
            api.getConfiguration.toneMappingMode = c && c.toneMapping ? c.toneMapping.mode : null;
          } catch (e) {
            api.getConfiguration.error = String(e && e.message ? e.message : e);
          }
        }
      } catch (e) {
        api.configure.ok = false;
        api.configure.error = String(e && e.message ? e.message : e);
      }
      unconfigureCanvas(ctx);
    } catch (e) {
      api.configure.error = String(e && e.message ? e.message : e);
      logError('P0-1 gpu', e);
    }
    try {
      const ctx2d = document.createElement('canvas').getContext('2d', { colorType: 'float16' });
      if (ctx2d) {
        const attrs =
          typeof ctx2d.getContextAttributes === 'function' ? ctx2d.getContextAttributes() : {};
        api.canvas2dFloat16.colorType = attrs && attrs.colorType ? attrs.colorType : null;
        api.canvas2dFloat16.supported = api.canvas2dFloat16.colorType === 'float16';
      }
    } catch (e) {
      api.canvas2dFloat16.error = String(e && e.message ? e.message : e);
    }
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      api.webgl.webgl2 = !!gl;
      api.webgl.drawingBufferStorage = !!gl && typeof gl.drawingBufferStorage === 'function';
    } catch (e) {
      api.webgl.error = String(e && e.message ? e.message : e);
    }
    state.api = api;
    $('apiOut').textContent =
      (state.hangHint && !state.gpu ? core.GPU_HINT + '\n\n' : '') + JSON.stringify(api, null, 2);
    return api;
  }

  function collectEnv() {
    const dpr = globalThis.devicePixelRatio;
    return {
      macOS: $('envMacos').value.trim() || null,
      safari: core.parseSafariVersion(navigator.userAgent),
      chip: $('envChip').value.trim() || null,
      display: $('envDisplay').value.trim() || null,
      power: $('envPower').value || null,
      sdrBrightness: $('envBrightness').value || null,
      refreshRate: $('envRefresh').value || null,
      ua: navigator.userAgent,
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        dpr,
        colorDepth: screen.colorDepth,
      },
    };
  }

  // ---------- 정적 셰이더 렌더 (P0-2, P0-3) ----------
  function renderStatic(gpu, canvas, code, color) {
    const device = gpu.device;
    const ctx = configureCanvas(canvas, device, EDR_CFG);
    const module = device.createShaderModule({ code });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
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
    if (color) {
      const buffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(buffer, 0, new Float32Array(color));
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer } }],
        }),
      );
    }
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  async function drawStripes() {
    try {
      renderStatic(await getGpu(), $('stripes'), shaders.STRIPES);
      state.lastDrawAt = performance.now();
      updateDrawAge();
    } catch (e) {
      logError('P0-2 stripes', e);
    }
  }

  async function drawPatches() {
    try {
      const gpu = await getGpu();
      renderStatic(gpu, $('patchA'), shaders.PATCH, [0.5, 0.5, 0.5, 1]);
      renderStatic(gpu, $('patchB'), shaders.PATCH, [0.5, 0.5, 0.5, 1]);
    } catch (e) {
      logError('P0-3 patches', e);
    }
  }

  // H4: 마지막 그리기 후 경과 초 표시. 선택 시점의 값을 edr.secondsSinceDraw로 기록한다.
  function currentSecondsSinceDraw() {
    return core.secondsSinceDraw(state.lastDrawAt, performance.now());
  }

  function updateDrawAge() {
    const s = currentSecondsSinceDraw();
    $('drawAge').textContent = s === null ? '-' : String(s);
  }

  function buildStepUi() {
    const labels = $('stepLabels');
    const choices = $('stepChoices');
    for (const s of shaders.STEPS) {
      const span = document.createElement('span');
      span.textContent = String(s);
      labels.appendChild(span);
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'edrstep';
      radio.value = String(s);
      radio.addEventListener('change', () => {
        state.stepSecondsSinceDraw = currentSecondsSinceDraw();
      });
      label.appendChild(radio);
      label.appendChild(
        document.createTextNode(s === 1.0 ? ' 1.0 (SDR white 위로 구분되는 단계 없음)' : ' ' + s),
      );
      choices.appendChild(label);
    }
  }

  // ---------- P0-4 ----------
  async function checkFixtures() {
    const list = $('fixtureList');
    list.textContent = '';
    for (const name of FIXTURES) {
      let ok = false;
      try {
        const r = await fetch(fixtureUrl(name), { method: 'HEAD' });
        ok = r.ok;
      } catch (e) {
        ok = false;
      }
      state.fixtures[name] = ok;
      const btn = document.createElement('button');
      btn.textContent = name + (ok ? ' 창 실행' : ' (픽스처 없음)');
      btn.disabled = !ok;
      btn.addEventListener('click', () => runFixture(name));
      list.appendChild(btn);
      const fsBtn = document.createElement('button');
      fsBtn.textContent = name + ' 전체화면 측정';
      fsBtn.disabled = !ok;
      fsBtn.addEventListener('click', () => runFixtureFullscreen(name));
      list.appendChild(fsBtn);
      list.appendChild(document.createElement('br'));
    }
    $('btnMatrix').disabled = !core.MATRIX_FIXTURES.every((f) => state.fixtures[f]);
    await checkVp9Files();
  }

  // P0-6 대상 파일 존재 확인. G3 일괄 측정 목록(FIXTURES, MATRIX_FIXTURES)과는 별개다.
  async function checkVp9Files() {
    for (const t of core.VP9_TARGETS) {
      let ok = false;
      try {
        ok = (await fetch('../fixtures/' + t.file, { method: 'HEAD' })).ok;
      } catch (e) {
        ok = false;
      }
      state.vp9Files[t.file] = ok;
    }
    $('btnVp9').disabled = !core.VP9_TARGETS.some((t) => state.vp9Files[t.file]);
  }

  function setStatus(t) {
    $('runStatus').textContent = t;
  }

  function renderRunTable() {
    const cols = [
      'fixture',
      'mode',
      'driver',
      'layout',
      'itm',
      'srcRes',
      'canvasRes',
      'fullscreen',
      'frames',
      'windowSec',
      'fps',
      'dropRate',
      'dropRatePresented',
      'missRate',
      'loopFps',
      'videoPresentedFps',
      'jsP50',
      'jsP95',
      'gpuMs',
    ];
    const t = $('runTable');
    t.textContent = '';
    const head = t.insertRow();
    for (const c of cols) head.insertCell().textContent = c;
    for (const r of state.perfRuns) {
      const row = t.insertRow();
      for (const c of cols) row.insertCell().textContent = r[c] === null ? '-' : String(r[c]);
    }
  }

  function fixtureFps(name) {
    const m = /p(\d+)$/.exec(name);
    return m ? Number(m[1]) : 60;
  }

  function inFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function nextFrames() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  // 1회 측정. opts = { mode: 'R0'|'R2'|'R3'|'V3'|'B0'~'B3'|'split', layout: 'overlay'|'split', itm } .
  // 중단되면 null (run 기록 안 함). state.running 관리는 호출자가 한다.
  async function runMeasurement(name, opts) {
    const mode = opts.mode;
    const layout = opts.layout;
    const cfg =
      mode === 'split'
        ? Object.assign({}, EDR_CFG, { itm: !!opts.itm, driver: 'rvfc' })
        : core.modeConfig(mode);
    const video = $('origVideo');
    const canvas = $('vidCanvas');
    let ctx = null;
    let querySet = null;
    let resolveBuf = null;
    let readBuf = null;
    try {
      setStatus(name + ' ' + mode + ' 로딩...');
      video.src = fixtureUrl(name);
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('video 로드 실패'));
      });
      if (state.aborted) return null;
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;

      let gpu = null;
      let device = null;
      let pipeline = null;
      let sampler = null;
      let res = { width: canvas.width, height: canvas.height };
      if (cfg.canvas) {
        gpu = await getGpu();
        device = gpu.device;
        // R0/B0에서 숨긴 캔버스를 다시 보이게 한 뒤 표시 크기를 잰다.
        canvas.style.display = '';
        const rect = video.getBoundingClientRect();
        res = core.canvasResolution(
          srcW,
          srcH,
          rect.width,
          rect.height,
          globalThis.devicePixelRatio || 1,
        );
        if (!res) throw new Error('캔버스 해상도 계산 실패 (표시 크기 0)');
        canvas.width = res.width;
        canvas.height = res.height;
        ctx = configureCanvas(canvas, device, cfg);
        const module = device.createShaderModule({
          code: cfg.itm ? shaders.VIDEO_ITM : shaders.VIDEO_IDENTITY,
        });
        pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format: cfg.format }] },
          primitive: { topology: 'triangle-list' },
        });
        sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        if (gpu.timestamps) {
          querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
          resolveBuf = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          });
          readBuf = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          });
        }
      } else {
        // R0/B0: 캔버스를 만들지 않는다. 구동 콜백 시각과 관측 rVFC만 기록한다.
        canvas.style.display = 'none';
        res = null;
      }

      // loop: 구동 콜백마다 1건(R0도 콜백 시각만 기록). obs: 관측 전용 rVFC. 창 집계는 core.runStats가 한다.
      const loop = [];
      const obs = [];
      let frames = 0;
      let gpuBusy = false;
      let finished = false;
      const fullscreen = inFullscreen();
      let wallStart = 0;
      let loopStartTs = 0;
      let rafId = null;
      let obsId = null;
      let drvId = null;

      // 구동 콜백 1회분: (캔버스가 있으면) importExternalTexture 재import -> 렌더 -> 기록. 반환값 true면 run 종료 시간.
      // ts: raf는 rAF timestamp, rvfc는 null(콜백 진입 시각 사용).
      const step = (ts) => {
        const t0 = performance.now();
        const stamp = ts === null ? t0 : ts;
        if (frames === 0) {
          wallStart = t0;
          loopStartTs = stamp;
        }
        const sample = !!querySet && !gpuBusy && frames % GPU_SAMPLE_EVERY === 0;
        if (cfg.canvas) {
          const tex = device.importExternalTexture({ source: video });
          const bind = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: sampler },
              { binding: 1, resource: tex },
            ],
          });
          const enc = device.createCommandEncoder();
          const desc = {
            colorAttachments: [
              {
                view: ctx.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
              },
            ],
          };
          if (sample) {
            desc.timestampWrites = {
              querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            };
          }
          const pass = enc.beginRenderPass(desc);
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bind);
          pass.draw(3);
          pass.end();
          if (sample) {
            enc.resolveQuerySet(querySet, 0, 2, resolveBuf, 0);
            enc.copyBufferToBuffer(resolveBuf, 0, readBuf, 0, 16);
          }
          device.queue.submit([enc.finish()]);
        }
        const rec = { t: stamp, js: performance.now() - t0, gpu: null };
        loop.push(rec);
        if (sample) {
          gpuBusy = true;
          readBuf
            .mapAsync(GPUMapMode.READ)
            .then(() => {
              const a = new BigUint64Array(readBuf.getMappedRange().slice(0));
              rec.gpu = Number(a[1] - a[0]) / 1e6;
              readBuf.unmap();
              gpuBusy = false;
            })
            .catch((e) => {
              gpuBusy = false;
              if (!finished) logError('gpu timestamp readback', e);
            });
        }
        frames++;
        return (stamp - loopStartTs) / 1000 >= RUN_MAX_SEC;
      };

      const done = new Promise((resolve) => {
        const finish = () => {
          if (finished) return;
          finished = true;
          state.cancel = null;
          try {
            if (rafId !== null) cancelAnimationFrame(rafId);
            if (obsId !== null) video.cancelVideoFrameCallback(obsId);
            if (drvId !== null) video.cancelVideoFrameCallback(drvId);
          } catch (e) {
            // 정리 중 오류는 무시한다.
          }
          resolve();
        };
        state.cancel = finish;
        video.onended = finish;

        // 관측 전용 rVFC: 렌더하지 않고 presentedFrames/mediaTime만 기록한다 (FIX_GUIDE J1-2).
        const onObs = (now, meta) => {
          if (finished) return;
          obs.push({
            t: performance.now(),
            mediaTime: meta.mediaTime,
            presented: typeof meta.presentedFrames === 'number' ? meta.presentedFrames : null,
          });
          obsId = video.requestVideoFrameCallback(onObs);
        };
        obsId = video.requestVideoFrameCallback(onObs);

        if (cfg.driver === 'raf') {
          // video가 일시정지·ended면 렌더하지 않고 루프만 유지한다.
          const onRaf = (ts) => {
            if (finished) return;
            try {
              if (!video.paused && !video.ended && step(ts)) {
                finish();
                return;
              }
              rafId = requestAnimationFrame(onRaf);
            } catch (e) {
              logError('P0-4 frame', e);
              finish();
            }
          };
          rafId = requestAnimationFrame(onRaf);
        } else {
          const onFrame = () => {
            if (finished) return;
            try {
              if (step(null)) {
                finish();
                return;
              }
              drvId = video.requestVideoFrameCallback(onFrame);
            } catch (e) {
              logError('P0-4 frame', e);
              finish();
            }
          };
          drvId = video.requestVideoFrameCallback(onFrame);
        }
      });

      setStatus(
        name + ' 실행 중 (' + mode + ' ' + cfg.driver + (cfg.itm ? ' ITM' : ' identity') + ')...',
      );
      await video.play();
      await done;
      if (state.aborted) return null;
      const wallSeconds = (performance.now() - wallStart) / 1000;
      // 전체화면 여부는 run 종료 시점에도 유지된 경우만 true로 기록한다.
      const fullscreenEnd = inFullscreen();
      video.pause();
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
      const win = core.runStats(loop, obs, { fps: fixtureFps(name) });
      const run = core.buildRun({
        fixture: name,
        mode,
        driver: cfg.driver,
        layout,
        itm: cfg.itm,
        srcW,
        srcH,
        canvasW: res ? res.width : null,
        canvasH: res ? res.height : null,
        fullscreen: fullscreen && fullscreenEnd,
        frames,
        wallSeconds,
        warmupSec: win.warmupSec,
        windowSec: win.windowSec,
        windowFrames: win.frames,
        dropRate: win.dropRate,
        dropRatePresented: win.dropRatePresented,
        missRate: win.missRate,
        loopFps: win.loopFps,
        videoPresentedFps: win.videoPresentedFps,
        jsTimes: win.jsTimes,
        gpuTimes: win.gpuTimes,
        videoQuality: q ? { dropped: q.droppedVideoFrames, total: q.totalVideoFrames } : null,
      });
      if (!gpuBusy) {
        for (const b of [querySet, resolveBuf, readBuf]) if (b) b.destroy();
      }
      return run;
    } finally {
      state.cancel = null;
      unconfigureCanvas(ctx);
    }
  }

  // 기존 "창 실행" / "전체화면 측정" 경로 (좌우 분할, mode 'split').
  async function runFixture(name, opts) {
    if (state.running) return;
    state.running = true;
    state.aborted = false;
    try {
      const run = await runMeasurement(name, {
        mode: 'split',
        layout: 'split',
        itm: $('vmode').value === 'itm',
      });
      if (run) {
        state.perfRuns.push(run);
        renderRunTable();
        setStatus(name + ' 완료');
      }
    } catch (e) {
      logError('P0-4 ' + name, e);
      setStatus(name + ' 실패: ' + (e && e.message ? e.message : e));
    } finally {
      state.running = false;
      if (opts && opts.autoExitFullscreen) exitFullscreen();
    }
  }

  function exitFullscreen() {
    if (!inFullscreen()) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try {
      const p = exit.call(document);
      if (p && p.catch) p.catch((e) => logError('exitFullscreen', e));
    } catch (e) {
      logError('exitFullscreen', e);
    }
  }

  // 클릭 처리기 안에서 동기적으로 호출해야 사용자 제스처 요건을 충족한다.
  // fullscreenchange(진입)까지 기다리는 Promise. 3초 내 없으면 reject. 미검증(사용자 Mac).
  function enterFullscreen(el) {
    return new Promise((resolve, reject) => {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (!req) {
        reject(new Error('requestFullscreen 없음'));
        return;
      }
      let timer = null;
      const cleanupListeners = () => {
        clearTimeout(timer);
        document.removeEventListener('fullscreenchange', onChange);
        document.removeEventListener('webkitfullscreenchange', onChange);
      };
      const onChange = () => {
        if (!inFullscreen()) return;
        cleanupListeners();
        resolve();
      };
      document.addEventListener('fullscreenchange', onChange);
      document.addEventListener('webkitfullscreenchange', onChange);
      timer = setTimeout(() => {
        cleanupListeners();
        reject(new Error('fullscreenchange 3초 내 없음'));
      }, 3000);
      try {
        const p = req.call(el);
        if (p && p.catch) {
          p.catch((e) => {
            cleanupListeners();
            reject(e);
          });
        }
      } catch (e) {
        cleanupListeners();
        reject(e);
      }
    });
  }

  function runFixtureFullscreen(name) {
    if (state.running || state.pending) return;
    state.pending = true;
    enterFullscreen($('stage')).then(
      // 전체화면 레이아웃이 반영된 뒤 캔버스 크기를 측정하도록 두 프레임 기다린다.
      async () => {
        state.pending = false;
        await nextFrames();
        runFixture(name, { autoExitFullscreen: true });
      },
      (e) => {
        state.pending = false;
        logError('fullscreen', e);
        setStatus(name + ' 전체화면 진입 실패');
      },
    );
  }

  // H2: G3 진단 일괄 측정. 클릭 1회로 전체화면 진입 -> 8 run -> 해제.
  function runMatrix() {
    if (state.running || state.pending) return;
    for (const f of core.MATRIX_FIXTURES) {
      if (!state.fixtures[f]) {
        setStatus('일괄 측정 불가: 픽스처 없음 (' + f + ')');
        return;
      }
    }
    const stage = $('stage');
    state.pending = true;
    stage.classList.add('overlay');
    const p = enterFullscreen(stage);
    p.then(
      async () => {
        state.pending = false;
        await nextFrames();
        await matrixLoop(stage);
      },
      (e) => {
        state.pending = false;
        stage.classList.remove('overlay');
        logError('fullscreen', e);
        setStatus('일괄 측정: 전체화면 진입 실패');
      },
    );
  }

  async function matrixLoop(stage) {
    const plan = core.matrixPlan(core.MATRIX_FIXTURES);
    const progress = $('matrixProgress');
    const onFsChange = () => {
      if (inFullscreen()) return;
      state.aborted = true;
      if (state.cancel) state.cancel();
      if (state.judderResolve) state.judderResolve();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    state.running = true;
    state.aborted = false;
    let completed = 0;
    progress.hidden = false;
    try {
      for (let i = 0; i < plan.length; i++) {
        if (i > 0) await sleep(GAP_MS);
        if (state.aborted) break;
        const step = plan[i];
        progress.textContent = core.progressText(i + 1, plan.length, step);
        const run = await runMeasurement(step.fixture, { mode: step.mode, layout: 'overlay' });
        if (!run) break;
        state.perfRuns.push(run);
        renderRunTable();
        completed++;
      }
      // J3: 전체화면 안에서 끊김 질문. 나가면 질문이 닫히고 페이지에서 고를 수 있다.
      if (completed === plan.length && !state.aborted) await askJudder();
    } catch (e) {
      logError('G3 일괄 측정', e);
    } finally {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      const interrupted = completed < plan.length;
      progress.hidden = true;
      state.running = false;
      state.aborted = false;
      releaseVideo($('origVideo'));
      $('vidCanvas').style.display = '';
      exitFullscreen();
      stage.classList.remove('overlay');
      setStatus(
        interrupted
          ? '일괄 측정 중단: 완료 ' + completed + ' / ' + plan.length + ' run만 기록'
          : '일괄 측정 완료: ' + completed + ' / ' + plan.length,
      );
    }
  }

  // 끊김 질문 답 = select#judderChoice 값. 전체화면 안 버튼과 페이지 select가 같은 값을 공유한다.
  function askJudder() {
    const box = $('judderPrompt');
    box.hidden = false;
    return new Promise((resolve) => {
      const close = () => {
        box.hidden = true;
        state.judderResolve = null;
        for (const b of box.querySelectorAll('button[data-judder]')) b.onclick = null;
        resolve();
      };
      state.judderResolve = close;
      for (const b of box.querySelectorAll('button[data-judder]')) {
        b.onclick = () => {
          $('judderChoice').value = b.dataset.judder;
          close();
        };
      }
    });
  }

  function updateG3Warning(env, runs) {
    const el = $('g3Warn');
    el.textContent = core.hasG3OverlayRun(runs, env.power)
      ? ''
      : '경고: G3 조건(전원 연결 + 전체화면 + overlay 배치)을 만족하는 run이 없다. 전원 선택과 "G3 진단 일괄 측정" 버튼 사용을 확인한다. (export는 진행됨)';
  }

  // ---------- P0-6 VP9 입력 방식 (FIX_GUIDE Q3) ----------
  // 변형 1회 측정. 미검증(사용자 Mac에서만 동작 확인 가능). 중단되면 null. 예외는 errorName으로 기록하고 건너뛴다.
  async function runVp9Variant(file, variant) {
    const video = $('origVideo');
    const canvas = $('vidCanvas');
    const base = { fixture: file, variant };
    let ctx = null;
    let tex2d = null;
    let srcW = null;
    let srcH = null;
    let res = null;
    const fullscreenStart = inFullscreen();
    try {
      setVp9Status(file + ' ' + variant + ' 로딩...');
      video.src = '../fixtures/' + file;
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('video 로드 실패'));
      });
      if (state.aborted) return null;
      srcW = video.videoWidth;
      srcH = video.videoHeight;
      const gpu = await getGpu();
      const device = gpu.device;
      canvas.style.display = '';
      const rect = video.getBoundingClientRect();
      res = core.canvasResolution(
        srcW,
        srcH,
        rect.width,
        rect.height,
        globalThis.devicePixelRatio || 1,
      );
      if (!res) throw new Error('캔버스 해상도 계산 실패 (표시 크기 0)');
      canvas.width = res.width;
      canvas.height = res.height;
      ctx = configureCanvas(canvas, device, EDR_CFG);

      const useExt = variant === 'V-ext' || variant === 'V-vf';
      const isBmp = variant === 'V-bmp' || variant === 'V-bmpR';
      const module = device.createShaderModule({
        code: useExt ? shaders.VIDEO_IDENTITY : shaders.VIDEO_IDENTITY_2D,
      });
      const makePipeline = (format) =>
        device.createRenderPipeline({
          layout: 'auto',
          vertex: { module, entryPoint: 'vs' },
          fragment: { module, entryPoint: 'fs', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        });
      const pipeline = makePipeline(EDR_CFG.format);
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

      // 일반 2D 텍스처(복사·비트맵 변형). bmpR은 캔버스 크기, 나머지는 원본 크기.
      let texW = srcW;
      let texH = srcH;
      let texView = null;
      if (!useExt) {
        if (variant === 'V-bmpR') {
          texW = res.width;
          texH = res.height;
        }
        tex2d = device.createTexture({
          size: [texW, texH],
          format: variant === 'V-copyB' ? 'bgra8unorm' : 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        texView = tex2d.createView();
      }

      // 비동기 변형: 렌더 루프를 기다리지 않고 이전 결과 텍스처로 렌더한다. 동시에 1건만 진행.
      let inflight = false;
      let asyncErr = null;
      const asyncSamples = [];
      const startBitmap = () => {
        inflight = true;
        const t0 = performance.now();
        const p =
          variant === 'V-bmpR'
            ? createImageBitmap(video, { resizeWidth: res.width, resizeHeight: res.height })
            : createImageBitmap(video);
        p.then((bm) => {
          try {
            device.queue.copyExternalImageToTexture({ source: bm }, { texture: tex2d }, [
              Math.min(bm.width, texW),
              Math.min(bm.height, texH),
            ]);
          } finally {
            bm.close();
          }
          const now = performance.now();
          asyncSamples.push({ t: now, ms: now - t0 });
          inflight = false;
        }).catch((e) => {
          asyncErr = asyncErr || e;
          inflight = false;
        });
      };

      // 입력 준비(동기 부분). 반환 resource를 bind group 1번에 넣고, frame이 있으면 렌더 후 닫는다.
      const prepareInput = (startAsync) => {
        if (variant === 'V-ext')
          return { resource: device.importExternalTexture({ source: video }) };
        if (variant === 'V-vf') {
          const frame = new VideoFrame(video);
          return { resource: device.importExternalTexture({ source: frame }), frame };
        }
        if (isBmp) {
          if (startAsync && !inflight) startBitmap();
        } else if (startAsync) {
          device.queue.copyExternalImageToTexture({ source: video }, { texture: tex2d }, [
            srcW,
            srcH,
          ]);
        }
        return { resource: texView };
      };

      const encodeDraw = (enc, view, pipe, resource) => {
        const bind = device.createBindGroup({
          layout: pipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: sampler },
            { binding: 1, resource },
          ],
        });
        const pass = enc.beginRenderPass({
          colorAttachments: [
            { view, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
          ],
        });
        pass.setPipeline(pipe);
        pass.setBindGroup(0, bind);
        pass.draw(3);
        pass.end();
      };

      const loop = [];
      let loopStartTs = null;
      let q0 = null;
      let q1 = null;
      const quality = () =>
        video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
      const totalSec = core.VP9_WARMUP_SEC + core.VP9_WINDOW_SEC;
      const step = (ts) => {
        if (asyncErr) throw asyncErr;
        const t0 = performance.now();
        if (loopStartTs === null) loopStartTs = ts;
        const elapsed = (ts - loopStartTs) / 1000;
        if (q0 === null && elapsed >= core.VP9_WARMUP_SEC) q0 = quality();
        const input = prepareInput(true);
        const enc = device.createCommandEncoder();
        encodeDraw(enc, ctx.getCurrentTexture().createView(), pipeline, input.resource);
        device.queue.submit([enc.finish()]);
        if (input.frame) input.frame.close();
        loop.push({ t: ts, js: performance.now() - t0 });
        return elapsed >= totalSec;
      };

      setVp9Status(file + ' ' + variant + ' 실행 중...');
      await video.play();
      await new Promise((resolve, reject) => {
        let rafId = null;
        let finished = false;
        const finish = (err) => {
          if (finished) return;
          finished = true;
          state.cancel = null;
          if (rafId !== null) cancelAnimationFrame(rafId);
          if (err) reject(err);
          else resolve();
        };
        state.cancel = () => finish();
        video.onended = () => finish();
        const onRaf = (ts) => {
          if (finished) return;
          try {
            if (!video.paused && !video.ended && step(ts)) {
              finish();
              return;
            }
            rafId = requestAnimationFrame(onRaf);
          } catch (e) {
            finish(e);
          }
        };
        rafId = requestAnimationFrame(onRaf);
      });
      if (state.aborted) return null;
      if (asyncErr) throw asyncErr;
      q1 = quality();
      const fullscreen = fullscreenStart && inFullscreen();
      video.pause();

      // 출력 평균 밝기: 마지막 프레임을 64x36 rgba8unorm으로 1회 되읽는다. 실패해도 변형 기록은 남긴다.
      let brightness = null;
      try {
        if (isBmp) {
          for (let i = 0; i < 10 && inflight; i++) await sleep(50);
        }
        const rt = device.createTexture({
          size: [core.READBACK_W, core.READBACK_H],
          format: 'rgba8unorm',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        const bpr = core.alignBytesPerRow(core.READBACK_W * 4);
        const buf = device.createBuffer({
          size: bpr * core.READBACK_H,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });
        try {
          const input = prepareInput(false);
          const enc = device.createCommandEncoder();
          encodeDraw(enc, rt.createView(), makePipeline('rgba8unorm'), input.resource);
          enc.copyTextureToBuffer({ texture: rt }, { buffer: buf, bytesPerRow: bpr }, [
            core.READBACK_W,
            core.READBACK_H,
          ]);
          device.queue.submit([enc.finish()]);
          if (input.frame) input.frame.close();
          await core.withTimeout(buf.mapAsync(GPUMapMode.READ), core.GPU_TIMEOUT_MS, 'readback');
          const data = new Uint8Array(buf.getMappedRange().slice(0));
          buf.unmap();
          brightness = core.meanBrightness(data, core.READBACK_W, core.READBACK_H, bpr);
        } finally {
          rt.destroy();
          buf.destroy();
        }
      } catch (e) {
        logError('P0-6 readback ' + file + ' ' + variant, e);
      }

      return core.buildVp9Path(
        Object.assign({}, base, {
          srcW,
          srcH,
          canvasW: res.width,
          canvasH: res.height,
          fullscreen,
          loop,
          asyncSamples,
          meanBrightness: brightness,
          videoDropped: q0 && q1 ? q1.droppedVideoFrames - q0.droppedVideoFrames : null,
          videoTotal: q0 && q1 ? q1.totalVideoFrames - q0.totalVideoFrames : null,
        }),
      );
    } catch (e) {
      if (state.aborted) return null;
      logError('P0-6 ' + file + ' ' + variant, e);
      return core.buildVp9Path(
        Object.assign({}, base, {
          srcW,
          srcH,
          canvasW: res ? res.width : null,
          canvasH: res ? res.height : null,
          fullscreen: fullscreenStart && inFullscreen(),
          errorName: e && e.name ? String(e.name) : 'Error',
        }),
      );
    } finally {
      state.cancel = null;
      if (tex2d) tex2d.destroy();
      unconfigureCanvas(ctx);
      releaseVideo(video);
    }
  }

  function setVp9Status(t) {
    $('vp9Status').textContent = t;
  }

  function renderVp9Table() {
    const cols = [
      'fixture',
      'variant',
      'srcRes',
      'canvasRes',
      'frames',
      'jsP50',
      'jsP95',
      'jsMax',
      'asyncP50',
      'asyncP95',
      'displayMissRate',
      'displayHz',
      'loopFps',
      'meanBrightness',
      'videoDropped',
      'videoTotal',
      'errorName',
    ];
    const t = $('vp9Table');
    t.textContent = '';
    const head = t.insertRow();
    for (const c of cols) head.insertCell().textContent = c;
    for (const r of state.vp9Paths) {
      const row = t.insertRow();
      for (const c of cols) row.insertCell().textContent = r[c] === null ? '-' : String(r[c]);
    }
  }

  // 클릭 1회로 전체화면 진입 -> 변형 순차 실행 -> 해제. 사용자 제스처 안에서 동기 호출해야 한다.
  function runVp9Batch() {
    if (state.running || state.pending) return;
    if (!core.VP9_TARGETS.some((t) => state.vp9Files[t.file])) {
      setVp9Status('일괄 측정 불가: 픽스처 없음');
      return;
    }
    const stage = $('stage');
    state.pending = true;
    stage.classList.add('overlay');
    enterFullscreen(stage).then(
      async () => {
        state.pending = false;
        await nextFrames();
        await vp9Loop(stage);
      },
      (e) => {
        state.pending = false;
        stage.classList.remove('overlay');
        logError('fullscreen', e);
        setVp9Status('일괄 측정: 전체화면 진입 실패');
      },
    );
  }

  async function vp9Loop(stage) {
    const plan = core.vp9Plan().filter((p) => state.vp9Files[p.fixture]);
    const progress = $('matrixProgress');
    const onFsChange = () => {
      if (inFullscreen()) return;
      state.aborted = true;
      if (state.cancel) state.cancel();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    state.running = true;
    state.aborted = false;
    state.vp9Paths = [];
    renderVp9Table();
    let completed = 0;
    progress.hidden = false;
    try {
      for (let i = 0; i < plan.length; i++) {
        if (i > 0) await sleep(GAP_MS);
        if (state.aborted) break;
        progress.textContent = core.vp9ProgressText(i + 1, plan.length, plan[i]);
        const rec = await runVp9Variant(plan[i].fixture, plan[i].variant);
        if (!rec) break;
        state.vp9Paths.push(rec);
        renderVp9Table();
        completed++;
      }
    } catch (e) {
      logError('P0-6 일괄 측정', e);
    } finally {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      progress.hidden = true;
      state.running = false;
      state.aborted = false;
      releaseVideo($('origVideo'));
      $('vidCanvas').style.display = '';
      exitFullscreen();
      stage.classList.remove('overlay');
      setVp9Status(
        completed < plan.length
          ? '일괄 측정 중단: 완료 ' + completed + ' / ' + plan.length + ' 변형만 기록'
          : '일괄 측정 완료: ' + completed + ' / ' + plan.length,
      );
    }
  }

  // ---------- export ----------
  async function exportJson() {
    // H1-3: export는 GPU에 의존하지 않는다. api가 없으면 타임아웃 있는 collectApi를 1회 시도하고, 실패해도 진행한다.
    if (!state.api) {
      try {
        await collectApi();
      } catch (e) {
        logError('export collectApi', e);
      }
    }
    if (!state.api) {
      state.api = core.buildFallbackApi(
        state.errors.length > 0 ? state.errors[state.errors.length - 1] : 'api 수집 실패',
        { secureContext: !!globalThis.isSecureContext, navigatorGpu: !!navigator.gpu },
      );
    }
    const step = document.querySelector('input[name=edrstep]:checked');
    const enc = document.querySelector('input[name=enc]:checked');
    const env = collectEnv();
    const last = state.perfRuns.length > 0 ? state.perfRuns[state.perfRuns.length - 1] : null;
    const fullscreen = last ? last.fullscreen : inFullscreen();
    updateG3Warning(env, state.perfRuns);
    const now = new Date();
    const result = core.buildResult({
      milestone: 'M1',
      now: now.toISOString(),
      env,
      api: state.api,
      edr: {
        maxDistinctStep: step ? Number(step.value) : null,
        encodingMatch: enc ? enc.value : null,
        refHdrImage: $('refChoice').value,
        secondsSinceDraw: step ? state.stepSecondsSinceDraw : null,
      },
      perfRuns: state.perfRuns,
      vp9Paths: state.vp9Paths,
      visualJudder: $('judderChoice').value,
      flags: { drm: false, hdrSource: false, fullscreen },
      errors: state.errors,
    });
    const text = JSON.stringify(result, null, 2);
    $('jsonOut').value = text;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = core.resultFileName(now.toISOString().slice(0, 10), 'M1', result.env);
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function init() {
    buildStepUi();
    $('btnApi').addEventListener('click', collectApi);
    $('btnStripes').addEventListener('click', () => {
      drawStripes();
      drawPatches();
    });
    $('btnFixtures').addEventListener('click', checkFixtures);
    $('btnMatrix').addEventListener('click', runMatrix);
    $('btnVp9').addEventListener('click', runVp9Batch);
    $('btnExport').addEventListener('click', () =>
      exportJson().catch((e) => logError('export', e)),
    );
    $('refFile').addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      const img = $('refImg');
      img.src = URL.createObjectURL(f);
      img.style.display = 'block';
    });
    state.ageTimer = setInterval(updateDrawAge, 1000);
    // GPU를 얻지 못했으면(타임아웃 등) 그리기를 시도하지 않는다. 오류는 배너에 표시된다.
    collectApi().then(() => {
      if (!state.gpu) return;
      drawStripes();
      drawPatches();
    });
    checkFixtures();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('pagehide', cleanup);
  // bfcache 복원 시 자원이 정리된 상태이므로 새로 로드한다.
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) location.reload();
  });
})();
