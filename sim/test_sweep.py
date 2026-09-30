import pytest

from sim import sweep
from sim.presets import PRESETS


@pytest.mark.parametrize("name", list(PRESETS))
def test_presets_pass(name):
    assert sweep.check_preset(name) == []


def test_grid_no_nan():
    rows = sweep.run_grid()
    assert len(rows) > 1000
    assert not any("nan" in x for _, v in rows for x in v)


def test_violation_detection_works():
    assert "monotonic" in sweep.check(0.5, 0.65, 2.5, 1, 1, 1)  # P<1 은 범위 밖 -> 위반으로 표시
