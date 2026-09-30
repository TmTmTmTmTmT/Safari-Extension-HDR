#!/usr/bin/env bash
# 사용자 Mac 전용. 저장소 루트에서 실행한다. (PLAN.md M2-3)
# safari-web-extension-converter로 xcode/ 를 생성하고 pbxproj 절대경로 여부를 검사한다.
set -euo pipefail

BUNDLE_ID="${BUNDLE_ID:-io.github.tmtmtmtmtmt.sdrhdr}"

if [ ! -f package.json ] || [ ! -f extension/manifest.json ] || [ ! -f scripts/make-xcode.sh ]; then
  echo "오류: 저장소 루트에서 실행하세요 (package.json, extension/manifest.json 필요)." >&2
  exit 1
fi

if [ -e xcode ]; then
  echo "오류: xcode/ 가 이미 있습니다. 덮어쓰지 않습니다. 재생성하려면 직접 삭제한 뒤 다시 실행하세요." >&2
  exit 1
fi

# 옵션 이름은 [2차] 정보이므로 --help 출력에 있는지 먼저 확인한다.
help_out="$(xcrun safari-web-extension-converter --help 2>&1 || true)"
missing=0
for opt in --project-location --app-name --bundle-identifier --macos-only --swift --no-open --no-prompt; do
  if ! printf '%s\n' "$help_out" | grep -q -- "$opt"; then
    echo "오류: converter --help 에 $opt 옵션이 없습니다." >&2
    missing=1
  fi
done
if [ "$missing" -ne 0 ]; then
  echo "converter 옵션이 계획과 다릅니다. 실행을 중단합니다. 위 목록과 --help 출력을 Opus에 전달하세요." >&2
  exit 1
fi

# --copy-resources 는 쓰지 않는다 (A16).
xcrun safari-web-extension-converter extension \
  --project-location xcode \
  --app-name SDRHDR \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only --swift --no-open --no-prompt

proj="$(find xcode -maxdepth 3 -name '*.xcodeproj' -type d | head -n 1)"
if [ -z "$proj" ]; then
  echo "오류: xcode/ 아래에 .xcodeproj 를 찾지 못했습니다." >&2
  exit 1
fi
pbx="$proj/project.pbxproj"

# 저장소 절대경로가 들어가면 CI(다른 경로)에서 빌드가 깨진다 (A16). 수정하지 않고 알린다.
# grep 종료 코드: 0=발견, 1=없음, 2=오류(파일 없음 등). 오류를 "없음"으로 보지 않는다.
if [ ! -f "$pbx" ]; then
  echo "오류: $pbx 파일이 없어 A16 검사를 할 수 없습니다. 아래 출력을 Opus에 전달하세요." >&2
  ls -la "$proj" >&2 || true
  exit 1
fi
rc=0
grep -F -e "$PWD" -e "/Users/" "$pbx" >/dev/null || rc=$?
if [ "$rc" -eq 0 ]; then
  echo "오류: A16 실패. $pbx 에 절대경로($PWD 또는 /Users/)가 있습니다. 수정하지 말고 이 출력을 Opus에 전달하세요." >&2
  grep -n -F -e "$PWD" -e "/Users/" "$pbx" >&2 || true
  exit 2
elif [ "$rc" -ne 1 ]; then
  echo "오류: grep 실행 실패(rc=$rc). A16 검사를 완료하지 못했습니다." >&2
  exit 1
fi
echo "pbxproj 절대경로 검사 통과: $pbx"

xcodebuild -list -project "$proj"

cat <<MSG

다음 단계:
  1. Xcode에서 개인 팀을 지정해 서명·실행한다. DEVELOPMENT_TEAM 변경은 커밋하지 않는다.
  2. push할 커밋은 이 스크립트 직후 상태여야 한다: git add xcode && git commit && git push
MSG
