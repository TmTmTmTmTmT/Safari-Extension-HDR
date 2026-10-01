import json

from sim import export_ref


def test_reference_file_is_up_to_date(tmp_path):
    """커밋된 참조 JSON 이 현재 sim 수식과 같은 값인지 확인한다(수식 변경 시 재생성 필요)."""
    with open(export_ref.OUT, encoding="utf-8") as f:
        committed = json.load(f)
    fresh = json.loads(json.dumps(export_ref.build()))
    assert committed == fresh
