'use strict';
// renderer attach 시 첫 프레임(FIX_GUIDE L4)을 GPU stub으로 검사한다. 실제 WebGPU 동작 검증이 아니다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// opts.ext/vf/copy/c2d: 각 경로가 돌려줄 픽셀 값(0~255) 또는 Error(예외). noVf: VideoFrame 전역 없음. onProbe/onWarn은 hooks로 전달된다.
function setup({
  readyState,
  paused,
  ext = 100,
  vf = 100,
  copy = 100,
  c2d = 100,
  noVf = false,
  onProbe,
  onUndecided,
  onWarn,
  videoSize,
  mode,
}) {
  const vals = { ext, vf, copy, c2d };
  const state = {
    vals,
    submits: 0,
    renders: 0,
    paths: [],
    raf: [],
    calls: [],
    textures: [],
    buffers: [],
    intervals: [],
    probes: [],
    frames: [],
    vfNewErr: null,
    warns: [],
    now: 0,
  };
  let lastFill = 0;
  const device = {
    lost: new Promise(() => {}),
    addEventListener() {},
    createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createSampler: () => ({}),
    createBindGroup: () => ({}),
    importExternalTexture: (desc) => {
      const isFrame = !!(desc && desc.source && desc.source.isFrame);
      const key = isFrame ? 'vf' : 'ext';
      state.calls.push(isFrame ? 'importExternalTexture:vf' : 'importExternalTexture');
      if (vals[key] instanceof Error) throw vals[key];
      lastFill = vals[key];
      return {};
    },
    createTexture: (d) => {
      state.calls.push('createTexture:' + d.format + ':' + d.size.join('x'));
      const t = {
        usage: d.usage,
        destroyed: false,
        createView: () => ({}),
        destroy() {
          t.destroyed = true;
        },
      };
      state.textures.push(t);
      return t;
    },
    createBuffer: (d) => {
      state.calls.push('createBuffer:' + d.size);
      const b = {
        unmaps: 0,
        destroyed: false,
        async mapAsync() {
          state.calls.push('mapAsync');
        },
        getMappedRange: () => new Uint8Array(d.size).fill(lastFill).buffer,
        unmap() {
          b.unmaps += 1;
        },
        destroy() {
          b.destroyed = true;
        },
      };
      state.buffers.push(b);
      return b;
    },
    createCommandEncoder: () => ({
      copyTextureToBuffer: (src, dst, size) => {
        state.calls.push('copyTextureToBuffer:' + dst.bytesPerRow + ':' + size.join('x'));
      },
      beginRenderPass: () => ({
        setPipeline() {},
        setBindGroup() {},
        draw() {},
        end() {},
      }),
      finish: () => ({}),
    }),
    queue: {
      submit() {
        state.submits += 1;
      },
      copyExternalImageToTexture: (src, dst, size) => {
        const at = src.origin ? src.origin.x + ',' + src.origin.y : 'full';
        state.calls.push('copyExternalImageToTexture:' + at + ':' + size.join('x'));
        if (vals.copy instanceof Error) throw vals.copy;
        lastFill = vals.copy;
      },
    },
    destroy() {},
  };
  const gpuCtx = {
    configure() {},
    getConfiguration: () => ({
      format: 'rgba16float',
      colorSpace: 'display-p3',
      toneMapping: { mode: 'extended' },
    }),
    getCurrentTexture: () => {
      state.renders += 1;
      return { createView: () => ({}) };
    },
    unconfigure() {},
  };
  const listeners = {};
  const video = {
    readyState,
    paused,
    ended: false,
    currentTime: 0,
    getVideoPlaybackQuality: () => ({ droppedVideoFrames: 3, totalVideoFrames: 100 }),
    videoWidth: videoSize ? videoSize[0] : 1920,
    videoHeight: videoSize ? videoSize[1] : 1080,
    addEventListener(t, fn) {
      (listeners[t] = listeners[t] || new Set()).add(fn);
    },
    removeEventListener(t, fn) {
      if (listeners[t]) listeners[t].delete(fn);
    },
  };
  state.listeners = listeners;
  state.video = video;
  state.fire = (t) => [...(listeners[t] || [])].forEach((fn) => fn());
  state.settle = () => new Promise((r) => setImmediate(r));
  state.flush = () => {
    const q = state.raf.splice(0);
    q.forEach((fn) => fn(0));
  };
  const ctx = vm.createContext({
    navigator: { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    performance: { now: () => state.now },
    setInterval: (fn) => state.intervals.push(fn),
    clearInterval: (id) => state.intervals.splice(id - 1, 1, null),
    OffscreenCanvas: class {
      getContext() {
        return {
          drawImage() {
            state.calls.push('drawImage');
            if (vals.c2d instanceof Error) throw vals.c2d;
          },
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(vals.c2d) }),
        };
      }
    },
    requestAnimationFrame: (fn) => state.raf.push(fn),
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
  });
  if (!noVf) {
    ctx.VideoFrame = class {
      constructor() {
        if (state.vfNewErr) throw state.vfNewErr;
        this.isFrame = true;
        this.closed = 0;
        state.calls.push('new VideoFrame');
        state.frames.push(this);
      }
      close() {
        this.closed += 1;
        state.calls.push('frame.close');
      }
    };
  }
  for (const f of manifest.content_scripts[0].js) {
    if (f === 'content/main.js' || f === 'content/overlay.js') continue; // main은 로드 시 start를 예약한다
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const canvas = { style: {}, getContext: () => gpuCtx };
  state.canvas = canvas;
  state.renderer = ctx.__sdrhdr.renderer.createRenderer(canvas, video, () => {}, {
    onUndecided,
    onWarn: (e, at) => {
      state.warns.push([at, e.name]);
      if (onWarn) onWarn(e, at);
    },
    onProbe: (p, path) => {
      state.probes.push(p);
      state.paths.push(path);
      if (onProbe) onProbe(p, path);
    },
  });
  if (mode) state.renderer.setMode(mode);
  return state;
}

