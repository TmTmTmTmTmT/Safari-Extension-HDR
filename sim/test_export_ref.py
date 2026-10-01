import json

import numpy as np

from sim import export_ref

# 플랫폼(BLAS·libm)에 따라 마지막 자릿수가 달라질 수 있어 값은 1e-8 이내이면 같은 것으로 본다(JSON 은 소수 9자리 반올림).
ATOL = 1e-8


def _same(a, b, path="root"):
    if isinstance(a, dict):
        assert isinstance(b, dict) and a.keys() == b.keys(), path
        for k in a:
            _same(a[k], b[k], f"{path}.{k}")
    elif isinstance(a, list) and a and isinstance(a[0], (dict, str)):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b)):
            _same(x, y, f"{path}[{i}]")
    elif isinstance(a, list):
        assert np.allclose(np.asarray(a, dtype=float), np.asarray(b, dtype=float), atol=ATOL, rtol=0), path
    elif isinstance(a, (int, float)) and not isinstance(a, bool):
        assert abs(a - b) <= ATOL, path
    else:
        assert a == b, path


def test_reference_file_is_up_to_date():
    """커밋된 참조 JSON 이 현재 sim 수식과 같은 값인지 확인한다(수식 변경 시 `python -m sim.export_ref` 로 재생성)."""
    with open(export_ref.OUT, encoding="utf-8") as f:
        committed = json.load(f)
    fresh = json.loads(json.dumps(export_ref.build()))
    _same(committed, fresh)
