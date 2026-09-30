# FIX_GUIDE.md — M2 Xcode 형식 불일치·구현 검토 + 프로브 지표(K1)

> 작성: Opus. 근거: STATUS.md "Opus 확인 필요"(M2 항목), PR #4 CI 로그(`23f3af2`: 러너 Xcode 26.2~26.6, `project.xcproj` 읽기 실패 exit 74), 사용자 Mac `make-xcode.sh` 출력.
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: F1~F5(`63291b6`), H1~H5(`5fedb89`), J1~J4(`7abf8a8`) 완료. K1은 미구현이며 아래에 그대로 둔다.

## 판정 요약

- macOS CI 실패는 코드 결함이 아니다. 사용자 Mac의 Xcode 베타 converter가 새 형식 `project.xcproj`를 만들었고, 러너(최신 26.6)는 `project.pbxproj`만 읽는다. 러너에 27 계열이 없어 (b) 러너 쪽 선택은 불가.
- 결정: **(d) CI가 러너 Xcode로 converter를 직접 실행해 임시 프로젝트를 만들고 무서명 빌드한다.** 커밋된 `xcode/`는 사용자 Mac 설치용이며 CI에서는 A16(절대경로) 검사만 한다. 커밋된 프로젝트가 `project.pbxproj` 형식이면 그것도 빌드한다.
  - (a) 안정판 26.x 재생성은 macOS 27.2에서 실행 가능 여부가 미확인이고, 사용자 Xcode 버전에 CI가 계속 묶인다. 기각.
  - (c) 빌드 생략은 A15(확장이 빌드되는가) 검증을 잃는다. 기각.
  - (d)는 extension/ 변경이 러너 Xcode에서 빌드되는지를 매 push 검증하므로 A15 목적을 유지한다. 커밋 프로젝트의 빌드 가능성은 사용자 Mac Run으로 확인한다(0b 절차에 이미 포함).
- M2 구현 중 보고된 결정 보류 항목은 대부분 승인한다(L3). 일시정지 attach 첫 프레임 누락만 수정한다(L4).
- 이 수정은 **0b 사용자 측정을 막지 않는다.** 사용자는 현재 `xcode/`로 Mac에서 Run·측정을 병행해도 된다.

---

## L1. macOS CI: 러너에서 converter로 임시 프로젝트 생성 후 빌드

- **원인**: 커밋 프로젝트 형식(`project.xcproj`)을 러너 Xcode 26.x가 읽지 못함.
- **수정 방향**:
  1. ci.yml `macos` job 순서: `xcodebuild -version` 기록 → (커밋된 `xcode/`가 있으면) A16 검사: `.xcodeproj` 안의 `project.pbxproj` 또는 `project.xcproj`에서 `$PWD`·`/Users/` 검출 시 실패(현행 규칙 유지) → **임시 빌드**: `$RUNNER_TEMP/xc`에 `xcrun safari-web-extension-converter extension --project-location "$RUNNER_TEMP/xc" --app-name SDRHDR --bundle-identifier io.github.tmtmtmtmtmt.sdrhdr --macos-only --swift --no-open --no-prompt --force`(옵션은 make-xcode.sh와 동일, `--force`는 임시 경로라 허용. 러너 converter `--help`에 없으면 생략) → 생성된 `.xcodeproj`를 `-alltargets -configuration Debug CODE_SIGNING_ALLOWED=NO build`.
  2. 커밋된 `.xcodeproj`에 `project.pbxproj`가 있으면 그것도 같은 명령으로 빌드한다. `project.xcproj`만 있으면 "커밋 프로젝트는 새 형식이라 러너에서 빌드 생략(사용자 Mac Run으로 확인)"을 출력한다(실패 아님).
  3. `xcode/`가 없어도 임시 빌드는 한다(더 이상 "프로젝트 없음"으로 조기 종료하지 않는다).
  4. 진단용 `ls -d /Applications/Xcode*` 줄은 제거한다.
- **영향 범위**: `.github/workflows/ci.yml`만.
- **검증**: (2) PR #4 macos job green, 로그에 임시 프로젝트 빌드 `** BUILD SUCCEEDED **`와 커밋 프로젝트 "빌드 생략" 문구. 실패하면 로그를 STATUS.md에 요약하고 Opus로 반환(스크립트 우회 금지).

