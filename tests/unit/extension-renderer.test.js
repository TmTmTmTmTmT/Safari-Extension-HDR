'use strict';
// renderer attach 시 첫 프레임(FIX_GUIDE L4)을 GPU stub으로 검사한다. 실제 WebGPU 동작 검증이 아니다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// opts.ext/copy/c2d: 각 경로가 돌려줄 픽셀 값(0~255) 또는 Error(예외). onProbe는 hooks로 전달된다.
function setup({ readyState, paused, ext = 100, copy = 100, c2d = 100, onProbe, videoSize }) {
  const state = {
    submits: 0,
    raf: [],
    calls: [],
    textures: [],
    buffers: [],
    intervals: [],
    probes: [],
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
    importExternalTexture: () => {
      state.calls.push('importExternalTexture');
      if (ext instanceof Error) throw ext;
      lastFill = ext;
      return {};
    },
    createTexture: (d) => {
      state.calls.push('createTexture:' + d.format + ':' + d.size.join('x'));
      const t = {
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
        state.calls.push(
          'copyExternalImageToTexture:' + src.origin.x + ',' + src.origin.y + ':' + size.join('x'),
        );
        if (copy instanceof Error) throw copy;
        lastFill = copy;
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
    getCurrentTexture: () => ({ createView: () => ({}) }),
    unconfigure() {},
  };
  const listeners = {};
  const video = {
    readyState,
    paused,
    ended: false,
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
            if (c2d instanceof Error) throw c2d;
          },
          getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(c2d) }),
        };
      }
    },
    requestAnimationFrame: (fn) => state.raf.push(fn),
    cancelAnimationFrame() {},
    setTimeout,
    clearTimeout,
  });
  for (const f of manifest.content_scripts[0].js) {
    if (f === 'content/main.js' || f === 'content/overlay.js') continue; // main은 로드 시 start를 예약한다
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const canvas = { getContext: () => gpuCtx };
  state.renderer = ctx.__sdrhdr.renderer.createRenderer(canvas, video, () => {}, {
    onProbe: (p) => {
      state.probes.push(p);
      if (onProbe) onProbe(p);
    },
  });
  return state;
}

test('L4: 일시정지 + readyState>=2 이면 attach 직후 1회만 렌더하고 정지', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  s.flush();
  assert.strictEqual(s.submits, 1);
  assert.strictEqual(s.raf.length, 0);
  assert.ok(!s.listeners.loadeddata || s.listeners.loadeddata.size === 0);
  s.renderer.destroy();
});

test('L4: readyState<2 이면 loadeddata 1회 구독 후 발화 시 1회 렌더, detach에서 해제', async () => {
  const s = setup({ readyState: 0, paused: true });
  await s.renderer.start();
  s.flush();
  assert.strictEqual(s.submits, 0);
  assert.strictEqual(s.listeners.loadeddata.size, 1);
  s.video.readyState = 2;
  s.fire('loadeddata');
  s.flush();
  assert.strictEqual(s.submits, 1);
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

test('N1: 재생 중 readyState>=2이면 시작 직후 1회, 세 경로 값과 호출 순서', async () => {
  const s = setup({ readyState: 4, paused: false, ext: 10, copy: 50, c2d: 90 });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  const p = s.probes[0];
  assert.deepStrictEqual(
    [p.n, p.ext, p.copy, p.c2d, p.extErr, p.copyErr, p.c2dErr],
    [1, 10, 50, 90, null, null, null],
  );
  const order = s.calls.filter((c) => !c.startsWith('createBuffer') && c !== 'mapAsync');
  const iExt = order.indexOf('importExternalTexture');
  const iCopy = order.findIndex((c) => c.startsWith('copyExternalImageToTexture'));
  const iC2d = order.indexOf('drawImage');
  assert.ok(iExt >= 0 && iExt < iCopy && iCopy < iC2d, order.join(','));
  assert.ok(s.calls.includes('createTexture:rgba8unorm:64x36'));
  assert.ok(s.calls.includes('copyTextureToBuffer:256:64x36'));
  // 중앙 64x36 영역의 좌상단 (1920x1080)
  assert.ok(s.calls.includes('copyExternalImageToTexture:928,522:64x36'));
  // 자원 해제: 텍스처 destroy, 버퍼 unmap+destroy
  assert.ok(s.textures.length === 2 && s.textures.every((t) => t.destroyed));
  assert.ok(s.buffers.length === 2 && s.buffers.every((b) => b.unmaps === 1 && b.destroyed));
  assert.strictEqual(s.renderer.getStats().frameProbe.n, 1);
  s.renderer.destroy();
});

test('N1: 일시정지 또는 readyState<2에서는 실행하지 않고, 5초 간격으로 반복', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  await s.settle();
  assert.strictEqual(s.probes.length, 0);
  s.video.paused = false;
  s.video.readyState = 1;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 0);
  s.video.readyState = 4;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.now = 4000; // 5초 미만이면 건너뜀
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 1);
  s.now = 5001;
  s.intervals[0]();
  await s.settle();
  assert.strictEqual(s.probes.length, 2);
  assert.strictEqual(s.probes[1].n, 2);
  assert.strictEqual(s.probes[1].at, 5001);
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
    copy: err('SecurityError'),
    c2d: 77,
  });
  await s.renderer.start();
  await s.settle();
  const p = s.probes[0];
  assert.deepStrictEqual(
    [p.ext, p.copy, p.c2d, p.extErr, p.copyErr, p.c2dErr],
    [null, null, 77, 'TypeError', 'SecurityError', null],
  );
  assert.ok(!JSON.stringify(p).includes('secret'));
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
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  s.renderer.destroy();
  assert.strictEqual(s.intervals[0], null);
  s.video.paused = false;
  s.now = 99999;
  await s.settle();
  assert.strictEqual(s.probes.length, 0);
  assert.ok(!has(s.calls, 'copyTextureToBuffer'));
});

test('N1: probe는 기존 캔버스 렌더 루프의 submit 횟수에 영향을 주지 않는다(렌더 1회 = 1 submit)', async () => {
  const s = setup({ readyState: 4, paused: true });
  await s.renderer.start();
  s.flush();
  assert.strictEqual(s.submits, 1);
  s.renderer.destroy();
});
