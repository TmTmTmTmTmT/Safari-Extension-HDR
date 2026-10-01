'use strict';
// WGSL은 문자열 검사만 한다(컴파일·실행은 사용자 Mac에서만 확인 가능, GUIDELINES 3-6).
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
const plain = (v) => JSON.parse(JSON.stringify(v));

test('STRIPES·VIDEO_IDENTITY는 probe/shaders.js와 같다 (M4부터 ITM은 uniform이라 별도)', () => {
  assert.strictEqual(ext.itm.VIDEO_IDENTITY, probe.VIDEO_IDENTITY);
  assert.strictEqual(ext.itm.STRIPES, probe.STRIPES);
  assert.deepStrictEqual(plain(ext.itm.STEPS), plain(probe.STEPS));
  assert.deepStrictEqual(plain(ext.itm.STEPS), [1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 16.0]);
});

test('ItmParams 구조체 필드 순서 = params.UNIFORM_ORDER + 패딩, 48바이트 (M4-B)', () => {
  const order = plain(ext.params.UNIFORM_ORDER);
  const fields = plain(ext.itm.UNIFORM_FIELDS);
  assert.deepStrictEqual(fields.slice(0, order.length), order);
  assert.strictEqual(fields.length, ext.params.UNIFORM_FLOATS);
  assert.deepStrictEqual(fields.slice(order.length), ['pad0', 'pad1', 'pad2']);
  const struct = `struct ItmParams { ${fields.map((n) => n + ': f32').join(', ')} };`;
  assert.ok(ext.itm.ITM_PARAMS.includes(struct));
  assert.ok(ext.itm.ITM_PARAMS.includes('@group(0) @binding(2) var<uniform> params: ItmParams;'));
  assert.strictEqual(fields.length * 4, 48);
  // renderer가 쓰는 버퍼 크기와 같아야 한다(48바이트).
  const rendererSrc = fs.readFileSync(
    path.join(repo, 'extension', 'content', 'renderer.js'),
    'utf8',
  );
  assert.ok(/const UNIFORM_BYTES = 48;/.test(rendererSrc));
  // 직렬화 배열 길이도 같다.
  assert.strictEqual(ext.params.toUniformArray({}).length, fields.length);
});

test('ITM 셰이더: 곡선 상수가 하드코딩되지 않고 uniform에서 읽는다', () => {
  for (const code of [ext.itm.VIDEO_ITM, ext.itm.VIDEO_ITM_COPY]) {
    assert.ok(!/^const (P|K|N|G|S|HS): f32/m.test(code), '프리셋 상수 const 없음');
    for (const f of ['params.k', 'params.P', 'params.n', 'params.g', 'params.s', 'params.hs']) {
      assert.ok(code.includes(f), f);
    }
  }
});

test('혼합·채도·선명도 셰이더 (M4a, M4-E): 선형 혼합 → P3 휘도 채도 → OETF, 선명도는 유니폼 분기', () => {
  for (const code of [ext.itm.VIDEO_ITM, ext.itm.VIDEO_ITM_COPY]) {
    assert.ok(code.includes('var m = mix(idLin, itm_lin(rgb), strength);'));
    assert.ok(code.includes('let yp = dot(m, LUMA_P3);'));
    assert.ok(code.includes('m = vec3f(yp) + csat * (m - vec3f(yp));'));
    assert.ok(code.includes('return ext_oetf(m);'));
    assert.ok(code.includes('if (params.sharp > 0.0) {'));
    assert.ok(code.includes('c = sharpen(c, in.uv, params.sharp);'));
    assert.ok(code.includes('itm_mix(c, params.strength, params.csat)'));
    assert.ok(code.includes('textureDimensions(tex)'));
    assert.ok(code.includes('clamp(dot(c - blur, LUMA709), -0.1, 0.1)'));
    assert.ok(code.includes('amount * 2.0 * d'));
    // 4탭 이웃
    for (const off of [
      'vec2f(0.0, -px.y)',
      'vec2f(0.0, px.y)',
      'vec2f(px.x, 0.0)',
      'vec2f(-px.x, 0.0)',
    ]) {
      assert.ok(code.includes(off), off);
    }
  }
  for (const code of [ext.itm.VIDEO_IDENTITY, ext.itm.VIDEO_IDENTITY_COPY, ext.itm.STRIPES]) {
    assert.ok(!code.includes('params'));
  }
});

test('WGSL 계수 = JS 미러 계수 (휘도·709→P3 행렬)', () => {
  const tc = ext.tonecurve;
  const code = ext.itm.ITM_FN;
  const vec = (a) => `vec3f(${a.join(', ')})`;
  assert.ok(code.includes(`const LUMA709 = ${vec(tc.LUMA_709)};`));
  assert.ok(code.includes(`const LUMA_P3 = ${vec(tc.LUMA_P3)};`));
  // WGSL mat3x3f는 열 우선: 열 j = M[:, j]. 6자리 반올림 값이 JS 미러(정밀값)와 1e-6 이내인지 본다.
  const m = tc.M709_TO_P3;
  const mat =
    /const M709_TO_P3 = mat3x3f\(\s*vec3f\(([^)]*)\),\s*vec3f\(([^)]*)\),\s*vec3f\(([^)]*)\)\s*\);/.exec(
      code,
    );
  assert.ok(mat);
  for (let j = 0; j < 3; j++) {
    const col = mat[j + 1].split(',').map(Number);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(col[i] - m[i][j]) < 1e-6, `M[${i}][${j}]`);
  }
});

test('복사 경로 셰이더: 바인딩 타입과 샘플 함수만 외부 텍스처용과 다르고 본문은 같다', () => {
  const EXT_BIND = '@group(0) @binding(1) var tex: texture_external;';
  const COPY_BIND = '@group(0) @binding(1) var tex: texture_2d<f32>;';
  const toExt = (src) =>
    src
      .replace(COPY_BIND, EXT_BIND)
      .replace(
        /textureSampleLevel\(tex, samp, ([^,]+), 0\.0\)/g,
        'textureSampleBaseClampToEdge(tex, samp, $1)',
      );
  assert.ok(ext.itm.VIDEO_ITM_COPY.includes(COPY_BIND));
  assert.ok(ext.itm.VIDEO_ITM_COPY.includes('textureSampleLevel(tex, samp, uv, 0.0)'));
  assert.ok(!ext.itm.VIDEO_ITM_COPY.includes('texture_external'));
  assert.ok(!ext.itm.VIDEO_ITM_COPY.includes('textureSampleBaseClampToEdge'));
  assert.strictEqual(toExt(ext.itm.VIDEO_ITM_COPY), ext.itm.VIDEO_ITM);
  assert.strictEqual(toExt(ext.itm.VIDEO_IDENTITY_COPY), ext.itm.VIDEO_IDENTITY);
  // probe 쪽에는 복사용 셰이더가 없다(probe/ 무변경).
  assert.ok(!('VIDEO_ITM_COPY' in probe));
});
