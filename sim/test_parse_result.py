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
    "errors": [{"at": "render", "name": "TestError", "message": "sample"}],
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


def test_m2_api_null_values_ok(tmp_path):
    ok = copy.deepcopy(M2_SAMPLE)
    ok["api"].update({"adapter": None, "device": None, "configure": None})
    ok["api"]["configRead"]["toneMapping"] = None
    r = run(write(tmp_path, "result-M2-null.json", ok))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout


def test_m2_api_wrong_types_fail(tmp_path):
    bad = copy.deepcopy(M2_SAMPLE)
    bad["api"]["adapter"] = {"info": "x"}
    r = run(write(tmp_path, "result-M2-bad-adapter.json", bad))
    assert r.returncode == 1
    assert "스키마 검증 실패" in r.stdout
    bad = copy.deepcopy(M2_SAMPLE)
    bad["api"]["configRead"]["toneMapping"] = {"mode": "extended"}
    r = run(write(tmp_path, "result-M2-bad-tm.json", bad))
    assert r.returncode == 1
    assert "스키마 검증 실패" in r.stdout


def test_m2_and_m1_together(tmp_path):
    m1 = sorted(glob.glob(os.path.join(ROOT, "results", "result-M1-*.json")))[0]
    r = run(m1, write(tmp_path, "result-M2-sample.json", M2_SAMPLE))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "G1 API 값" in r.stdout and "rgba16float" in r.stdout


def _v2_sample():
    d = copy.deepcopy(M2_SAMPLE)
    d["schemaVersion"] = 2
    d["frameProbe"] = {
        "at": 5012.5,
        "n": 3,
        "ext": 0.4,
        "copy": 61.25,
        "c2d": 60.5,
        "extErr": None,
        "copyErr": None,
        "c2dErr": "SecurityError",
    }
    d["flags"]["blackFrame"] = True
    return d


def test_m2_v2_prints_frame_probe_columns(tmp_path):
    r = run(write(tmp_path, "result-M2-v2.json", _v2_sample()))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout
    for s in ("frameProbe", "blackFrame", "61.25", "60.5", "SecurityError", "5012.5"):
        assert s in r.stdout
    for word in ("PASS", "FAIL", "통과", "판정:"):
        assert word not in r.stdout


def test_m2_v1_has_no_frame_probe_section(tmp_path):
    r = run(write(tmp_path, "result-M2-v1.json", M2_SAMPLE))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "frameProbe" not in r.stdout


def test_m2_v2_null_probe_ok_and_wrong_types_fail(tmp_path):
    ok = _v2_sample()
    ok["frameProbe"] = None
    r = run(write(tmp_path, "result-M2-v2-null.json", ok))
    assert r.returncode == 0, r.stdout + r.stderr
    bad = _v2_sample()
    bad["frameProbe"]["ext"] = "0"
    r = run(write(tmp_path, "result-M2-v2-bad.json", bad))
    assert r.returncode == 1
    assert "스키마 검증 실패" in r.stdout


def _v3_sample():
    d = _v2_sample()
    d["schemaVersion"] = 3
    d["render"].update(
        {
            "path": "copy",
            "displayHz": 120,
            "displayMissRate": 0.00417,
            "copyMsP50": 1.25,
            "copyMsP95": 2.5,
            "copySkipped": 42,
            "videoDropped": 3,
            "videoTotal": 1800,
        }
    )
    d["frameProbe"].update({"ms": 88.5, "extSyncMs": 1.5, "copySyncMs": 6.25, "c2dSyncMs": 30.75})
    return d


def test_m2_v3_prints_render_cost_and_probe_times(tmp_path):
    r = run(write(tmp_path, "result-M2-v3.json", _v3_sample()))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout
    for s in ("displayMissRate", "0.00417", "copyMsP95", "2.5", "1800", "copy", "extSyncMs", "88.5", "30.75"):
        assert s in r.stdout
    for word in ("PASS", "FAIL", "통과", "판정:"):
        assert word not in r.stdout


