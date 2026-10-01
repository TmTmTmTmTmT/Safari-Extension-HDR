#!/usr/bin/env python3
"""results/*.json 검증 + G1~G3 판정용 값 요약 표 출력. 판정은 하지 않고 값만 출력한다. stdlib만 사용.

사용: python3 scripts/parse-result.py [파일 또는 디렉터리 ...]   (기본: results/)
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_PATH = os.path.join(ROOT, "docs", "result-schema.json")
SCHEMA_M2_PATH = os.path.join(ROOT, "docs", "result-schema-m2.json")

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "null": type(None),
}


def _type_ok(value, name):
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    return isinstance(value, _TYPES[name])


def check_required(value, schema, path="$"):
    """jsonschema가 없을 때의 대체 검사: required 키와 type/enum/minimum만 확인한다."""
    errs = []
    types = schema.get("type")
    if types is not None:
        types = types if isinstance(types, list) else [types]
        if not any(_type_ok(value, t) for t in types):
            return ["%s: 타입 불일치 (기대 %s)" % (path, "/".join(types))]
    if "enum" in schema and value not in schema["enum"]:
        errs.append("%s: 허용되지 않은 값 %r" % (path, value))
    if "minimum" in schema and isinstance(value, (int, float)) and value < schema["minimum"]:
        errs.append("%s: 최솟값 %s 미만" % (path, schema["minimum"]))
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                errs.append("%s: 필수 키 없음 '%s'" % (path, key))
        for key, sub in schema.get("properties", {}).items():
            if key in value:
                errs += check_required(value[key], sub, "%s.%s" % (path, key))
    elif isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            errs += check_required(item, schema["items"], "%s[%d]" % (path, i))
    return errs


def validate(data, schema):
    try:
        import jsonschema  # type: ignore

        validator = jsonschema.Draft7Validator(schema)
        return ["%s: %s" % ("$" + "".join("[%r]" % p for p in e.absolute_path), e.message) for e in validator.iter_errors(data)]
    except ImportError:
        return check_required(data, schema)


def g(d, *keys):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def fmt(v):
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def is_g3_run(run, power):
    """G3 대상 = 전원 연결 + 전체화면 run. 스키마 v1/v2 공통(env.power와 run.fullscreen만 사용)."""
    return power == "ac" and run.get("fullscreen") is True


MODES = ["R0", "R2", "R3", "V3"]  # v4 매트릭스 모드
LEGACY_MODES = ["B0", "B1", "B2", "B3"]  # v3 이하 파일의 모드


def is_g3_overlay_run(run, power):
    """v3 G3 대상 = 전원 연결 + 전체화면 + overlay 배치. layout이 없는 v1/v2 run은 split로 간주해 제외한다."""
    return is_g3_run(run, power) and run.get("layout", "split") == "overlay"


def latest_by_mode(runs):
    """{srcRes: {mode: run}}. 같은 (해상도, 모드)가 여러 번이면 마지막 run."""
    out = {}
    for r in runs:
        out.setdefault(r.get("srcRes") or "unknown", {})[r.get("mode", "split")] = r
    return out


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _max(vs):
    vs = [v for v in vs if _num(v)]
    return max(vs) if vs else None


def g3_summary(runs, power):
    """v4 {srcRes: {baselineMiss, itmMiss, delta, rvfcMiss, loopFps, videoPresentedFps, jsP95Max, gpuMsMax} | None}.
    R0 또는 R3가 없으면 None. 값만 계산하고 판정하지 않는다."""
    targets = [r for r in runs if is_g3_overlay_run(r, power)]
    res = {}
    for key, by_mode in sorted(latest_by_mode(targets).items()):
        r0, r3, v3 = by_mode.get("R0"), by_mode.get("R3"), by_mode.get("V3")
        if not r0 or not r3:
            res[key] = None
            continue
        m0, m3 = r0.get("missRate"), r3.get("missRate")
        same = [r for r in targets if (r.get("srcRes") or "unknown") == key]
        res[key] = {
            "baselineMiss": m0 if _num(m0) else None,
            "itmMiss": m3 if _num(m3) else None,
            "delta": round(m3 - m0, 5) if _num(m0) and _num(m3) else None,
            "rvfcMiss": v3.get("missRate") if v3 and _num(v3.get("missRate")) else None,
            "loopFps": r3.get("loopFps"),
            "videoPresentedFps": r3.get("videoPresentedFps"),
            "jsP95Max": _max([r.get("jsP95") for r in same]),
            "gpuMsMax": _max([r.get("gpuMs") for r in same]),
        }
    return res


def g3_summary_legacy(runs, power):
    """v3 파일용 {srcRes: {baselineDrop, itmDrop, delta, jsP95Max} | None} (B0/B3 기준)."""
    targets = [r for r in runs if is_g3_overlay_run(r, power)]
    res = {}
    for key, by_mode in sorted(latest_by_mode(targets).items()):
        b0, b3 = by_mode.get("B0"), by_mode.get("B3")
        if not b0 or not b3:
            continue
        d0, d3 = b0.get("dropRate"), b3.get("dropRate")
        res[key] = {
            "baselineDrop": d0 if _num(d0) else None,
            "itmDrop": d3 if _num(d3) else None,
            "delta": round(d3 - d0, 5) if _num(d0) and _num(d3) else None,
            "jsP95Max": _max([r.get("jsP95") for r in targets if (r.get("srcRes") or "unknown") == key]),
        }
    return res


def print_mode_tables(runs, power):
    overlay = [r for r in runs if r.get("layout", "split") == "overlay"]
    print("\n모드별 표 (overlay run, 해상도 x R0/R2/R3/V3, 같은 모드 반복 시 마지막 run)")
    if not overlay:
        print("overlay run 없음")
    else:
        grouped = latest_by_mode(overlay)
        legacy = any(m in by_mode for by_mode in grouped.values() for m in LEGACY_MODES)
        modes = MODES + (LEGACY_MODES if legacy else [])
        metrics = ["missRate", "loopFps", "videoPresentedFps", "gpuMs", "jsP95"] + (["dropRate"] if legacy else [])
        for metric in metrics:
            print("\n%s" % metric)
            rows = [[res] + [fmt(by_mode.get(m, {}).get(metric)) for m in modes] for res, by_mode in sorted(grouped.items())]
            print(table(["srcRes"] + modes, rows))
        print("\n표의 run 조건 (power=%s)" % fmt(power))
        rows = []
        for res, by_mode in sorted(grouped.items()):
            for m in modes:
                r = by_mode.get(m)
                if r:
                    rows.append([res, m, fmt(r.get("driver", "rvfc")), fmt(r.get("fullscreen")), fmt(is_g3_overlay_run(r, power)), fmt(r.get("canvasRes"))])
        print(table(["srcRes", "mode", "driver", "fullscreen", "G3 대상", "canvasRes"], rows))
    print("\nG3 요약 (전원 연결 + 전체화면 + overlay run; 값만)")
    summary = g3_summary(runs, power)
    legacy_summary = g3_summary_legacy(runs, power)
    if not summary and not legacy_summary:
        print("G3 대상 overlay run 없음")
    if summary:
        keys = ("baselineMiss", "itmMiss", "delta", "rvfcMiss", "loopFps", "videoPresentedFps", "jsP95Max", "gpuMsMax")
        rows = [[res] + (["-"] * len(keys) if v is None else [fmt(v[k]) for k in keys]) for res, v in summary.items()]
        print(table(["srcRes"] + list(keys), rows))
        print("(R0 또는 R3 run이 없는 해상도는 '-')")
    if legacy_summary:
        print("\nG3 요약 (v3 정의: B0/B3 dropRate 기준)")
        keys = ("baselineDrop", "itmDrop", "delta", "jsP95Max")
        print(table(["srcRes"] + list(keys), [[res] + [fmt(v[k]) for k in keys] for res, v in legacy_summary.items()]))


def table(headers, rows):
    widths = [len(h) for h in headers]
    for r in rows:
        for i, c in enumerate(r):
            widths[i] = max(widths[i], len(c))
    line = lambda cells: "| " + " | ".join(c.ljust(widths[i]) for i, c in enumerate(cells)) + " |"
    out = [line(headers), "|" + "|".join("-" * (w + 2) for w in widths) + "|"]
    out += [line(r) for r in rows]
    return "\n".join(out)


VP9_COLS = ["fixture", "variant", "srcRes", "canvasRes", "fullscreen", "frames", "jsP50", "jsP95", "jsMax", "asyncP50", "asyncP95", "displayMissRate", "displayHz", "loopFps", "meanBrightness", "videoDropped", "videoTotal", "errorName"]


def print_vp9_paths(paths):
    """v5 vp9Paths 표(P0-6 VP9 입력 방식). 없거나 비었으면(v1~v4) 출력하지 않는다. 값만 출력하고 판정하지 않는다."""
    if not isinstance(paths, list) or not paths:
        return
    print("\nP0-6 VP9 입력 방식 (v5, 값만)")
    print(table(VP9_COLS, [[fmt(p.get(c)) for c in VP9_COLS] for p in paths if isinstance(p, dict)]))


def summarize(name, data):
    print("\n## %s" % name)
    env = data.get("env", {})
    print(
        "env: macOS=%s safari=%s chip=%s display=%s power=%s sdrBrightness=%s refreshRate=%s windowMode=%s"
        % tuple(fmt(env.get(k)) for k in ("macOS", "safari", "chip", "display", "power", "sdrBrightness", "refreshRate", "windowMode"))
    )
    print("screen: %s" % fmt(env.get("screen")))
    print("schemaVersion=%s visualJudder=%s" % (fmt(data.get("schemaVersion")), fmt(g(data, "perf", "visualJudder"))))
    print("\nG1 API 값")
    api = data.get("api", {})
    print(
        table(
            ["navigator.gpu", "secure", "configure.ok", "configure.error", "getConfiguration", "format", "colorSpace", "toneMapping.mode"],
            [
                [
                    fmt(api.get("navigatorGpu")),
                    fmt(api.get("secureContext")),
                    fmt(g(api, "configure", "ok")),
                    fmt(g(api, "configure", "error")),
                    fmt(g(api, "getConfiguration", "supported")),
                    fmt(g(api, "getConfiguration", "format")),
                    fmt(g(api, "getConfiguration", "colorSpace")),
                    fmt(g(api, "getConfiguration", "toneMappingMode")),
                ]
            ],
        )
    )
    print(
        "dynamic-range:high=%s color-gamut:p3=%s canvas2d.float16=%s webgl.drawingBufferStorage=%s timestamp-query=%s"
        % (
            fmt(g(api, "mediaQueries", "dynamicRangeHigh")),
            fmt(g(api, "mediaQueries", "colorGamutP3")),
            fmt(g(api, "canvas2dFloat16", "supported")),
            fmt(g(api, "webgl", "drawingBufferStorage")),
            fmt(api.get("timestampQuery")),
        )
    )
    print("\nG2 EDR 값")
    edr = data.get("edr", {})
    print(
        table(
            ["maxDistinctStep", "encodingMatch", "refHdrImage", "secondsSinceDraw"],
            [[fmt(edr.get("maxDistinctStep")), fmt(edr.get("encodingMatch")), fmt(edr.get("refHdrImage")), fmt(edr.get("secondsSinceDraw"))]],
        )
    )
    print("\nG3 성능 값 (run별)")
    runs = g(data, "perf", "runs") or []
    power = env.get("power")
    if not runs:
        print("(run 없음)")
    else:
        cols = ["fixture", "mode", "driver", "layout", "itm", "srcRes", "canvasRes", "fullscreen", "frames", "warmupSec", "windowSec", "fps", "missRate", "loopFps", "videoPresentedFps", "dropRate", "dropRatePresented", "jsP50", "jsP95", "gpuMs"]
        dflt = {"mode": "split", "layout": "split", "driver": "rvfc"}
        rows = [[fmt(is_g3_overlay_run(r, power))] + [fmt(r.get(c, dflt.get(c))) for c in cols] for r in runs]
        print(table(["G3 대상(overlay)"] + cols, rows))
    print("\n전체화면 run 요약 (전원 연결 + 전체화면, v2 정의)")
    targets = [r for r in runs if is_g3_run(r, power)]
    if not targets:
        print("G3 대상 run 없음")
    else:
        cols = ["fixture", "itm", "srcRes", "canvasRes", "windowSec", "dropRate", "jsP50", "jsP95", "jsMax", "gpuMs"]
        print(table(cols, [[fmt(r.get(c)) for c in cols] for r in targets]))
        print("\n소스 해상도별 최악값 (대상 run만)")
        worst = {}
        for r in targets:
            w = worst.setdefault(r.get("srcRes") or "unknown", {"n": 0, "drop": [], "p95": []})
            w["n"] += 1
            w["drop"].append(r.get("dropRate"))
            w["p95"].append(r.get("jsP95"))
        mx = lambda vs: max([v for v in vs if isinstance(v, (int, float))], default=None)
        print(table(["srcRes", "runs", "dropRate 최대", "jsP95 최대"], [[k, str(w["n"]), fmt(mx(w["drop"])), fmt(mx(w["p95"]))] for k, w in sorted(worst.items())]))
    print_mode_tables(runs, power)
    print_vp9_paths(data.get("vp9Paths"))
    print("\nflags: %s" % fmt(data.get("flags")))
    errs = data.get("errors") or []
    print("errors (%d)%s" % (len(errs), "".join("\n  - " + e for e in errs)))


def summarize_m2(name, data):
    """milestone 'M2' 진단 JSON의 값만 표로 출력한다. 판정하지 않는다."""
    print("\n## %s" % name)
    print("schemaVersion=%s extVersion=%s createdAt=%s" % (fmt(data.get("schemaVersion")), fmt(data.get("extVersion")), fmt(data.get("createdAt"))))
    print("page: %s" % fmt(g(data, "page", "url")))
    env = data.get("env") or {}
    print("\nenv")
    print(
        table(
            ["dpr", "screen.w", "screen.h", "dynamic-range:high", "color-gamut:p3"],
            [[fmt(env.get("dpr")), fmt(g(env, "screen", "w")), fmt(g(env, "screen", "h")), fmt(env.get("dynamicRangeHigh")), fmt(env.get("colorGamutP3"))]],
        )
    )
    print("ua: %s" % fmt(env.get("ua")))
    api = data.get("api") or {}
    print("\napi")
    print(
        table(
            ["gpu", "adapter", "device", "configure", "configRead.format", "configRead.colorSpace", "configRead.toneMapping"],
            [
                [
                    fmt(api.get("gpu")),
                    fmt(api.get("adapter")),
                    fmt(api.get("device")),
                    fmt(api.get("configure")),
                    fmt(g(api, "configRead", "format")),
                    fmt(g(api, "configRead", "colorSpace")),
                    fmt(g(api, "configRead", "toneMapping")),
                ]
            ],
        )
    )
    video, canvas, render, flags = (data.get(k) or {} for k in ("video", "canvas", "render", "flags"))
    print("\nvideo / canvas / render / flags")
    print(
        table(
            ["videoWidth", "videoHeight", "srcIsBlob", "paused", "canvas.width", "canvas.height", "cssWidth", "cssHeight", "mode", "frames", "loopFps", "jsP50", "jsP95", "drm", "attached", "fullscreen"],
            [
                [
                    fmt(video.get("videoWidth")),
                    fmt(video.get("videoHeight")),
                    fmt(video.get("srcIsBlob")),
                    fmt(video.get("paused")),
                    fmt(canvas.get("width")),
                    fmt(canvas.get("height")),
                    fmt(canvas.get("cssWidth")),
                    fmt(canvas.get("cssHeight")),
                    fmt(render.get("mode")),
                    fmt(render.get("frames")),
                    fmt(render.get("loopFps")),
                    fmt(render.get("jsP50")),
                    fmt(render.get("jsP95")),
                    fmt(flags.get("drm")),
                    fmt(flags.get("attached")),
                    fmt(flags.get("fullscreen")),
                ]
            ],
        )
    )
    if "frameProbe" in data or "blackFrame" in flags:  # schemaVersion 2 이상. v1 파일은 건너뛴다.
        fp = data.get("frameProbe") or {}
        print("\nframeProbe (v2, 밝기 0~255) / flags.blackFrame")
        cols = ["at", "n", "ext", "copy", "c2d", "extErr", "copyErr", "c2dErr"]
        if any(k in fp for k in ("vf", "vfErr", "vfSyncMs")):  # v4: vf 경로
            cols[3:3] = ["vf"]
            cols += ["vfErr"]
        if "ms" in fp:  # v3: 프로브 1회 소요와 경로별 동기 시간
            cols += ["ms", "extSyncMs", "copySyncMs", "c2dSyncMs"]
            if "vfSyncMs" in fp:
                cols += ["vfSyncMs"]
        print(table(cols + ["blackFrame"], [[fmt(fp.get(c)) for c in cols] + [fmt(flags.get("blackFrame"))]]))
    v3_cols = ["path", "displayHz", "displayMissRate", "copyMsP50", "copyMsP95", "copySkipped", "videoDropped", "videoTotal"]
    if any(k in render for k in ("vfMsP50", "vfMsP95")):  # schemaVersion 4 이상
        v3_cols = v3_cols + ["vfMsP50", "vfMsP95"]
    if any(k in render for k in v3_cols):  # schemaVersion 3 이상. v1/v2 파일은 건너뛴다.
        print("\nrender 비용 진단 (v3~v4, 값만)")
        print(table(v3_cols, [[fmt(render.get(c)) for c in v3_cols]]))
    errs = data.get("errors") or []
    print("errors (%d)" % len(errs))
    if errs:
        print(table(["at", "name", "message"], [[fmt(e.get("at")), fmt(e.get("name")), fmt(e.get("message"))] for e in errs if isinstance(e, dict)]))


def collect(args):
    paths = []
    for a in args or [os.path.join(ROOT, "results")]:
        if os.path.isdir(a):
            paths += sorted(glob.glob(os.path.join(a, "*.json")))
        else:
            paths.append(a)
    return paths


def main(argv):
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        schema = json.load(f)
    with open(SCHEMA_M2_PATH, encoding="utf-8") as f:
        schema_m2 = json.load(f)
    paths = collect(argv[1:])
    if not paths:
        print("results/*.json 없음")
        return 1
    bad = 0
    for p in paths:
        try:
            with open(p, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError) as e:
            print("\n## %s\n읽기 실패: %s" % (p, e))
            bad += 1
            continue
        is_m2 = isinstance(data, dict) and data.get("milestone") == "M2"
        problems = validate(data, schema_m2 if is_m2 else schema)
        if problems:
            bad += 1
            print("\n## %s\n스키마 검증 실패 %d건" % (p, len(problems)))
            for m in problems:
                print("  - " + m)
            continue
        (summarize_m2 if is_m2 else summarize)(os.path.basename(p), data)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
