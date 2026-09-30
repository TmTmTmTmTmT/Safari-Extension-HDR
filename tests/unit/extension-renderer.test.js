'use strict';
// renderer attach 시 첫 프레임(FIX_GUIDE L4)을 GPU stub으로 검사한다. 실제 WebGPU 동작 검증이 아니다.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function setup({ readyState, paused }) {
  const state = { submits: 0, raf: [] };
  const device = {
    lost: new Promise(() => {}),
    addEventListener() {},
    createShaderModule: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createSampler: () => ({}),
    createBindGroup: () => ({}),
    importExternalTexture: () => ({}),
    createCommandEncoder: () => ({
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
  state.flush = () => {
    const q = state.raf.splice(0);
    q.forEach((fn) => fn(0));
  };
  const ctx = vm.createContext({
    navigator: { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    performance: { now: () => 0 },
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
  state.renderer = ctx.__sdrhdr.renderer.createRenderer(canvas, video, () => {});
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
