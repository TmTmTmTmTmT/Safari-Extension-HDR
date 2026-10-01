"""JS 미러 검증용 참조값 생성 (PLAN D-M4 M4-B, GUIDELINES 3-2). 사용: python -m sim.export_ref

tests/unit/fixtures/tonecurve-ref.json 을 만든다. 같은 수식을 확장 content/tonecurve.js 가 구현하고
tests/unit/extension-tonecurve.test.js 가 오차 < 1e-4 로 비교한다.
"""

import json
import os

import numpy as np

from sim import sharpen as sh
from sim import tonecurve as tc
from sim.presets import PRESETS

OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tests", "unit", "fixtures", "tonecurve-ref.json")
PRESET_IDS = {"정확": "accurate", "균형": "balanced", "선명": "vivid"}
STRENGTHS = (0.0, 0.45, 1.0)
CSATS = (0.5, 1.0, 1.5)
SHARPS = (0.0, 0.5, 1.0)


def sample_points():
    ramp = [[c / 255.0] * 3 for c in list(range(0, 256, 4)) + [253, 254, 255]]
    v = np.linspace(0, 1, 5)
    grid = np.stack(np.meshgrid(v, v, v, indexing="ij"), -1).reshape(-1, 3).tolist()
    # 경계값: 곡선 시작점 근처와 모서리
    edge = [[0.0, 0.0, 0.0], [1.0, 1.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [0.7, 0.7, 0.7]]
    return ramp + grid + edge


def build():
    pts = np.array(sample_points())
    cases = []
    for name, preset in PRESETS.items():
        for t in STRENGTHS:
            for cs in CSATS:
                lin = tc.itm_linear_strength(pts, t, **preset.kwargs())
                lin = tc.saturate_p3(lin, cs)
                cases.append(
                    {
                        "preset": PRESET_IDS[name],
                        "params": preset.kwargs(),
                        "strength": t,
                        "csat": cs,
                        "out": np.round(lin, 9).tolist(),
                    }
                )
    rng = np.random.default_rng(20261001)
    n = 120
    center = rng.uniform(0, 1, size=(n, 3))
    nb = rng.uniform(0, 1, size=(n, 4, 3))
    sharp_cases = []
    for sharp in SHARPS:
        out = sh.sharpen_pixel(center, nb[:, 0], nb[:, 1], nb[:, 2], nb[:, 3], sharp)
        sharp_cases.append({"sharp": sharp, "out": np.round(out, 9).tolist()})
    return {
        "points": np.round(pts, 9).tolist(),
        "cases": cases,
        "sharpen": {
            "center": np.round(center, 9).tolist(),
            "neighbors": np.round(nb, 9).tolist(),
            "gain": sh.GAIN,
            "limit": sh.LIMIT,
            "cases": sharp_cases,
        },
        "luma_p3": [round(float(x), 9) for x in tc.LUMA_P3],
    }


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(build(), f, separators=(",", ":"))
        f.write("\n")
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