test('L4: 일시정지 + readyState>=2 이면 경로 결정 후 1회만 렌더하고 정지', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  await s.settle();
  s.flush();
  assert.strictEqual(s.renders, 1);
  assert.strictEqual(s.raf.length, 0);
  assert.ok(!s.listeners.loadeddata || s.listeners.loadeddata.size === 0);
  s.renderer.destroy();
});

test('L4: readyState<2 이면 loadeddata 1회 구독, 발화 후 경로 결정되면 1회 렌더, detach에서 해제', async () => {
  const s = setup({ readyState: 0, paused: true });
  await s.renderer.start();
  s.flush();
  assert.strictEqual(s.renders, 0);
  assert.strictEqual(s.listeners.loadeddata.size, 1);
  s.video.readyState = 2;
  s.fire('loadeddata');
  s.intervals[0](); // 500ms 폴링이 첫 frameProbe를 시작한다
  await s.settle();
  s.flush();
  assert.strictEqual(s.renders, 1);
  s.renderer.destroy();
  assert.strictEqual(s.listeners.loadeddata.size, 0);
  assert.strictEqual(s.listeners.play.size, 0);
});

test('L4: loadeddata 구독 중 destroy하면 리스너가 해제된다', async () => {
  const s = setup({ readyState: 0, paused: true });
  await s.renderer.start();
  assert.strictEqual(s.listeners.loadeddata.size, 1);
  s.renderer.destroy();
  assert.strictEqual(s.listeners.loadeddata.size, 0);
});

test('L5: renderer getStats api 타입 (boolean, toneMapping string)', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  const a = s.renderer.getStats().api;
  for (const k of ['gpu', 'adapter', 'device', 'configure'])
    assert.strictEqual(typeof a[k], 'boolean', k);
  assert.strictEqual(a.configRead.toneMapping, 'extended');
  s.renderer.destroy();
});

// ---- N1 frameProbe: stub으로 호출 순서와 자원 해제만 본다. 실제 WebGPU/Canvas 동작 검증이 아니다. ----

const has = (calls, prefix) => calls.some((c) => c.startsWith(prefix));