## L2. make-xcode.sh: converter 부재 시 정확한 안내

- **원인**: `xcode-select`가 Command Line Tools를 가리키면 converter 자체가 없는데, 스크립트는 "옵션이 없다"고 7줄을 출력해 원인을 오도했다.
- **수정 방향**: 옵션 확인 전에 `xcrun --find safari-web-extension-converter`를 실행한다. 실패하면 "Xcode 앱이 선택되지 않음: `xcode-select -p` 확인, `sudo xcode-select -s /Applications/<Xcode>.app/Contents/Developer`"를 출력하고 종료 코드 1. 옵션 누락 시에는 `--help` 출력 앞부분(40줄)을 함께 표시한다. 생성 후 `xcodebuild -version`을 출력해 어떤 Xcode로 만들었는지 남긴다.
- **영향 범위**: `scripts/make-xcode.sh`.
- **검증**: (1) `bash -n`, `xcrun` 없는 환경(클라우드)에서 실행 시 안내 문구·rc=1 확인(저장소 루트 검사 통과 조건을 만족시킨 상태로). (3)은 불필요.

## L3. M2 구현 결정 보류 항목 판정 (코드 변경 없음, 기록만)

| 항목                                                                                         | 판정                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| main.js 끝에서 `Promise.resolve().then(start)`로 시작                                        | **승인.** "부작용 시작점은 main.js"와 "로드 시 동기 접근 없음"을 모두 만족한다. start 내부 예외는 삼키되 diag `errors`에 기록한다(현행이 기록하지 않으면 L4와 함께 추가) |
| renderer `hooks.onFrame`, `getStats()`                                                       | **승인.** M2-1 동작 구현에 필요한 최소 인터페이스                                                                                                                        |
| overlay의 video `loadedmetadata`/`resize` 구독                                               | **승인.** 화질 변경 시 캔버스 크기 갱신에 필요. detach에서 해제 필수                                                                                                     |
| diag 값 형식(`configRead.toneMapping`=mode 문자열, 통계는 최근 600개 기준, `errors` 최대 20) | **승인**                                                                                                                                                                 |
| 체크리스트 파일명 표기 `ac`/`mid`/`1080p60`/`2160p60`/모드                                   | **승인.** M1 관례와 같음                                                                                                                                                 |
| make-xcode.sh 저장소 루트 판정, 절대경로 rc=2                                                | **승인**                                                                                                                                                                 |

## L4. 일시정지 상태 attach 시 첫 프레임 렌더

- **원인**: 재개 이벤트가 `play`/`seeked`뿐이라, 자동재생이 막혀 일시정지로 attach되면 캔버스가 비어 있고(검거나 투명) 원본 video를 가린다. C절 "일시정지 시 1회 렌더"와 어긋난다.
- **수정 방향**: attach 직후 `video.readyState >= 2`(HAVE_CURRENT_DATA)면 1회 렌더한다. 아니면 `loadeddata`를 1회 구독해 1회 렌더한다. 재생 중이면 기존 루프를 따른다. 리스너는 detach에서 해제한다.
- **영향 범위**: `extension/content/renderer.js`(필요 시 `main.js`), 해당 단위 테스트(렌더 호출 횟수를 stub으로 검사할 수 있는 범위만. 불가하면 테스트 없이 STATUS.md에 사유 기록).
- **검증**: (1) lint·`npm test`. (3) 0b 체크리스트에 "일시정지 상태로 페이지 로드 → 오버레이에 첫 프레임 표시" 항목 1줄 추가.

## L5. M2 진단 스키마 타입 확정

- **수정 방향**: `docs/result-schema-m2.json`에서 `api.adapter`·`api.device`·`api.configure`를 `boolean|null`(성공 true, 실패 false, 시도 전 null), `api.configRead.toneMapping`을 `string|null`로 정한다. `buildDiag`가 이 타입을 내도록 맞추고 단위 테스트에 타입 검사를 추가한다.
- **영향 범위**: `docs/result-schema-m2.json`, `extension/content/hud.js`(필요 시 `main.js`/`renderer.js`의 값 대입), `tests/unit/extension-*.test.js`, `sim/test_parse_result.py`(샘플 값).
- **검증**: (1) lint, `npm test`, `python3 -m pytest sim`.

## L6. CI ubuntu job에 DOM 테스트 추가

