import pytest

from sim import budget


def test_content_rect_xdr():
    assert budget.content_rect((3024, 1964)) == (3024, 1701)
    assert budget.content_rect((3456, 2234)) == (3456, 1944)


def test_canvas_sizes():
    assert budget.canvas_size((3840, 2160)) == (3840, 2160)
    assert budget.canvas_size((3840, 2160), (3024, 1964)) == (3024, 1701)
    assert budget.canvas_size((3840, 2160), (3456, 2234)) == (3456, 1944)
    assert budget.canvas_size((1920, 1080), (3024, 1964)) == (1920, 1080)  # 소스가 더 작으면 소스


def test_canvas_gbps_2160p60():
    r = budget.model("x", (3840, 2160), None)
    assert r.canvas_gbps == pytest.approx(3840 * 2160 * 8 * 60 / 1e9)
    assert r.canvas_mb == pytest.approx(3840 * 2160 * 8 / 1e6)


def test_hidden_video_layer_cheaper_and_monotonic():
    a = budget.model("x", (3840, 2160), (3024, 1964))
    b = budget.model("x", (3840, 2160), (3024, 1964), hide_video_layer=True)
    assert b.total_gbps < a.total_gbps
    lo = budget.model("x", (1920, 1080), None)
    hi = budget.model("x", (3840, 2160), None)
    assert lo.ms_peak < hi.ms_peak


def test_ms_consistent_with_bandwidth():
    r = budget.model("x", (3840, 2160), (3456, 2234))
    assert r.ms_peak == pytest.approx(r.total_gbps / budget.FPS / budget.BW_GBPS * 1e3)
    assert r.ms_eff == pytest.approx(r.ms_peak / budget.EFF)


def test_report_rows():
    rep = budget.report()
    assert rep.count("XDR 14") >= 6 and "XDR 16" in rep and "16.6" in rep
