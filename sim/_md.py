"""마크다운 표 출력 보조 (prettier 통과 형식: 셀 공백 1칸, 구분선 ---)."""


def md_table(headers, rows):
    def fmt(v):
        if isinstance(v, float):
            return f"{v:.4g}"
        return str(v)

    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for r in rows:
        out.append("| " + " | ".join(fmt(v) for v in r) + " |")
    return "\n".join(out)