- **원인**: `npm run test:dom`이 어디서도 실행되지 않는다. M3의 DOM 판별 검증 수단이므로 지금 CI에 넣는다.
- **수정 방향**: ubuntu job에 `npx playwright install --with-deps webkit` 후 `npm run test:dom` 단계를 추가한다. Playwright 버전은 package-lock의 것을 쓴다. 이 VM에서 WebKit 설치가 실패하는 것은 VM egress 문제로 보고, CI 결과로 판단한다.
- **영향 범위**: `.github/workflows/ci.yml`(L1과 같은 파일이므로 같은 작업자가 처리).
- **검증**: (2) ubuntu job에서 `m2-detect.spec.js` 3건 통과.

---

## 병렬 분할 (L 회차)

- W-A: L1 + L6(ci.yml), L2(make-xcode.sh).
- W-B: L4, L5(extension/, docs/result-schema-m2.json, tests, sim/test_parse_result.py), 0b 체크리스트 1줄 추가(docs/manual-checklist.md).
- L3는 STATUS.md 기록만(본 세션).
- 파일 비중첩. K1은 여전히 별도 PR(이 브랜치에 섞지 않음).

---

## K1. G3 지표를 3차 개정 정의로 교체

- **원인**: 프로브의 `missRate`는 소스 프레임 슬롯 기준(2차 개정 정의)이다. 구동 루프 주기와 소스 fps가 같은 60Hz에서는 rAF 위상 지터만으로 한 슬롯에 2회, 다음 슬롯 0회가 생겨 거짓 누락이 잡힌다. 4차 60Hz 파일에서 캔버스 없는 R0가 콜백 601/600인데 `missRate` 5.67%, R2 7.5%, R3 0%로 작업과 무관하게 흔들렸다. 구현 작업자가 J 회차에서 미리 보고한 문제와 같다.
- **수정 방향**:
  1. 순수 함수 `displayMissRate(loopTimes, windowStart, windowEnd, displayHz)`를 `probe-core.js`에 둔다. 측정 창에서 연속 콜백 간격이 `1.5 / displayHz`를 넘으면 `round(간격 × displayHz) − 1`개 갱신을 놓친 것으로 센다. 결과 = 놓친 갱신 수 / (측정 창 초 × displayHz).
  2. `displayHz`는 측정 창의 콜백 간격 중앙값에서 추정해 60 또는 120 중 가까운 값으로 반올림한다. 추정값을 run에 `displayHz`로 기록한다. 사용자가 고른 `env.refreshRate`는 참고로만 두고, 둘이 다르면 페이지에 "주사율 선택값과 측정값이 다름" 경고를 표시한다(4차에서 표기가 뒤바뀐 문제 방지).
  3. run에 `displayMissRate`, `displayHz`를 추가한다. 기존 `missRate`(슬롯 기반)는 이름을 바꾸지 말고 보조로 남긴다.
  4. `perf.g3`의 `baselineMiss`/`itmMiss`/`delta`를 `displayMissRate` 기준으로 바꾸고, `rvfcMiss`는 기존 그대로 둔다. `perf.g3`에 `displayHz`를 추가한다. schemaVersion 5.
  5. `scripts/parse-result.py`: 모드별 표와 G3 요약에 `displayMissRate`, `displayHz` 열을 추가한다. v1~v4 파일 11건 오류 없이 처리한다. 판정은 출력하지 않는다.
- **영향 범위**: `probe/probe-core.js`, `probe/probe.js`, `docs/result-schema.json`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`.
- **검증(1)**: 단위 테스트. 60Hz 규칙 시퀀스(±2 ms 지터 포함) → 0, 120Hz → 0, 60Hz에서 33 ms 공백 1회 → 1/600, displayHz 추정(16.7 ms → 60, 8.3 ms → 120). `results/` 11건 parse-result 오류 없음.
- **검증(3)**: 필요 없음. 다음 Safari 업데이트 때 회귀 확인용으로 쓴다.

---

## 이번 수정 범위 밖 (변경 금지, L·K 공통)

- ITM 수식, 프리셋 수치(M4).
- K1은 `probe/` 전용이며 M2 브랜치에 섞지 않는다. L 회차는 `extension/`·CI·스크립트만 다룬다.
- 커밋된 `xcode/`의 수기 편집·형식 변환(GUIDELINES 7-5).

## 병렬 분할 (K1)

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
