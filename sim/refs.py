"""S3: 램프/컬러바 예상 출력표 (0a/M4 참조표). 근거: PLAN.md F절 S3.

임의로 정한 사항:
  - 램프는 8bit 코드 0,32,...,224,255 의 회색 9단계 (코드/255 를 sRGB 인코딩 값으로 취급).
  - 컬러바는 100% 8색(백/노/시/녹/마/적/청/흑) + 75% 진폭 7색(흑 제외, 75% = 채널값 0.75).
  - '출력'은 P3 원색 기준 선형(SDR white=1)과 확장 sRGB 인코딩(부호 보존, 1.0 초과 허용) 둘 다 표시.
"""

import numpy as np

from sim import tonecurve as tc
from sim._md import md_table
from sim.presets import PRESETS

RAMP_CODES = [0, 32, 64, 96, 128, 160, 192, 224, 255]
_NAMES = ["백", "노", "시안", "녹", "마젠타", "적", "청", "흑"]
_BARS100 = np.array(
    [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 1], [0, 0, 0]], float
)


def ramp_rgb():
    v = np.array(RAMP_CODES, float) / 255.0
    return np.repeat(v[:, None], 3, axis=1)


def bars_rgb():
    """(이름 리스트, RGB 배열 (N,3)) 100% 8색 + 75% 7색."""
    names = list(_NAMES)
    rows = [b for b in _BARS100]
    for nm, b in zip(_NAMES[:-1], _BARS100[:-1]):
        names.append(nm + "75")
        rows.append(b * 0.75)
    return names, np.array(rows)


def expected(rgb_enc, name):
    """반환: (입력 선형 709, 출력 선형 P3, 출력 인코딩 P3)."""
    p = PRESETS[name].kwargs()
    lin_in = tc.input_eotf(rgb_enc)
    lin_out = tc.itm_linear(rgb_enc, **p)
    return lin_in, lin_out, tc.srgb_oetf_ext(lin_out)


def _tri(a):
    return " ".join(f"{x:.4f}" for x in a)


def ramp_table(name):
    rgb = ramp_rgb()
    lin_in, lin_out, enc_out = expected(rgb, name)
    rows = [
        [c, f"{rgb[i, 0]:.4f}", f"{lin_in[i, 0]:.4f}", f"{lin_out[i, 0]:.4f}", f"{enc_out[i, 0]:.4f}"]
        for i, c in enumerate(RAMP_CODES)
    ]
    return rows


def bars_table(name):
    names, rgb = bars_rgb()
    lin_in, lin_out, enc_out = expected(rgb, name)
    return [[nm, _tri(rgb[i]), _tri(lin_out[i]), _tri(enc_out[i])] for i, nm in enumerate(names)]


def report():
    lines = ["### S3 램프/컬러바 예상 출력표", "", "출력은 Display P3 기준 (선형은 SDR white=1, 인코딩은 확장 sRGB OETF).", ""]
    for name in PRESETS:
        lines += [f"#### {name} 램프", ""]
        lines.append(md_table(["코드", "입력 인코딩", "입력 선형", "출력 선형", "출력 인코딩"], ramp_table(name)))
        lines += ["", f"#### {name} 컬러바", ""]
        lines.append(md_table(["패치", "입력 인코딩 RGB", "출력 선형 P3 RGB", "출력 인코딩 P3 RGB"], bars_table(name)))
        lines.append("")
    return "\n".join(lines).rstrip()


if __name__ == "__main__":
    print(report())
