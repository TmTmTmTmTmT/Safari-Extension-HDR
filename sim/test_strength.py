"""D-M4a 강도 혼합 성질: t=0 은 색 변환만, t=1 은 ITM, 단조, NaN 없음, 피크 = 1 + t(P-1)."""

import numpy as np
import pytest

from sim import tonecurve as tc
from sim.presets import PRESETS

TS = (0.0, 0.25, 0.5, 0.75, 1.0)


def gray(codes):
    v = np.asarray(codes, dtype=np.float64) / 255.0
    return np.stack([v, v, v], axis=-1)


def grid(n=9):
    v = np.linspace(0, 1, n)
    r, g, b = np.meshgrid(v, v, v, indexing="ij")
    return np.stack([r, g, b], axis=-1).reshape(-1, 3)


@pytest.mark.parametrize("nm", list(PRESETS))
def test_t0_is_color_converted_sdr(nm):
    p = PRESETS[nm].kwargs()
    rgb = grid()
    out = tc.itm_linear_strength(rgb, 0.0, **p)
    assert np.allclose(out, tc.input_eotf(rgb) @ tc.M709_TO_P3.T, atol=1e-12)


@pytest.mark.parametrize("nm", list(PRESETS))
def test_t1_is_itm(nm):
    p = PRESETS[nm].kwargs()
    rgb = grid()
    assert np.allclose(tc.itm_linear_strength(rgb, 1.0, **p), tc.itm_linear(rgb, **p), atol=1e-12)


@pytest.mark.parametrize("nm", list(PRESETS))
@pytest.mark.parametrize("t", TS)
def test_gray_ramp_monotonic_finite(nm, t):
    p = PRESETS[nm].kwargs()
    y = tc.itm_linear_strength(gray(np.arange(256)), t, **p)[:, 1]
    assert np.isfinite(y).all()
    assert (np.diff(y) > 0).all()
    assert y[0] == 0.0


@pytest.mark.parametrize("nm", ["정확", "균형"])
@pytest.mark.parametrize("t", TS)
def test_white_peak_is_one_plus_t_times_p_minus_one(nm, t):
    pr = PRESETS[nm]
    y = tc.itm_linear_strength(gray([255]), t, **pr.kwargs())[0]
    assert y == pytest.approx(np.full(3, 1.0 + t * (pr.P * pr.g - 1.0)), abs=1e-6)


def test_balanced_half_strength_peak_matches_headroom_two():
    # PLAN D-M4a 근거: 균형 P=3, t=0.5 -> 피크 2.0 (밝기 최대 헤드룸 약 2).
    y = tc.itm_linear_strength(gray([255]), 0.5, **PRESETS["균형"].kwargs())[0]
    assert y == pytest.approx(np.full(3, 2.0), abs=1e-6)
