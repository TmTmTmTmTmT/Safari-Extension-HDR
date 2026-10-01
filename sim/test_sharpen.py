import numpy as np
import pytest

from sim import sharpen as sh
from sim import tonecurve as tc


def test_luma_p3_coefficients():
    assert tc.LUMA_P3 == pytest.approx([0.2290, 0.6917, 0.0793], abs=1e-4)
    assert tc.LUMA_P3.sum() == pytest.approx(1.0)


def test_saturate_identity_gray_and_luma_preserved():
    rng = np.random.default_rng(1)
    c = rng.uniform(0, 2.5, size=(50, 3))
    assert np.allclose(tc.saturate_p3(c, 1.0), c)
    gray = tc.saturate_p3(c, 0.0)
    y = c @ tc.LUMA_P3
    assert np.allclose(gray, np.repeat(y[:, None], 3, axis=1))
    for cs in (0.5, 1.5):
        assert np.allclose(tc.saturate_p3(c, cs) @ tc.LUMA_P3, y)
    g = np.repeat(rng.uniform(0, 3, size=(10, 1)), 3, axis=1)
    assert np.allclose(tc.saturate_p3(g, 0.3), g)  # 회색 입력 불변


def test_sharp_zero_is_identity_and_flat_unchanged():
    rng = np.random.default_rng(2)
    c = rng.uniform(0, 1, size=(20, 3))
    n = rng.uniform(0, 1, size=(20, 3))
    assert np.allclose(sh.sharpen_pixel(c, n, n, n, n, 0.0), c)
    flat = np.full((6, 6, 3), 0.4)
    assert np.allclose(sh.sharpen_image(flat, 1.0), flat)


def test_step_edge_overshoot_bounded_by_limit():
    img = np.zeros((8, 8, 3))
    img[:, 4:] = 0.5
    out = sh.sharpen_image(img, 1.0)
    bound = 1.0 * sh.GAIN * sh.LIMIT
    assert np.all(out >= 0.0) and np.all(out <= 1.0)
    assert np.max(np.abs(out - img)) <= bound + 1e-12
    # 에지 양쪽이 서로 반대로 움직인다(어두운 쪽은 더 어둡게, 밝은 쪽은 더 밝게).
    assert out[3, 3, 1] <= img[3, 3, 1] and out[3, 4, 1] >= img[3, 4, 1]


@pytest.mark.parametrize("sharp", [0.25, 0.5, 1.0])
def test_output_clamped_and_monotonic_in_sharp(sharp):
    rng = np.random.default_rng(3)
    img = rng.uniform(0, 1, size=(16, 16, 3))
    out = sh.sharpen_image(img, sharp)
    assert out.min() >= 0.0 and out.max() <= 1.0
    d1 = np.abs(sh.sharpen_image(img, sharp * 0.5) - img).mean()
    d2 = np.abs(out - img).mean()
    assert d2 >= d1
