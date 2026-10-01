"""PLAN D-M4 M4-E 선명도(언샤프 마스크) 참조 구현. WGSL `sharpen` 과 JS `sharpenPixel` 이 같은 식을 따른다.

입력은 sRGB 인코딩 값(0~1)이다. 이웃은 상·하·좌·우 4탭(소스 텍셀 1칸).
  blur = (n + s + e + w) / 4
  d    = dot(center - blur, LUMA_709), 이후 [-LIMIT, LIMIT] 로 제한 (헤일로 제한)
  out  = clamp(center + sharp * GAIN * d, 0, 1)   (같은 d 를 RGB 모두에 더한다)
sharp == 0 이면 입력 그대로다.
"""

import numpy as np

from sim import tonecurve as tc

GAIN = 2.0
LIMIT = 0.10


def sharpen_pixel(center, north, south, east, west, sharp):
    """center, 이웃: (..., 3) sRGB 인코딩. 반환: (..., 3)."""
    center = np.asarray(center, dtype=np.float64)
    blur = (np.asarray(north) + np.asarray(south) + np.asarray(east) + np.asarray(west)) / 4.0
    d = np.clip((center - blur) @ tc.LUMA_709, -LIMIT, LIMIT)[..., None]
    return np.clip(center + sharp * GAIN * d, 0.0, 1.0)


def sharpen_image(img, sharp):
    """(H, W, 3) 이미지에 4탭 언샤프. 가장자리는 가장자리 값으로 확장(clamp to edge)."""
    img = np.asarray(img, dtype=np.float64)
    pad = np.pad(img, ((1, 1), (1, 1), (0, 0)), mode="edge")
    return sharpen_pixel(
        img,
        pad[:-2, 1:-1],
        pad[2:, 1:-1],
        pad[1:-1, 2:],
        pad[1:-1, :-2],
        sharp,
    )
