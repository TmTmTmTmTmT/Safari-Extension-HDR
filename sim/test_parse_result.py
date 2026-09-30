"""scripts/parse-result.py: 기존 results/ 처리 유지 + milestone 'M2' 지원(값만 출력, 판정 없음)."""
import copy
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "scripts", "parse-result.py")

M2_SAMPLE = {
    "schemaVersion": 1,
    "milestone": "M2",
    "extVersion": "0.1.0",
    "createdAt": "2026-09-30T12:00:00.000Z",
    "page": {"url": "/watch?v=abc123"},
    "env": {"ua": "test-ua", "dpr": 2, "screen": {"w": 1512, "h": 982}, "dynamicRangeHigh": True, "colorGamutP3": True},
    "api": {
        "gpu": True,
        "adapter": True,
        "device": True,
        "configure": True,
        "configRead": {"format": "rgba16float", "colorSpace": "display-p3", "toneMapping": "extended"},
    },
    "video": {"videoWidth": 1920, "videoHeight": 1080, "srcIsBlob": True, "paused": False},
    "canvas": {"width": 1920, "height": 1080, "cssWidth": 960, "cssHeight": 540},
    "render": {"mode": "stripes", "frames": 321, "loopFps": 59.9, "jsP50": 0.4, "jsP95": 0.9},
    "flags": {"drm": False, "attached": True, "fullscreen": False},
    "errors": [{"at": 1.5, "name": "TestError", "message": "sample"}],
}


def run(*args):
    return subprocess.run([sys.executable, SCRIPT, *args], capture_output=True, text=True, cwd=ROOT)


def write(tmp_path, name, data):
    p = tmp_path / name
    p.write_text(json.dumps(data), encoding="utf-8")
    return str(p)


def test_existing_results_still_parse():
    files = sorted(glob.glob(os.path.join(ROOT, "results", "result-M1-*.json")))
    assert files
    r = run(*files)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout


def test_m2_sample_prints_values_only(tmp_path):
    r = run(write(tmp_path, "result-M2-sample.json", M2_SAMPLE))
    assert r.returncode == 0, r.stdout + r.stderr
    for s in ("rgba16float", "display-p3", "stripes", "321", "59.9", "/watch?v=abc123", "TestError"):
        assert s in r.stdout
    assert "스키마 검증 실패" not in r.stdout
    assert "G1 API 값" not in r.stdout  # v1~v4 표가 아닌 M2 표
    for word in ("PASS", "FAIL", "통과", "판정:"):
        assert word not in r.stdout


def test_m2_missing_required_key_fails(tmp_path):
    bad = copy.deepcopy(M2_SAMPLE)
    del bad["render"]
    r = run(write(tmp_path, "result-M2-bad.json", bad))
    assert r.returncode == 1
    assert "스키마 검증 실패" in r.stdout


def test_m2_and_m1_together(tmp_path):
    m1 = sorted(glob.glob(os.path.join(ROOT, "results", "result-M1-*.json")))[0]
    r = run(m1, write(tmp_path, "result-M2-sample.json", M2_SAMPLE))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "G1 API 값" in r.stdout and "rgba16float" in r.stdout