test('N1/R1: 재생 중 readyState>=2이면 시작 직후 1회, 네 경로 값과 호출 순서', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 10, vf: 30, copy: 50, c2d: 90 });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  const p = s.probes[0];
  assert.deepStrictEqual(
    [p.n, p.ext, p.vf, p.copy, p.c2d, p.extErr, p.vfErr, p.copyErr, p.c2dErr],
    [1, 10, 30, 50, 90, null, null, null, null],
  );
  assert.strictEqual(typeof p.vfSyncMs, 'number');
  const order = s.calls.filter((c) => !c.startsWith('createBuffer') && c !== 'mapAsync');
  const iExt = order.indexOf('importExternalTexture');
  const iVf = order.indexOf('importExternalTexture:vf');
  const iCopy = order.findIndex((c) => c.startsWith('copyExternalImageToTexture'));
  const iC2d = order.indexOf('drawImage');
  assert.ok(iExt >= 0 && iExt < iVf && iVf < iCopy && iCopy < iC2d, order.join(','));
  // vf: frame 생성 -> import -> 되읽기 전에 close (submit 후)
  assert.ok(order.indexOf('new VideoFrame') < iVf && iVf < order.indexOf('frame.close'));
  assert.ok(s.frames.length === 1 && s.frames[0].closed === 1);
  assert.ok(s.calls.includes('createTexture:rgba8unorm:64x36'));
  assert.ok(s.calls.includes('copyTextureToBuffer:256:64x36'));
  // 중앙 64x36 영역의 좌상단 (1920x1080)
  assert.ok(s.calls.includes('copyExternalImageToTexture:928,522:64x36'));
  // 자원 해제: 텍스처 destroy, 버퍼 unmap+destroy
  assert.ok(s.textures.length === 3 && s.textures.every((t) => t.destroyed));
  assert.ok(s.buffers.length === 3 && s.buffers.every((b) => b.unmaps === 1 && b.destroyed));
  assert.strictEqual(s.renderer.getStats().frameProbe.n, 1);
  s.renderer.destroy();
});

test('N1/P2: 경로 결정 전 첫 회차는 일시정지여도 실행, 이후는 재생 중 30초 간격', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.now = 99999; // 결정 후 일시정지 중에는 실행하지 않음
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.video.paused = false;
  s.video.readyState = 1;
  s.now = 30000;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.video.readyState = 4;
  s.now = 29999; // 첫 회차(now=0)로부터 30초 미만이면 건너뜀
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.now = 30001;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 2);
  assert.strictEqual(s.probes[1].n, 2);
  assert.strictEqual(s.probes[1].at, 30001);
  s.renderer.destroy();
});

test('N1: 실행 중이면 다음 회차를 건너뛴다', async () => {
  const s = setup({ readyState: 4, paused: false });
  await s.renderer.start(); // 첫 probe가 진행 중(await 전)
  s.now = 6000;
  s.intervals[0](); // busy이므로 무시
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.renderer.destroy();
});

test('N1: 경로별 예외는 name만 기록하고 서로 막지 않으며 자원은 해제된다', async () => {
  const err = (name) => Object.assign(new Error('secret detail'), { name });
  const s = setup({
    readyState: 4,
    paused: false,
    ext: err('TypeError'),
    vf: err('InvalidStateError'),
    copy: err('SecurityError'),
    c2d: 77,
  });
  await s.renderer.start();
  await s.settle();
  const p = s.probes[0];
  assert.deepStrictEqual(
    [p.ext, p.vf, p.copy, p.c2d, p.extErr, p.vfErr, p.copyErr, p.c2dErr],
    [null, null, null, 77, 'TypeError', 'InvalidStateError', 'SecurityError', null],
  );
  assert.ok(!JSON.stringify(p).includes('secret'));
  assert.ok(s.frames.every((f) => f.closed === 1)); // import 예외여도 frame은 닫힌다
  assert.ok(s.textures.every((t) => t.destroyed));
  assert.ok(s.buffers.every((b) => b.destroyed));
  s.renderer.destroy();
});

test('N1: c2d 예외(또는 OffscreenCanvas 없음)여도 ext/copy는 기록된다', async () => {
  const s = setup({
    readyState: 4,
    paused: false,
    ext: 5,
    copy: 6,
    c2d: Object.assign(new Error('x'), { name: 'SecurityError' }),
  });
  await s.renderer.start();
  await s.settle();
  const p = s.probes[0];
  assert.deepStrictEqual([p.ext, p.copy, p.c2d, p.c2dErr], [5, 6, null, 'SecurityError']);
  s.renderer.destroy();
});

