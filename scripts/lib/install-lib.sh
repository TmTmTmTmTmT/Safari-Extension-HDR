#!/usr/bin/env bash
# scripts/install.sh 가 source 하는 순수 함수 모음. 부작용 없음 (FIX_GUIDE W5 (c)).
# 테스트: tests/unit/install-lib.test.js

# il_version_ge A B : 점 구분 숫자 버전 A >= B 이면 0.
il_version_ge() {
  local a="$1" b="$2" i x y
  local -a pa pb
  IFS=. read -r -a pa <<<"$a"
  IFS=. read -r -a pb <<<"$b"
  local n=${#pa[@]}
  [ "${#pb[@]}" -gt "$n" ] && n=${#pb[@]}
  for ((i = 0; i < n; i++)); do
    x="${pa[i]:-0}"; y="${pb[i]:-0}"
    x="${x//[^0-9]/}"; y="${y//[^0-9]/}"
    x="${x:-0}"; y="${y:-0}"
    if [ "$x" -gt "$y" ]; then return 0; fi
    if [ "$x" -lt "$y" ]; then return 1; fi
  done
  return 0
}

# il_parse_identities : stdin 은 `security find-identity -v -p codesigning` 출력.
# "Apple Development" 인증서의 SHA-1 을 한 줄에 하나씩 출력한다.
il_parse_identities() {
  sed -n 's/^[[:space:]]*[0-9][0-9]*)[[:space:]]\{1,\}\([0-9A-Fa-f]\{40\}\)[[:space:]]\{1,\}".*Apple Development.*".*$/\1/p'
}

# il_ou_from_subject : stdin 은 `openssl x509 -noout -subject` 한 줄. OU(팀 ID 10자리)를 출력한다.
il_ou_from_subject() {
  grep -o 'OU *= *[A-Z0-9]\{10\}' | head -n 1 | sed 's/OU *= *//'
}

# il_cert_pem_for_sha1 SHA1 : stdin 은 `security find-certificate -a -Z -p` 출력. 해당 해시의 PEM 만 출력한다.
il_cert_pem_for_sha1() {
  local want
  want="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  awk -v want="$want" '
    /^SHA-1 hash:/ { h = toupper($3); next }
    /-----BEGIN CERTIFICATE-----/ { if (h == want) on = 1 }
    on { print }
    /-----END CERTIFICATE-----/ { if (on) exit }
  '
}

# il_valid_team_id ID : 10자리 영숫자 대문자면 0.
il_valid_team_id() {
  printf '%s' "$1" | grep -q '^[A-Z0-9]\{10\}$'
}

# il_teams_from_xcode_defaults : stdin 은 `defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier` 출력.
# 로그인된 계정의 팀 ID(10자리)를 한 줄에 하나씩, 중복 없이 출력한다. 팀 이름·Apple ID 는 읽지 않는다.
il_teams_from_xcode_defaults() {
  sed -n 's/^[[:space:]]*teamID[[:space:]]*=[[:space:]]*"\{0,1\}\([A-Z0-9]\{10\}\)"\{0,1\};.*$/\1/p' | awk '!seen[$0]++'
}

# il_list_contains "a b c" x : 공백 구분 목록에 x 가 있으면 0.
il_list_contains() {
  case " $1 " in *" $2 "*) return 0 ;; *) return 1 ;; esac
}

# il_redact_home HOME : stdin 의 HOME 경로를 ~ 로 바꿔 출력한다 (공개 이슈에 붙일 로그용). HOME 이 비었거나 / 이거나 sed 구분자 # 를 포함하면 그대로 출력.
il_redact_home() {
  local home="$1"
  case "$home" in
    '' | / | *'#'*) cat ;;
    *) sed "s#${home}#~#g" ;;
  esac
}
