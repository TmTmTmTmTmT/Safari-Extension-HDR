'use strict';
// JS 미러 (PLAN D-M4 M4-B, GUIDELINES 3-1·3-2): sim/tonecurve.py·sim/sharpen.py와 같은 식.
// 런타임에는 쓰지 않고 tests/unit/extension-tonecurve.test.js가 numpy 참조(tonecurve-ref.json)와 오차 < 1e-4로 비교한다.
// WGSL(itm.wgsl.js)과 같은 계수를 쓴다(휘도·709→P3 행렬). 입력 RGB는 길이 3 배열.
(function () {
  const LUMA_709 = [0.2126390059, 0.7151686788, 0.0721923154];
  const LUMA_P3 = [0.2289745641, 0.6917385218, 0.0792869141];
  // 선형 BT.709 -> 선형 Display P3 (열 우선이 아니라 행 우선 3x3)
  const M709_TO_P3 = [
    [0.8224619687, 0.1775380313, 0.0],
    [0.033194198851, 0.96680580115, 0.0],
    [0.017082630721, 0.072397440664, 0.91051992861],
  ];
  const SHARP_GAIN = 2.0; // PLAN M4-E
  const SHARP_LIMIT = 0.1;

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const mat = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 1단계(ITM 입력, FIX_GUIDE Z1): 영상 인코딩 -> 선형 v^INPUT_GAMMA, [0,1]로 클램프(셰이더와 같음).
  // 감마 값은 params.js INPUT_GAMMA 한 곳에서 읽는다.
  function inputEotf(v) {
    return Math.pow(clamp(v, 0, 1), globalThis.__sdrhdr.params.INPUT_GAMMA);
  }

  // sRGB 인코딩 -> 선형. 부호 보존. ITM에서는 쓰지 않고 OETF 왕복 검증용으로 남긴다.
  function srgbEotf(v) {
    const a = Math.abs(v);
    const lin = a <= 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
    return Math.sign(v) * lin;
  }

  // 5단계: 확장 sRGB OETF, 부호 보존, 1.0 초과 허용.
  function srgbOetfExt(x) {
    const a = Math.abs(x);
    const enc = a <= 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
    return Math.sign(x) * enc;
  }

  // 3단계: 출력 휘도 f(Y). Y<=k 항등.
  function curveF(Y, P, k, n) {
    if (Y <= k) return Y;
    const pp = (P - k) / (1 - k);
    const t = (Y - k) / (1 - k);
    return k + (1 - k) * (t + (pp - 1) * Math.pow(t, n));
  }

  // f(Y)/Y, Y<=k 구간은 1 (Y=0 분기 명시, GUIDELINES 3-4).
  function curveScale(Y, P, k, n) {
    return Y > k ? curveF(Y, P, k, n) / Y : 1;
  }

  // 1~5단계 중 OETF 직전까지. 반환: 선형 Display P3.
  function itmLinear(rgbEnc, p) {
    const lin = rgbEnc.map((v) => inputEotf(v) * p.g); // 1, 2
    const Y = dot(LUMA_709, lin); // 3
    const sc = curveScale(Y, p.P, p.k, p.n);
    const scaled = lin.map((v) => v * sc); // 4 색상 보존
    const Yo = dot(LUMA_709, scaled);
    const w = clamp((Y - p.k) / (1 - p.k), 0, 1);
    const sat = p.s * (1 + (p.hs - 1) * w);
    const sa = scaled.map((v) => Yo + sat * (v - Yo)); // 채도: 휘도 기준 mix
    return mat(M709_TO_P3, sa); // 5
  }

  // identity(입력 EOTF -> 709->P3)와 ITM 결과를 선형 P3에서 t로 섞는다 (PLAN D-M4a).
  function itmLinearStrength(rgbEnc, t, p) {
    const id = mat(
      M709_TO_P3,
      rgbEnc.map((v) => inputEotf(v)),
    );
    const itm = itmLinear(rgbEnc, p);
    return id.map((v, i) => v + t * (itm[i] - v));
  }

  // 선형 Display P3에서 휘도 기준 채도 배율 (PLAN M4-E).
  function saturateP3(linP3, csat) {
    const y = dot(LUMA_P3, linP3);
    return linP3.map((v) => y + csat * (v - y));
  }

  // 4탭 언샤프 한 픽셀 (PLAN M4-E). 입력은 sRGB 인코딩 값, 이웃은 상·하·좌·우.
  function sharpenPixel(center, north, south, east, west, sharp) {
    const blur = center.map((_, i) => (north[i] + south[i] + east[i] + west[i]) / 4);
    const d = clamp(
      dot(
        LUMA_709,
        center.map((v, i) => v - blur[i]),
      ),
      -SHARP_LIMIT,
      SHARP_LIMIT,
    );
    return center.map((v) => clamp(v + sharp * SHARP_GAIN * d, 0, 1));
  }

  globalThis.__sdrhdr.tonecurve = {
    LUMA_709,
    LUMA_P3,
    M709_TO_P3,
    SHARP_GAIN,
    SHARP_LIMIT,
    inputEotf,
    srgbEotf,
    srgbOetfExt,
    curveF,
    curveScale,
    itmLinear,
    itmLinearStrength,
    saturateP3,
    sharpenPixel,
  };
})();
