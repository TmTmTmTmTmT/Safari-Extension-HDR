import numpy as np
import pytest

from sim import banding
from sim.presets import PRESETS


@pytest.mark.parametrize("name", list(PRESETS))
def test_steps_positive_and_finite(name):
    m = banding.measure(name)
    assert np.all(m["amp_enc"] > 0) and np.all(np.isfinite(m["amp_enc"]))
    s = banding.summary(name)
    assert s["hi_codes"] > 0 and s["amp_enc_max"] >= s["amp_enc_mean"] > 0


def test_exact_identity_below_knee():
    m = banding.measure("정확")
    v = (banding.CODES[1:]) / 255.0
    lo = banding.tc.srgb_eotf(v) <= PRESETS["정확"].k  # 스텝 끝점까지 항등 구간인 경우만 (EOTF/OETF 가 역함수이므로 1)
    assert lo.sum() > 150 and np.allclose(m["amp_enc"][lo], 1.0, atol=1e-9)


def test_highlight_amplified_exact_gt_one():
    assert banding.summary("정확")["amp_enc_max"] > 1.0


@pytest.mark.parametrize("name", list(PRESETS))
def test_max_step_at_top_code(name):
    # 곡선 기울기는 t 에 대해 증가 -> 최대 스텝은 마지막 인접 쌍 (254->255)
    assert banding.summary(name)["amp_enc_max_code"] == 254


def test_report_runs():
    assert "S5" in banding.report()
