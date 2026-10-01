"""S10: 헤드룸 클리핑. 근거: PLAN.md C절 "0a 헤드룸 제약", F절 S10, FIX_GUIDE.md H5.

프리셋 3종 x 헤드룸 H in {2,3,4} 에 대해, 8bit 회색 입력 코드 0~255 가 톤 커브를 거친 뒤
출력 휘도가 H 를 넘어 시스템에 잘리는 코드의 수, 입력 코드 범위, 비율을 낸다. 판정은 하지 않고 값만 출력한다.

출력 휘도 정의 (sim/tonecurve.py 와 동일): SDR white = 1.0 기준 선형 상대 휘도.
  코드 c -> v = c/255 (sRGB 인코딩) -> srgb_eotf(v) -> 밝기 게인 g 곱 -> Y -> curve_f(Y, P, k, n) = 출력 휘도.
회색은 채도 단계와 709->P3 행렬(행 합 1)에서 휘도가 변하지 않으므로 출력 휘도 = curve_f 값이다.

임의로 정한 사항:
  - 프리셋의 밝기 게인 g 를 곡선 입력 전에 곱한다 (tonecurve.itm_linear 의 2단계와 동일). g>1 이면 f(Y) 가 P 를 넘을 수 있다.
  - "넘는다" 는 출력 휘도 > H + 1e-9 (부동소수 오차 허용, 같으면 넘지 않음).
  - 비율 = 넘는 코드 수 / 256 (전체 코드 수 기준).
"""

import numpy as np

from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS

HEADROOMS = (2, 3, 4)
CODES = np.arange(256)
EPS = 1e-9


def output_luminance(preset, codes=CODES):
    """8bit 회색 코드 -> 출력 휘도 (SDR white=1 기준 선형)."""
    Y = tc.srgb_eotf(np.asarray(codes, dtype=np.float64) / 255.0) * preset.g
    return tc.curve_f(Y, preset.P, preset.k, preset.n)


def clip_stats(preset, H):
    """반환: (넘는 코드 수, 최소 코드 또는 None, 최대 코드 또는 None, 비율)."""
    over = np.nonzero(output_luminance(preset) > H + EPS)[0]
    if over.size == 0:
        return 0, None, None, 0.0
    return int(over.size), int(over.min()), int(over.max()), over.size / len(CODES)


def table_rows():
    rows = []
    for nm, p in PRESETS.items():
        for H in HEADROOMS:
            cnt, lo, hi, frac = clip_stats(p, H)
            rng = "-" if cnt == 0 else f"{lo}~{hi}"
            rows.append([nm, p.P, H, cnt, rng, f"{frac:.1%}"])
    return rows


STRENGTHS = (0.25, 0.5, 0.75, 1.0)


def output_luminance_strength(preset, t, codes=CODES):
    """강도 혼합 후 8bit 회색 코드의 출력 휘도: id + t * (itm - id), id 는 게인 없는 선형 휘도 (PLAN D-M4a)."""
    lin = tc.srgb_eotf(np.asarray(codes, dtype=np.float64) / 255.0)
    itm = tc.curve_f(lin * preset.g, preset.P, preset.k, preset.n)
    return lin + t * (itm - lin)


def clip_stats_strength(preset, H, t):
    """반환: (넘는 코드 수, 최소 코드 또는 None, 최대 코드 또는 None, 비율)."""
    over = np.nonzero(output_luminance_strength(preset, t) > H + EPS)[0]
    if over.size == 0:
        return 0, None, None, 0.0
    return int(over.size), int(over.min()), int(over.max()), over.size / len(CODES)


def table_rows_strength():
    rows = []
    for nm, p in PRESETS.items():
        for t in STRENGTHS:
            for H in HEADROOMS:
                cnt, lo, hi, frac = clip_stats_strength(p, H, t)
                rng = "-" if cnt == 0 else f"{lo}~{hi}"
                rows.append([nm, p.P, t, H, cnt, rng, f"{frac:.1%}"])
    return rows


def report():
    lines = [
        "### S10 헤드룸 클리핑 (8bit 회색 코드 0~255, 값만 출력)",
        "",
        "출력 휘도 = SDR white 1.0 기준 선형 휘도(tonecurve.curve_f, 프리셋 g 적용). H 를 넘는 코드는 시스템이 잘라낸다.",
        "",
        md_table(["프리셋", "P", "H", "넘는 코드 수", "넘는 코드 범위", "넘는 비율"], table_rows()),
        "",
        "### S10b 강도 t 혼합 후 헤드룸 클리핑 (PLAN D-M4a, 값만 출력)",
        "",
        md_table(
            ["프리셋", "P", "t", "H", "넘는 코드 수", "넘는 코드 범위", "넘는 비율"],
            table_rows_strength(),
        ),
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())
