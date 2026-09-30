'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'extension', 'manifest.json'), 'utf8'));

const ctx = vm.createContext({});
for (const f of manifest.content_scripts[0].js) {
  vm.runInContext(fs.readFileSync(path.join(repo, 'extension', f), 'utf8'), ctx, { filename: f });
}
const ext = ctx.__sdrhdr;
const probeCtx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(repo, 'probe', 'shaders.js'), 'utf8'), probeCtx);
const probe = probeCtx.__probeShaders;

const CONST_RE = /^const (P|K|N|G|S|HS): f32 = ([0-9.]+);$/gm;
function itmConsts(src) {
  const out = {};
  for (const m of src.matchAll(CONST_RE)) out[m[1]] = Number(m[2]);
  return out;
}

test('ITM 상수 = params.js 균형 값 = sim/presets.py 균형 값', () => {
  const c = itmConsts(ext.itm.VIDEO_ITM);
  const p = ext.params.PRESET_BALANCED;
  assert.deepStrictEqual(c, { P: p.P, K: p.k, N: p.n, G: p.g, S: p.s, HS: p.hs });

  const py = fs.readFileSync(path.join(repo, 'sim', 'presets.py'), 'utf8');
  const m = /"균형":\s*Preset\("균형",\s*([^)]*)\)/.exec(py);
  assert.ok(m, 'presets.py 균형 행');
  const kv = {};
  for (const part of m[1].split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim());
    kv[k] = Number(v);
  }
  assert.deepStrictEqual(kv, { P: p.P, k: p.k, n: p.n, g: p.g, s: p.s, hs: p.hs });
});

test('셰이더 본문(상수 제외)이 probe/shaders.js와 같다', () => {
  const strip = (s) => s.replace(CONST_RE, 'const $1: f32 = X;');
  assert.strictEqual(strip(ext.itm.VIDEO_ITM), strip(probe.VIDEO_ITM));
  assert.strictEqual(ext.itm.VIDEO_IDENTITY, probe.VIDEO_IDENTITY);
  assert.strictEqual(ext.itm.STRIPES, probe.STRIPES);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(ext.itm.STEPS)),
    JSON.parse(JSON.stringify(probe.STEPS)),
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(ext.itm.STEPS)),
    [1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 16.0],
  );
  // 균형 프리셋에서는 상수까지 포함해 문자열이 완전히 같다.
  assert.strictEqual(ext.itm.VIDEO_ITM, probe.VIDEO_ITM);
});