test('N1: detach 후에는 타이머가 해제되고 더 이상 probe하지 않는다', async () => {
  const s = setup({ readyState: 0, paused: true });
  await s.renderer.start();
  s.renderer.destroy();
  assert.strictEqual(s.intervals[0], null);
  s.video.paused = false;
  s.now = 99999;
  await s.settle();
  assert.strictEqual(s.probes.length, 0);
  assert.ok(!has(s.calls, 'copyTextureToBuffer'));
});

test('N1: 캔버스 렌더 1회 = 캔버스 텍스처 획득 1회 (probe 렌더와 구분)', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  await s.settle();
  s.flush();
  assert.strictEqual(s.renders, 1);
  s.renderer.destroy();
});

// ---- P2 입력 경로 / P3 진단: stub으로 호출 순서·자원 해제·전환 로직만 본다. 실제 GPU 동작 검증이 아니다. ----

const copyCalls = (calls) => calls.filter((c) => c.startsWith('copyExternalImageToTexture:full'));

test('P2: 첫 frameProbe 전에는 캔버스를 숨기고 렌더하지 않으며, 결정 후 표시', async () => {
  const s = setup({ readyState: 4, paused: false });
  await s.renderer.start(); // 첫 probe 진행 중
  assert.strictEqual(s.canvas.style.visibility, 'hidden');
  s.flush();
  assert.strictEqual(s.renders, 0);
  assert.strictEqual(s.renderer.getStats().path, null);
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'ext');
  assert.strictEqual(s.canvas.style.visibility, '');
  s.flush();
  assert.strictEqual(s.renders, 1);
  s.renderer.destroy();
});

test('P2: ext·vf 검음 + copy 정상이면 copy 경로. 텍스처 usage, 복사 호출, 외부 텍스처 미사용', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 0, copy: 60, c2d: 60 });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'copy');
  assert.deepStrictEqual(s.paths, ['copy']);
  const imports = s.calls.filter((c) => c === 'importExternalTexture').length;
  s.video.currentTime = 1;
  s.flush();
  assert.strictEqual(s.renders, 1);
  assert.ok(s.calls.includes('createTexture:rgba8unorm:1920x1080'));
  const t = s.textures.find((x) => x.usage === (0x04 | 0x02 | 0x10));
  assert.ok(t, 'TEXTURE_BINDING|COPY_DST|RENDER_ATTACHMENT');
  assert.strictEqual(copyCalls(s.calls).length, 1);
  assert.ok(s.calls.includes('copyExternalImageToTexture:full:1920x1080'));
  assert.strictEqual(s.calls.filter((c) => c === 'importExternalTexture').length, imports);
  s.renderer.destroy();
  assert.ok(t.destroyed);
});

test('P2: 같은 currentTime이면 재복사 생략, 바뀌면 복사. copySkipped와 copyMs 기록', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 0, copy: 60, c2d: 60 });
  await s.renderer.start();
  await s.settle();
  s.video.currentTime = 1;
  s.flush();
  s.flush(); // 같은 currentTime
  assert.strictEqual(copyCalls(s.calls).length, 1);
  s.video.currentTime = 1.0167;
  s.flush();
  assert.strictEqual(copyCalls(s.calls).length, 2);
  const st = s.renderer.getStats();
  assert.strictEqual(st.copySkipped, 1);
  assert.strictEqual(st.copyTimesMs.length, 2);
  assert.strictEqual(s.renders, 3);
  s.renderer.destroy();
});

test('P2: video 크기가 바뀌면 텍스처를 파괴 후 재생성하고 다시 복사', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 0, copy: 60, c2d: 60 });
  await s.renderer.start();
  await s.settle();
  s.video.currentTime = 1;
  s.flush();
  const first = s.textures.find((x) => x.usage === (0x04 | 0x02 | 0x10));
  s.video.videoWidth = 1280;
  s.video.videoHeight = 720;
  s.flush(); // currentTime은 같아도 새 텍스처에는 복사해야 한다
  assert.ok(first.destroyed);
  assert.ok(s.calls.includes('createTexture:rgba8unorm:1280x720'));
  assert.ok(s.calls.includes('copyExternalImageToTexture:full:1280x720'));
  s.renderer.destroy();
});

