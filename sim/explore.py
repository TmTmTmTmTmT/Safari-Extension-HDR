"""S11: 프리셋 곡선 탐색 (PLAN D-M4 M4-A). 격자의 각 조합이 M4-1 판정 기준 C1~C5를 만족하는지 표로 낸다.

이 모듈은 수치를 고르지 않는다. 통과 후보를 정렬해 보여 줄 뿐이며 프리셋 수치는 Opus가 개정한다.

격자 (g=1.0, hs=1.0 고정 — PLAN M4-1 "hs 기본 1.0"):
  k in {0.45, 0.5, 0.55, 0.6, 0.65}, n in {1.5, 2.0, 2.5, 3.0}, P in {2.0, 2.5, 3.0, 3.5, 4.0}, s in {1.0, 1.05, 1.2}

열:
  amp_t1    : 회색 램프 인접 코드 스텝의 출력 인코딩 증폭 최대 (하이라이트 코드만, banding.py 정의), 강도 t=1.
  amp_t045  : 같은 지표, 강도 t=0.45 (선형 P3에서 identity와 섞은 뒤 OETF).
  slope1    : 꼭대기 기울기 f'(1) = 1 + n (P' - 1), P' = (P-k)/(1-k).
  peak045   : 기본 강도 0.45의 흰색 피크 = 1 + 0.45 (P g - 1).
  neg%      : 9^3 RGB 격자, t=1 선형 P3 채널 중 음수 비율(%) (S4 음수 채널과 같은 정의).
  mid018/04 : f(Y)/Y at Y=0.18, 0.4 (미드톤 보존, C3와 함께 본다).
C 기준 (프리셋 클래스별): PLAN D-M4 M4-1.
  C1 amp_t1 <= 한도, C2 peak045 <= 한도, C3 k >= 0.45, C4 neg% <= 한도, C5 단조·C1연속·NaN 없음(S2 check).
임의로 정한 사항: 회색 램프는 banding.py와 같은 8bit 코드 0~255, 음수 채널 격자는 9^3, 정렬 동률은 입력 순서.
"""

import itertools

import numpy as np

from sim import banding, sweep
from sim import tonecurve as tc
from sim._md import md_table

K_GRID = (0.45, 0.5, 0.55, 0.6, 0.65)
N_GRID = (1.5, 2.0, 2.5, 3.0)
P_GRID = (2.0, 2.5, 3.0, 3.5, 4.0)
S_GRID = (1.0, 1.05, 1.2)
HS = 1.0
G = 1.0
T_DEFAULT = 0.45

# PLAN D-M4 M4-1 판정 기준. neg_max 는 % 단위.
CLASSES = {
    "정확": {"amp_max": 3.5, "peak_max": 2.0, "neg_max": 0.0},
    "균형": {"amp_max": 4.5, "peak_max": 2.0, "neg_max": 2.0},
    "선명": {"amp_max": 5.5, "peak_max": 2.5, "neg_max": 12.0},
}
K_MIN = 0.45  # C3

_CODES = np.arange(256)
_GRAY = np.repeat((_CODES / 255.0)[:, None], 3, axis=1)
_GRID = None


def _rgb_grid(n=9):
    v = np.linspace(0, 1, n)
    return np.stack(np.meshgrid(v, v, v, indexing="ij"), -1).reshape(-1, 3)


def amp_enc_max(P, k, n, s, t, hs=HS, g=G):
    """회색 램프 하이라이트 코드의 출력 인코딩 스텝 증폭 최대. t 는 identity 와의 혼합 강도."""
    p = dict(P=P, k=k, n=n, g=g, s=s, hs=hs)
    lin = tc.itm_linear_strength(_GRAY, t, **p)[:, 1]
    enc = tc.srgb_oetf_ext(lin)
    amp = np.diff(enc) * 255.0
    lin_in = tc.srgb_eotf(_CODES / 255.0)
    hi = (lin_in[:-1] * g) > k
    return float(amp[hi].max()) if hi.any() else 1.0


def slope_top(P, k, n):
    """꼭대기 기울기 f'(1) = 1 + n (P' - 1)."""
    return 1.0 + n * ((P - k) / (1 - k) - 1.0)


def neg_channel_pct(P, k, n, s, hs=HS, g=G):
    global _GRID
    if _GRID is None:
        _GRID = _rgb_grid()
    lin = tc.itm_linear(_GRID, P, k, n, g, s, hs)
    return float(np.mean(lin < -1e-9) * 100.0)


def evaluate(P, k, n, s, hs=HS, g=G, t=T_DEFAULT):
    """한 조합의 모든 지표."""
    return {
        "P": P,
        "k": k,
        "n": n,
        "s": s,
        "amp_t1": amp_enc_max(P, k, n, s, 1.0, hs, g),
        "amp_t045": amp_enc_max(P, k, n, s, t, hs, g),
        "slope1": slope_top(P, k, n),
        "peak045": 1.0 + t * (P * g - 1.0),
        "neg_pct": neg_channel_pct(P, k, n, s, hs, g),
        "mid018": float(tc.curve_scale(0.18, P, k, n)),
        "mid04": float(tc.curve_scale(0.4, P, k, n)),
        "s2_fail": sweep.check(P, k, n, g, s, hs),
    }


