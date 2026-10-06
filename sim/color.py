"""S4: 색 왜곡 지표. 근거: PLAN.md F절 S4, G절 "색 왜곡".

측정 항목:
  1) 709->P3 후 채널 범위: sRGB 인코딩 RGB 격자(9^3)를 itm_linear 에 통과시킨 뒤
     음수 채널 비율(< -1e-9), 1.0 초과 채널 비율, P 초과 채널 비율.
  2) 채도(s)/하이라이트 채도(hs)에 따른 색 변화: ΔE ITP(ITU-R BT.2124) 와 ITP 색상각 차이.
  3) 피부톤 패치.

임의로 정한 사항 (계획에 수치 없음):
  - ITP 계산 시 SDR white(선형 1.0) = 203 cd/m2 (BT.2408 reference white). 1.0 초과 값은 비례해서 더 밝은 nit 로 본다.
    ITP 는 PQ 기반이라 음수를 다룰 수 없으므로 음수 채널은 0 으로 클립한 뒤 계산한다(음수 비율은 따로 보고).
  - ΔE ITP = 720 * sqrt(dI^2 + dT^2 + dP^2), T = 0.5 * CT (BT.2124). LMS 행렬은 BT.2100 ICtCp 계수.
  - 기준(reference) 두 가지: (a) 같은 곡선에서 s=1, hs=1 로 둔 출력 = "채도 조정만의 효과",
    (b) 확장 없는 측색적 709->P3 = "SDR 원본 대비 총 변화(밝기 확장 포함)".
  - 색상각 = atan2(P, T) (도). 무채색 근처는 정의 불안정하므로 채도 있는 패치만 사용한다.
  - 색 패치: 회색 L(0.5, 0.9)에 원색/이차색을 50% 섞은 6색. 피부톤은 Macbeth 식 sRGB 근사값
    dark(115,82,68), light(194,150,130) 과 임의의 밝게 조명된 피부 (245,205,180).
  - 목표(합격선)는 정하지 않는다. 측정값만 출력한다(Opus 확정).
"""

import numpy as np

from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS

SDR_WHITE_NITS = 203.0  # 임의(BT.2408 reference white)

_LMS = np.array([[1688, 2146, 262], [683, 2951, 462], [99, 309, 3688]], float) / 4096.0  # BT.2100 ICtCp
_M1, _M2 = 2610 / 16384, 2523 / 4096 * 128
_C1, _C2, _C3 = 3424 / 4096, 2413 / 4096 * 32, 2392 / 4096 * 32


def _pq_inv_eotf(nits):
    y = np.clip(nits / 10000.0, 0.0, 1.0) ** _M1
    return ((_C1 + _C2 * y) / (1 + _C3 * y)) ** _M2


def lin_p3_to_itp(lin_p3):
    """선형 P3 (SDR white=1) -> ITP (..., 3). 음수는 0 클립."""
    rgb = np.clip(np.asarray(lin_p3, float), 0.0, None) * SDR_WHITE_NITS
    rgb2020 = rgb @ tc.M_P3_TO_2020.T
    lms = _pq_inv_eotf(np.clip(rgb2020, 0, None) @ _LMS.T)
    L, M, S = lms[..., 0], lms[..., 1], lms[..., 2]
    I = 0.5 * L + 0.5 * M
    T = 0.5 * (6610 * L - 13613 * M + 7003 * S) / 4096
    P = (17933 * L - 17390 * M - 543 * S) / 4096
    return np.stack([I, T, P], -1)


def delta_e_itp(lin_a, lin_b):
    d = lin_p3_to_itp(lin_a) - lin_p3_to_itp(lin_b)
    return 720.0 * np.sqrt(np.sum(d**2, -1))


def hue_deg(lin_p3):
    itp = lin_p3_to_itp(lin_p3)
    return np.degrees(np.arctan2(itp[..., 2], itp[..., 1]))


def hue_diff_deg(lin_a, lin_b):
    d = hue_deg(lin_a) - hue_deg(lin_b)
    return (d + 180.0) % 360.0 - 180.0


def grid_rgb(n=9):
    v = np.linspace(0, 1, n)
    return np.stack(np.meshgrid(v, v, v, indexing="ij"), -1).reshape(-1, 3)


def out_of_range(name, n=9):
    """프리셋의 채널 범위 비율 (0~1 비율)."""
    p = PRESETS[name]
    lin = tc.itm_linear(grid_rgb(n), **p.kwargs())
    return {
        "neg_channel": float(np.mean(lin < -1e-9)),
        "neg_pixel": float(np.mean(np.any(lin < -1e-9, -1))),
        "over1_channel": float(np.mean(lin > 1.0 + 1e-9)),
        "overP_channel": float(np.mean(lin > p.P + 1e-9)),
        "min": float(lin.min()),
    }


