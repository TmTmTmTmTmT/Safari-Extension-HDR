import numpy as np
import pytest

from sim import color
from sim import tonecurve as tc
from sim.presets import PRESETS


def test_exact_preset_zero_negative_channels():
    r = color.out_of_range("정확", n=17)
    assert r["neg_channel"] == 0.0 and r["neg_pixel"] == 0.0


@pytest.mark.parametrize("name", list(PRESETS))
def test_ranges_finite_and_ratios_valid(name):
    r = color.out_of_range(name)
    assert all(np.isfinite(v) for v in r.values())
    assert 0 <= r["neg_channel"] <= r["neg_pixel"] <= 1
    assert r["overP_channel"] <= r["over1_channel"]


def test_itp_neutral_has_zero_chroma():
    itp = color.lin_p3_to_itp(np.array([[1.0, 1.0, 1.0], [0.3, 0.3, 0.3], [3.0, 3.0, 3.0]]))
    assert np.all(np.abs(itp[:, 1:]) < 1e-3)
    assert np.all(np.diff(itp[:, 0]) != 0)
    # 203 nit 흰색의 I 는 약 0.58 (PQ 58%)
    assert abs(color.lin_p3_to_itp(np.ones(3))[0] - 0.58) < 0.01


def test_delta_e_zero_and_symmetric():
    a, b = np.array([0.5, 0.3, 0.2]), np.array([0.6, 0.3, 0.1])
    assert color.delta_e_itp(a, a) == 0
    assert color.delta_e_itp(a, b) == pytest.approx(color.delta_e_itp(b, a))
    assert color.delta_e_itp(a, b) > 0


def test_exact_preset_no_saturation_effect():
    names, rgb = color.chroma_patches()
    de, dh, _ = color.color_shift(rgb, PRESETS["정확"].kwargs())
    assert np.allclose(de, 0) and np.allclose(dh, 0)


def test_hs_has_no_effect_below_knee():
    # 미드톤 패치(Y<k): hs 만 다른 두 설정의 출력이 동일해야 한다
    names, rgb = color.chroma_patches()
    p1, p2 = PRESETS["균형"].kwargs(), PRESETS["균형"].kwargs()
    y = (tc.input_eotf(rgb) * p1["g"]) @ tc.LUMA_709
    lo = y <= p1["k"]
    assert lo.sum() >= 3  # k 가 0.45 라 일부 패치만 항등 구간
    p1["hs"], p2["hs"] = 0.5, 1.5
    a = tc.itm_linear(rgb[lo], **p1)
    b = tc.itm_linear(rgb[lo], **p2)
    assert np.allclose(a, b)


def test_sweep_identity_row_zero_and_more_sat_more_shift():
    rows = {(r["s"], r["hs"]): r for r in color.sat_hs_sweep()}
    assert rows[(1.0, 1.0)]["de_hi_max"] == pytest.approx(0, abs=1e-9)
    assert rows[(1.5, 1.0)]["de_mid_max"] > rows[(1.2, 1.0)]["de_mid_max"] > 0
    assert rows[(1.0, 1.5)]["de_hi_max"] > 0 and rows[(1.0, 1.5)]["de_mid_max"] == pytest.approx(0, abs=1e-9)


def test_report_runs():
    assert "S4" in color.report()
