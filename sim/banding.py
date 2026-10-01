"""S5: 8bit 계조 확장 밴딩 측정. 근거: PLAN.md F절 S5, G절 "8bit 밴딩 확대".

측정 대상은 회색 램프 8bit 코드 c -> c+1 인접 스텝(c=0..254, 입력은 sRGB 인코딩 c/255).
지표 (값만 출력, 기준은 Opus 확정):
  amp_enc : 출력 인코딩(확장 sRGB, rgba16f 에 저장되는 값)의 스텝 / 입력 인코딩 스텝(1/255).
            1 이면 SDR 항등과 같은 촘촘함, 클수록 하이라이트 계단이 커진다.
  weber_in / weber_out : 선형 휘도 상대 스텝 (Δ선형 / 선형) — 입력/출력.
  amp_rel : weber_out / weber_in (상대 대비 스텝의 증폭).
하이라이트 = 입력 선형 휘도가 k 를 넘는 코드 (게인 g 를 곱하기 전 기준이 아니라 곡선 입력 기준: 선형 * g > k).

임의로 정한 사항: 지표 정의 전부(위 항목), 회색 램프만 사용, 컬러 채널은 측정하지 않음.
"""

import numpy as np

from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS

CODES = np.arange(256)


def measure(name_or_params):
    p = PRESETS[name_or_params].kwargs() if isinstance(name_or_params, str) else dict(name_or_params)
    v = CODES / 255.0
    rgb = np.repeat(v[:, None], 3, axis=1)
    lin_in = tc.srgb_eotf(v)
    lin_out = tc.itm_linear(rgb, **p)[:, 1]
    enc_out = tc.srgb_oetf_ext(lin_out)
    d_enc = np.diff(enc_out)
    d_lin_in, d_lin_out = np.diff(lin_in), np.diff(lin_out)
    with np.errstate(divide="ignore", invalid="ignore"):
        weber_in = d_lin_in / lin_in[:-1]
        weber_out = d_lin_out / lin_out[:-1]
        amp_rel = weber_out / weber_in
    hi = (lin_in[:-1] * p["g"]) > p["k"]
    return {
        "codes": CODES[:-1],
        "hi": hi,
        "amp_enc": d_enc * 255.0,
        "weber_in": weber_in,
        "weber_out": weber_out,
        "amp_rel": amp_rel,
    }


def summary(name_or_params):
    m = measure(name_or_params)
    hi = m["hi"]
    a = m["amp_enc"][hi]
    c = m["codes"][hi]
    r = m["amp_rel"][hi]
    return {
        "hi_codes": int(hi.sum()),
        "first_hi_code": int(c[0]) if hi.any() else -1,
        "amp_enc_max": float(a.max()) if hi.any() else 1.0,
        "amp_enc_max_code": int(c[np.argmax(a)]) if hi.any() else -1,
        "amp_enc_mean": float(a.mean()) if hi.any() else 1.0,
        "amp_rel_max": float(np.nanmax(r)) if hi.any() else 1.0,
        "weber_out_max_pct": float(np.nanmax(m["weber_out"][hi]) * 100) if hi.any() else 0.0,
        "weber_in_max_pct": float(np.nanmax(m["weber_in"][hi]) * 100) if hi.any() else 0.0,
    }


def report():
    rows = []
    for nm in PRESETS:
        s = summary(nm)
        rows.append([nm, s["first_hi_code"], s["hi_codes"], s["amp_enc_mean"], s["amp_enc_max"], s["amp_enc_max_code"],
                     s["amp_rel_max"], s["weber_in_max_pct"], s["weber_out_max_pct"]])
    lines = ["### S5 밴딩 (8bit 회색 램프, 하이라이트 인접 코드 스텝)", ""]
    lines.append(md_table(["프리셋", "하이라이트 시작 코드", "하이라이트 코드 수", "amp_enc 평균", "amp_enc 최대", "최대 코드",
                           "amp_rel 최대", "입력 Weber 최대 %", "출력 Weber 최대 %"], rows))
    lines += ["", "amp_enc: 출력 인코딩 스텝 / 입력 스텝(1/255). 기준값은 Opus 확정 전이므로 판정하지 않는다."]
    return "\n".join(lines)


if __name__ == "__main__":
    print(report())
