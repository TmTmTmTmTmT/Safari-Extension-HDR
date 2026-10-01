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
    # 지표 정의(Y<=0.5 전체)상 k<0.5 인 프리셋은 0.5 근처에서 편차가 생긴다. k 이하 구간은 항등이어야 한다.
    _Y = compare._Y
    f = compare.own(_Y, p.P, p.k, p.n)
    below = _Y <= p.k
    assert np.allclose(f[below], _Y[below], atol=1e-12)
    if p.k >= 0.5:
        assert m["mid_dev_max_pct"] == 0.0
    else:
        assert m["mid_dev_max_pct"] > 0.0  # Y in (k, 0.5] 에서 확장이 시작됨


def test_report_marks_unconfirmed():
    assert "미확인" in compare.report()
