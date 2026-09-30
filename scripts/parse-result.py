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
        "env: macOS=%s safari=%s chip=%s display=%s power=%s sdrBrightness=%s windowMode=%s"
        % tuple(fmt(env.get(k)) for k in ("macOS", "safari", "chip", "display", "power", "sdrBrightness", "windowMode"))
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
            ["maxDistinctStep", "encodingMatch", "refHdrImage"],
            [[fmt(edr.get("maxDistinctStep")), fmt(edr.get("encodingMatch")), fmt(edr.get("refHdrImage"))]],
        )
    )
    print("\nG3 성능 값 (run별)")
    runs = g(data, "perf", "runs") or []
    power = env.get("power")
    if not runs:
        print("(run 없음)")
    else:
        cols = ["fixture", "itm", "srcRes", "canvasRes", "fullscreen", "frames", "warmupSec", "windowSec", "fps", "dropRate", "dropRatePresented", "jsP50", "jsP95", "gpuMs"]
        rows = [[fmt(is_g3_run(r, power))] + [fmt(r.get(c)) for c in cols] for r in runs]
        print(table(["G3 대상"] + cols, rows))
    print("\nG3 대상 run 요약 (전원 연결 + 전체화면)")
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
