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

test('ITM 곡선 본문(ITM_FN)은 probe/shaders.js와 같고, 그 뒤에 강도 혼합이 붙는다', () => {
  const strip = (s) => s.replace(CONST_RE, 'const $1: f32 = X;');
  // probe의 ITM 본문: VERTEX+COMMON 뒤 ~ @fragment 앞. 균형 프리셋에서는 상수까지 같다.
  const probeItmFn = probe.VIDEO_ITM.slice(
    probe.VIDEO_ITM.indexOf('\nconst P: f32'),
    probe.VIDEO_ITM.indexOf('@fragment'),
  );
  assert.strictEqual(ext.itm.ITM_FN.trimEnd(), probeItmFn.trimEnd());
  assert.strictEqual(strip(ext.itm.ITM_FN).trimEnd(), strip(probeItmFn).trimEnd());
  assert.ok(ext.itm.VIDEO_ITM.includes(ext.itm.ITM_FN + ext.itm.STRENGTH_FN));
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
});

test('강도 혼합 셰이더(M4a): 유니폼 binding 2, 선형 혼합 후 OETF, identity·stripes에는 없음', () => {
  for (const code of [ext.itm.VIDEO_ITM, ext.itm.VIDEO_ITM_COPY]) {
    assert.ok(code.includes('@group(0) @binding(2) var<uniform> params: StrengthParams;'));
    assert.ok(
      code.includes('struct StrengthParams { strength: f32, pad0: f32, pad1: f32, pad2: f32 };'),
    );
    assert.ok(code.includes('return ext_oetf(mix(idLin, itmLin, strength));'));
    assert.ok(code.includes('itm_mix(c.rgb, params.strength)'));
  }
  for (const code of [ext.itm.VIDEO_IDENTITY, ext.itm.VIDEO_IDENTITY_COPY, ext.itm.STRIPES]) {
    assert.ok(!code.includes('params'));
  }
});

test('복사 경로 셰이더: 바인딩 타입과 샘플 함수만 외부 텍스처용과 다르고 본문은 같다', () => {
  const EXT_BIND = '@group(0) @binding(1) var tex: texture_external;';
  const COPY_BIND = '@group(0) @binding(1) var tex: texture_2d<f32>;';
  const EXT_SAMPLE = 'textureSampleBaseClampToEdge(tex, samp, in.uv)';
  const COPY_SAMPLE = 'textureSampleLevel(tex, samp, in.uv, 0.0)';
  const toExt = (src) => src.replace(COPY_BIND, EXT_BIND).replace(COPY_SAMPLE, EXT_SAMPLE);
  assert.ok(
    ext.itm.VIDEO_ITM_COPY.includes(COPY_BIND) && ext.itm.VIDEO_ITM_COPY.includes(COPY_SAMPLE),
  );
  assert.ok(!ext.itm.VIDEO_ITM_COPY.includes('texture_external'));
  assert.ok(!ext.itm.VIDEO_ITM_COPY.includes('textureSampleBaseClampToEdge'));
  assert.strictEqual(toExt(ext.itm.VIDEO_ITM_COPY), ext.itm.VIDEO_ITM);
  assert.strictEqual(toExt(ext.itm.VIDEO_IDENTITY_COPY), ext.itm.VIDEO_IDENTITY);
  // 복사용 ITM 상수도 균형 값과 같다.
  const c = itmConsts(ext.itm.VIDEO_ITM_COPY);
  const p = ext.params.PRESET_BALANCED;
  assert.deepStrictEqual(c, { P: p.P, K: p.k, N: p.n, G: p.g, S: p.s, HS: p.hs });
  // probe 쪽에는 복사용 셰이더가 없다(probe/ 무변경).
  assert.ok(!('VIDEO_ITM_COPY' in probe));
});
