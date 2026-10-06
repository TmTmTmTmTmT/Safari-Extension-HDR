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
    # 정확 프리셋, 곡선 시작 전 구간: 선형 항등 (FIX_GUIDE Z1: 입력 EOTF 는 v^1.961, 출력은 확장 sRGB OETF)
    m = banding.measure("정확")
    v = banding.CODES / 255.0
    lo = banding.tc.input_eotf(v[1:]) <= PRESETS["정확"].k  # 스텝 c -> c+1 이 끝점까지 항등 구간인 경우만
    lo[0] = False  # 코드 0 -> 1 은 시작이 0 이라 상대 스텝이 0/0
    assert lo.sum() > 150
    # 상대 대비 스텝은 그대로, 출력 인코딩 스텝은 정의대로 입력 EOTF -> OETF 의 차분과 같다
    assert np.allclose(m["amp_rel"][lo], 1.0, atol=1e-9)
    enc = banding.tc.srgb_oetf_ext(banding.tc.input_eotf(v))
    assert np.allclose(m["amp_enc"][lo], np.diff(enc)[lo] * 255.0, atol=1e-9)


def test_highlight_amplified_exact_gt_one():
    assert banding.summary("정확")["amp_enc_max"] > 1.0


@pytest.mark.parametrize("name", list(PRESETS))
def test_max_step_at_top_code(name):
    # 곡선 기울기는 t 에 대해 증가 -> 최대 스텝은 마지막 인접 쌍 (254->255)
    assert banding.summary(name)["amp_enc_max_code"] == 254


def test_report_runs():
    assert "S5" in banding.report()
