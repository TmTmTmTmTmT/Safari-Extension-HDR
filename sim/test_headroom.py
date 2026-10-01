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
    # M4 프리셋은 모두 g=1.0 이라 게인 효과를 프리셋 복사본(g=1.05)으로 확인한다:
    # 코드 255 의 게인 후 Y>1 -> 곡선 연장으로 P 를 넘어 H=P 에서도 잘린다.
    from dataclasses import replace

    p = replace(PRESETS["선명"], g=1.05)
    assert headroom.output_luminance(p)[255] > p.P
    cnt, _, hi, _ = headroom.clip_stats(p, 4)
    assert cnt >= 1 and hi == 255


def test_zero_code_is_zero_and_monotonic():
    for p in PRESETS.values():
        y = headroom.output_luminance(p)
        assert y[0] == 0.0
        assert (y[1:] > y[:-1]).all()


def _tables():
    tables, cur = [], []
    for l in headroom.report().splitlines():
        if l.startswith("|"):
            cur.append(l)
        elif cur:
            tables.append(cur)
            cur = []
    if cur:
        tables.append(cur)
    return tables


def test_report_table_format():
    lines = headroom.report().splitlines()
    assert lines[0].startswith("### S10 ")
    tbl = _tables()[0]
    assert tbl[0] == "| 프리셋 | P | H | 넘는 코드 수 | 넘는 코드 범위 | 넘는 비율 |"
    assert tbl[1] == "| " + " | ".join(["---"] * 6) + " |"
    assert len(tbl) == 2 + 3 * 3
    assert all(l.count("|") == 7 for l in tbl)


def test_strength_table_format_and_t1_matches_s10():
    tbl = _tables()[1]
    assert tbl[0] == "| 프리셋 | P | t | H | 넘는 코드 수 | 넘는 코드 범위 | 넘는 비율 |"
    assert len(tbl) == 2 + 3 * len(headroom.STRENGTHS) * len(headroom.HEADROOMS)
    for p in PRESETS.values():
        for H in headroom.HEADROOMS:
            # t=1 은 게인 포함 ITM 곡선이므로 S10 과 같다.
            assert headroom.clip_stats_strength(p, H, 1.0) == headroom.clip_stats(p, H)


def test_balanced_half_strength_has_no_clipping_at_headroom_two():
    # PLAN D-M4a 근거: 균형 P=3, t=0.5 -> 피크 2.0 이므로 H=2 에서 잘리는 코드 없음.
    assert headroom.clip_stats_strength(PRESETS["균형"], 2, 0.5)[0] == 0
