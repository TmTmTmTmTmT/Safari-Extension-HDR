import pytest

from sim import headroom
from sim.presets import PRESETS


@pytest.mark.parametrize("nm", list(PRESETS))
@pytest.mark.parametrize("H", headroom.HEADROOMS)
def test_over_count_matches_peak(nm, H):
    p = PRESETS[nm]
    cnt, lo, hi, frac = headroom.clip_stats(p, H)
    if p.P <= H and p.g <= 1.0:
        assert cnt == 0 and lo is None and hi is None and frac == 0.0
    elif p.P > H:
        assert cnt >= 1
        assert hi == 255  # 출력은 코드에 대해 단조 증가 -> 최대 코드 포함
        assert lo <= hi and cnt <= hi - lo + 1
        assert frac == pytest.approx(cnt / 256)


def test_gain_above_one_exceeds_p_at_equal_headroom():
    # 선명: g=1.05 라서 코드 255 의 게인 후 Y>1 -> 곡선 연장으로 P=4 를 넘는다 (H=4 에서도 잘림).
    p = PRESETS["선명"]
    assert headroom.output_luminance(p)[255] > p.P
    cnt, _, hi, _ = headroom.clip_stats(p, 4)
    assert cnt >= 1 and hi == 255


def test_zero_code_is_zero_and_monotonic():
    for p in PRESETS.values():
        y = headroom.output_luminance(p)
        assert y[0] == 0.0
        assert (y[1:] > y[:-1]).all()


def test_report_table_format():
    lines = headroom.report().splitlines()
    assert lines[0].startswith("### S10 ")
    tbl = [l for l in lines if l.startswith("|")]
    assert tbl[0] == "| 프리셋 | P | H | 넘는 코드 수 | 넘는 코드 범위 | 넘는 비율 |"
    assert tbl[1] == "| " + " | ".join(["---"] * 6) + " |"
    assert len(tbl) == 2 + 3 * 3
    assert all(l.count("|") == 7 for l in tbl)
