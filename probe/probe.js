'use strict';
// 0a 프로브 페이지 UI/GPU 부작용 코드. 미검증(사용자 Mac에서만 동작 확인 가능). (PLAN B절)
(function () {
  const core = globalThis.__probeCore;
  const shaders = globalThis.__probeShaders;
  const FIXTURES = ['ramp-1080p60', 'ramp-2160p60', 'colorbars-1080p60', 'colorbars-2160p60'];
  const RUN_MAX_SEC = 10;
  const GPU_SAMPLE_EVERY = 10;
  const FORMAT = 'rgba16float';

  const state = { api: null, gpu: null, errors: [], perfRuns: [], fixtures: {}, running: false };
  const $ = (id) => document.getElementById(id);

  function logError(where, e) {
    const msg = e && e.message ? e.message : String(e);
    state.errors.push(where + ': ' + msg);
    $('errOut').textContent = state.errors.join('\n');
  }

  async function getGpu() {
    if (state.gpu) return state.gpu;
    if (!navigator.gpu) throw new Error('navigator.gpu 없음');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('requestAdapter()가 null');
    let device = null;
    let timestamps = false;
    if (adapter.features.has('timestamp-query')) {
      try {
        device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
        timestamps = true;
      } catch (e) {
        logError('requestDevice(timestamp-query)', e);
      }
    }
    if (!device) device = await adapter.requestDevice();
    device.lost.then((info) =>
      logError('device.lost', new Error(info.reason + ' ' + info.message)),
    );
    device.addEventListener('uncapturederror', (ev) => logError('uncapturederror', ev.error));
    state.gpu = { adapter, device, timestamps };
    return state.gpu;
  }

  // 게이트 대상 설정. GUIDELINES 2.5-3: 값 고정.
  function configureCanvas(canvas, device) {
    const ctx = canvas.getContext('webgpu');
    ctx.configure({
      device,
      format: FORMAT,
      colorSpace: 'display-p3',
      toneMapping: { mode: 'extended' },
    });
    return ctx;
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
      try {
        const ctx = configureCanvas(canvas, gpu.device);
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
    $('apiOut').textContent = JSON.stringify(api, null, 2);
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
      windowMode: $('envWindow').value || null,
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
    const ctx = configureCanvas(canvas, device);
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
        const r = await fetch('../fixtures/' + name + '.mp4', { method: 'HEAD' });
        ok = r.ok;
      } catch (e) {
        ok = false;
      }
      state.fixtures[name] = ok;
      const btn = document.createElement('button');
      btn.textContent = name + (ok ? ' 실행' : ' (픽스처 없음)');
      btn.disabled = !ok;
      btn.addEventListener('click', () => runFixture(name));
      list.appendChild(btn);
    }
  }

  function setStatus(t) {
    $('runStatus').textContent = t;
  }

  function renderRunTable() {
    const cols = [
      'fixture',
      'itm',
      'srcRes',
      'canvasRes',
      'fullscreen',
      'frames',
      'fps',
      'dropRate',
      'dropRatePresented',
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

  async function runFixture(name) {
    if (state.running) return;
    state.running = true;
    state.lastFixture = name;
    const video = $('origVideo');
    const canvas = $('vidCanvas');
    try {
      const gpu = await getGpu();
      const device = gpu.device;
      const itm = $('vmode').value === 'itm';
      setStatus(name + ' 로딩...');
      video.src = '../fixtures/' + name + '.mp4';
      video.muted = true;
      video.playsInline = true;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('video 로드 실패'));
      });
      const srcW = video.videoWidth;
      const srcH = video.videoHeight;
      const rect = video.getBoundingClientRect();
      const res = core.canvasResolution(
        srcW,
        srcH,
        rect.width,
        rect.height,
        globalThis.devicePixelRatio || 1,
      );
      canvas.width = res.width;
      canvas.height = res.height;
      const ctx = configureCanvas(canvas, device);

      const module = device.createShaderModule({
        code: itm ? shaders.VIDEO_ITM : shaders.VIDEO_IDENTITY,
      });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: FORMAT }] },
        primitive: { topology: 'triangle-list' },
      });
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
      let querySet = null;
      let resolveBuf = null;
      let readBuf = null;
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

      const jsTimes = [];
      const gpuTimes = [];
      const presented = [];
      let frames = 0;
      let firstMedia = null;
      let lastMedia = null;
      let gpuBusy = false;
      let finished = false;
      const fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      let wallStart = 0;

      const done = new Promise((resolve) => {
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve();
        };
        video.onended = finish;
        const onFrame = (now, meta) => {
          if (finished) return;
          try {
            const t0 = performance.now();
            if (frames === 0) wallStart = t0;
            const sample = querySet && !gpuBusy && frames % GPU_SAMPLE_EVERY === 0;
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
            jsTimes.push(performance.now() - t0);
            if (sample) {
              gpuBusy = true;
              readBuf
                .mapAsync(GPUMapMode.READ)
                .then(() => {
                  const a = new BigUint64Array(readBuf.getMappedRange().slice(0));
                  gpuTimes.push(Number(a[1] - a[0]) / 1e6);
                  readBuf.unmap();
                  gpuBusy = false;
                })
                .catch((e) => {
                  gpuBusy = false;
                  logError('gpu timestamp readback', e);
                });
            }
            frames++;
            if (firstMedia === null) firstMedia = meta.mediaTime;
            lastMedia = meta.mediaTime;
            if (typeof meta.presentedFrames === 'number') presented.push(meta.presentedFrames);
            if ((performance.now() - wallStart) / 1000 >= RUN_MAX_SEC) {
              finish();
              return;
            }
            video.requestVideoFrameCallback(onFrame);
          } catch (e) {
            logError('P0-4 frame', e);
            finish();
          }
        };
        video.requestVideoFrameCallback(onFrame);
      });

      setStatus(name + ' 실행 중 (' + (itm ? 'ITM' : 'identity') + ')...');
      await video.play();
      await done;
      const wallSeconds = (performance.now() - wallStart) / 1000;
      video.pause();
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
      const fps = fixtureFps(name);
      const run = core.buildRun({
        fixture: name,
        itm,
        srcW,
        srcH,
        canvasW: canvas.width,
        canvasH: canvas.height,
        fullscreen,
        frames,
        wallSeconds,
        dropRate: core.computeDropRate({
          frames,
          mediaTimeSpan: lastMedia - firstMedia,
          fps,
        }),
        dropRatePresented: core.dropRateFromPresented(presented),
        jsTimes,
        gpuTimes,
        videoQuality: q ? { dropped: q.droppedVideoFrames, total: q.totalVideoFrames } : null,
      });
      state.perfRuns.push(run);
      renderRunTable();
      setStatus(name + ' 완료');
    } catch (e) {
      logError('P0-4 ' + name, e);
      setStatus(name + ' 실패: ' + (e && e.message ? e.message : e));
    } finally {
      state.running = false;
    }
  }

  function toggleFullscreen() {
    const el = $('stage');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
      else logError('fullscreen', new Error('requestFullscreen 없음'));
    }
  }

  // ---------- export ----------
  async function exportJson() {
    if (!state.api) await collectApi();
    const step = document.querySelector('input[name=edrstep]:checked');
    const enc = document.querySelector('input[name=enc]:checked');
    const env = collectEnv();
    const last = state.perfRuns.length > 0 ? state.perfRuns[state.perfRuns.length - 1] : null;
    const fullscreen = last
      ? last.fullscreen
      : !!(document.fullscreenElement || document.webkitFullscreenElement);
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
      },
      perfRuns: state.perfRuns,
      flags: { drm: false, hdrSource: false, fullscreen },
      errors: state.errors,
    });
    const text = JSON.stringify(result, null, 2);
    $('jsonOut').value = text;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = core.resultFileName(now.toISOString().slice(0, 10), 'M1', env);
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
    $('btnFull').addEventListener('click', toggleFullscreen);
    // 전체화면에서는 stage 밖 버튼이 안 보이므로 r 키로 마지막 픽스처를 다시 실행한다.
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'r' && state.lastFixture) runFixture(state.lastFixture);
    });
    $('btnFixtures').addEventListener('click', checkFixtures);
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
    collectApi().then(() => {
      drawStripes();
      drawPatches();
    });
    checkFixtures();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
