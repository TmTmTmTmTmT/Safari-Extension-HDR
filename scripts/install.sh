#!/usr/bin/env bash
# SDR HDR 자동 설치·업데이트 (FIX_GUIDE W5). 저장소 어디서 실행해도 된다.
#
#   scripts/install.sh [--update] [-y] [--no-open] [--dry-run] [--help]
#
# 하는 일: 환경 점검 → 팀 ID 찾기 → 서명 빌드(.local/build 고정) → 이전 사본·낡은 등록 정리(사본은 확인 후 휴지통) → /Applications 설치 → 빌드본 등록 해제·삭제 → 앱 실행 → Safari 재시작(선택).
# 하지 않는 일: Apple ID 로그인, sudo, Safari 설정·개발자 메뉴 조작, project.xcproj 수정, rm 으로 앱 삭제.
# 테스트용 환경 변수: TEAM_ID(팀 지정), SDRHDR_SW_VERS·SDRHDR_SAFARI_VERSION(버전 주입, 점검 분기 확인용).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=lib/install-lib.sh
source "$ROOT/scripts/lib/install-lib.sh"

BUNDLE_ID="io.github.tmtmtmtmtmt.SDRHDR"
PROJECT="xcode/SDRHDR/SDRHDR.xcodeproj"
MIN_MACOS="26.0"
MIN_SAFARI="26.0"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
LOCAL_DIR="$ROOT/.local"
BUILD_DIR="$LOCAL_DIR/build"

UPDATE=0 ASSUME_YES=0 NO_OPEN=0 DRY=0
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    -y) ASSUME_YES=1 ;;
    --no-open) NO_OPEN=1 ;;
    --dry-run) DRY=1 ;;
    --help | -h)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0
      ;;
    *)
      echo "오류: 알 수 없는 옵션 $arg (--help 참고)" >&2
      exit 2
      ;;
  esac
done

step() { printf '\n[%s] %s\n' "$1" "$2"; }
die() {
  printf '오류: %s\n' "$1" >&2
  shift
  for l in "$@"; do printf '  %s\n' "$l" >&2; done
  exit 1
}
# 상태를 바꾸는 명령은 모두 run 으로 부른다. --dry-run 이면 출력만 한다.
run() {
  if [ "$DRY" -eq 1 ]; then
    printf '  (dry-run) %s\n' "$*"
    return 0
  fi
  "$@"
}
# ask "질문" default(y|n) : -y 이면 default 와 무관하게 확인이 필요한 항목은 예, 아니면 default.
ask() {
  local q="$1" def="$2" ans
  if [ "$ASSUME_YES" -eq 1 ]; then return 0; fi
  if [ ! -t 0 ]; then
    [ "$def" = y ]
    return
  fi
  if [ "$def" = y ]; then printf '%s (Y/n) ' "$q"; else printf '%s (y/N) ' "$q"; fi
  read -r ans || ans=""
  ans="${ans:-$def}"
  case "$ans" in y | Y | yes | YES) return 0 ;; *) return 1 ;; esac
}

# 되돌리기 어려운 동작(사본 휴지통 이동)은 -y 가 없으면 터미널에서 직접 확인받는다. 비대화형이면 하지 않는다.
ask_destructive() {
  if [ "$ASSUME_YES" -eq 1 ]; then return 0; fi
  if [ ! -t 0 ]; then
    echo "  비대화형 실행이라 사본을 정리하지 않습니다. -y 를 붙여 다시 실행하면 정리합니다."
    return 1
  fi
  ask "$1" y
}

[ -f extension/manifest.json ] && [ -d "$PROJECT" ] || die "저장소가 완전하지 않습니다." "extension/manifest.json 과 $PROJECT 가 필요합니다."

# ---------------------------------------------------------------- 0. 업데이트
if [ "$UPDATE" -eq 1 ]; then
  [ -d .git ] || die "--update 는 git clone 으로 받은 저장소에서만 쓸 수 있습니다." "ZIP 으로 받았다면 새 ZIP 을 받아 scripts/install.sh 를 실행하세요."
  step 0 "git pull --ff-only"
  run git pull --ff-only || die "git pull 이 실패했습니다." "로컬 변경이나 갈라진 이력이 있는지 확인하세요."
fi

# ---------------------------------------------------------------- 1. 환경 점검
step 1 "환경 점검"
sw="${SDRHDR_SW_VERS:-$(sw_vers -productVersion)}"
il_version_ge "$sw" "$MIN_MACOS" || die "macOS $MIN_MACOS 이상이 필요합니다 (현재 $sw)."
echo "  macOS $sw"