test('R2: ext 경로에서 ext 검음 + vf 밝음이면 vf로, 다시 vf 검음 + copy 밝음이면 copy로 한 단계씩, 되돌리지 않음', async () => {
  const s = setup({ readyState: 4, paused: false });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'ext');
  Object.assign(s.vals, { ext: 0, vf: 100, copy: 60, c2d: 60 });
  s.now = 30001;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'vf');
  Object.assign(s.vals, { ext: 100, vf: 0, copy: 60, c2d: 60 });
  s.now = 60002;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'copy');
  Object.assign(s.vals, { ext: 100, vf: 100, copy: 100, c2d: 100 });
  s.now = 90003;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'copy');
  assert.deepStrictEqual(s.paths, ['ext', 'vf', 'copy', 'copy']);
  s.renderer.destroy();
});

test('R2: ext 검음 + vf도 검고 copy만 밝아도 ext에서는 한 단계(vf)까지만 (전환 없음)', async () => {
  const s = setup({ readyState: 4, paused: false });
  await s.renderer.start();
  await s.settle();
  Object.assign(s.vals, { ext: 0, vf: 0, copy: 60, c2d: 60 });
  s.now = 30001;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'ext');
  s.renderer.destroy();
});

test('P2: stripes 모드는 경로 결정·probe 없이 렌더하고 캔버스가 보인다', async () => {
  const s = setup({ readyState: 4, paused: false, mode: 'stripes' });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.probes.length, 0);
  assert.strictEqual(s.canvas.style.visibility, '');
  s.flush();
  assert.strictEqual(s.renders, 1);
  s.now = 999999;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 0);
  s.renderer.setMode('itm'); // 결정 전 video 모드로 바뀌면 다시 숨긴다
  assert.strictEqual(s.canvas.style.visibility, 'hidden');
  s.renderer.destroy();
});

test('P3: frameProbe.ms와 경로별 동기 시간, getStats의 video 품질', async () => {
  const s = setup({ readyState: 4, paused: false });
  await s.renderer.start();
  await s.settle();
  const p = s.renderer.getStats().frameProbe;
  for (const k of ['ms', 'extSyncMs', 'copySyncMs', 'c2dSyncMs'])
    assert.strictEqual(typeof p[k], 'number', k);
  const st = s.renderer.getStats();
  assert.strictEqual(st.videoDropped, 3);
  assert.strictEqual(st.videoTotal, 100);
  s.renderer.destroy();
});

// ---- Q1 경로 보류 / Q2 버퍼 비움: stub으로 재시도 로직만 본다. 실제 GPU 동작 검증이 아니다. ----

test('Q1: 기준 경로가 어두우면 pending, 캔버스 숨김, 렌더 없음, 1초 간격 재시도', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 100, copy: 3, c2d: 3 });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'pending');
  assert.deepStrictEqual(s.paths, ['pending']);
  assert.strictEqual(s.canvas.style.visibility, 'hidden');
  s.flush();
  assert.strictEqual(s.renders, 0);
  s.now = 999; // 1초 미만이면 재시도하지 않는다
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.now = 1000;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 2);
  // 밝아지면 결정되고 캔버스가 보이며 이후 30초 주기
  Object.assign(s.vals, { ext: 100, copy: 100, c2d: 100 });
  s.now = 2000;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'ext');
  assert.strictEqual(s.canvas.style.visibility, '');
  s.flush();
  assert.strictEqual(s.renders, 1);
  s.now = 3000;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 3);
  s.now = 32001;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 4);
  s.renderer.destroy();
});

test('Q1: pending 재시도는 재생 중일 때만', async () => {
  const s = setup({ readyState: 4, paused: true, ext: 100, copy: 3, c2d: 3 });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.probes.length, 1); // 첫 회차는 일시정지여도 실행
  s.now = 5000;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.video.paused = false;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 2);
  s.renderer.destroy();
});

test('Q1: pending 60회 상한 후 중단, 숨긴 상태 유지, path pending, onUndecided 1회', async () => {
  let undecided = 0;
  const s = setup({
    readyState: 4,
    paused: false,
    ext: 100,
    copy: 3,
    c2d: 3,
    onUndecided: () => {
      undecided += 1;
    },
  });
  await s.renderer.start();
  await s.settle();
  for (let i = 1; i < 80; i++) {
    s.now = i * 1000;
    s.intervals[0]();
    await s.settle();
  }
  assert.strictEqual(s.probes.length, 60);
  assert.strictEqual(undecided, 1);
  assert.strictEqual(s.renderer.getStats().path, 'pending');
  assert.strictEqual(s.canvas.style.visibility, 'hidden');
  s.flush();
  assert.strictEqual(s.renders, 0);
  s.renderer.destroy();
});

