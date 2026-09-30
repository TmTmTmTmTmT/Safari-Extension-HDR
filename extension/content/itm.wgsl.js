'use strict';
// WGSL 문자열. 본문은 probe/shaders.js와 같다(수식·인코딩 변경 금지). 미검증(사용자 Mac에서 실제 컴파일 필요).
(function () {
  const preset = globalThis.__sdrhdr.params.PRESET_BALANCED;
  // WGSL f32 리터럴: 정수값도 소수점을 붙인다.
  const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

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

  // 스트라이프 9단계. 값은 캔버스에 그대로 기록(A5: 비선형 확장값 가정).
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

  const VIDEO_COMMON =
    VERTEX +
    `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_external;
`;

  // ITM 상수는 params.js 균형 프리셋에서 조립한다(PLAN C-ITM).
  const ITM_FN = `
const P: f32 = ${f(preset.P)};
const K: f32 = ${f(preset.k)};
const N: f32 = ${f(preset.n)};
const G: f32 = ${f(preset.g)};
const S: f32 = ${f(preset.s)};
const HS: f32 = ${f(preset.hs)};
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

  // 복사 경로(FIX_GUIDE P2): 바인딩 타입과 샘플 함수만 외부 텍스처용과 다르고 수식 본문은 공유한다.
  const COPY_COMMON =
    VERTEX +
    `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
`;
  const SAMPLE_EXT = 'textureSampleBaseClampToEdge(tex, samp, in.uv)';
  const SAMPLE_COPY = 'textureSampleLevel(tex, samp, in.uv, 0.0)';

  const fsIdentity = (sample) => `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let c = ${sample};
  return vec4f(c.rgb, 1.0);
}
`;
  const fsItm = (sample) => `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let c = ${sample};
  return vec4f(itm(c.rgb), 1.0);
}
`;

  const VIDEO_IDENTITY = VIDEO_COMMON + fsIdentity(SAMPLE_EXT);
  const VIDEO_ITM = VIDEO_COMMON + ITM_FN + fsItm(SAMPLE_EXT);
  const VIDEO_IDENTITY_COPY = COPY_COMMON + fsIdentity(SAMPLE_COPY);
  const VIDEO_ITM_COPY = COPY_COMMON + ITM_FN + fsItm(SAMPLE_COPY);

  globalThis.__sdrhdr.itm = {
    STEPS,
    VERTEX,
    STRIPES,
    VIDEO_IDENTITY,
    VIDEO_ITM,
    VIDEO_IDENTITY_COPY,
    VIDEO_ITM_COPY,
  };
})();