safari_ver="${SDRHDR_SAFARI_VERSION:-$(plutil -extract CFBundleShortVersionString raw -o - /Applications/Safari.app/Contents/Info.plist 2>/dev/null || true)}"
[ -n "$safari_ver" ] || die "Safari 버전을 읽을 수 없습니다." "/Applications/Safari.app 이 있는지 확인하세요."
il_version_ge "$safari_ver" "$MIN_SAFARI" || die "Safari $MIN_SAFARI 이상이 필요합니다 (현재 $safari_ver)." "HDR 변환은 WebGPU가 있는 Safari에서만 동작합니다."
echo "  Safari $safari_ver"

dev_dir="$(xcode-select -p 2>/dev/null || true)"
case "$dev_dir" in
  *.app/Contents/Developer) echo "  Xcode: $dev_dir" ;;
  *) die "xcode-select 가 Xcode 앱을 가리키지 않습니다 (현재: ${dev_dir:-없음})." "Xcode 를 설치한 뒤 직접 실행하세요:" "sudo xcode-select -s /Applications/<Xcode>.app/Contents/Developer" ;;
esac
if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
  die "Xcode 최초 실행 구성이 끝나지 않았습니다." "직접 실행하세요: sudo xcodebuild -runFirstLaunch (또는 Xcode 를 한 번 열어 라이선스에 동의)"
fi
if ! xcodebuild -list -project "$PROJECT" >/dev/null 2>&1; then
  die "이 Xcode 가 $PROJECT 를 열지 못했습니다 ($(xcodebuild -version 2>/dev/null | head -n 1))." "저장소의 프로젝트는 Xcode 베타 형식이라 같은 형식을 여는 Xcode(27 베타 이상 [추정])가 필요합니다."
fi
VERSION="$(plutil -extract version raw -o - extension/manifest.json)"
BUILD_NUM="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
echo "  확장 버전 $VERSION (빌드 $BUILD_NUM)"

# ---------------------------------------------------------------- 2. 팀 ID
step 2 "서명 팀 찾기"
mkdir -p "$LOCAL_DIR"
TEAM="${TEAM_ID:-}"
TEAM_FROM_CACHE=0
TEAM_FROM_XCODE=0

# 키체인의 Apple Development 인증서에서 팀 ID 목록을 구한다(공백 구분).
teams=""
shas="$(security find-identity -v -p codesigning 2>/dev/null | il_parse_identities || true)"
if [ -n "$shas" ]; then
  pems="$(security find-certificate -a -Z -p 2>/dev/null || true)"
  while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    ou="$(printf '%s\n' "$pems" | il_cert_pem_for_sha1 "$sha" | openssl x509 -noout -subject 2>/dev/null | il_ou_from_subject || true)"
    [ -n "$ou" ] || continue
    il_list_contains "$teams" "$ou" || teams="$teams $ou"
  done <<<"$shas"
fi

if [ -z "$TEAM" ] && [ -f "$LOCAL_DIR/team-id" ]; then
  cached="$(tr -d '[:space:]' <"$LOCAL_DIR/team-id")"
  if [ -z "$teams" ] || il_list_contains "$teams" "$cached"; then
    TEAM="$cached"
    TEAM_FROM_CACHE=1
  else
    echo "  저장된 팀 $cached 가 이 Mac 의 인증서 목록에 없어 다시 고릅니다."
  fi
fi

if [ -z "$TEAM" ]; then
  # 인증서가 없으면 Xcode 에 로그인된 계정의 팀 ID 를 후보로 쓴다(읽기 전용). 자동 서명이 인증서를 만들 것으로 기대한다 [미확인].
  if [ -z "$teams" ]; then
    xteams="$(defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier 2>/dev/null | il_teams_from_xcode_defaults || true)"
    if [ -n "$xteams" ]; then
      # shellcheck disable=SC2086
      teams="$(echo $xteams)"
      TEAM_FROM_XCODE=1
      echo "  인증서가 아직 없습니다. Xcode 에 로그인된 팀으로 빌드해 자동 서명이 인증서를 만들게 합니다 [미확인]."
    fi
  fi
  # shellcheck disable=SC2086
  set -- $teams
  if [ "$#" -eq 0 ]; then
    die "서명용 Apple Development 인증서를 찾지 못했습니다." \
      "1) Xcode › 설정 › 계정에서 Apple ID 를 추가하세요 (무료 개인 팀으로 충분)." \
      "2) $PROJECT 를 Xcode 로 열어 SDRHDR 타깃 Signing & Capabilities 에서 Team 을 한 번 지정하면 인증서가 만들어집니다." \
      "3) 다시 scripts/install.sh 를 실행하세요. (팀 ID 를 알면 TEAM_ID=<10자리> scripts/install.sh)"
  elif [ "$#" -eq 1 ]; then
    TEAM="$1"
  else
    echo "  팀이 여러 개입니다. 번호를 고르세요:"
    n=1
    for t in "$@"; do
      echo "   $n) $t"
      n=$((n + 1))
    done
    [ -t 0 ] || die "팀이 여러 개라 선택이 필요합니다." "TEAM_ID=<10자리> scripts/install.sh 로 지정하세요."
    printf '  번호: '
    read -r pick
    case "$pick" in '' | *[!0-9]*) die "잘못된 번호입니다." ;; esac
    [ "$pick" -ge 1 ] && [ "$pick" -le "$#" ] || die "잘못된 번호입니다."
    TEAM="$(eval "echo \${$pick}")"
  fi
