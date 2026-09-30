"""S1~S7 전체 실행 후 요약 마크다운을 stdout 에 출력. 사용: python3 -m sim.run_all"""

import numpy as np

from sim import banding, budget, color, compare, refs, sweep
from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS


def s1_report():
    Y = np.linspace(0, 1, 100001)
    rows = []
    for nm, p in PRESETS.items():
        f = tc.curve_f(Y, p.P, p.k, p.n)
        lo = Y <= p.k
        rows.append(
            [
                nm,
                "통과" if bool(np.all(np.diff(f) > 0)) else "위반",
                float(np.max(np.abs(f[lo] - Y[lo]))),
                float(tc.curve_f(1.0, p.P, p.k, p.n)),
                "통과" if not sweep.check_preset(nm) else "위반",
                float(tc.curve_f(0.9, p.P, p.k, p.n)),
            ]
        )
    return "\n".join(
        [
            "### S1 톤 커브",
            "",
            md_table(["프리셋", "단조", "Y<=k 항등 최대 오차", "f(1)", "S2 전체 검사", "f(0.9)"], rows),
        ]
    )


def main():
    parts = [
        "# 시뮬레이션 요약 (S1~S7)",
        "",
        "클라우드 numpy 결과이며 WebGPU/EDR/Safari 동작은 미검증(사용자 Mac 필요).",
        "",
        s1_report(),
        "",
        sweep.report(),
        "",
        refs.report(),
        "",
        color.report(),
        "",
        banding.report(),
        "",
        compare.report(),
        "",
        budget.report(),
    ]
    print("\n".join(parts))


if __name__ == "__main__":
    main()
