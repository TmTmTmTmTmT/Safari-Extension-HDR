import numpy as np
import pytest

from sim import tonecurve as tc
from sim.presets import PRESETS

PARAMS = [(p.P, p.k, p.n) for p in PRESETS.values()]
Y = np.linspace(0, 1, 100001)


@pytest.mark.parametrize("P,k,n", PARAMS)
def test_monotonic(P, k, n):
    assert np.all(np.diff(tc.curve_f(Y, P, k, n)) > 0)


@pytest.mark.parametrize("P,k,n", PARAMS)
def test_identity_below_k(P, k, n):
    y = Y[Y <= k]
    assert np.max(np.abs(tc.curve_f(y, P, k, n) - y)) < 1e-6


@pytest.mark.parametrize("P,k,n", PARAMS)
def test_f1_equals_P(P, k, n):
    assert abs(float(tc.curve_f(1.0, P, k, n)) - P) < 1e-9


@pytest.mark.parametrize("P,k,n", PARAMS)
def test_c1_at_boundary(P, k, n):
    h = 1e-6
    left = (tc.curve_f(k, P, k, n) - tc.curve_f(k - h, P, k, n)) / h
    right = (tc.curve_f(k + h, P, k, n) - tc.curve_f(k, P, k, n)) / h
    assert abs(left - 1) < 1e-6 and abs(right - 1) < 1e-4
    assert abs(left - right) < 1e-4


@pytest.mark.parametrize("name", list(PRESETS))
def test_pipeline_finite_nonnegative_gray(name):
    v = np.linspace(0, 1, 256)
    rgb = np.stack([v, v, v], -1)
    lin = tc.itm_linear(rgb, **PRESETS[name].kwargs())
    assert np.all(np.isfinite(lin)) and lin.min() >= -1e-9
    enc = tc.itm(rgb, **PRESETS[name].kwargs())
    assert np.all(np.isfinite(enc)) and enc.min() >= -1e-9


def test_zero_no_nan():
    assert np.all(np.isfinite(tc.curve_scale(np.array([0.0]), 3, 0.65, 2.5)))
    assert np.all(tc.itm(np.zeros((1, 3)), **PRESETS["선명"].kwargs()) == 0)


def test_exact_preset_matches_p3_identity_below_knee():
    # 정확 프리셋(s=hs=g=1): Y<=k 이면 측색적 709->P3 변환과 동일
    rgb = np.array([[0.2, 0.3, 0.4]])
    out = tc.itm_linear(rgb, **PRESETS["정확"].kwargs())
    ref = tc.input_eotf(rgb) @ tc.M709_TO_P3.T
    assert np.max(np.abs(out - ref)) < 1e-12


def test_matrix_sanity():
    assert abs(tc.LUMA_709[0] - 0.2126) < 1e-3
    assert np.allclose(tc.M709_TO_P3 @ np.ones(3), np.ones(3), atol=1e-9)


def test_oetf_roundtrip_signed():
    x = np.array([-0.5, -0.001, 0, 0.001, 0.5, 3.0])
    assert np.allclose(tc.srgb_eotf(tc.srgb_oetf_ext(x)), x, atol=1e-12)


# FIX_GUIDE Z1: ITM 입력 선형화는 Safari 기본 재생과 같은 v^1.961
def test_input_gamma_value():
    assert tc.INPUT_GAMMA == 1.961


def test_strength_zero_is_safari_decode():
    rgb = np.array([[0.04, 0.1, 0.5], [0.2, 0.3, 0.4], [1.0, 1.0, 1.0]])
    for p in PRESETS.values():
        lin = tc.itm_linear_strength(rgb, 0.0, **p.kwargs())
        want = (np.power(rgb, 1.961)) @ tc.M709_TO_P3.T
        assert np.allclose(lin, want, atol=1e-12)
        enc = tc.srgb_oetf_ext(lin)
        assert np.allclose(enc, tc.srgb_oetf_ext(want), atol=1e-12)


@pytest.mark.parametrize("name", list(PRESETS))
def test_input_eotf_monotonic_finite(name):
    v = np.linspace(0, 1, 100001)
    out = tc.itm_linear(np.repeat(v[:, None], 3, axis=1), **PRESETS[name].kwargs())[:, 1]
    assert np.all(np.isfinite(out)) and np.all(np.diff(out) >= 0)


def test_white_peak_unchanged():
    # 흰색은 1^γ = 1 이라 유효 피크가 sRGB 입력 때와 같다
    assert tc.input_eotf(1.0) == 1.0 == tc.srgb_eotf(1.0)


def test_dark_codes_lower_than_srgb_decode():
    # 암부 들뜸 제거 방향: 코드 10/255 의 선형값은 sRGB 직선 구간보다 낮다 (Safari 측정 근거)
    v = 10 / 255.0
    assert tc.input_eotf(v) < tc.srgb_eotf(v)
    assert tc.srgb_eotf(v) / tc.input_eotf(v) > 1.5