test('R2: 모두 검고 c2d 정상이면 none은 1회째 보류(1초 후 재probe), 2회 연속일 때만 none', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 0, copy: 3, c2d: 60 });
  await s.renderer.start();
  await s.settle();
  assert.deepStrictEqual(s.paths, ['pending']);
  assert.strictEqual(s.canvas.style.visibility, 'hidden');
  s.flush();
  assert.strictEqual(s.renders, 0);
  s.now = 999;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.now = 1000;
  s.intervals[0]();
  await s.settle();
  assert.deepStrictEqual(s.paths, ['pending', 'none']);
  assert.strictEqual(s.canvas.style.visibility, 'hidden');
  s.flush();
  assert.strictEqual(s.renders, 0);
  s.now = 99999; // none 이후에는 재시도하지 않는다
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 2);
  s.renderer.destroy();
});

test('R2: none 다음 다른 결과가 나오면 연속 횟수 0, 이후 none 1회는 다시 보류', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 0, copy: 3, c2d: 60 });
  await s.renderer.start();
  await s.settle();
  Object.assign(s.vals, { c2d: 3 }); // pending
  s.now = 1000;
  s.intervals[0]();
  await s.settle();
  Object.assign(s.vals, { c2d: 60 }); // none 1회 (연속 아님)
  s.now = 2000;
  s.intervals[0]();
  await s.settle();
  assert.deepStrictEqual(s.paths, ['pending', 'pending', 'pending']);
  Object.assign(s.vals, { vf: 50 }); // vf로 결정
  s.now = 3000;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.renderer.getStats().path, 'vf');
  s.renderer.destroy();
});

test('R2: 결정 후 probe가 none이어도 경로는 그대로 (전환·즉시 detach 없음)', async () => {
  const s = setup({ readyState: 4, paused: false });
  await s.renderer.start();
  await s.settle();
  Object.assign(s.vals, { ext: 0, vf: 0, copy: 0, c2d: 60 });
  s.now = 30001;
  s.intervals[0]();
  await s.settle();
  assert.deepStrictEqual(s.paths, ['ext', 'ext']);
  s.renderer.destroy();
});

test('R2: c2d가 8 미만이면 vf가 밝아도 pending', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 100, copy: 100, c2d: 7 });
  await s.renderer.start();
  await s.settle();
  assert.deepStrictEqual(s.paths, ['pending']);
  s.renderer.destroy();
});

// ---- R1/R3 vf 경로: stub으로 호출 순서와 frame.close 보장만 본다. 실제 VideoFrame/GPU 동작 검증이 아니다. ----

test('R1: VideoFrame 미정의면 vfErr ReferenceError, 나머지 경로는 기록되고 ext 선택', async () => {
  const s = setup({ readyState: 4, paused: false, noVf: true });
  await s.renderer.start();
  await s.settle();
  const p = s.probes[0];
  assert.deepStrictEqual(
    [p.vf, p.vfErr, p.ext, p.copy, p.c2d],
    [null, 'ReferenceError', 100, 100, 100],
  );
  assert.strictEqual(s.renderer.getStats().path, 'ext');
  s.renderer.destroy();
});

test('R1: VideoFrame 생성 예외는 vfErr name만 기록', async () => {
  const s = setup({ readyState: 4, paused: false });
  s.vfNewErr = Object.assign(new Error('secret'), { name: 'InvalidStateError' });
  await s.renderer.start();
  await s.settle();
  const p = s.probes[0];
  assert.deepStrictEqual([p.vf, p.vfErr], [null, 'InvalidStateError']);
  assert.ok(!JSON.stringify(p).includes('secret'));
  s.renderer.destroy();
});

async function vfSetup(opts) {
  const s = setup(Object.assign({ readyState: 4, paused: false, ext: 0, copy: 60, c2d: 60 }, opts));
  await s.renderer.start();
  await s.settle();
  return s;
}

