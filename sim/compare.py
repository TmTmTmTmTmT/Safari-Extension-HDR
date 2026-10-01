"""S6: 자체 곡선 vs BT.2446 Method C 역변환 vs BT.2408 display-light 비교표. 근거: PLAN.md F절 S6.

모든 곡선은 '출력 상대 휘도 = F(입력 선형 상대 휘도)' 이고 SDR white = 1 (EDR 상대값) 이다.

출처와 확신도:
  - 자체 곡선: sim.tonecurve.curve_f (PLAN.md C절 ITM 3단계).
  - BT.2408 display-light (ITU-R BT.2408, SDR 을 HDR 로 옮기는 두 방식 중 display light 방식):
    SDR 디스플레이가 내는 빛(display light)을 그대로 HDR 신호의 같은 절대 휘도로 옮긴다.
    EDR 에서는 SDR white 가 곧 기준 흰색(BT.2408 graphics/reference white 203 cd/m2, 확신)이므로 F(Y)=Y 항등 = 기준선(PLAN F절).
    다른 방식(scene light)은 이 표에 넣지 않았다.
  - BT.2446 Method C (ITU-R BT.2446-1, 다이내믹레인지 변환 방법 C) 역변환:
    미확인: 실제 권고의 계수(선형/로그 접점 Y'ip, k1~k4, crosstalk 계수, 기준 흰색/피크 nit)를 확신 있게 기억하지 못하며
    네트워크 조회도 하지 않았다. 따라서 이 파일의 구현은 권고 원문이 아니라 '구조 근사'다:
    "낮은 구간은 선형(항등), 접점 Y_ip 위는 로그(지수) 형태 확장" 이라는 구조만 따르고
    접점 연속(f(ip)=ip), 접점 기울기 1, f(1)=P 세 제약으로 지수 계수를 결정한다:
        F(Y) = Y_ip + (exp(b (Y-Y_ip)) - 1) / b   (Y > Y_ip),  b 는 F(1)=P 에서 수치 해.
    Y_ip 는 원문 값이 아니라 비교 대상 프리셋의 k 를 사용한다(미확인). crosstalk/색 처리는 포함하지 않는다.
    => 결과표의 'Method C' 열은 권고 재현이 아니며 Opus 가 방법 선택 시 원문 확인 필요.
"""

import numpy as np

from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS

BT2408_REF_WHITE_NITS = 203  # BT.2408 reference white (확신)


def display_light(Y, P=None, k=None, n=None):
    return np.asarray(Y, float)


def own(Y, P, k, n):
    return tc.curve_f(Y, P, k, n)


def solve_b(P, k):
    """(exp(b(1-k)) - 1)/b = P-k 의 해 b (>=0). P-k <= 1-k 이면 0."""
    u, w = 1.0 - k, P - k
    if w <= u + 1e-12:
        return 0.0
    lo, hi = 1e-9, 1.0
    while (np.expm1(hi * u) / hi) < w:
        hi *= 2
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if np.expm1(mid * u) / mid < w:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def method_c_approx(Y, P, k, n=None):
    """BT.2446 Method C 역변환의 구조 근사 (모듈 docstring 참고, 계수 미확인)."""
    Y = np.asarray(Y, float)
    b = solve_b(P, k)
    if b == 0.0:
        return Y.copy()
    x = np.maximum(Y - k, 0.0)
    return np.where(Y <= k, Y, k + np.expm1(b * x) / b)


METHODS = {
    "자체 곡선": own,
    "BT.2446 C 역변환(근사, 계수 미확인)": method_c_approx,
    "BT.2408 display-light": display_light,
}

_Y = np.linspace(0, 1, 4001)


def metrics(fn, P, k, n):
    f = fn(_Y, P, k, n)
    dev = np.abs(f[1:] - _Y[1:]) / _Y[1:]
    first = _Y[1:][dev > 0.01]
    slope = np.diff(f) / np.diff(_Y)
    mid = _Y <= 0.5
    return {
        "mid_dev_max_pct": float(np.max(np.abs(f[mid][1:] - _Y[mid][1:]) / _Y[mid][1:]) * 100),
        "first_dev_Y": float(first[0]) if first.size else float("nan"),
        "peak": float(f[-1]),
        "stops": float(np.log2(f[-1])),
        "gain_at_075": float(fn(np.array([0.75]), P, k, n)[0] / 0.75),
        "max_slope": float(slope.max()),
        "mean_gain_hi": float(np.mean(f[_Y >= 0.75][1:] / _Y[_Y >= 0.75][1:])),
    }


def report():
    lines = [
        "### S6 곡선 비교 (자체 vs BT.2446 Method C 역변환 근사 vs BT.2408 display-light)",
        "",
        "BT.2446 Method C 열은 구조 근사이며 권고 계수는 미확인이다 (sim/compare.py docstring). BT.2408 display-light 는 EDR 에서 항등(기준선).",
        "",
    ]
    for nm, pr in PRESETS.items():
        P, k, n = pr.P, pr.k, pr.n
        lines += [f"#### {nm} (P={P:g}, k={k:g}, n={n:g})", ""]
        ys = [0.05, 0.18, 0.5, 0.75, 0.9, 1.0]
        rows = [[lab] + [float(fn(np.array([y]), P, k, n)[0]) for y in ys] for lab, fn in METHODS.items()]
        lines.append(md_table(["방법"] + [f"F({y:g})" for y in ys], rows))
        lines.append("")
        rows = []
        for lab, fn in METHODS.items():
            m = metrics(fn, P, k, n)
            rows.append([lab, m["mid_dev_max_pct"], m["first_dev_Y"], m["peak"], m["stops"], m["gain_at_075"], m["mean_gain_hi"], m["max_slope"]])
        lines.append(md_table(["방법", "미드톤(Y<=0.5) 최대 편차 %", "1% 편차 시작 Y", "F(1)", "확장량(stops)", "F(0.75)/0.75", "Y>=0.75 평균 배율", "최대 기울기"], rows))
        lines.append("")
    return "\n".join(lines).rstrip()


if __name__ == "__main__":
    print(report())
