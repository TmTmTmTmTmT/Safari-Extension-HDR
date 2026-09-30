#!/usr/bin/env bash
# PLAN.md 없이 코드 구현 시작 금지 (CLAUDE.md 전환 규칙 5)
input=$(cat)
file=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$file" ] && exit 0

# 문서 및 .claude 설정 파일은 항상 허용
case "$file" in
  *.md|*/.claude/*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -z "$(find "$root" -maxdepth 3 -name PLAN.md -not -path '*/node_modules/*' -print -quit 2>/dev/null)" ]; then
  echo "차단: PLAN.md 없음. Opus 단계에서 계획 문서를 먼저 작성해야 함 (CLAUDE.md 전환 규칙 5)." >&2
  exit 2
fi
exit 0