test('R3: vf 경로는 렌더마다 frame 생성 -> import -> submit -> close, 외부 텍스처 직접 import 없음', async () => {
  const s = await vfSetup({});
  assert.strictEqual(s.renderer.getStats().path, 'vf');
  s.frames.length = 0;
  s.calls.length = 0;
  const submits = s.submits;
  s.flush();
  s.flush();
  assert.strictEqual(s.renders, 2);
  assert.strictEqual(s.frames.length, 2);
  assert.ok(s.frames.every((f) => f.closed === 1));
  assert.strictEqual(s.submits - submits, 2);
  assert.deepStrictEqual(s.calls, [
    'new VideoFrame',
    'importExternalTexture:vf',
    'frame.close',
    'new VideoFrame',
    'importExternalTexture:vf',
    'frame.close',
  ]);
  const st = s.renderer.getStats();
  assert.strictEqual(st.vfTimesMs.length, 2);
  assert.strictEqual(st.frames, 2);
  s.renderer.destroy();
});

test('R3: vf import 예외면 frame을 닫고 copy로 1회 전환, 재생은 이어지며 detach하지 않는다', async () => {
  const s = await vfSetup({});
  s.vals.vf = Object.assign(new Error('boom'), { name: 'TypeError' });
  s.frames.length = 0;
  s.flush(); // 렌더 예외
  assert.strictEqual(s.frames.length, 1);
  assert.strictEqual(s.frames[0].closed, 1);
  assert.strictEqual(s.renderer.getStats().path, 'copy');
  assert.deepStrictEqual(s.warns, [['vf.render', 'TypeError']]);
  s.video.currentTime = 1;
  s.flush(); // copy 경로로 렌더
  assert.ok(s.calls.includes('copyExternalImageToTexture:full:1920x1080'));
  assert.strictEqual(s.frames.length, 1); // 더 이상 frame을 만들지 않는다
  s.renderer.destroy();
});

test('R3: 프레임 생성 실패는 연속 3회째에 errors 기록 후 copy 전환, 성공하면 카운트 0', async () => {
  const s = await vfSetup({});
  const fail = Object.assign(new Error('x'), { name: 'InvalidStateError' });
  s.vfNewErr = fail;
  s.flush();
  s.flush();
  assert.deepStrictEqual(s.warns, []);
  assert.strictEqual(s.renderer.getStats().path, 'vf');
  assert.strictEqual(s.renders, 0); // 실패한 프레임은 그리지 않는다
  s.vfNewErr = null;
  s.flush(); // 성공 -> 카운트 0
  s.vfNewErr = fail;
  s.flush();
  s.flush();
  assert.deepStrictEqual(s.warns, []);
  s.flush();
  assert.deepStrictEqual(s.warns, [['vf.create', 'InvalidStateError']]);
  assert.strictEqual(s.renderer.getStats().path, 'copy');
  s.renderer.destroy();
});

test('R3: vf 경로 일시정지 상태는 1회 렌더 후 정지, frame 닫힘', async () => {
  const s = await vfSetup({ paused: true });
  s.flush();
  assert.strictEqual(s.renders, 1);
  assert.strictEqual(s.raf.length, 0);
  assert.ok(s.frames.every((f) => f.closed === 1));
  s.renderer.destroy();
});

test('Q2: play·seeked·가시 복귀 시 루프·JS·복사 버퍼를 비운다', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 0, vf: 0, copy: 60, c2d: 60 });
  await s.renderer.start();
  await s.settle();
  const fill = () => {
    s.video.currentTime += 1;
    s.flush();
  };
  fill();
  fill();
  let st = s.renderer.getStats();
  assert.ok(
    st.loopTimestamps.length > 0 && st.frameTimesMs.length > 0 && st.copyTimesMs.length > 0,
  );
  for (const ev of ['play', 'seeked']) {
    s.flush();
    s.fire(ev);
    st = s.renderer.getStats();
    assert.deepStrictEqual(
      [st.loopTimestamps.length, st.frameTimesMs.length, st.copyTimesMs.length],
      [0, 0, 0],
      ev,
    );
    fill();
    assert.ok(s.renderer.getStats().loopTimestamps.length > 0);
  }
  s.renderer.destroy();
});