def passes(row, cls, ignore_c1=False):
    """클래스 기준 C1~C5 통과 여부와 위반 항목 이름. ignore_c1 이면 S2 의 C1 연속 검사 위반(STATUS: 검사법 문제 의심)만 있는 행을 통과로 본다."""
    c = CLASSES[cls]
    bad = []
    if not row["amp_t1"] <= c["amp_max"]:
        bad.append("C1")
    if not row["peak045"] <= c["peak_max"] + 1e-9:
        bad.append("C2")
    if not row["k"] >= K_MIN:
        bad.append("C3")
    if not row["neg_pct"] <= c["neg_max"] + 1e-9:
        bad.append("C4")
    fails = [f for f in row["s2_fail"] if not (ignore_c1 and f == "c1")]
    if fails:
        bad.append("C5")
    return bad


def all_rows():
    return [
        evaluate(P, k, n, s)
        for k, n, P, s in itertools.product(K_GRID, N_GRID, P_GRID, S_GRID)
    ]


def candidates(cls, rows=None, ignore_c1=False):
    """통과 행. 정렬: amp_t1 오름차순 → peak045 내림차순 (PLAN M4-A)."""
    rows = all_rows() if rows is None else rows
    ok = [r for r in rows if not passes(r, cls, ignore_c1)]
    ok.sort(key=lambda r: (r["amp_t1"], -r["peak045"]))
    return ok


def candidates_by_peak(cls, rows=None, ignore_c1=False):
    """통과 행을 피크 내림차순 → amp_t1 오름차순으로 (가장 강한 후보 참고용)."""
    rows = all_rows() if rows is None else rows
    ok = [r for r in rows if not passes(r, cls, ignore_c1)]
    ok.sort(key=lambda r: (-r["peak045"], r["amp_t1"]))
    return ok


HEADERS = ["P", "k", "n", "s", "amp_t1", "amp_t045", "f'(1)", "peak@0.45", "neg%", "mid0.18", "mid0.4"]


def _row(r):
    return [
        r["P"],
        r["k"],
        r["n"],
        r["s"],
        round(r["amp_t1"], 2),
        round(r["amp_t045"], 2),
        round(r["slope1"], 2),
        round(r["peak045"], 3),
        round(r["neg_pct"], 2),
        round(r["mid018"], 4),
        round(r["mid04"], 4),
    ]


def report(top=5):
    rows = all_rows()
    lines = [
        "### S11 프리셋 곡선 탐색 (PLAN D-M4 M4-A, 값만 출력, 수치 선택은 Opus)",
        "",
        f"격자 k {K_GRID} x n {N_GRID} x P {P_GRID} x s {S_GRID}, g=1.0, hs=1.0 ({len(rows)}개 조합). "
        "기준: C1 amp_t1 한도, C2 peak@0.45 한도, C3 k>=0.45, C4 neg% 한도, C5 S2 검사.",
        "",
    ]
    for cls, c in CLASSES.items():
        ok = candidates(cls, rows)
        lines += [
            f"#### {cls}: 한도 amp_t1<={c['amp_max']}, peak@0.45<={c['peak_max']}, neg%<={c['neg_max']} — 통과 {len(ok)}/{len(rows)}",
            "",
        ]
        if ok:
            lines += [
                f"amp_t1 오름차순 상위 {top}",
                "",
                md_table(HEADERS, [_row(r) for r in ok[:top]]),
                "",
                f"peak@0.45 내림차순 상위 {top} (가장 강한 후보 참고)",
                "",
                md_table(HEADERS, [_row(r) for r in candidates_by_peak(cls, rows)[:top]]),
                "",
            ]
            only_c1 = [r for r in candidates(cls, rows, ignore_c1=True) if r["s2_fail"]]
            if only_c1:
                lines += [
                    f"참고: S2 C¹ 위반만 있는 행 포함 시 추가 {len(only_c1)}개 (amp_t1 오름차순 상위 {top})",
                    "",
                    md_table(HEADERS, [_row(r) for r in only_c1[:top]]),
                    "",
                ]
        else:
            # 통과 후보가 없으면 위반 항목별 최소 위반 행을 낸다.
            near = sorted(rows, key=lambda r: (len(passes(r, cls)), r["amp_t1"]))[:top]
            lines += [
                "통과 후보 없음. 위반 항목 수가 적은 상위 행:",
                "",
                md_table(HEADERS + ["위반"], [_row(r) + [",".join(passes(r, cls))] for r in near]),
                "",
            ]
    return "\n".join(lines).rstrip() + "\n"


if __name__ == "__main__":
    print(report())
