"""프리셋 3종과 파라미터 범위. 수치 출처: PLAN.md C절 표 (초안, M4에서 Opus 확정)."""

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Preset:
    name: str
    P: float  # 피크 배율
    k: float  # 확장 시작
    n: float  # 곡선 지수
    g: float  # 밝기 게인
    s: float  # 채도
    hs: float  # 하이라이트 채도

    def kwargs(self):
        d = asdict(self)
        d.pop("name")
        return d


# PLAN.md C절 "파라미터와 프리셋" 표 (2026-10-01 M4 확정)
PRESETS = {
    "정확": Preset("정확", P=2.0, k=0.5, n=2.0, g=1.0, s=1.0, hs=1.0),
    "균형": Preset("균형", P=3.0, k=0.45, n=2.0, g=1.0, s=1.0, hs=1.0),
    "선명": Preset("선명", P=4.0, k=0.45, n=2.0, g=1.0, s=1.2, hs=1.0),
}

# PLAN.md C절 표의 범위 (min, max)
RANGES = {
    "P": (1.0, 8.0),
    "k": (0.4, 0.9),
    "n": (1.5, 4.0),
    "g": (0.8, 1.5),
    "s": (0.8, 1.5),
    "hs": (0.5, 1.5),
}
