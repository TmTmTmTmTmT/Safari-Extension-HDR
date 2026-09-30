import numpy as np
import pytest

from sim import compare
from sim.presets import PRESETS

Y = np.linspace(0, 1, 20001)


@pytest.mark.parametrize("name", list(PRESETS))
def test_display_light_is_identity_baseline(name):
    p = PRESETS[name]
    assert np.array_equal(compare.display_light(Y, p.P, p.k, p.n), Y)
    m = compare.metrics(compare.display_light, p.P, p.k, p.n)
    assert m["peak"] == 1.0 and m["stops"] == 0.0 and m["mid_dev_max_pct"] == 0.0


@pytest.mark.parametrize("name", list(PRESETS))
def test_method_c_approx_constraints(name):
    p = PRESETS[name]
    f = compare.method_c_approx(Y, p.P, p.k)
    assert abs(f[-1] - p.P) < 1e-6
    assert np.allclose(f[Y <= p.k], Y[Y <= p.k])
    assert np.all(np.diff(f) > 0)
    h = 1e-6
    right = (compare.method_c_approx(np.array([p.k + h]), p.P, p.k)[0] - p.k) / h
    assert abs(right - 1) < 1e-4


def test_method_c_degenerate_identity():
    assert np.allclose(compare.method_c_approx(Y, 1.0, 0.65), Y)


@pytest.mark.parametrize("name", list(PRESETS))
def test_own_matches_peak_and_midtone_preserved(name):
    p = PRESETS[name]
    m = compare.metrics(compare.own, p.P, p.k, p.n)
    assert m["peak"] == pytest.approx(p.P, rel=1e-9)
    assert m["mid_dev_max_pct"] == 0.0  # k >= 0.55 > 0.5


def test_report_marks_unconfirmed():
    assert "미확인" in compare.report()
