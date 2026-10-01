'use strict';
// WGSL 문자열. STRIPES·VIDEO_IDENTITY는 probe/shaders.js와 같다(수식·인코딩 변경 금지). ITM은 M4에서 uniform 파라미터·강도·선명도·채도를 갖는다(PLAN D-M4). 컴파일은 사용자 Mac에서 확인한다.
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

  // ITM 파라미터는 uniform(ItmParams)으로 받는다 (PLAN D-M4 M4-B). 필드 순서는 params.UNIFORM_ORDER와 같고
  // renderer가 params.toUniformArray 순서로 writeBuffer 한다. 패딩 3개로 48바이트(16바이트 정렬).
  const paramsApi = globalThis.__sdrhdr.params;
  const UNIFORM_FIELDS = paramsApi.UNIFORM_ORDER.concat(
    Array.from(
      { length: paramsApi.UNIFORM_FLOATS - paramsApi.UNIFORM_ORDER.length },
      (_, i) => 'pad' + i,
    ),
  );
  const ITM_PARAMS = `
struct ItmParams { ${UNIFORM_FIELDS.map((n) => n + ': f32').join(', ')} };
@group(0) @binding(2) var<uniform> params: ItmParams;
`;

  // 곡선·색 수식 (PLAN C-ITM 1~5). sim/tonecurve.py, content/tonecurve.js와 같은 식·계수.
  const ITM_FN = `
const LUMA709 = vec3f(0.2126390059, 0.7151686788, 0.0721923154);
const LUMA_P3 = vec3f(0.2289745641, 0.6917385218, 0.0792869141);
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
  let k = params.k;
  if (y <= k) { return y; }
  let t = (y - k) / (1.0 - k);
  let pp = (params.P - k) / (1.0 - k);
  return k + (1.0 - k) * (t + (pp - 1.0) * pow(t, params.n));
}
// OETF 직전 선형 Display P3
fn itm_lin(rgb: vec3f) -> vec3f {
  let lin = srgb_eotf(clamp(rgb, vec3f(0.0), vec3f(1.0))) * params.g;
  let y = dot(lin, LUMA709);
  var outc = lin;
  var yo = 0.0;
  if (y > 1e-6) {
    yo = curve(y);
    outc = lin * (yo / y);
  }
  // 하이라이트 채도 보정은 확장 구간(y>k)에서만 점진 적용
  let w = clamp((y - params.k) / (1.0 - params.k), 0.0, 1.0);
  let sat = params.s * mix(1.0, params.hs, w);
  outc = mix(vec3f(yo), outc, sat);
  return M709_TO_P3 * outc;
}
`;

  // 강도 혼합(PLAN D-M4a)과 채도 슬라이더(M4-E): 선형 P3에서 identity와 ITM을 섞은 뒤 휘도 기준 채도를 곱하고 OETF.
  const MIX_FN = `
fn itm_mix(rgb: vec3f, strength: f32, csat: f32) -> vec3f {
  let idLin = M709_TO_P3 * srgb_eotf(clamp(rgb, vec3f(0.0), vec3f(1.0)));
  var m = mix(idLin, itm_lin(rgb), strength);
  let yp = dot(m, LUMA_P3);
  m = vec3f(yp) + csat * (m - vec3f(yp));
  return ext_oetf(m);
}
// 4탭 언샤프(PLAN M4-E): 입력 sRGB 인코딩 값의 휘도 디테일만 더한다. 소스 텍셀 1칸 이웃.
fn sharpen(c: vec3f, uv: vec2f, amount: f32) -> vec3f {
  let px = 1.0 / vec2f(textureDimensions(tex));
  let nn = sample_at(uv + vec2f(0.0, -px.y)).rgb;
  let ss = sample_at(uv + vec2f(0.0, px.y)).rgb;
  let ee = sample_at(uv + vec2f(px.x, 0.0)).rgb;
  let ww = sample_at(uv + vec2f(-px.x, 0.0)).rgb;
  let blur = (nn + ss + ee + ww) * 0.25;
  let d = clamp(dot(c - blur, LUMA709), -0.1, 0.1);
  return clamp(c + vec3f(amount * 2.0 * d), vec3f(0.0), vec3f(1.0));
}
`;

  // 복사 경로(FIX_GUIDE P2): 바인딩 타입과 샘플 함수만 외부 텍스처용과 다르고 수식 본문은 공유한다.
  const COPY_COMMON =
    VERTEX +
    `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
`;
  const SAMPLE_EXT = (uv) => `textureSampleBaseClampToEdge(tex, samp, ${uv})`;
  const SAMPLE_COPY = (uv) => `textureSampleLevel(tex, samp, ${uv}, 0.0)`;
  const sampleAt = (sample) => `
fn sample_at(uv: vec2f) -> vec4f {
  return ${sample('uv')};
}
`;

  const fsIdentity = (sample) => `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let c = ${sample('in.uv')};
  return vec4f(c.rgb, 1.0);
}
`;
  const FS_ITM = `
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var c = sample_at(in.uv).rgb;
  if (params.sharp > 0.0) {
    c = sharpen(c, in.uv, params.sharp);
  }
  return vec4f(itm_mix(c, params.strength, params.csat), 1.0);
}
`;
  const itmShader = (common, sample) =>
    common + ITM_PARAMS + sampleAt(sample) + ITM_FN + MIX_FN + FS_ITM;

  const VIDEO_IDENTITY = VIDEO_COMMON + fsIdentity(SAMPLE_EXT);
  const VIDEO_ITM = itmShader(VIDEO_COMMON, SAMPLE_EXT);
  const VIDEO_IDENTITY_COPY = COPY_COMMON + fsIdentity(SAMPLE_COPY);
  const VIDEO_ITM_COPY = itmShader(COPY_COMMON, SAMPLE_COPY);

  globalThis.__sdrhdr.itm = {
    STEPS,
    VERTEX,
    STRIPES,
    ITM_PARAMS,
    ITM_FN,
    MIX_FN,
    UNIFORM_FIELDS,
    VIDEO_IDENTITY,
    VIDEO_ITM,
    VIDEO_IDENTITY_COPY,
    VIDEO_ITM_COPY,
  };
})();
