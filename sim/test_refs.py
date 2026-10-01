import numpy as np
import pytest

from sim import refs, tonecurve as tc
from sim.presets import PRESETS


@pytest.mark.parametrize("name", list(PRESETS))
def test_ramp_neutral_and_monotonic(name):
    _, lin, enc = refs.expected(refs.ramp_rgb(), name)
    assert np.allclose(lin[:, 0], lin[:, 1]) and np.allclose(lin[:, 1], lin[:, 2], atol=1e-9)
    assert np.all(np.diff(enc[:, 1]) > 0)
    assert enc[0, 0] == 0


@pytest.mark.parametrize("name", list(PRESETS))
def test_ramp_white_equals_peak_times_gain(name):
    p = PRESETS[name]
    _, lin, _ = refs.expected(refs.ramp_rgb(), name)
    Y = p.g  # 흰색 선형 1 * g
    expect = float(tc.curve_f(Y, p.P, p.k, p.n))
    assert lin[-1, 1] == pytest.approx(expect, rel=1e-9)


def test_exact_ramp_identity_below_knee():
    _, lin, _ = refs.expected(refs.ramp_rgb(), "정확")
    lin_in = tc.srgb_eotf(refs.ramp_rgb())
    below = lin_in[:, 0] <= PRESETS["정확"].k
    assert below.sum() >= 4  # 램프 9점 중 항등 구간 점
    assert np.allclose(lin[below], lin_in[below], atol=1e-12)


def test_bars_shape_and_black():
    names, rgb = refs.bars_rgb()
    assert len(names) == 15 and rgb.shape == (15, 3)
    _, lin, enc = refs.expected(rgb, "선명")
    assert np.all(enc[names.index("흑")] == 0)


def test_report_has_tables():
    r = refs.report()
    assert r.count("램프") >= 3 and "컬러바" in r