def test_m2_v1_v2_have_no_render_cost_section(tmp_path):
    for name, d in (("v1", M2_SAMPLE), ("v2", _v2_sample())):
        r = run(write(tmp_path, "result-M2-%s.json" % name, d))
        assert r.returncode == 0, r.stdout + r.stderr
        assert "displayMissRate" not in r.stdout
        assert "extSyncMs" not in r.stdout


def test_m2_v3_wrong_types_fail(tmp_path):
    bad = _v3_sample()
    bad["render"]["path"] = "gpu"
    r = run(write(tmp_path, "result-M2-v3-bad-path.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    bad = _v3_sample()
    bad["render"]["displayMissRate"] = "0.1"
    r = run(write(tmp_path, "result-M2-v3-bad-miss.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    ok = _v3_sample()
    ok["render"].update({"path": None, "displayHz": None, "displayMissRate": None})
    r = run(write(tmp_path, "result-M2-v3-null.json", ok))
    assert r.returncode == 0, r.stdout + r.stderr


def _v4_sample():
    d = _v3_sample()
    d["schemaVersion"] = 4
    d["render"].update({"path": "vf", "vfMsP50": 0.75, "vfMsP95": 1.5})
    d["frameProbe"].update({"vf": 96.25, "vfErr": None, "vfSyncMs": 0.5})
    return d


def test_m2_v4_prints_vf_columns_values_only(tmp_path):
    r = run(write(tmp_path, "result-M2-v4.json", _v4_sample()))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout
    for s in ("vfMsP50", "vfMsP95", "0.75", "vfErr", "vfSyncMs", "96.25", "vf"):
        assert s in r.stdout
    for word in ("PASS", "FAIL", "통과", "판정:"):
        assert word not in r.stdout


def test_m2_v1_to_v3_have_no_vf_columns(tmp_path):
    for name, d in (("v1", M2_SAMPLE), ("v2", _v2_sample()), ("v3", _v3_sample())):
        r = run(write(tmp_path, "result-M2-%s.json" % name, d))
        assert r.returncode == 0, r.stdout + r.stderr
        assert "vfMsP50" not in r.stdout
        assert "vfSyncMs" not in r.stdout


def test_m2_v4_vf_error_and_wrong_types(tmp_path):
    ok = _v4_sample()
    ok["frameProbe"].update({"vf": None, "vfErr": "ReferenceError", "vfSyncMs": 0.1})
    ok["render"].update({"vfMsP50": None, "vfMsP95": None})
    r = run(write(tmp_path, "result-M2-v4-err.json", ok))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "ReferenceError" in r.stdout
    bad = _v4_sample()
    bad["frameProbe"]["vf"] = "96"
    r = run(write(tmp_path, "result-M2-v4-bad-vf.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    bad = _v4_sample()
    bad["render"]["vfMsP95"] = "1.5"
    r = run(write(tmp_path, "result-M2-v4-bad-ms.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout


def _v5_result():
    """results/의 M1 v4 파일 하나를 바탕으로 v5(vp9Paths 추가) 샘플을 만든다."""
    src = sorted(glob.glob(os.path.join(ROOT, "results", "result-M1-*.json")))[0]
    with open(src, encoding="utf-8") as f:
        d = json.load(f)
    d["schemaVersion"] = 5
    d["vp9Paths"] = [
        {
            "fixture": "ramp-2160p60.webm",
            "variant": "V-bmp",
            "srcRes": "3840x2160",
            "canvasRes": "3840x2160",
            "fullscreen": True,
            "frames": 478,
            "windowSec": 7.97,
            "jsP50": 0.812,
            "jsP95": 1.734,
            "jsMax": 6.5,
            "asyncP50": 21.375,
            "asyncP95": 33.25,
            "displayMissRate": 0.00417,
            "displayHz": 60,
            "loopFps": 59.97,
            "meanBrightness": 97.81,
            "videoDropped": 3,
            "videoTotal": 480,
            "errorName": None,
        },
        {
            "fixture": "ramp-2160p60.webm",
            "variant": "V-vf",
            "srcRes": "3840x2160",
            "canvasRes": None,
            "fullscreen": True,
            "frames": 0,
            "windowSec": None,
            "jsP50": None,
            "jsP95": None,
            "jsMax": None,
            "asyncP50": None,
            "asyncP95": None,
            "displayMissRate": None,
            "displayHz": None,
            "loopFps": None,
            "meanBrightness": None,
            "videoDropped": None,
            "videoTotal": None,
            "errorName": "ReferenceError",
        },
    ]
    return d


def test_v5_prints_vp9_paths_table_values_only(tmp_path):
    r = run(write(tmp_path, "result-M1-v5.json", _v5_result()))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout
    for s in ("P0-6 VP9 입력 방식", "V-bmp", "V-vf", "21.375", "33.25", "0.00417", "97.81", "ReferenceError", "asyncP50", "meanBrightness"):
        assert s in r.stdout
    for word in ("판정:", "통과", "불통과"):
        assert word not in r.stdout


def test_v1_to_v4_have_no_vp9_paths_section():
    files = []
    for f in sorted(glob.glob(os.path.join(ROOT, "results", "result-M1-*.json"))):
        with open(f, encoding="utf-8") as fh:
            if json.load(fh).get("schemaVersion", 1) < 5:
                files.append(f)
    assert files
    r = run(*files)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "P0-6 VP9 입력 방식" not in r.stdout


def test_v5_empty_vp9_paths_ok_and_bad_types_fail(tmp_path):
    ok = _v5_result()
    ok["vp9Paths"] = []
    r = run(write(tmp_path, "result-M1-v5-empty.json", ok))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "P0-6 VP9 입력 방식" not in r.stdout
    bad = _v5_result()
    bad["vp9Paths"][0]["variant"] = "V-unknown"
    r = run(write(tmp_path, "result-M1-v5-bad-variant.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    bad = _v5_result()
    bad["vp9Paths"][0]["jsP95"] = "1.7"
    r = run(write(tmp_path, "result-M1-v5-bad-js.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    bad = _v5_result()
    del bad["vp9Paths"][0]["fixture"]
    r = run(write(tmp_path, "result-M1-v5-missing.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout


def _m2_v5_sample():
    d = _v4_sample()
    d["schemaVersion"] = 5
    d["render"]["cadence"] = {
        "srcFps": 23.98,
        "srcFpsNominal": 23.976,
        "holdHist": {"1": 2, "2": 120, "3": 118, "4": 0, "5+": 1},
        "irregular": 0.0125,
        "skipped": 3,
    }
    return d


def test_m2_v5_prints_cadence_values_only(tmp_path):
    r = run(write(tmp_path, "result-M2-v5.json", _m2_v5_sample()))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "스키마 검증 실패" not in r.stdout
    for s in ("cadence", "srcFpsNominal", "23.976", "irregular", "0.0125", "skipped", "hold5+", "118"):
        assert s in r.stdout
    for word in ("PASS", "FAIL", "통과", "판정:"):
        assert word not in r.stdout


def test_m2_v1_to_v4_have_no_cadence_section(tmp_path):
    for name, d in (("v1", M2_SAMPLE), ("v2", _v2_sample()), ("v3", _v3_sample()), ("v4", _v4_sample())):
        r = run(write(tmp_path, "result-M2-%s.json" % name, d))
        assert r.returncode == 0, r.stdout + r.stderr
        assert "srcFpsNominal" not in r.stdout


def test_m2_v5_baseline_and_null_cadence_ok_and_bad_types_fail(tmp_path):
    ok = _m2_v5_sample()
    ok["render"].update({"mode": "baseline", "frames": 0, "path": None, "cadence": None})
    r = run(write(tmp_path, "result-M2-v5-baseline.json", ok))
    assert r.returncode == 0, r.stdout + r.stderr
    assert "baseline" in r.stdout
    bad = _m2_v5_sample()
    bad["render"]["mode"] = "bogus"
    r = run(write(tmp_path, "result-M2-v5-bad-mode.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    bad = _m2_v5_sample()
    bad["render"]["cadence"]["irregular"] = "0.1"
    r = run(write(tmp_path, "result-M2-v5-bad-irregular.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
    bad = _m2_v5_sample()
    bad["render"]["cadence"]["holdHist"]["2"] = 1.5
    r = run(write(tmp_path, "result-M2-v5-bad-hist.json", bad))
    assert r.returncode == 1 and "스키마 검증 실패" in r.stdout
