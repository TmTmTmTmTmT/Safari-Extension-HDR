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


MODES = ["B0", "B1", "B2", "B3"]


def is_g3_overlay_run(run, power):
    """v3 G3 대상 = 전원 연결 + 전체화면 + overlay 배치. layout이 없는 v1/v2 run은 split로 간주해 제외한다."""
    return is_g3_run(run, power) and run.get("layout", "split") == "overlay"


def latest_by_mode(runs):
    """{srcRes: {mode: run}}. 같은 (해상도, 모드)가 여러 번이면 마지막 run."""
    out = {}
    for r in runs:
        out.setdefault(r.get("srcRes") or "unknown", {})[r.get("mode", "split")] = r
    return out


def g3_summary(runs, power):
    """{srcRes: {baselineDrop, itmDrop, delta, jsP95Max} | None}. 값만 계산하고 판정하지 않는다."""
    targets = [r for r in runs if is_g3_overlay_run(r, power)]
    res = {}
    for key, by_mode in sorted(latest_by_mode(targets).items()):
        b0, b3 = by_mode.get("B0"), by_mode.get("B3")
        if not b0 or not b3:
            res[key] = None
            continue
        d0, d3 = b0.get("dropRate"), b3.get("dropRate")
        num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
        p95 = [r.get("jsP95") for r in targets if (r.get("srcRes") or "unknown") == key and num(r.get("jsP95"))]
        res[key] = {
            "baselineDrop": d0 if num(d0) else None,
            "itmDrop": d3 if num(d3) else None,
            "delta": round(d3 - d0, 5) if num(d0) and num(d3) else None,
            "jsP95Max": max(p95) if p95 else None,
        }
    return res


def print_mode_tables(runs, power):
    overlay = [r for r in runs if r.get("layout", "split") == "overlay"]
    print("\n모드별 표 (overlay run, 해상도 x B0~B3, 같은 모드 반복 시 마지막 run)")
    if not overlay:
        print("overlay run 없음")
    else:
        grouped = latest_by_mode(overlay)
        for metric in ("dropRate", "dropRatePresented", "fps", "gpuMs", "jsP95"):
            print("\n%s" % metric)
            rows = [[res] + [fmt(by_mode.get(m, {}).get(metric)) for m in MODES] for res, by_mode in sorted(grouped.items())]
            print(table(["srcRes"] + MODES, rows))
        print("\n표의 run 조건 (power=%s)" % fmt(power))
        rows = []
        for res, by_mode in sorted(grouped.items()):
            for m in MODES:
                r = by_mode.get(m)
                if r:
                    rows.append([res, m, fmt(r.get("fullscreen")), fmt(is_g3_overlay_run(r, power)), fmt(r.get("canvasRes"))])
        print(table(["srcRes", "mode", "fullscreen", "G3 대상", "canvasRes"], rows))
    print("\nG3 요약 (전원 연결 + 전체화면 + overlay run; 값만)")
    summary = g3_summary(runs, power)
    if not summary:
        print("G3 대상 overlay run 없음")
    else:
        rows = []
        for res, v in summary.items():
            if v is None:
                rows.append([res, "-", "-", "-", "-"])
            else:
                rows.append([res] + [fmt(v[k]) for k in ("baselineDrop", "itmDrop", "delta", "jsP95Max")])
        print(table(["srcRes", "baselineDrop", "itmDrop", "delta", "jsP95Max"], rows))
        print("(B0 또는 B3 run이 없는 해상도는 '-')")


def table(headers, rows):
    widths = [len(h) for h in headers]
    for r in rows:
        for i, c in enumerate(r):
            widths[i] = max(widths[i], len(c))
    line = lambda cells: "| " + " | ".join(c.ljust(widths[i]) for i, c in enumerate(cells)) + " |"
    out = [line(headers), "|" + "|".join("-" * (w + 2) for w in widths) + "|"]
    out += [line(r) for r in rows]
    return "\n".join(out)


def summarize(name, data):
    print("\n## %s" % name)
    env = data.get("env", {})
    print(
        "env: macOS=%s safari=%s chip=%s display=%s power=%s sdrBrightness=%s refreshRate=%s windowMode=%s"
        % tuple(fmt(env.get(k)) for k in ("macOS", "safari", "chip", "display", "power", "sdrBrightness", "refreshRate", "windowMode"))
    )
    print("screen: %s" % fmt(env.get("screen")))
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
        cols = ["fixture", "mode", "layout", "itm", "srcRes", "canvasRes", "fullscreen", "frames", "warmupSec", "windowSec", "fps", "dropRate", "dropRatePresented", "jsP50", "jsP95", "gpuMs"]
        dflt = {"mode": "split", "layout": "split"}
        rows = [[fmt(is_g3_overlay_run(r, power))] + [fmt(r.get(c, dflt.get(c))) for c in cols] for r in runs]
        print(table(["G3 대상(v3)"] + cols, rows))
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
    print("\nflags: %s" % fmt(data.get("flags")))
    errs = data.get("errors") or []
    print("errors (%d)%s" % (len(errs), "".join("\n  - " + e for e in errs)))


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
        problems = validate(data, schema)
        if problems:
            bad += 1
            print("\n## %s\n스키마 검증 실패 %d건" % (p, len(problems)))
            for m in problems:
                print("  - " + m)
            continue
        summarize(os.path.basename(p), data)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
