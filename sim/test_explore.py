import numpy as np
import pytest

from sim import explore as ex
from sim import tonecurve as tc


def test_grid_size_and_report_sections():
    rows = ex.all_rows()
    assert len(rows) == len(ex.K_GRID) * len(ex.N_GRID) * len(ex.P_GRID) * len(ex.S_GRID)
    out = ex.report()
    assert out.startswith("### S11 ")
    for cls in ex.CLASSES:
        assert f"#### {cls}" in out


def test_slope_top_matches_numerical_derivative():
    for P, k, n in [(3.0, 0.65, 2.5), (2.0, 0.5, 1.5), (4.0, 0.45, 3.0)]:
        h = 1e-6
        num = (tc.curve_f(1.0, P, k, n) - tc.curve_f(1.0 - h, P, k, n)) / h
        assert ex.slope_top(P, k, n) == pytest.approx(float(num), rel=1e-4)


def test_peak_at_default_strength():
    r = ex.evaluate(3.0, 0.65, 2.5, 1.05)
    assert r["peak045"] == pytest.approx(1.9)
    assert r["amp_t1"] > r["amp_t045"] > 1.0


def test_amp_t0_is_sdr_step_and_amp_monotonic_in_t():
    a0 = ex.amp_enc_max(3.0, 0.55, 2.0, 1.0, 0.0)
    a1 = ex.amp_enc_max(3.0, 0.55, 2.0, 1.0, 1.0)
    am = ex.amp_enc_max(3.0, 0.55, 2.0, 1.0, 0.5)
    assert a0 < am < a1
    # SDR 입력 스텝(1/255 인코딩) 근처: 색 변환 후에도 하이라이트 스텝이 1 부근이다.
    assert 0.9 < a0 < 1.2


def test_identity_gray_has_no_negative_channels():
    assert ex.neg_channel_pct(2.0, 0.75, 3.0, 1.0) == 0.0


def test_passes_reports_violations():
    r = ex.evaluate(4.0, 0.45, 1.5, 1.2)
    bad = ex.passes(r, "정확")
    assert "C2" in bad  # 피크 1 + 0.45*3 = 2.35 > 2.0
    ok = dict(r, peak045=1.5, amp_t1=1.0, neg_pct=0.0, k=0.5, s2_fail=[])
    assert ex.passes(ok, "정확") == []
    assert "C3" in ex.passes(dict(ok, k=0.4), "정확")


def test_candidates_sorted_and_all_pass():
    for cls in ex.CLASSES:
        ok = ex.candidates(cls)
        assert all(not ex.passes(r, cls) for r in ok)
        amps = [r["amp_t1"] for r in ok]
        assert amps == sorted(amps)
        pk = [r["peak045"] for r in ex.candidates_by_peak(cls)]
        assert pk == sorted(pk, reverse=True)
        assert len(pk) == len(ok)


def test_midtone_unchanged_below_k():
    # k >= 0.45 이면 Y=0.18, 0.4 는 항등 구간.
    for r in ex.all_rows():
        assert r["mid018"] == pytest.approx(1.0)
        assert r["mid04"] == pytest.approx(1.0)


def test_c1_only_failure_is_excluded_unless_ignored():
    # n=1.5 는 S2 C1(연속) 검사에서만 걸린다 (STATUS: 검사법 문제 의심) -> 기본은 제외, 옵션으로 포함.
    r = ex.evaluate(3.0, 0.55, 1.5, 1.0)
    assert r["s2_fail"] == ["c1"]
    assert "C5" in ex.passes(r, "선명")
    assert "C5" not in ex.passes(r, "선명", ignore_c1=True)
    assert len(ex.candidates("균형", ignore_c1=True)) > len(ex.candidates("균형"))