fi
il_valid_team_id "$TEAM" || die "팀 ID 형식이 올바르지 않습니다 (10자리 영문 대문자·숫자)."
if [ "$DRY" -eq 0 ]; then printf '%s\n' "$TEAM" >"$LOCAL_DIR/team-id"; fi
echo "  팀 $TEAM"

# ---------------------------------------------------------------- 3. 빌드
step 3 "빌드 (Release, 서명)"
PRODUCTS="$BUILD_DIR/Build/Products"
PURGED=0
warn_purge() {
  echo "  경고: 빌드 폴더를 지우지 못했습니다: $(printf '%s' "$PRODUCTS" | il_redact_home "$HOME")" >&2
  echo "  시스템 설정 › 개인정보 보호 및 보안 › 앱 관리에서 터미널을 허용한 뒤 다시 실행하세요. (설치와 등록 해제는 끝났습니다)" >&2
}
# 빌드본(앱·독립 appex)의 pluginkit·LaunchServices 등록을 해제하고 .local/build/Build/Products 를 지운다 (AA2). 모듈 캐시 등은 둔다.
purge_build() {
  local ax
  if [ "$DRY" -eq 0 ] && [ ! -d "$PRODUCTS" ]; then return 0; fi
  for ax in "$PRODUCTS/Release/SDRHDR.app/Contents/PlugIns/SDRHDR Extension.appex" "$PRODUCTS/Release/SDRHDR Extension.appex"; do
    run pluginkit -r "$ax" 2>/dev/null || true
  done
  for ax in "$PRODUCTS/Release/SDRHDR.app" "$PRODUCTS/Release/SDRHDR Extension.appex"; do
    [ -x "$LSREGISTER" ] && run "$LSREGISTER" -u "$ax" 2>/dev/null || true
  done
  if run rm -rf "$PRODUCTS"; then PURGED=1; else warn_purge; fi
}
cleanup() {
  [ "$PURGED" -eq 0 ] && [ "$DRY" -eq 0 ] && [ -d "$PRODUCTS" ] || return 0
  purge_build
}
trap cleanup EXIT
run mkdir -p "$BUILD_DIR"
purge_build
PURGED=0
BUILD_LOG="$LOCAL_DIR/build.log"
APP_BUILT="$PRODUCTS/Release/SDRHDR.app"
build_cmd=(xcodebuild -project "$PROJECT" -scheme SDRHDR -configuration Release -derivedDataPath "$BUILD_DIR"
  -allowProvisioningUpdates
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic
  MACOSX_DEPLOYMENT_TARGET="$MIN_MACOS"
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUM" build)
if [ "$DRY" -eq 1 ]; then
  printf '  (dry-run) %s\n' "${build_cmd[*]}"
else
  echo "  로그: $BUILD_LOG"
  if ! "${build_cmd[@]}" >"$BUILD_LOG" 2>&1; then
    echo "  마지막 오류:" >&2
    grep -E "error:" "$BUILD_LOG" | tail -n 5 | il_redact_home "$HOME" | sed 's/^/    /' >&2 || true
    hints=("자세한 내용: $BUILD_LOG (이슈에 공유할 때는 error: 줄만, 경로를 가려서 붙이세요. 로그 전체에는 사용자 경로·팀 ID가 있습니다)" "서명 오류면 Xcode › 설정 › 계정에서 Apple ID 로그인 상태를 확인하세요.")
    if [ "$TEAM_FROM_CACHE" -eq 1 ]; then hints+=("저장된 팀 $TEAM 이 이 Mac 과 맞지 않을 수 있습니다. rm .local/team-id 후 다시 실행하세요."); fi
    if [ "$TEAM_FROM_XCODE" -eq 1 ]; then hints+=("인증서가 없는 상태의 자동 서명이 실패했습니다. $PROJECT 를 Xcode 로 열어 SDRHDR·SDRHDR Extension 의 Team 을 한 번 지정한 뒤 다시 실행하세요."); fi
    die "빌드에 실패했습니다." "${hints[@]}"
  fi
  for target in "$APP_BUILT" "$APP_BUILT/Contents/PlugIns/SDRHDR Extension.appex"; do
    info="$(codesign -dv "$target" 2>&1 || true)"
    printf '%s\n' "$info" | grep -q "TeamIdentifier=$TEAM" || die "서명 확인 실패: $(basename "$target") 의 팀이 $TEAM 이 아닙니다." "빌드 로그: $BUILD_LOG"
    printf '%s\n' "$info" | grep -q "Signature=adhoc" && die "서명 확인 실패: $(basename "$target") 가 ad-hoc 서명입니다."
  done
  echo "  앱·확장 모두 팀 $TEAM 서명 확인"
fi

# ---------------------------------------------------------------- 4. 이전 사본 정리
step 4 "이전 사본 점검"
copies=()
add_copy() {
  local p="$1" c
  [ -d "$p" ] || return 0
  case "$p" in "$BUILD_DIR"/*) return 0 ;; esac
  for c in ${copies[@]+"${copies[@]}"}; do [ "$c" = "$p" ] && return 0; done
  copies+=("$p")
}
while IFS= read -r p; do [ -n "$p" ] && add_copy "$p"; done < <(mdfind "kMDItemCFBundleIdentifier == '$BUNDLE_ID'" 2>/dev/null || true)
add_copy "/Applications/SDRHDR.app"
add_copy "$HOME/Applications/SDRHDR.app"
for p in "$HOME"/Library/Developer/Xcode/DerivedData/SDRHDR-*/Build/Products/*/SDRHDR.app "${TMPDIR:-/tmp}"/sdrhdr-build.*/Build/Products/*/SDRHDR.app; do add_copy "$p"; done
# Spotlight 가 색인하지 않는 임시 폴더 사본은 pluginkit 등록 경로에서 찾는다 (AA3). 독립 appex 는 사본이 아니라 등록 해제 대상.
PK_PATHS="$(pluginkit -m -v -A -D -i "$BUNDLE_ID.Extension" 2>/dev/null | il_pluginkit_paths || true)"
while IFS= read -r p; do [ -n "$p" ] && add_copy "$p"; done < <(printf '%s\n' "$PK_PATHS" | il_app_of_appex)

trash_move() {
  local src="$1" n=0 dest
  dest="$HOME/.Trash/SDRHDR-$(date +%Y%m%d-%H%M%S)-$n.app"
  while [ -e "$dest" ]; do
    n=$((n + 1))
    dest="$HOME/.Trash/SDRHDR-$(date +%Y%m%d-%H%M%S)-$n.app"
  done
  [ -x "$LSREGISTER" ] && run "$LSREGISTER" -u "$src" 2>/dev/null || true
  run mv "$src" "$dest"
  [ -x "$LSREGISTER" ] && run "$LSREGISTER" -u "$dest" 2>/dev/null || true
}

if [ "${#copies[@]}" -eq 0 ]; then
  echo "  이전 사본 없음"
else
  echo "  발견한 사본:"
  for c in "${copies[@]}"; do
    v="$(plutil -extract version raw -o - "$c/Contents/PlugIns/SDRHDR Extension.appex/Contents/Resources/manifest.json" 2>/dev/null || echo '버전 알 수 없음')"
    t="$(stat -f '%Sm' -t '%Y-%m-%d %H:%M' "$c/Contents/MacOS/SDRHDR" 2>/dev/null || echo '?')"
    echo "   - $c (확장 $v, 빌드 $t)"
  done
  if pgrep -f "/SDRHDR.app/Contents/MacOS/SDRHDR" >/dev/null 2>&1; then
    echo "  실행 중인 SDR HDR 를 종료합니다."
    run osascript -e "quit app id \"$BUNDLE_ID\"" || die "SDR HDR 를 종료하지 못했습니다." "직접 종료한 뒤 다시 실행하세요."
    [ "$DRY" -eq 1 ] || sleep 2
  fi
  if ask_destructive "  위 사본을 모두 휴지통으로 옮길까요? (새 버전을 설치하기 전에 정리합니다)"; then
    for c in "${copies[@]}"; do trash_move "$c"; done
    echo "  휴지통으로 이동 완료"
  else
    echo "  정리하지 않고 계속합니다. (설치 위치에 이미 있는 사본은 교체를 위해 휴지통으로 옮깁니다)"
  fi
fi

# 독립 appex 등록과 파일이 없는 낡은 SDRHDR 등록을 정리한다 (AA3·AA4). 파일은 건드리지 않으므로 확인하지 않는다.
while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in "$BUILD_DIR"/*) continue ;; esac
  run pluginkit -r "$p" 2>/dev/null || true
done < <(printf '%s\n' "$PK_PATHS" | il_standalone_appex)
if [ -x "$LSREGISTER" ]; then
  stale=0
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    [ -e "$p" ] && continue
    run "$LSREGISTER" -u "$p" 2>/dev/null || true
    stale=$((stale + 1))
  done < <("$LSREGISTER" -dump 2>/dev/null | il_parse_ls_paths || true)
  echo "  낡은 등록 정리 ${stale}건"
fi

# ---------------------------------------------------------------- 5. 설치
step 5 "설치"
DEST_DIR="/Applications"
if [ ! -w "$DEST_DIR" ]; then
  DEST_DIR="$HOME/Applications"
  run mkdir -p "$DEST_DIR"
fi
DEST="$DEST_DIR/SDRHDR.app"
if [ -e "$DEST" ]; then trash_move "$DEST"; fi
run ditto "$APP_BUILT" "$DEST"
echo "  설치 위치: $DEST"
echo "  빌드본 등록 해제·삭제"
purge_build

# ---------------------------------------------------------------- 6. 등록·실행
if [ "$NO_OPEN" -eq 1 ]; then
  step 6 "등록·실행 생략 (--no-open)"
else
  step 6 "등록·실행"
  [ -x "$LSREGISTER" ] && run "$LSREGISTER" -f "$DEST" 2>/dev/null || true
  run open "$DEST"
  if [ "$DRY" -eq 0 ]; then
    sleep 2
    pk_now="$(pluginkit -m -v -A -D -i "$BUNDLE_ID.Extension" 2>/dev/null | il_pluginkit_paths || true)"
    reg="$(printf '%s\n' "$pk_now" | grep -c . || true)"
    if [ "${reg:-0}" -gt 1 ]; then
      echo "  경고: 확장이 ${reg}곳에 등록돼 있습니다. 열린 SDR HDR 창의 '사본' 항목을 따라 정리하세요. 남은 경로:"
      printf '%s\n' "$pk_now" | il_redact_home "$HOME" | sed 's/^/    /'
    fi
  fi
fi

# ---------------------------------------------------------------- 7. Safari 재시작
if [ "$NO_OPEN" -eq 1 ]; then
  step 7 "Safari 재시작 생략 (--no-open)"
else
  step 7 "Safari"
  if pgrep -x Safari >/dev/null 2>&1 || [ "$DRY" -eq 1 ]; then
    if [ "$ASSUME_YES" -eq 1 ]; then
      echo "  -y 에서는 Safari 를 재시작하지 않습니다. 새 버전을 불러오려면 직접 완전히 종료(⌘Q)한 뒤 다시 여세요."
    elif ask "  새 버전을 불러오려면 Safari 를 재시작해야 합니다. 지금 할까요? (열린 탭은 복원 설정에 따릅니다)" n; then
      run osascript -e 'quit app "Safari"'
      [ "$DRY" -eq 1 ] || sleep 2
      run open -a Safari
    else
      echo "  나중에 Safari 를 완전히 종료(⌘Q)한 뒤 다시 여세요."
    fi
  else
    echo "  Safari 가 실행 중이 아닙니다. 다음에 열 때 새 버전이 적용됩니다."
  fi
fi

# ---------------------------------------------------------------- 8. 남은 수동 단계
step 8 "남은 수동 단계"
cat <<'MSG'
  1) Safari 설정 › 확장 프로그램에서 SDR HDR 를 켠다.
  2) 확장의 웹사이트 접근에서 www.youtube.com 을 허용한다.
  3) 열린 SDR HDR 창의 점검 목록(서명·사본·확장 켜짐)을 따라 남은 항목을 확인한다.
MSG
if [ "$DRY" -eq 1 ]; then echo; echo "(--dry-run: 아무것도 변경하지 않았습니다)"; fi
