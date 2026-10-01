'use strict';
// WGSL 문자열. 미검증(사용자 Mac에서 실제 컴파일 필요). 클라우드에서는 컴파일 검증 불가.
(function () {
  // 풀스크린 삼각형. uv는 좌상단 원점.
  const VERTEX = `
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f((p[i].x + 1.0) * 0.5, (1.0 - p[i].y) * 0.5);
  return o;
}
`;

  // P0-2: 스트라이프 9단계. 값은 캔버스에 그대로 기록(A5: 비선형 확장값 가정).
  const STEPS = [1.0, 1.25, 1.5, 2.0, 3.0, 4.0, 6.0, 8.0, 16.0];
  const STRIPES =
    VERTEX +
    `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var vals = array<f32, 9>(${STEPS.map((s) => s.toFixed(2)).join(', ')});
  let idx = min(u32(floor(in.uv.x * 9.0)), 8u);
  let v = vals[idx];
  return vec4f(v, v, v, 1.0);
}
`;

  // P0-3: 단색 패치. uniform 색을 그대로 기록.
  const PATCH =
    VERTEX +
    `
@group(0) @binding(0) var<uniform> color: vec4f;
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return color;
}
`;

  // P0-4: 비디오. identity는 샘플 RGB 그대로. itm은 PLAN C절 ITM 초안(균형 프리셋 고정값).
  // 프리셋 값(PLAN C절 표 균형): P=3.0 k=0.65 n=2.5 g=1.0 s=1.05 hs=0.95
  const VIDEO_COMMON =
    VERTEX +
    `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_external;
`;

  const ITM_FN = `
const P: f32 = 3.0;
const K: f32 = 0.65;
const N: f32 = 2.5;
const G: f32 = 1.0;
const S: f32 = 1.05;
const HS: f32 = 0.95;
const LUMA709 = vec3f(0.2126, 0.7152, 0.0722);
// 선형 BT.709 -> 선형 Display P3
const M709_TO_P3 = mat3x3f(
  vec3f(0.822462, 0.033194, 0.017083),
  vec3f(0.177538, 0.966806, 0.072397),
  vec3f(0.0, 0.0, 0.910520)
);

fn srgb_eotf(v: vec3f) -> vec3f {
  let lo = v / 12.92;
  let hi = pow((v + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(hi, lo, v <= vec3f(0.04045));
}
fn srgb_oetf_pos(v: vec3f) -> vec3f {
  let lo = v * 12.92;
  let hi = 1.055 * pow(v, vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(hi, lo, v <= vec3f(0.0031308));
}
// 부호 보존 확장 sRGB OETF
fn ext_oetf(v: vec3f) -> vec3f {
  return sign(v) * srgb_oetf_pos(abs(v));
}
// Y<=k 항등, 위는 t + (P'-1) t^n (PLAN C-ITM 3)
fn curve(y: f32) -> f32 {
  if (y <= K) { return y; }
  let t = (y - K) / (1.0 - K);
  let pp = (P - K) / (1.0 - K);
  return K + (1.0 - K) * (t + (pp - 1.0) * pow(t, N));
}
fn itm(rgb: vec3f) -> vec3f {
  let lin = srgb_eotf(clamp(rgb, vec3f(0.0), vec3f(1.0))) * G;
  let y = dot(lin, LUMA709);
  var outc = lin;
  var yo = 0.0;
  if (y > 1e-6) {
    yo = curve(y);
    outc = lin * (yo / y);
  }
  // 하이라이트 채도 보정은 확장 구간(y>K)에서만 점진 적용
  let w = clamp((y - K) / (1.0 - K), 0.0, 1.0);
  let sat = S * mix(1.0, HS, w);
  outc = mix(vec3f(yo), outc, sat);
  return ext_oetf(M709_TO_P3 * outc);
}
`;

  const VIDEO_IDENTITY =
    VIDEO_COMMON +
    `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let c = textureSampleBaseClampToEdge(tex, samp, in.uv);
  return vec4f(c.rgb, 1.0);
}
`;

  const VIDEO_ITM =
    VIDEO_COMMON +
    ITM_FN +
    `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let c = textureSampleBaseClampToEdge(tex, samp, in.uv);
  return vec4f(itm(c.rgb), 1.0);
}
`;

  // P0-6(FIX_GUIDE Q3): copyExternalImageToTexture로 채운 일반 2D 텍스처 샘플용 identity. 입력 방식 비용 실험 전용.
  const VIDEO_IDENTITY_2D =
    VERTEX +
    `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let c = textureSample(tex, samp, in.uv);
  return vec4f(c.rgb, 1.0);
}
`;

  globalThis.__probeShaders = {
    STEPS,
    STRIPES,
    PATCH,
    VIDEO_IDENTITY,
    VIDEO_ITM,
    VIDEO_IDENTITY_2D,
  };
})();
