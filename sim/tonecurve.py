"""S1: ITM 톤 커브와 전체 파이프라인 (numpy, 벡터화). 근거: PLAN.md C절 "ITM 셰이더 (초안)" 1~5.

해석 (임의로 정한 사항): C절 3번의 f(Y)는 "출력 휘도"(SDR white=1 기준 선형 상대 휘도)이다.
  Y <= k        : f(Y) = Y
  Y >  k        : t = (Y-k)/(1-k),  f(Y) = k + (1-k) * g(t),  g(t) = t + (P'-1) t^n,  P' = (P-k)/(1-k)
  => f(1) = k + (P-k) = P, f'(k) = 1 (C1), P >= 1 이면 단조 증가.
색상 보존 스케일은 배율 f(Y)/Y 를 RGB에 곱한다(4단계). 밝기 게인 g는 곡선 입력 전에 선형 RGB에 곱한다(2단계).
게인 후 Y 가 1 을 넘으면(g>1) 곡선을 t>1 로 그대로 연장한다(클램프하지 않음).
하이라이트 채도 가중치 w = clip(t, 0, 1) (확장 구간에서 0->1 선형), 유효 채도 = s * (1 + (hs-1) * w).
"""

import numpy as np

# BT.709 / Display P3 원색과 D65 백색점으로 행렬을 계산한다 (상수 암기 오류 방지).
_D65 = (0.3127, 0.3290)
_PRIM_709 = ((0.640, 0.330), (0.300, 0.600), (0.150, 0.060))
_PRIM_P3 = ((0.680, 0.320), (0.265, 0.690), (0.150, 0.060))
_PRIM_2020 = ((0.708, 0.292), (0.170, 0.797), (0.131, 0.046))


def _xy_to_XYZ(xy):
    x, y = xy
    return np.array([x / y, 1.0, (1 - x - y) / y])


def rgb_to_xyz_matrix(prim, white=_D65):
    m = np.stack([_xy_to_XYZ(p) for p in prim], axis=1)
    scale = np.linalg.solve(m, _xy_to_XYZ(white))
    return m * scale


M709_TO_XYZ = rgb_to_xyz_matrix(_PRIM_709)
M_P3_TO_XYZ = rgb_to_xyz_matrix(_PRIM_P3)
M_2020_TO_XYZ = rgb_to_xyz_matrix(_PRIM_2020)
M709_TO_P3 = np.linalg.solve(M_P3_TO_XYZ, M709_TO_XYZ)  # 5단계 행렬
M_P3_TO_2020 = np.linalg.solve(M_2020_TO_XYZ, M_P3_TO_XYZ)
LUMA_709 = M709_TO_XYZ[1]  # BT.709 휘도 계수 (0.2126, 0.7152, 0.0722)


def srgb_eotf(v):
    """1단계: sRGB 인코딩 -> 선형. 음수 입력은 부호 보존."""
    v = np.asarray(v, dtype=np.float64)
    a = np.abs(v)
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    return np.sign(v) * lin


def srgb_oetf_ext(x):
    """5단계: 확장 sRGB OETF, 부호 보존, 1.0 초과 허용."""
    x = np.asarray(x, dtype=np.float64)
    a = np.abs(x)
    enc = np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)
    return np.sign(x) * enc


def curve_f(Y, P, k, n):
    """3단계: 출력 휘도 f(Y). Y 는 게인 적용 후 선형 휘도."""
    Y = np.asarray(Y, dtype=np.float64)
    Pp = (P - k) / (1 - k)
    t = np.maximum(Y - k, 0.0) / (1 - k)
    return np.where(Y <= k, Y, k + (1 - k) * (t + (Pp - 1) * t**n))


def curve_scale(Y, P, k, n):
    """f(Y)/Y. Y=0 분기 명시 (GUIDELINES 3-4): Y<=k 구간은 항등이므로 1."""
    Y = np.asarray(Y, dtype=np.float64)
    safe = np.where(Y > k, Y, 1.0)
    return np.where(Y > k, curve_f(Y, P, k, n) / safe, 1.0)


def itm_linear_strength(rgb_enc, t, P, k, n, g, s, hs):
    """PLAN D-M4a: 선형 P3에서 identity(sRGB EOTF -> 709->P3, 곡선·게인·채도 없음)와 ITM 결과를 t로 섞는다.
    t=0 은 색 변환만 한 SDR, t=1 은 itm_linear 와 같다. 혼합 후 OETF 는 호출자가 적용한다."""
    id_lin = srgb_eotf(rgb_enc) @ M709_TO_P3.T
    itm_lin = itm_linear(rgb_enc, P, k, n, g, s, hs)
    return id_lin + t * (itm_lin - id_lin)


def itm_linear(rgb_enc, P, k, n, g, s, hs):
    """1~5단계 중 OETF 직전까지. 반환: 선형 Display P3 (음수/초과 가능)."""
    rgb = srgb_eotf(rgb_enc) * g  # 1, 2
    Y = rgb @ LUMA_709  # 3
    rgb = rgb * curve_scale(Y, P, k, n)[..., None]  # 4 색상 보존
    Yo = (rgb @ LUMA_709)[..., None]
    t = np.clip((Y - k) / (1 - k), 0.0, 1.0)[..., None]
    sat = s * (1.0 + (hs - 1.0) * t)
    rgb = Yo + sat * (rgb - Yo)  # 채도: 휘도 기준 mix
    return rgb @ M709_TO_P3.T  # 5


def itm(rgb_enc, P, k, n, g, s, hs):
    """전체 파이프라인. 입력: sRGB 인코딩 RGB (..., 3), 출력: 확장 sRGB 인코딩 P3 (부호 보존)."""
    return srgb_oetf_ext(itm_linear(rgb_enc, P, k, n, g, s, hs))