def chroma_patches():
    """이름, RGB(인코딩) — 회색 L 에 6색 50% 혼합."""
    prim = {"R": [1, 0, 0], "G": [0, 1, 0], "B": [0, 0, 1], "C": [0, 1, 1], "M": [1, 0, 1], "Y": [1, 1, 0]}
    names, rows = [], []
    for L in (0.5, 0.9):
        for nm, c in prim.items():
            names.append(f"{nm}@L{L}")
            rows.append(L * 0.5 + 0.5 * np.array(c, float))
    return names, np.array(rows)


SKIN = {
    "피부 dark": (115, 82, 68),
    "피부 light": (194, 150, 130),
    "피부 밝은조명": (245, 205, 180),
}


def skin_rgb():
    return list(SKIN), np.array(list(SKIN.values()), float) / 255.0


def _ref_kwargs(p):
    d = dict(p)
    d["s"], d["hs"] = 1.0, 1.0
    return d


def color_shift(rgb, params):
    """패치별 (ΔE vs 채도조정 없음, 색상각차(도), ΔE vs SDR 측색적)."""
    out = tc.itm_linear(rgb, **params)
    ref = tc.itm_linear(rgb, **_ref_kwargs(params))
    sdr = tc.input_eotf(rgb) @ tc.M709_TO_P3.T
    return delta_e_itp(out, ref), hue_diff_deg(out, ref), delta_e_itp(out, sdr)


def sat_hs_sweep(base="균형", s_list=(0.8, 1.0, 1.2, 1.5), hs_list=(0.5, 1.0, 1.5)):
    """base 프리셋 곡선에서 s, hs 만 바꿔 색 패치 ΔE(채도조정 효과) 평균/최대와 최대 Δh 절대값.
    mid/hi 구분: 패치의 곡선 입력 휘도(게인 후)가 base 의 k 이하면 mid, 넘으면 hi (M4: k 가 0.45 로 내려가
    L0.5 패치 일부도 확장 구간에 들어가므로 이름이 아니라 휘도로 나눈다)."""
    names, rgb = chroma_patches()
    base_p = PRESETS[base].kwargs()
    y = (tc.input_eotf(rgb) * base_p["g"]) @ tc.LUMA_709
    hi = y > base_p["k"]
    rows = []
    for s in s_list:
        for hs in hs_list:
            p = dict(base_p)
            p["s"], p["hs"] = s, hs
            de, dh, _ = color_shift(rgb, p)
            rows.append(
                dict(
                    s=s,
                    hs=hs,
                    de_mid_max=float(de[~hi].max()),
                    de_hi_max=float(de[hi].max()),
                    dh_max=float(np.abs(dh).max()),
                )
            )
    return rows


def report():
    lines = ["### S4 색 왜곡", "", f"ITP 계산 기준: SDR white = {SDR_WHITE_NITS:g} nit (임의), 음수는 0 클립.", ""]
    rows = []
    for nm in PRESETS:
        r = out_of_range(nm)
        rows.append([nm, r["neg_channel"] * 100, r["neg_pixel"] * 100, r["over1_channel"] * 100, r["overP_channel"] * 100, r["min"]])
    lines += ["채널 범위 (RGB 9^3 격자, %):", ""]
    lines.append(md_table(["프리셋", "음수 채널 %", "음수 포함 픽셀 %", "1.0 초과 채널 %", "P 초과 채널 %", "최소 선형값"], rows))
    lines += ["", "s/hs 스윕 (균형 곡선, 색 패치 ΔE ITP vs s=hs=1):", ""]
    sw = sat_hs_sweep()
    lines.append(md_table(["s", "hs", "ΔE 미드톤 최대", "ΔE 하이라이트 최대", "Δh 절대값 최대(도)"], [[r["s"], r["hs"], r["de_mid_max"], r["de_hi_max"], r["dh_max"]] for r in sw]))
    lines += ["", "프리셋별 색 패치/피부톤 (ΔE ITP):", ""]
    rows = []
    for nm, pr in PRESETS.items():
        for label, (names, rgb) in (("색패치", chroma_patches()), ("피부톤", skin_rgb())):
            de, dh, dsdr = color_shift(rgb, pr.kwargs())
            rows.append([nm, label, float(de.mean()), float(de.max()), float(np.abs(dh).max()), float(dsdr.mean()), float(dsdr.max())])
    lines.append(md_table(["프리셋", "대상", "ΔE(채도효과) 평균", "ΔE 최대", "Δh 절대값 최대(도)", "ΔE(vs SDR) 평균", "ΔE(vs SDR) 최대"], rows))
    lines += ["", "피부톤 개별 (ΔE vs s=hs=1 / ΔE vs SDR):", ""]
    names, rgb = skin_rgb()
    rows = []
    for nm, pr in PRESETS.items():
        de, dh, dsdr = color_shift(rgb, pr.kwargs())
        for i, pn in enumerate(names):
            rows.append([nm, pn, float(de[i]), float(dh[i]), float(dsdr[i])])
    lines.append(md_table(["프리셋", "패치", "ΔE(채도효과)", "Δh(도)", "ΔE(vs SDR)"], rows))
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())
