"""S2: 프리셋 범위 격자 스윕. 위반 행 표시, 마크다운 출력."""

import itertools

import numpy as np

from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS, RANGES

GRID = {
    "P": [1.0, 2.0, 3.0, 4.0, 6.0, 8.0],
    "k": [0.4, 0.55, 0.65, 0.75, 0.9],
    "n": [2.0, 2.5, 3.0, 4.0],  # M5: 하한 2.0 (RANGES 와 같음)
    "g": [0.8, 1.0, 1.05, 1.5],
    "s": [0.8, 1.0, 1.2, 1.5],
    "hs": [0.5, 1.0, 1.5],
}
_Y = np.linspace(0, 1, 2049)
_GRAY = np.repeat(np.linspace(0, 1, 257)[:, None], 3, axis=1)
_BARS = np.array(
    [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 1], [0, 0, 0]], float
)


def check(P, k, n, g, s, hs):
    """반환: 위반 항목 이름 리스트."""
    v = []
    f = tc.curve_f(_Y, P, k, n)
    if not np.all(np.isfinite(f)) or f.min() < 0:
        v.append("nan_or_neg")
    if not np.all(np.diff(f) > 0):
        v.append("monotonic")
    lo = _Y[_Y <= k]
    if np.max(np.abs(tc.curve_f(lo, P, k, n) - lo)) >= 1e-6:
        v.append("identity")
    if abs(float(tc.curve_f(1.0, P, k, n)) - P) >= 1e-9:
        v.append("f1")
    h = 1e-6
    left = (tc.curve_f(k, P, k, n) - tc.curve_f(k - h, P, k, n)) / h
    right = (tc.curve_f(k + h, P, k, n) - tc.curve_f(k, P, k, n)) / h
    if abs(left - right) >= 1e-4:
        v.append("c1")
    out = tc.itm(np.concatenate([_GRAY, _BARS]), P, k, n, g, s, hs)
    if not np.all(np.isfinite(out)):
        v.append("pipeline_nan")
    gray = tc.itm(_GRAY, P, k, n, g, s, hs)[:, 1]
    if gray.min() < -1e-9 or not np.all(np.diff(gray) > 0):
        v.append("gray_ramp")
    return v


def run_grid():
    keys = list(GRID)
    rows = []
    for vals in itertools.product(*(GRID[k] for k in keys)):
        p = dict(zip(keys, vals))
        rows.append((p, check(**p)))
    return rows


def check_preset(name):
    return check(**PRESETS[name].kwargs())


def report():
    rows = run_grid()
    viol = [(p, v) for p, v in rows if v]
    lines = [
        "### S2 파라미터 스윕",
        "",
        f"격자 {len(rows)}점 (범위 {RANGES}), 위반 {len(viol)}점.",
        "",
    ]
    tr = [[nm] + [getattr(pr, a) for a in RANGES] + ["통과" if not check_preset(nm) else "위반 " + ",".join(check_preset(nm))]
          for nm, pr in PRESETS.items()]
    lines.append(md_table(["프리셋", *RANGES, "판정"], tr))
    if viol:
        lines += ["", "위반 행 (최대 20행):", ""]
        lines.append(md_table([*RANGES, "위반"], [[*p.values(), ",".join(v)] for p, v in viol[:20]]))
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())
