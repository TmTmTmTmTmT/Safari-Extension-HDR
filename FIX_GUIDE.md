# FIX_GUIDE.md — X 회차(공개 저장소 정리) · W · V · U 회차

> 작성: Opus (2026-10-03). 근거: 사용자 보고(2026-10-03), STATUS.md "조사: 메모리 증가·재부팅 후 설정 초기화"(Sonnet 코드 읽기), `extension/content/{renderer,main,params,background}.js`, `extension/popup/popup.js`, `xcode/SDRHDR/SDRHDR Extension/SafariWebExtensionHandler.swift`.
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차(T 포함)는 git 이력에 있다. T 회차 판정 보류 항목(TA 깜박임, T2 popup)은 체크리스트 "T 회차 확인" 절로 계속 받는다.
> 브랜치: `claude/m8-plan`의 PR #14가 머지된 뒤 새 브랜치 `claude/u-fixes`(base는 PR #14가 머지된 브랜치). 버전 1.2.0 → 1.2.1.

## X 회차 (2026-10-06, Opus) — 1.3.3: 공개 저장소 정리

> 근거: GitHub 저장소 점검(`gh` 읽기 전용: 설정·브랜치·CI·community profile) + Haiku 저장소 감사(추적 파일 읽기 전용) + Opus 확인. 감사 결과 중 사실이 아닌 것(install.md "8장" 참조는 8장이 실제로 있어 정상, 앱 배포 타깃 26.6은 이미 26.0으로 수정됨)은 제외했다.
> 브랜치: `main`에서 `claude/x-fixes`. 버전 1.3.2 → 1.3.3. 대상: Sonnet. 사용자 결정 항목(X0)이 정해진 뒤 시작한다. PR #21(README 주소)은 이 회차 전에 병합한다.

### 현재 상태 (사실)

- 기본 브랜치 `main`(=`56825df`, v1.3.2 태그), 병합 후 자동 삭제 켜짐, 설명·토픽 설정됨. 브랜치 보호 없음. 원격 브랜치 22개(모두 병합된 `claude/*` 21개 + PR #21).
- community profile: README만 있음. LICENSE·CONTRIBUTING·이슈/PR 템플릿 없음. 공개(PUBLIC) 저장소인데 라이선스가 없어 법적으로는 "모든 권리 보유"다.
- 개인정보: 추적 파일에 팀 ID·이메일·`/Users/` 절대경로 없음(감사 확인).
- CI(`ci.yml`): push·PR 전부에서 ubuntu(lint·`npm test`·pytest·DOM)와 macos(러너 converter 임시 프로젝트 무서명 빌드). 커밋된 `project.xcproj`(베타 형식)는 러너에서 빌드하지 않아 **W1·W4의 Swift·storyboard 변경은 CI에서 한 번도 컴파일되지 않는다**. `scripts/test-swift.sh`·`install.sh`도 CI에 없다.
- v1.3.2 릴리스 소스 압축본의 README·install.md에는 `<저장소 주소>`가 남아 있다(PR #21 이전 커밋).

### X0. 사용자 결정 (2026-10-06 확정)

- 라이선스: **넣지 않음**(모든 권리 보유 유지). X2의 LICENSE·README 라이선스 줄·`package.json` license 필드는 하지 않는다.
- 병합된 `claude/*` 브랜치 21개: **삭제**.
- `main` 브랜치 보호: **켬**(필수 체크 `ubuntu`·`macos`, 강제 push·삭제 금지, 관리자 우회 허용, 리뷰 필수 없음).
- 저장소 이름: **`Safari_Extention-HDR` → `Safari-Extension-HDR`로 변경**. README·install.md·릴리스 노트의 주소, `scripts/install.sh` 안내 문구(있다면), `git clone` 뒤 폴더명(`cd Safari-Extension-HDR`), 로컬 `git remote set-url`을 함께 바꾼다. 로컬 작업 폴더 이름(`~/Safari_Extention-HDR`)은 바꾸지 않는다(Claude 메모리·세션 경로가 이 경로에 묶여 있음).
- 안정판 Xcode 재생성: 보류.
- 순서: PR #21 병합 → 계획 push → (Sonnet) X5 GitHub 작업 중 **이름 변경과 브랜치 삭제를 먼저**, 보호 규칙은 X 회차 PR 병합 **후**(X4 CI 스텝이 확정된 뒤) 설정.

### X1. 문서 최신화 (Sonnet, 코드 영향 없음)

- `docs/install.md`
  - 머리말(3행) "7일 만료 후 다시 설치할 때" → "처음 설치·업데이트·재서명할 때".
  - 5장 "7일 만료와 재서명": 3번째 항목의 "개발자 메뉴의 '서명되지 않은 확장 허용'… 다시 확인"을 "앱 점검 화면 1번이 서명 확인이면 필요 없음, 아니면 3-2의 6번 참조"로 바꾼다. 기간은 [확인 필요] 유지(Apple Development 인증서 자체는 1년, 무료 팀 프로비저닝 기간은 미확인 — 문구를 "만료되어 확장이 사라지면"으로 일반화).
  - 6장 툴바 배지 항목의 "Safari 27.2에서 [확인 필요]"는 M8 이후 사용자 확인 결과가 STATUS에 있으면 반영, 없으면 유지(Sonnet이 STATUS·체크리스트 회신 기록을 확인).
- `docs/local-session.md` 11행 `pip install --user` → `.venv` 절차(STATUS에 이미 기록된 방식: `python3 -m venv .venv && .venv/bin/pip install pytest numpy`, 실행 `.venv/bin/python -m pytest sim`). `.venv`가 `.gitignore`에 있는지 확인, 없으면 추가.
- `STATUS.md` "현재 단계"(M2 시점에 멈춤)를 현재로 갱신: "1.3.2 릴리스(PR #20, `56825df`). 다음: 사용자 Mac W 회차 체크리스트 회신, X 회차". 아래 기록은 그대로 두고 완료 항목은 규칙대로 한 줄 요약.
- `PLAN.md` 16·819·856행의 `claude/amazing-hypatia-3rbspr` 언급: 기본 브랜치가 `main`으로 바뀌었다는 한 줄을 819행 근처에 추가하고 856행 "푸시는 지정 브랜치…"는 "작업 브랜치 → `main`으로 PR"로 바꾼다. 16행은 역사 기록이라 유지. PLAN.md 문구 변경은 Opus 권한이지만 이 항목은 사실 갱신이라 이 지침으로 위임한다.
- FIX_GUIDE·STATUS의 과거 절 참조(install.md 3-3 등)는 기록이므로 고치지 않는다.

### X2. 공개 저장소 기본 파일

- `LICENSE`: 넣지 않음(X0). `package.json`의 `"private": true` 유지 확인.
- `.github/ISSUE_TEMPLATE/bug_report.md`(한국어): 환경(macOS·Safari·디스플레이), 설치 방법(install.sh/Xcode), popup 상태 줄 문구, 진단 JSON 첨부 안내("복사" 버튼, URL·제목은 포함되지 않음), 재현 절차. `config.yml`로 빈 이슈 허용.
- `.gitattributes`: 새로 추가하는 `.github/ISSUE_TEMPLATE`은 이미 `.github export-ignore`에 포함됨.
- `package.json` `version` "0.0.0"은 개발 도구용이라 유지하되 `description`에 "개발 도구(확장 버전은 extension/manifest.json)" 명시(이미 그렇다면 생략).

### X3. 설치 스크립트 보완 (`scripts/install.sh`, `scripts/lib/install-lib.sh`)

- (a) **비대화형에서 휴지통 이동 금지**: 현재 `ask`는 stdin이 터미널이 아니면 기본값을 쓰므로, 파이프 실행 시 사본 정리(기본 y)가 확인 없이 실행된다. 확인이 필요한 파괴적 동작(사본 정리)은 `-y`가 없고 비대화형이면 **아니오**로 처리하고 "-y로 다시 실행하면 정리합니다"를 출력. Safari 재시작은 현재대로(기본 n).
- (b) **팀 캐시 갱신**: `.local/team-id`의 팀으로 빌드가 서명 오류로 실패하면 "저장된 팀 <ID>가 이 Mac의 인증서와 맞지 않을 수 있습니다. `rm .local/team-id` 후 다시 실행" 안내. 또한 캐시된 팀이 현재 키체인 인증서 팀 목록에 없으면(목록을 구할 수 있을 때) 경고 후 목록에서 다시 고른다.
- (c) **인증서 없는 첫 사용자**(지난 대화의 미해결 틈): 키체인에 Apple Development 인증서가 없을 때 `defaults read com.apple.dt.Xcode IDEProvisioningTeamByIdentifier`에서 `teamID`를 읽어 후보로 쓴다(읽기 전용, 팀 ID·팀 유형만 사용, 이름·Apple ID 출력 금지). 후보로 빌드하면 `-allowProvisioningUpdates`가 인증서를 만들 것으로 기대 [추정]. 실패하면 기존 안내("Xcode에서 Team 한 번 지정")로 종료. 파싱 함수는 install-lib에 두고 가짜 픽스처로 테스트. **사용자 확인 필수 항목**: 깨끗한 macOS 사용자 계정에서 Xcode에 Apple ID만 추가한 상태로 `scripts/install.sh` 실행 결과 회신.
- (d) **요구 Xcode 명시**: 1단계 프로젝트 열기 실패 문구에 감지한 `xcodebuild -version` 첫 줄을 함께 출력. README·install.md 요구 환경에 "저장소 프로젝트를 만든 Xcode: 27.2 베타. 안정판 호환 [확인 필요]" 명시.
- (e) `--help` 출력에 테스트용 환경 변수(`TEAM_ID`, `SDRHDR_SW_VERS`, `SDRHDR_SAFARI_VERSION`) 설명 포함 여부 확인(현재 주석 9행까지만 출력 — 범위 조정).

### X4. CI 보강 (`.github/workflows/ci.yml`)

- ubuntu: `bash -n scripts/install.sh scripts/lib/install-lib.sh scripts/test-swift.sh` + `shellcheck`(러너 기본 설치) 실행. 기존 경고는 고치거나 해당 줄에 사유 주석으로 비활성.
- macos: `scripts/test-swift.sh`(Swift 순수 로직) 실행. 앱 Swift 전체 컴파일은 커밋 프로젝트가 베타 형식이라 러너에서 불가 — 대신 `swiftc -typecheck`로 `AppDelegate.swift`·`ViewController.swift`를 macOS SDK에 대해 타입체크하는 단계 추가(storyboard 불포함, `@main`/`@IBOutlet` 때문에 실패하면 이 단계는 넣지 않고 STATUS에 기록).
- macos: `SDRHDR_SAFARI_VERSION=26.0 scripts/install.sh --dry-run -y --no-open`은 러너 Xcode가 프로젝트를 못 열어 1단계에서 멈출 수 있다. 멈추면 그 실패 문구가 X3(d) 형식인지만 확인하는 스텝으로 둔다(`|| true` 후 출력 grep). 서명·설치는 CI에서 하지 않는다.

### X5. GitHub 설정 (사용자 결정 반영, 본 세션이 `gh`로 실행 — 실행 전 사용자에게 목록 확인)

- 병합된 브랜치 삭제(X0에서 삭제 선택 시): `claude/*` 21개 중 `main`에 포함된 것만, 삭제 전 `git merge-base --is-ancestor`로 재확인.
- `main` 보호(선택 시): 필수 상태 체크 `ubuntu`·`macos`, 강제 push·삭제 금지, 관리자 우회 허용(1인).
- v1.3.2 릴리스 노트에 "README의 저장소 주소는 1.3.3에서 수정" 한 줄 추가, 태그는 옮기지 않는다. 1.3.3 릴리스는 X 회차 병합 후 생성.
- 저장소 이름 변경(선택 시): `gh repo rename`, 이후 README·install.md·릴리스 노트 주소와 로컬 `git remote set-url` 갱신.

### X6. 기록만 (이번에 하지 않음)

- Xcode 프로젝트 `MARKETING_VERSION` 1.0·확장 타깃 배포 타깃 12.0·표시 이름 "SDRHDR": 스크립트 설치는 명령행으로 덮어쓰므로 사용자 영향 없음. Xcode GUI로만 고칠 수 있어 안정판 재생성 회차에 함께.
- 개발 문서(PLAN·GUIDELINES·FIX_GUIDE·STATUS)를 `docs/internal/`로 옮기는 안: 훅·규칙·세션 스킬이 루트 경로를 참조하므로 하지 않는다. 압축본에서는 이미 제외됨.
- `results/`·`probe/`·`fixtures/` 공개 유지(개인정보 없음, 개발 근거 자료).

### 재현/검증

- (1) 로컬(Sonnet → sim-runner): lint, `npm test`(install-lib 새 테스트: 비대화형 정리 거부, Xcode defaults 파싱), `test:dom`, pytest, `scripts/test-swift.sh`, `bash -n`, `install.sh --dry-run`(대화형/비대화형 `</dev/null` 두 경우: 비대화형에서 mv 줄이 출력되지 않아야 함), `git archive HEAD | tar -t`에 개발 파일 제외 유지, README·install.md 주소가 새 이름.
- (2) CI: PR에서 새 스텝 모두 통과.
- (3) 사용자: X3(c) 깨끗한 계정 시험, X5 설정 결과 확인(브랜치 목록·보호 규칙 화면).

### 분할

- 사용자 X0 결정 → impl-worker 2개 병렬: X-A `scripts/*`·`tests/unit/install-lib.test.js`·`.github/workflows/ci.yml`(X3·X4), X-B 문서·`.github/ISSUE_TEMPLATE`·`package.json`·저장소 주소 갱신(X0·X1·X2). 본 세션: STATUS, 검증, PR, X5(`gh` 실행은 사용자 확인 후).

---

## W 회차 (2026-10-06, Opus) — 1.3.2: 부팅 시 숨김 실행 · 사본 정리·설치 안내 · 설치 자동화 · 지원 대상 macOS 26/Safari 26

> 브랜치 `claude/w-fixes`(base `claude/amazing-hypatia-3rbspr`, 1.3.1). 버전 1.3.1 → 1.3.2. 아래 V·U 회차 절은 기록으로 남긴다.
> 근거: 사용자 요청(2026-10-06), 서브에이전트 조사(Haiku: 코드 읽기, Sonnet: 저장소 사본에서 무서명 빌드·배포 타깃 스윕·Swift API 타입체크·서명 상태 확인. 저장소는 건드리지 않음, 사본은 scratchpad).
> 작업 트리에 `project.xcproj`의 `DEVELOPMENT_TEAM` 로컬 변경이 있다. 커밋하지 않는다(CLAUDE.md).

### 조사 결과 (사실)

- 앱(`AppDelegate.swift`)에 로그인 항목·`SMAppService`·`LSUIElement`·활성화 정책 코드가 없다. `Main.storyboard`의 초기 컨트롤러(`initialViewController="B8D-0N-5wS"`, 창 `restorable="NO"`)가 실행마다 창을 띄운다. `applicationShouldTerminateAfterLastWindowClosed` = true.
- 따라서 재부팅 후 앱이 뜨는 경로는 macOS "다시 로그인할 때 윈도우 다시 열기"(종료 시 실행 중이던 앱 재실행) 또는 사용자가 직접 등록한 로그인 항목이다 [추정, 어느 쪽인지 미확인]. 어느 경로든 창이 뜬다.
- 배포 타깃(Sonnet 확인됨): 프로젝트 기본값 `MACOSX_DEPLOYMENT_TARGET = 27.2`(project.xcproj 236행)를 **앱 타깃이 그대로 상속**, 확장 타깃만 12.0(166행). 즉 지금 빌드한 앱은 macOS 27.2 미만에서 실행되지 않는다(minos 27.2).
- 설치된 툴체인(Xcode 27.2 베타)이 받는 최저 타깃은 **12.0**. 10.14·10.15·11.0은 `error: ... the range of supported deployment target versions is 12.0 to 27.2.x.`로 실패. 12.0·13.0·14.0·15.0·26.0은 두 타깃 모두 무서명 빌드 성공, 가용성 오류 없음(기존 `#available(macOS 13)` 가드로 충분).
- 저장소의 Xcode 프로젝트는 `project.xcproj`(Xcode 27 베타 형식)뿐이고 `project.pbxproj`가 없다. 안정판 Xcode가 이 형식을 여는지 [미확인]. GitHub에서 받은 사용자의 빌드 환경을 가장 크게 제한하는 요소다.
- 기능 최저선은 Safari 쪽이 결정한다: WebGPU(`navigator.gpu`, `importExternalTexture`, `getContext('webgpu')`)는 Safari 26부터 기본 활성 [추정, 높음], `toneMapping: {mode:'extended'}` 지원 시작 버전 [미확인, 낮음], `VideoFrame` Safari 16.4+ [추정], MV3 `service_worker` background Safari 15.4~16.4+ [추정]. Safari 26은 macOS 14 Sonoma 이상에서 설치 가능 [추정]. 앱 배포 타깃을 내려도 Safari가 낮으면 HDR 변환은 동작하지 않는다.
- WebGPU가 없으면 `renderer.init()`이 `NoWebGPU`를 던지고 → `skipped(noGpu)` → popup "렌더 오류(NoWebGPU)" + "껐다 켜거나 새로고침" 안내(params.js 366행). 페이지는 깨지지 않지만 안내 문구가 원인(Safari 버전)과 맞지 않는다.
- 서명(Sonnet 확인됨): ad-hoc(`CODE_SIGN_IDENTITY="-"`) 빌드는 `TeamIdentifier=not set`, `spctl` rejected. 무료 개인 팀 서명도 Safari 재시작마다 "서명되지 않은 확장 허용"을 다시 켜야 함(install.md 3-3, 2026-10-02 사용자 확인).

### W1. 재부팅 후 최초 실행 시 창 없이 백그라운드로

**원인**: 실행 방식과 무관하게 storyboard 초기 창이 자동 표시된다. 사용자 실행과 시스템(로그인) 실행을 구분하는 코드가 없다.

**수정 방향**

- (a) **실행 종류 판정**(`AppDelegate.applicationWillFinishLaunching`): 아래 중 하나면 "시스템 실행"으로 본다.
  1. 현재 Apple Event가 `kAEOpenApplication`이고 `keyAEPropData` 값이 `keyAELaunchedAsLogInItem` (로그인 항목 실행).
  2. `applicationDidFinishLaunching` 알림 `userInfo[NSApplication.launchIsDefaultUserInfoKey] == false`(저장 상태 복원 재실행 포함)이고 디버거 미연결(`sysctl` `P_TRACED` 검사). Xcode Run은 디버거가 붙으므로 창이 뜬다(install.md 3-2 "Run하면 창이 뜬다" 유지).
  - 판정 결과는 `os_log`(subsystem = 앱 번들 ID, category `launch`)로 한 줄 남긴다: 각 신호값과 최종 판정. 사용자가 `log show`로 확인할 수 있게 한다. 다른 정보(경로·사용자명)는 남기지 않는다.
  - 시점: 신호 1은 `willFinishLaunching`에서 읽을 수 있고, 신호 2(`launchIsDefault`)는 `didFinishLaunching` 알림에서만 온다. 따라서 신호 1이 참이면 `willFinishLaunching`에서 바로 숨김 처리, 신호 2로만 판정되면 `didFinishLaunching`에서 숨김 처리(Dock 아이콘이 잠깐 보일 수 있음 [추정], 허용). 창은 어느 경우든 `didFinishLaunching` 판정 뒤에만 만든다.
- (b) **시스템 실행이면**: `NSApp.setActivationPolicy(.accessory)`(Dock 아이콘·메뉴 막대·포커스 빼앗기 없음), 창을 만들지 않는다. 프로세스는 백그라운드에 남는다(사용자 요청). CPU·타이머·네트워크 작업은 하지 않는다.
- (c) **창 생성 방식 변경**: storyboard에서 `initialViewController`를 제거하고 창 컨트롤러(`B8D-0N-5wS`)에 `storyboardIdentifier="MainWindow"`를 준다. 메뉴(앱 메뉴)는 storyboard 그대로 둔다(Info.plist `NSMainStoryboardFile` 유지). 사용자 실행이면 `didFinishLaunching`에서 `instantiateController(withIdentifier: "MainWindow")`로 띄우고 `NSApp.activate`. storyboard는 XML 수정이며 pbxproj 수기 편집 금지(GUIDELINES 7-5)와 무관하다. Xcode Interface Builder로 해도 된다.
- (d) **나중에 사용자가 앱을 열 때**(Finder·Launchpad·Dock): `applicationShouldHandleReopen`에서 창이 없으면 활성화 정책을 `.regular`로 바꾸고 (c)와 같은 방식으로 창을 띄운 뒤 활성화. 창이 이미 있으면 앞으로 가져온다. 창 컨트롤러는 1개만 유지(중복 생성 금지).
- (e) `applicationShouldTerminateAfterLastWindowClosed`는 true 유지. 시스템 실행에서는 창이 열린 적이 없어 종료되지 않고, 사용자가 연 창을 닫으면 지금처럼 종료된다.
- (f) **로그인 항목 등록·해제 기능은 이번에 추가하지 않는다**(요구는 "켜질 때 숨김"이지 "자동 실행 추가"가 아님). `NSApp.disableRelaunchOnLogin()`도 부르지 않는다(재실행 자체를 막으면 요구와 반대).
- (g) 시스템 실행 판정이 틀렸을 때의 안전장치: 판정이 애매하면(Apple Event 없음 + launchIsDefault 키 없음) **창을 띄운다**(사용자 실행으로 본다).

**영향 범위**: `xcode/SDRHDR/SDRHDR/AppDelegate.swift`, `Base.lproj/Main.storyboard`(초기 컨트롤러 속성·식별자 2곳). `ViewController.swift`·확장(`extension/`)·project.xcproj 불변. `ViewController`의 "설정 열기 후 앱 종료" 동작 불변.

**검증**

- (1) 로컬(Sonnet): `xcodebuild` 무서명 빌드 통과(배포 타깃 26.0 적용 후). `open -a`로 실행 시 창 표시, `log show --predicate 'subsystem == "io.github.tmtmtmtmtmt.SDRHDR"' --last 1m`에 판정 줄 확인. 디버거 판정 함수와 판정 규칙(신호 3개 → 결과)을 순수 함수로 분리해 Swift 단위 테스트가 없으면 최소한 `swiftc -typecheck`로 확인. 로그인 실행·재부팅은 Claude가 검증하지 않는다.
- (2) 사용자 Mac(체크리스트 "W 회차 확인" 절 신설):
  1. 앱 창이 열린 채로 재부팅 → 로그인 후 SDR HDR 창이 뜨지 않고 Dock에도 없는지, 활동 모니터에 SDRHDR 프로세스가 있는지.
  2. 그 상태에서 Finder/Launchpad로 SDR HDR 실행 → 창이 1개 뜨고 앞으로 오는지. 창 닫으면 앱 종료되는지.
  3. 평소처럼 Finder에서 실행 → 창이 뜨는지. Xcode Run → 창이 뜨는지.
  4. 1번 직후 `log show --predicate 'subsystem == "io.github.tmtmtmtmtmt.SDRHDR"' --last 10m` 출력 회신(판정 신호값). 시스템 설정 › 일반 › 로그인 항목에 SDR HDR가 있는지도 함께 회신.
  - 1번에서 창이 뜨면 판정 신호가 이 경로에서 오지 않는 것이다. 로그를 받아 Opus가 규칙을 다시 정한다(Sonnet 임의 변경 금지).

### W2. 미서명 확장 허용 유지 — W4로 이관 (2026-10-06)

- 자동 우회는 하지 않는다. 대신 "팀 서명 + 사본 1개" 상태를 만들도록 앱이 점검·안내한다(W4). 아래 조사가 근거.
- 원칙은 유지: Safari 보안 설정(개발자 메뉴·`defaults write`·UI 스크립팅) 자동 조작 코드는 넣지 않는다.

**W2 조사 (2026-10-06, Haiku 읽기 전용 점검, 기록용)**

- 환경: macOS 27.2, Safari 27.2. 등록된 확장 사본 3개(pluginkit): `/Applications/SDRHDR.app`(ad-hoc, 팀 없음, spctl 거부, 예전 설치본), Xcode DerivedData Debug 빌드(**Apple Development 인증서, 팀 <개인 팀 ID>로 정상 서명**), Sonnet 실험용 scratchpad ad-hoc 빌드(실험 후 삭제함).
- Safari가 실제로 리소스를 읽는 사본은 DerivedData의 **서명된 Debug 빌드**였다(lsof). Safari 확장 DB의 등록도 팀 <개인 팀 ID> 기준.
- 해석 [추정]: Safari 27.2는 개인 팀(무료) Apple Development 인증서로 **두 타깃 모두** 서명된 확장을 "서명된 개발 확장"으로 보고 미서명 허용 없이 로드한다. 2026-10-02 "재시작마다 다시 켜야 함" 관측은 두 타깃 중 하나만 팀이 지정됐던 시기(install.md 3-3-1 "두 타깃 모두" 확인 전)였을 가능성. 여러 사본이 있을 때 Safari가 어느 사본을 고르는지 규칙은 [미확인].
- (W4에서 반영) install.md 3-3을 "두 타깃에 팀을 지정하면 미서명 허용이 필요 없을 수 있음 [확인 필요], 확장이 안 보일 때만 켠다"로 바꾸는 것, 사용자 확인 절차(옵션 끔 + `/Applications` 예전 사본 제거 후 Safari 재시작해도 확장이 켜지는지). 무료 팀 인증서 유효기간(Apple Development 1년)과 7일 만료 문구의 관계도 [미확인].

### W4. 중복 사본 정리 + 최초 실행 안내(스플래시) (2026-10-06 사용자 요청)

**요구**: 사본이 여러 개면 최신 것만 쓰고 이전 것은 지운다. 최초 실행 시 스플래시로 "미서명 허용을 매번 켜지 않아도 되는 상태"(팀 서명 + 사본 1개 + 확장 켜짐)로 유도한다.

**사실(Sonnet 샌드박스 프로브, 확인됨)** — 실제 앱과 같은 App Sandbox + user-selected read-only, macOS 27.2:

| 항목                                                           | /Applications 사본 | 홈 아래 사본(DerivedData) |
| -------------------------------------------------------------- | ------------------ | ------------------------- |
| 목록: `NSWorkspace.urlsForApplications(withBundleIdentifier:)` | 나옴               | 나옴                      |
| Info.plist·appex `manifest.json` 버전                          | 읽힘               | **읽기 거부**(Code=257)   |
| `Contents/MacOS/SDRHDR` mtime(`attributesOfItem`)              | 읽힘               | 읽힘                      |
| 서명 팀(`SecStaticCode`)                                       | 읽힘               | 실패(-67028)              |
| 쓰기·삭제                                                      | 불가               | 불가                      |

- Spotlight(`NSMetadataQuery`)는 홈 사본을 숨기고, `resourceValues` 수정일은 두 사본 모두 같은 옛 값이라 **쓰지 않는다**.
- Safari가 여러 사본 중 무엇을 고르는지 정할 API는 없다. "최신을 불러오게" 하는 유일한 방법은 **이전 사본을 없애 1개만 남기는 것**이다.

**수정 방향 (앱: `AppDelegate.swift`, `ViewController.swift`, 새 `SetupCheck.swift`, `Resources/Base.lproj/Main.html`·`Script.js`·`Style.css`)**

- (a) **점검 모델 `SetupCheck`**(순수 판정 함수 + 수집 함수 분리):
  1. 자기 서명: `SecCodeCopySelf` + 서명 정보, 그리고 자기 번들 안 appex(`builtInPlugInsURL`)의 `SecStaticCode`. 둘 다 팀 ID가 있고 ad-hoc 아님 → `signed`. 하나라도 ad-hoc/팀 없음 → `unsigned`.
  2. 사본 목록: `urlsForApplications`에서 자기 경로(`Bundle.main.bundleURL`, 표준화 후 비교) 제외. 존재하지 않는 경로(유령 등록)는 제외.
  3. 사본별 정보: 확장 버전(appex `manifest.json` `version`, 못 읽으면 null), 빌드 시각(`Contents/MacOS/SDRHDR` mtime), 서명(읽히면 signed/adhoc, 아니면 unknown).
  4. 최신 판정: 두 사본 모두 버전이 있으면 버전(점 구분 숫자 비교) → 같으면 mtime. 하나라도 버전 null이면 mtime만. mtime도 없으면 판정 불가(삭제 제안 안 함). 자기 자신 포함 전체에서 최신 1개 선택.
  5. 확장 켜짐: 기존 `SFSafariExtensionManager.getStateOfSafariExtension`.
  6. youtube.com 접근 허용: 앱에서 알 수 없음 → 수동 단계로 표시.
- (b) **이전 사본 정리**(삭제는 휴지통 이동만, 영구 삭제 금지, 항상 사용자 확인):
  - 자기가 최신이면: 이전 사본마다 경로·버전·빌드 시각을 보여 주고 "휴지통으로 이동" 버튼. 누르면 `NSOpenPanel`(디렉터리 = 그 사본의 상위 폴더, 메시지 "휴지통으로 옮길 이전 SDR HDR 사본을 선택하세요", 앱 번들 선택 허용, 다중 선택 금지)로 사용자가 직접 선택·확인 → 선택 경로가 제안한 사본과 같을 때만 `FileManager.trashItem`. 다르면 아무것도 하지 않고 안내.
  - 이를 위해 앱 타깃 App Sandbox의 User Selected File을 **Read/Write**로 바꿔야 한다(현재 `ENABLE_USER_SELECTED_FILES = readonly`). project.xcproj 수기 편집 금지 → **사용자가 Xcode Signing & Capabilities에서 변경**(W3(a) 배포 타깃 변경과 같은 커밋). 확장 타깃은 바꾸지 않는다.
  - `trashItem` 실패 또는 권한 미변경 시 대체: "Finder에서 보기"(`NSWorkspace.activateFileViewerSelecting`) + "Finder에서 휴지통으로 옮기세요" 안내. 이 버튼은 항상 같이 제공한다.
  - 자기가 최신이 아니면: 삭제를 제안하지 않고 "최신 사본 열기"(`NSWorkspace.openApplication(at:)`) → 연 뒤 자기 종료. 최신 사본이 다시 점검해 이 사본 정리를 제안한다.
  - 판정 불가 사본은 "알 수 없는 사본"으로 목록만 보이고 Finder 보기만 제공.
  - 정리 후 "Safari를 완전히 종료(⌘Q) 후 다시 열기" 안내. 등록 해제(`pluginkit -r`, `lsregister -u`)는 하지 않는다(샌드박스 불가 + 시스템 등록 조작).
- (c) **스플래시(안내 화면)**: 기존 앱 창의 `Main.html`을 한국어 안내 화면으로 바꾼다(별도 창 아님). 순서와 상태(완료 ✓ / 조치 필요 / 수동 확인):
  1. 서명: `signed`면 ✓ "개인 팀 서명 확인 — 개발자 메뉴의 '서명되지 않은 확장 허용'은 꺼 두어도 됩니다(macOS 27.2 · Safari 27.2에서 확인)". `unsigned`면 "Xcode에서 SDRHDR와 SDRHDR Extension **두 타깃 모두** Team을 지정하고 다시 Run하세요. 그전까지는 Safari 재시작마다 '서명되지 않은 확장 허용'이 필요합니다."
  2. 사본: 1개면 ✓, 여러 개면 (b) UI.
  3. 확장 켜짐: 켜짐 ✓ / 꺼짐 → "Safari 확장 설정 열기"(기존 `showPreferencesForExtension`). **설정을 연 뒤 앱을 종료하지 않는다**(현행 terminate 제거). 앱이 다시 활성화되면(`didBecomeActiveNotification`) 전체 재점검·화면 갱신.
  4. www.youtube.com 접근 허용(수동): install.md 3-5 요약 한 줄 + "확인했어요" 체크.
  5. 완료 버튼: "시작하기"(창 닫기 → 앱 종료, 현행 규칙).
- (d) **언제 보이나**: 사용자 실행(W1 판정)에서만. ① 처음 실행(UserDefaults `setupDoneVersion` 없음) ② 확장 버전이 바뀜(`setupDoneVersion` ≠ 현재 manifest 버전) ③ 자동 점검 1~3 중 하나라도 조치 필요. 그 외 사용자 실행에서는 같은 화면을 ✓ 요약 상태로 보인다(별도 화면 없음). 완료 버튼을 누르고 1~3이 모두 ✓일 때만 `setupDoneVersion` 기록. 시스템 실행(W1)에서는 점검도 화면도 하지 않는다.
- (e) **브리지**: Swift → JS 상태 객체 하나(`render(state)`: signed, copies[{id, path, version, builtAt, signing, newest}], selfIsNewest, extEnabled, firstRun). JS → Swift 메시지 문자열 종류 고정: `open-preferences`, `reveal:<id>`, `trash:<id>`, `open-newest`, `recheck`, `done`. id는 Swift가 만든 인덱스, JS가 경로를 보내지 않는다. 경로는 화면 표시만, `os_log`에는 경로를 남기지 않는다(개수·판정만).
- (f) 문구·톤은 popup과 맞춘 한국어. 영문 converter 기본 문구 제거. CSP(`default-src 'self'`) 유지, 외부 리소스 금지.

**영향 범위**: 앱 타깃 Swift 3파일 + Resources 3파일, 앱 타깃 sandbox 설정 1곳(사용자 Xcode). 확장(`extension/`)·appex Swift·진단 스키마 불변. install.md 3장(설치 순서를 "Run → 안내 화면 따르기"로 단순화, 3-3 미서명 허용은 "안내 화면 1번이 조치 필요일 때만"), 5장 문구.

**재현/검증**

- (1) 로컬(Sonnet): 판정 순수 함수(버전 비교, 버전 null 시 mtime, 판정 불가, 자기 최신/아님)는 Swift 파일 단독 `swiftc` 테스트 실행 파일 또는 XCTest 없이 `swiftc -typecheck` + 작은 실행 드라이버로 표 기반 확인(sim-runner). 무서명 빌드 통과. `Main.html`/`Script.js`는 Playwright WebKit DOM 테스트로 상태 객체별 렌더(서명 미확인, 사본 2개·자기 최신/아님, 확장 꺼짐, 전부 ✓)와 메시지 문자열 확인(`webkit.messageHandlers` 목업).
- (2) Claude는 실제 휴지통 이동·Safari 로드를 검증하지 않는다. 사용자 Mac 체크리스트 "W 회차 확인"에 추가:
  1. 지금 상태(사본 2개: `/Applications` ad-hoc 1.0.1, DerivedData 1.3.x)에서 Xcode Run → 안내 화면에 사본 2개, 최신 = DerivedData, `/Applications` 사본 "휴지통으로 이동" 제안.
  2. 휴지통 이동 → 패널에서 선택 확인 → 휴지통에 들어갔는지. (실패 시 Finder 보기 경로가 동작하는지)
  3. Safari ⌘Q 후 재실행, 개발자 메뉴 "서명되지 않은 확장 허용" **끈 채로** 확장이 켜져 있고 YouTube에서 popup 버전이 1.3.2인지.
  4. 앱 재실행 → 모든 항목 ✓, 처음 실행 때와 달리 바로 요약.
  5. Safari 확장 설정 열기 버튼 → 앱이 종료되지 않고, 확장을 끄고 돌아오면 3번 항목이 "조치 필요"로 갱신.

### W3. 지원 대상: Safari 26 / macOS 26 (2026-10-06 사용자 확정)

**원인**: 앱 타깃이 프로젝트 기본값 27.2를 상속(converter가 생성 시 현재 SDK로 설정 [추정]). 확장 타깃만 12.0. 두 타깃이 서로 다르고 둘 다 목표와 맞지 않는다.

**수정 방향**

- (a) **배포 타깃 = macOS 26.0**으로 프로젝트 기본값·SDRHDR·SDRHDR Extension 3곳을 통일한다(Sonnet 실험에서 26.0 두 타깃 무서명 빌드 성공, 확인됨).
  - 방법: project.xcproj 수기 편집 금지(GUIDELINES 7-5). **사용자가 Xcode에서** 프로젝트 › Build Settings › macOS Deployment Target을 3곳 모두 26.0으로 바꾸고 저장 → Sonnet이 diff에 배포 타깃 3곳만 바뀌었는지(`DEVELOPMENT_TEAM` 없음) 확인 후 커밋. `xcodebuild ... MACOSX_DEPLOYMENT_TARGET=26.0` 명령행 지정은 검증용으로만 쓴다.
  - 기존 `#available(macOS 13, *)` 분기(ViewController)는 항상 참이 되지만 이번에 정리하지 않는다(범위 최소화).
  - W1은 macOS 26 API 범위에서 자유롭지만 `SMAppService`는 범위 밖이라 쓰지 않는다.
- (b) **지원 표기**: install.md 2장 요구 환경 표를 "macOS 26 이상, Safari 26 이상(실측은 macOS 27.2 / Safari 27.2), EDR 디스플레이"로 바꾼다. Safari 26.x에서의 동작(WebGPU `importExternalTexture`·`VideoFrame` 입력 경로, `toneMapping: extended`)은 [미확인]으로 표시한다.
- (c) **WebGPU 미지원 안내**(낮은 우선순위, 작게): `params.js` 상태 문구에서 `noGpu`이고 `errorName === 'NoWebGPU'`이면 "이 Safari는 WebGPU를 지원하지 않음: 원본 표시", 안내 "Safari 26 이상 필요", 배지 회색 "–". 그 밖의 `noGpu`는 기존 "렌더 오류(…)" 유지. 진단 스키마 불변(schemaVersion 13).
- (d) **빌드 환경**: `xcode/`가 Xcode 27 베타 형식(`project.xcproj`)이라 GitHub 사용자는 같은 형식을 여는 Xcode가 필요하다 [추정]. 안정판 Xcode 재생성은 사용자 지시가 있을 때만(CLAUDE.md). install.md 2장 Xcode 줄은 현행 유지.
- (e) manifest에 `strict_min_version` 류 키는 추가하지 않는다(Safari 지원 [미확인], 로드 실패 위험).

**영향 범위**: project.xcproj 배포 타깃 3곳(사용자 Xcode 조작), `params.js` noGpu 분기 문구, 상태 문구 단위 테스트, install.md 2장, manual-checklist. 렌더·곡선·수명주기·진단 스키마 불변.

**검증**

- (1) 로컬(Sonnet → sim-runner): 배포 타깃 변경 후 무서명 Release 빌드, `vtool -show-build`로 앱·appex minos 26.0 확인. `npm run lint`, `npm test`(NoWebGPU 문구·회색 배지, 기타 noGpu 기존 문구), `npm run test:dom`, `python3 -m pytest sim`(불변).
- (2) 사용자 Mac: macOS 27.2에서 회귀 없음(HDR 변환·popup 상태 줄). Safari 26.x 실기는 장비가 있을 때만.

### W5. GitHub에서 받은 사용자의 설치 자동화 (2026-10-06 사용자 요청)

> 작성: Opus. 대상: Sonnet. W1·W3·W4 구현(미커밋, STATUS "W 회차")과 같은 브랜치 `claude/w-fixes`에서 이어서 한다.

**요구**: 다른 사용자가 저장소를 받은 뒤 자동화할 수 있는 부분은 모두 자동화한다.

**자동화 경계 (원칙)**

| 단계                                                             | 처리                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 환경 점검(macOS·Safari·Xcode 버전, xcode-select, 최초 실행 구성) | 스크립트 자동                                                                           |
| 서명 팀 찾기                                                     | 스크립트 자동(키체인의 Apple Development 인증서에서 팀 ID 추출). 인증서가 없으면 안내만 |
| Apple ID를 Xcode에 로그인                                        | **수동**(자격 증명 입력은 자동화하지 않는다)                                            |
| 빌드·서명·설치·이전 사본 정리·앱 실행                            | 스크립트 자동(정리는 확인 1회 후 휴지통 이동)                                           |
| Safari 재시작                                                    | 스크립트가 묻고(y/N) 실행                                                               |
| Safari 확장 켜기·웹사이트 접근 허용·미서명 허용                  | **수동**(Safari 보안 설정, 자동 조작 금지 — W2 원칙). 앱 점검 화면(W4)이 안내           |
| 업데이트                                                         | 같은 스크립트 재실행(`git pull` 포함 옵션)                                              |

**수정 방향**

- (a) **`scripts/install.sh` 신설**(저장소 루트에서 실행, bash, `set -euo pipefail`). 한 번 실행으로 아래를 순서대로 한다. 각 단계는 한 줄로 진행 상황을 출력하고, 실패하면 원인과 사용자가 할 일을 한국어로 출력하고 종료(rc≠0).
  1. **환경 점검**: `sw_vers -productVersion` ≥ 26.0, Safari(`/Applications/Safari.app` Info.plist `CFBundleShortVersionString`) ≥ 26.0, `xcode-select -p`가 Xcode 앱을 가리킴(CLT면 `sudo xcode-select -s …` 안내, 스크립트가 sudo 실행하지 않음), `xcodebuild -checkFirstLaunchStatus` 실패 시 `sudo xcodebuild -runFirstLaunch` 안내, `xcodebuild -list -project xcode/SDRHDR/SDRHDR.xcodeproj` 성공(실패 = 이 Xcode가 프로젝트 형식을 못 엶 → "Xcode 27 베타 이상 필요 [추정]" 안내).
  2. **팀 ID**: 우선순위 ① 환경 변수 `TEAM_ID` ② 저장된 값 `.local/team-id`(gitignore) ③ `security find-identity -v -p codesigning`에서 "Apple Development" 인증서를 찾아 `security find-certificate -c <SHA1> -p | openssl x509 -noout -subject`의 `OU=`(팀 ID) 추출. 팀이 1개면 자동 선택, 여러 개면 번호 선택(팀 ID만 표시, 인증서 이름·이메일은 출력하지 않음), 0개면 "Xcode › 설정 › 계정에서 Apple ID를 추가하고 Xcode에서 한 번 아무 프로젝트나 서명(또는 `open xcode/SDRHDR/SDRHDR.xcodeproj` 후 두 타깃 Team 지정)한 뒤 다시 실행" 안내 후 종료. 선택한 팀 ID를 `.local/team-id`에 저장.
  3. **빌드**: 임시 derivedData(`mktemp -d`)로 `xcodebuild -project xcode/SDRHDR/SDRHDR.xcodeproj -scheme SDRHDR -configuration Release -derivedDataPath <tmp> -allowProvisioningUpdates DEVELOPMENT_TEAM=<팀> CODE_SIGN_STYLE=Automatic MACOSX_DEPLOYMENT_TARGET=26.0 MARKETING_VERSION=<manifest version> CURRENT_PROJECT_VERSION=<git rev-list --count HEAD> build`. 로그는 `.local/build.log`에 저장, 화면에는 마지막 오류 줄만. **project.xcproj는 절대 수정하지 않는다**(명령행 설정으로만 전달 → `DEVELOPMENT_TEAM` 커밋 사고 원천 차단). 빌드 후 `codesign -dv`로 앱·appex 모두 팀 ID = 선택 팀, ad-hoc 아님을 확인(아니면 실패).
  4. **이전 사본 정리**: 설치 전에 같은 번들 ID 사본을 찾는다 — `mdfind "kMDItemCFBundleIdentifier == 'io.github.tmtmtmtmtmt.SDRHDR'"` + `/Applications/SDRHDR.app`·`~/Applications/SDRHDR.app` 존재 확인 + `~/Library/Developer/Xcode/DerivedData/SDRHDR-*/Build/Products/*/SDRHDR.app`. 임시 빌드 경로는 제외. 목록(경로·확장 버전·빌드 시각)을 보이고 "모두 휴지통으로 옮길까요? (Y/n)" 1회 확인 → 각 사본을 `lsregister -u <경로>`(등록 해제, 실패 무시) 후 `~/.Trash/SDRHDR-<타임스탬프>-<n>.app`로 `mv`. 영구 삭제(`rm`) 금지. `-y` 옵션이면 확인 생략. 거절하면 정리 없이 계속(앱 점검 화면이 다시 안내).
     - 앱이 실행 중이면 먼저 `osascript -e 'quit app id "io.github.tmtmtmtmtmt.SDRHDR"'`로 종료(실패 시 안내 후 중단).
  5. **설치**: 빌드 결과 `SDRHDR.app`을 `/Applications`에 `ditto`로 복사(쓰기 불가면 `~/Applications`). 이후 임시 derivedData 삭제(스크립트가 만든 임시 폴더만, `trap`). 결과적으로 사본은 설치본 1개.
  6. **등록·실행**: `lsregister -f <설치 경로>`(실패 무시) → `open <설치 경로>` → 앱 점검 화면(W4)이 뜬다. `pluginkit -m -i io.github.tmtmtmtmtmt.SDRHDR.Extension` 출력에 설치 경로 1개만 있는지 확인해 다르면 경고만.
  7. **Safari 재시작**: Safari가 실행 중이면 "새 버전을 불러오려면 Safari를 재시작해야 합니다. 지금 할까요? (y/N)" → 예면 `osascript -e 'quit app "Safari"'` 후 `open -a Safari`. 기본 아니오(탭 손실 우려).
  8. **마지막 안내**(남은 수동 단계만, 3줄 이내): Safari 설정 › 확장 프로그램에서 SDR HDR 켜기 / 웹사이트 접근에서 www.youtube.com 허용 / 자세한 점검은 열린 SDR HDR 창을 따르기.
- (b) **옵션**: `--update`(시작 전에 `git pull --ff-only`, 실패 시 중단), `-y`(확인 생략, Safari 재시작은 여전히 하지 않음), `--no-open`(6·7 생략), `--dry-run`(명령을 출력만, 파일 이동·빌드·실행 없음), `--help`.
- (c) **순수 함수 분리와 테스트**: 버전 비교, `openssl` subject에서 OU 추출, `security find-identity` 출력 파싱은 `scripts/lib/install-lib.sh`의 함수로 분리하고 `tests/unit/install-lib.test.js`(node `child_process`로 `bash -c 'source …; fn …'` 호출, 고정 픽스처 문자열)로 확인. 픽스처에 실제 인증서 이름·이메일을 넣지 않는다(가짜 값).
- (d) **`.gitignore`**에 `.local/` 추가.
- (e) **README.md 신설**(저장소 첫 화면, 짧게): 무엇인지 2줄, 요구 환경(macOS 26+, Safari 26+, Xcode, 무료 Apple ID), 빠른 설치 3줄(`git clone` → `cd` → `scripts/install.sh`), 업데이트 1줄(`scripts/install.sh --update`), 남은 수동 단계 3줄, 상세는 `docs/install.md`. W2 절의 "README 만들지 않음"은 이 항목으로 대체한다.
- (f) **docs/install.md**: 3장을 "자동 설치(권장): `scripts/install.sh`" + "수동 설치(Xcode Run)" 두 절로 나누고, 4장 업데이트를 `scripts/install.sh --update`로 바꾼다. Xcode Run 경로는 DerivedData 사본이 생겨 점검 화면이 정리를 제안한다는 점을 한 줄로 쓴다.
- (g) **스크립트가 하지 않는 것**: Apple ID 로그인·비밀번호 처리, `sudo`, Safari 설정·`defaults write`·UI 스크립팅, 개발자 메뉴 조작, 로그인 항목 등록, project.xcproj 수정, `rm`으로 앱 삭제, 네트워크 다운로드(`git pull` 제외).

**영향 범위**: `scripts/install.sh`, `scripts/lib/install-lib.sh`, `tests/unit/install-lib.test.js`, `.gitignore`, `README.md`, `docs/install.md` 3·4장, manual-checklist "W 회차 확인"에 W5 항목. 앱·확장 코드 불변.

**재현/검증**

- (1) 로컬(Sonnet → sim-runner): `npm test`(install-lib 파싱·버전 비교), `bash -n`·`shellcheck`(설치돼 있으면) 통과, `scripts/install.sh --dry-run` 출력이 단계 1~8 순서·명령과 맞는지, 환경 점검 실패 분기(가짜 `TEAM_ID`·잘못된 Xcode 경로는 `--dry-run`에서 환경 변수로 주입)의 안내 문구. **실제 설치·사본 이동·Safari 재시작은 Claude가 실행하지 않는다**(사용자 Mac 상태 변경).
- (2) 사용자 Mac(체크리스트에 추가):
  1. 깨끗한 클론(다른 폴더에 `git clone`)에서 `scripts/install.sh` → 팀 자동 선택, 빌드 성공, 기존 `/Applications`·DerivedData 사본 휴지통 이동 제안·수행, `/Applications/SDRHDR.app` 1개만 남고 점검 화면이 사본 1개 ✓로 뜨는가.
  2. Safari 재시작 질문에 예 → 재시작 후 미서명 허용 없이 확장이 켜져 있고 popup `v1.3.2`인가.
  3. `scripts/install.sh --update` 재실행이 같은 결과로 끝나는가(팀 질문 없음).
  4. `git status`에 `xcode/` 변경이 생기지 않는가.

### 버전·분할·문서

- `extension/manifest.json` 1.3.2, popup 헤더 버전 동기화. Xcode `MARKETING_VERSION`(현재 1.0)은 이번에 건드리지 않는다(사용자 Xcode 조작 범위를 배포 타깃으로 한정).
- 순서: ① 사용자에게 Xcode 변경 2건 요청 — W3(a) 배포 타깃 26.0(3곳), W4(b) 앱 타깃 User Selected File Read/Write (이 단계 전 project.xcproj 커밋 금지, `DEVELOPMENT_TEAM` 제외 확인) ② 본 세션: W1+W4 앱 쪽은 같은 파일(`AppDelegate.swift`)을 건드리므로 **한 작업 단위**로 직접 또는 impl-worker 1개(W-A: `AppDelegate.swift`·`ViewController.swift`·`SetupCheck.swift`·`Main.storyboard`·`Resources/*`), 병렬로 impl-worker W-B: `params.js`+상태 문구 테스트(W3(c)) ③ 본 세션: manifest 버전, install.md(W3 요구 환경·W4 설치 순서), manual-checklist "W 회차 확인"(W1·W3·W4), GUIDELINES에 "앱 실행 종류 판정" 한 단락(Opus가 문구 확정 전이면 STATUS에 이슈로 기록), STATUS, 전체 검증 → PR.
- W5는 W1·W3·W4 구현 뒤 본 세션 단독(파일이 겹치지 않으면 impl-worker 1개: `scripts/*`+테스트, 본 세션: README·install.md·checklist·STATUS).
- 사용자 결정 대기: W3(d) 안정판 Xcode 재생성 여부(지시 없으면 현행). 배포 타깃은 Xcode에서 26.6으로 저장됨(STATUS 이슈 ③) — 3곳 26.0으로 재설정 요청. W5 스크립트는 명령행으로 26.0을 넘기므로 스크립트 설치본은 이 값과 무관.

### 이번 범위 밖 (변경 금지)

- 로그인 항목 등록 UI, `SMAppService`, 메뉴 막대 아이콘(상주 UI).
- 사본의 영구 삭제, LaunchServices·pluginkit 등록 조작, 샌드박스 해제·임시 예외 entitlement.
- Safari 설정·개발자 메뉴 자동 조작, 서명 우회.
- 렌더 경로·곡선·DRM 감지·진단 스키마.

---

## V 회차 (2026-10-04, Opus) — `storage.local.set` Disk I/O 오류

> 브랜치 `claude/v-fixes`(base `claude/amazing-hypatia-3rbspr`, 1.3.0). 버전 1.3.0 → 1.3.1. 아래 U 회차 절은 기록으로 남긴다.

### 사용자 회신 (2026-10-04, U 회차 체크리스트)

- 메모리 (a) 확장 끔 15분: Safari 페이지 1.4~1.8 GB 오르내림, `kernel_task` 거의 없음. 진단 JSON `results/result-U-20261004-a.json`(schemaVersion 13, extVersion 1.3.0, 4K 3840×1772 60fps, 끔 직전까지 itm 경로 vf, `devicesCreated` 3, `gpuBusySkipped` 0, 갱신 누락 4.0%, 드롭 0, errors 없음).
- 메모리 (b) `baseline` 진행 중 **"Error: Invalid call to browser.storage.local.set(). Disk I/O error."** 발생. Safari 페이지 1.3 GB대, `kernel_task` 문제없음.
- 오류 표시 위치(사용자 회신): **Safari 설정 › 확장 프로그램 › SDR HDR 창 맨 아래**. 이 자리는 확장의 background 쪽 오류가 보이는 곳으로 본다 [추정]. background가 `storage.local.set`을 부르는 곳은 U1 **복원** 하나뿐이고, 복원은 "저장소가 비어 있을 때"만 실행된다. 즉 Safari 시작 시 저장소가 이미 비어 있었고(U1 현상 재발), 백업에서 되살리려 쓰다가 저장소 자체가 쓰기를 거부한 것으로 해석한다. 진단 쓰기(popup·content)가 같은 저장소를 손상시킨 원인인지는 미확인.
- (c) 정상(itm)은 이 오류 수정 후 측정 예정. 설정 유지(U1) 회신은 아직 없음.
- 판단: 이전 보고(13 GB)는 이번 (a)(b)에서 재현되지 않았다. U2 판정은 (c) 결과 후 한다.

### V1. 저장소 쓰기 오류(Disk I/O)

**원인 분석**

- 오류는 Safari의 확장 저장소(내부 데이터베이스) 쓰기 실패다. 확장 코드가 막을 수 있는 종류가 아니지만, **쓰기 빈도**는 줄일 수 있다.
- 현재 쓰기 경로: popup 진단 영역이 열려 있는 동안 `requestDiag`가 **2초마다** `sdrhdr.diagRequest`를 쓰고, content는 요청마다 바뀐 진단 JSON(수 KB)을 `sdrhdr.diag`에 쓴다(재생 중에는 매번 바뀜). 측정 절차가 진단 영역을 열어 둔 채 15분을 보내게 하므로 **약 1초에 1회, 15분에 약 900회** 쓰기가 생긴다. 탭이 다시 보일 때도 1회 쓴다. 설정·백업 쓰기는 사용자 조작 때만이라 무시할 수준이다.
- Xcode Run으로 앱을 다시 설치하면 Safari가 열어 둔 저장소 파일이 바뀔 수 있고, 그 상태에서 잦은 쓰기가 I/O 오류로 이어졌을 가능성이 있다 [추정]. 이 경우 U1(설정 초기화)과 같은 뿌리일 수 있다.
- M8에서 popup ↔ 현재 탭 메시징(`getState`)이 생겼으므로, 진단을 저장소를 거쳐 주고받을 이유가 없어졌다.

**수정 방향**

- (a) **진단 전달을 메시징으로 바꾼다**: `params.MSG.getDiag = 'sdrhdr:getDiag'` 추가. popup 진단 영역이 열려 있는 동안 2초마다 `tabs.sendMessage(현재 탭, {type: getDiag})` → content가 `buildDiag(collectState())`를 **응답으로 반환**(저장하지 않음). 응답이 없으면(대상 탭 아님) 진단 상자에 기존 "아직 상태 정보가 없습니다…" 문구. 이로써 `sdrhdr.diagRequest`·`sdrhdr.diag` 쓰기를 **없앤다**(`requestDiag`·`subscribeDiagRequest`·`writeDiag`·`writeDiagIfChanged`의 저장 부분 삭제, visibilitychange 때 쓰기도 삭제). GUIDELINES 2.6-2("최신 1개를 storage.local에 유지")는 "진단은 저장하지 않고 요청 시 응답만 한다"로 Opus가 개정한다. 진단 출처 줄은 응답의 `createdAt` 기준, 숨긴 탭은 응답하지 않던 T2 규칙은 메시징 대상이 활성 탭이라 자연히 지켜진다.
- (b0) **background 복원 쓰기 재시도 강화**(이번 오류의 직접 지점): 복원 `set`이 reject되면 1초·5초·15초 뒤 최대 3회 재시도. 모두 실패하면 `console.warn` 한 줄(`'SDR HDR: 설정 복원 실패, Safari를 완전히 종료 후 다시 여세요'`, 오류 원문 없이)만 남기고 중단한다. 재시도 중 사용자가 popup에서 값을 바꾸면(저장소에 BACKUP_KEYS 중 하나라도 생기면) 재시도를 멈춘다(사용자 값 우선). 복원 실패를 popup이 알 수 있게 background는 아무 키도 쓰지 않는다(쓰기가 실패하는 상황이므로) — popup은 열릴 때 저장소가 비어 있고 `restoredAt`도 없으면 진단 영역에 "설정을 읽지 못했거나 초기화됨. 내 프리셋에서 다시 불러오거나 Safari를 재시작하세요"를 한 줄 보인다.
- (b) **남은 쓰기의 실패 처리**: 설정(popup `save`), `setEnabled`(단축키), background 백업 복원 `set`에서 reject를 잡아 **1초 뒤 1회 재시도**. 재시도도 실패하면 popup은 기존 '저장 실패' 자리에 "저장 실패(Safari 저장소 오류). Safari를 완전히 종료 후 다시 여세요"를 표시하고, content는 진단 `errors`에 `{at: 'storage.set', name: 'StorageError'}`를 남긴다(메시지 원문은 남기지 않음). background는 조용히 무시(현행).
- (c) 이전 버전이 남긴 `sdrhdr.diag`·`sdrhdr.diagRequest` 키는 background 시작 시 1회 `storage.local.remove`로 지운다(저장소 크기 축소). 실패는 무시.
- (d) 진단 스키마는 바꾸지 않는다(schemaVersion 13 유지). 내용은 같고 전달 방식만 바뀐다. "JSON 저장"(Blob)과 복사는 마지막으로 받은 응답을 쓴다.

**영향 범위**: `params.js`(MSG 추가, 진단 저장 함수 제거), `main.js`(getDiag 응답, 진단 쓰기 제거, set 재시도·errors 기록), `popup.js`(진단 요청을 메시징으로, 저장 실패 문구·재시도), `background.js`(이전 키 정리, 복원 set 재시도), GUIDELINES 2.6-2·2.1-5(메시지 3종), 테스트, install.md·체크리스트 문구. 렌더·곡선·수명주기·배지·내 프리셋 불변.

**검증**

- (1) 단위: popup이 진단 영역을 열면 2초마다 getDiag 메시지(저장소 쓰기 0회), 응답을 표시·복사·저장에 사용, 무응답 시 안내 문구, content가 getDiag에 진단 객체로 응답하고 storage.set을 부르지 않음, 설정 저장 reject → 1초 뒤 재시도 → 재실패 시 문구, content set 재실패 시 errors 기록, background가 이전 키 2개를 1회 remove. 기존 진단 내용 테스트(buildDiag)는 그대로.
- (2) 사용자 Mac: 체크리스트 "V 회차 확인" — 진단 영역을 열어 둔 채 15분 재생해도 오류가 나지 않는지, 진단 상자가 2초마다 갱신되는지, 복사가 되는지. 이어서 U 회차 메모리 (c) 측정과 설정 유지 확인.

### 버전·분할

- 1.3.1, popup 헤더 버전 문자열 동기화.
- 본 세션(Sonnet): `params.js` 먼저(MSG.getDiag, 함수 정리) → impl-worker 2개 병렬: W-A `main.js`+main 테스트, W-B `popup/*`+popup 테스트 → 본 세션 `background.js`+테스트, 문서·체크리스트("V 회차 확인" 절, 기존 "T 회차 확인" 2번·"U 회차 확인"의 진단 영역 설명을 새 방식에 맞게), STATUS, 전체 검증 → PR.

---

# U 회차 (2026-10-03, 기록)

## 사용자 보고 (2026-10-03)

- 설정: **Xcode에서 다시 Run** 하거나 **Mac을 재부팅**하면 슬라이더 값(프리셋·강도·상세 곡선 등)이 기본값으로 돌아간다.
- 메모리: 4K 재생, HUD 끔. 시점은 무작위. 활동 상태 보기에서 `kernel_task`와 Safari의 해당 페이지 프로세스 합계 약 13 GB.

## 판정 요약

| ID  | 분류                                       | 심각도 | 결정                                                 |
| --- | ------------------------------------------ | ------ | ---------------------------------------------------- |
| U1  | 설정 유실: 재설치·재부팅 뒤 storage 초기화 | 높음   | 수정(네이티브 백업·복원)                             |
| U2  | 메모리: GPU 측 자원 적체 가능성            | 높음   | 방어 수정 1건(U2-A) + 진단 카운터(U2-B) + 측정(U2-C) |

## U1. 재설치·재부팅 뒤 설정 초기화

**원인 분석**

- 코드가 설정을 지우는 경로는 popup "기본값으로 되돌리기"(사용자 조작) 하나뿐이다. 설정 쓰기는 모두 popup 조작 시점이며 로드 시 기본값을 쓰는 코드는 없다(Sonnet 확인). 저장소는 `storage.local`만 쓴다.
- 재현 조건 두 가지(Xcode Run, Mac 재부팅)는 모두 Safari가 **서명되지 않은 확장을 다시 등록·재허용하는 시점**이다(재부팅 → Safari 재시작 → "서명되지 않은 확장 허용" 재설정 → 확장 다시 켬, 사용자 확인 2026-10-02). 이때 Safari가 확장의 `storage.local`을 새로 시작하는 것으로 **추정**한다 [미확인: Safari 내부 동작, 문서 근거 없음]. 코드로 막을 수 없는 외부 원인이므로 저장소를 하나 더 둔다.

**수정 방향**

- (a) **네이티브 백업**: 컨테이너 앱의 확장 타깃(`SafariWebExtensionHandler.swift`, 이미 프로젝트에 있음 → pbxproj 변경 불필요)이 `UserDefaults`에 설정 JSON 1개를 보관한다. 확장 컨테이너의 UserDefaults는 Xcode 재빌드·재부팅 뒤에도 유지된다 [추정, U1 검증 (3)으로 확인].
  - 메시지 2종(`browser.runtime.sendNativeMessage`, Safari는 앱 id 인자를 무시하므로 번들 id 문자열을 그대로 넘김): `{type: 'backup:set', data}` → 저장 후 `{ok: true}`, `{type: 'backup:get'}` → `{ok: true, data}`(없으면 `data: null`). 그 외 type은 `{ok: false}`.
  - Swift 쪽 검증: `data`는 JSON 직렬화 가능한 사전이고 직렬화 크기 ≤ 16 KB일 때만 저장. 키는 `sdrhdr.settingsBackup` 하나. 기존 템플릿의 echo·os_log 출력은 메시지 내용을 로그에 남기지 않게 바꾼다(타입만 로그).
- (b) **백업 대상**: `params`에 `BACKUP_KEYS` = enabled, preset, custom, strength, sharpness, saturation, hud, notify. **mode(진단 모드)·diag·diagRequest·customPrev는 제외**(진단 모드가 재시작 후 살아나면 UX-01 문제 재발).
- (c) **백업 시점**(background.js): `storage.onChanged`에서 `BACKUP_KEYS` 중 하나라도 바뀌면 1초 디바운스 후 `storage.local.get(BACKUP_KEYS)` → `normalizeSettings` 하지 않은 **원본 값 그대로**(없는 키는 생략) `backup:set`. 기본값 복원(키 삭제)도 같은 경로로 반영된다(빈 객체 저장 허용).
- (d) **복원 시점**(background.js 시작 시 1회, `runtime.onStartup`·`onInstalled`와 최상위 실행 중 먼저 오는 것 1회만): `storage.local.get(BACKUP_KEYS)`가 **모두 비어 있고** 백업이 비어 있지 않을 때만 `storage.local.set(백업)` + `sdrhdr.restoredAt`(ms) 기록. 하나라도 있으면 아무것도 하지 않는다(사용자 최신 값 우선). 복원으로 생긴 onChanged는 백업을 다시 쓰지만 같은 값이므로 무해.
  - content는 background보다 먼저 기본값으로 시작할 수 있다. 복원 set이 onChanged로 전달되어 1초 안에 사용자 값으로 바뀌므로 수용한다.
- (e) **표시**: popup 진단 영역 출처 줄 아래에 `sdrhdr.restoredAt`이 있으면 "M월 D일 HH:MM 재시작 후 설정을 백업에서 복원함" 한 줄(진단 영역 안). 진단 JSON 스키마는 바꾸지 않는다.
- (f) **실패 시**: `sendNativeMessage`가 없거나 거부·예외면 조용히 무시(현재 동작과 같음). background가 로드되지 않는 경우(M8 미확인 사항)에는 U1도 동작하지 않는다 → 체크리스트에서 함께 확인.
- (g) **규칙·권한**: manifest `permissions`에 `"nativeMessaging"` 추가(이 문서로 Opus 승인). GUIDELINES 1-3(background 역할에 "설정 백업·복원" 추가), 2.1-5(네이티브 메시지 2종 추가)는 Opus가 이 커밋에서 개정한다. 백업 데이터에 URL·제목·진단은 없다(2.6-1).

**영향 범위**: `background.js`, `params.js`(`BACKUP_KEYS`, `KEYS.restoredAt`), `manifest.json`, `SafariWebExtensionHandler.swift`, `popup.js`(복원 안내 한 줄), 관련 테스트. content·renderer·수명주기 불변.

**검증**

- (1) 단위: 디바운스(연속 변경 → 1회 백업, 마지막 값), mode·diag 변경은 백업 안 함, 시작 시 저장소가 비고 백업이 있으면 복원 + restoredAt, 저장소에 키가 하나라도 있으면 복원 안 함, 백업이 비면 복원 안 함, 복원 1회만, 네이티브 미지원·거부 무시, popup 복원 안내 표시.
- (2) `xcodebuild`(무서명) 빌드 통과로 Swift 컴파일 확인. Swift 동작 자체는 사용자 Mac.
- (3) 사용자 Mac: 슬라이더 값 바꿈 → 1초 이상 대기 → Xcode Run → Safari 재시작·확장 켬 → popup 값 유지 + 진단 영역 "복원함" 표시 여부. 이어서 Mac 재부팅 후 같은 확인. "복원함"이 뜨면 원인 추정(storage 초기화)이 맞는 것이다. 값이 유지되는데 "복원함"이 없으면 storage가 지워지지 않은 것(원인이 다른 곳) → Opus에 회신.

## U2. 메모리 증가 (4K, kernel_task + Safari 페이지 약 13 GB)

**원인 분석 (가설, 측정 전)**

- `kernel_task` 메모리에는 GPU가 쓰는 wired 메모리(IOSurface 등)가 잡힌다. 확장은 렌더할 때마다 `VideoFrame`(즉시 close), `GPUExternalTexture`, `GPUBindGroup`, command encoder를 새로 만든다(GUIDELINES 2.5-1, 외부 텍스처 재사용 금지). JS 래퍼는 GC 전까지 남고, 그동안 GPU 측 자원(4K 프레임 IOSurface 참조)이 함께 유지될 수 있다. 120Hz·4K에서 GC가 늦거나 GPU 큐가 밀리면 적체된다 → **H1 (유력)**.
- **H2**: 설정 토글·SPA 이동·모드 전환마다 `requestDevice`로 새 GPU device를 만든다. 이전 device는 `destroy()`하지만 Safari가 즉시 반환하는지 미확인.
- **H3**: 확장과 무관(YouTube 4K 재생·Safari 자체). 확장 끔 상태 측정 없이 배제할 수 없다.
- 코드 읽기로 확인된 누수(해제 누락)는 없다(STATUS 조사). 따라서 원인은 "해제 누락"이 아니라 "해제 지연·적체"로 본다.

**수정 방향**

- **U2-A (방어, 지금 적용)**: GPU 큐 적체 상한. renderer에 제출 후 완료되지 않은 프레임 수(in-flight)를 센다(`device.queue.onSubmittedWorkDone()`의 resolve로 감소). **in-flight ≥ 2이면 그 tick은 렌더하지 않고 건너뛴다**(VideoFrame도 만들지 않음, `sameFrameSkipped`와 별도 카운터 `gpuBusySkipped`). device 교체·destroy 시 카운터 초기화(이전 device의 promise가 늦게 와도 새 카운터를 건드리지 않게 세대 확인). 이 상한은 정상 상태(GPU 2.4~5.3 ms/프레임, G3)에서는 거의 걸리지 않고 적체 때만 동작한다.
- **U2-B (진단 카운터)**: 진단 `render`에 `devicesCreated`(이 페이지에서 requestDevice 성공 누적, renderer 바깥 main이 세는 누적값), `gpuBusySkipped`, `uptimeS`(start 후 경과 초)를 추가 → **schemaVersion 13**. 스키마·parse-result 갱신. HUD 4줄에 `GPU 대기 생략 n` 추가하지 않는다(진단만).
- **U2-C (측정, 사용자)**: 아래 체크리스트로 H1~H3를 가른다. 결과를 받은 뒤 Opus가 추가 조치(예: H1이면 렌더 상한 60Hz 옵션, H2면 device 재사용)를 결정한다. 이 문서는 U2-A·B만 구현을 지시한다.

**영향 범위**: `renderer.js`(in-flight 카운트·tick 생략·`getStats` 필드), `main.js`(devicesCreated 누적, uptime), `hud.js`(buildDiag 필드, schemaVersion 13), `docs/result-schema-m2.json`, `scripts/parse-result.py`, 테스트. 경로 선택·곡선·수명주기 불변.

**검증**

- (1) 단위: in-flight 2에서 tick 생략·VideoFrame 미생성·카운터 증가, onSubmittedWorkDone resolve 후 재개, device 교체 후 늦은 resolve가 새 카운터를 바꾸지 않음, `onSubmittedWorkDone` 미지원이면 상한 없이 현행 동작, buildDiag v13 필드.
- (2) 사용자 Mac 측정(체크리스트 "U 회차 확인"):
  - 같은 4K SDR 영상(재생목록 반복 가능), 창 모드, HUD 끔. 각 조건 **15분**, 0·5·15분에 활동 상태 보기 → 메모리 탭에서 `kernel_task`와 "Safari 웹 콘텐츠(youtube.com)" 값을 적는다. 조건 사이에 Safari를 완전 종료 후 재시작.
  - (a) 확장 끔 (b) popup 진단 모드 `baseline` (c) 정상(itm). (c) 끝에 진단 JSON 1개.
  - 판정 자료: (a)에서도 오르면 H3(확장 무관). (b)는 평탄하고 (c)만 오르면 H1(렌더 경로). (c)에서 `devicesCreated`가 1보다 크고 그때마다 오르면 H2.

## 버전·문서

- manifest 1.2.1, popup 헤더 버전 문자열 동기화(GUIDELINES 7-7), 진단 schemaVersion 13.
- install.md: 7장 문제 해결에 "설정이 기본값으로 돌아갔을 때"(U1 동작과 복원 안내), 8장에 메모리 측정 중임을 한 줄. 6장 HUD 절 첫 줄에 "popup의 '페이지 HUD 표시'를 켜면 보이는 상태 표시"라고 위치를 명시(사용자가 HUD를 모른다고 회신).
- 체크리스트: "U 회차 확인" 절 = U1 검증 (3) + U2 측정 (2). 판정: U1 값 유지, U2 측정 표 회신.

## 이번 수정 범위 밖 (변경 금지)

- 곡선·프리셋·기본값·WGSL, 경로 선택 규칙, 수명주기 상태 전이, DRM 가드, 오버레이 배치, popup 레이아웃(복원 안내 한 줄 제외), M8 상태 칩·배지 동작.

## 병렬 분할

- 본 세션(Sonnet) 먼저: `params.js`(`BACKUP_KEYS`, `KEYS.restoredAt`) 커밋.
- W-A(impl-worker): U1 — `background.js`, `manifest.json`(nativeMessaging·1.2.1), `SafariWebExtensionHandler.swift`, `tests/unit/extension-background.test.js`·manifest 테스트, `xcodebuild` 무서명 빌드 확인.
- W-B(impl-worker): U2-A·B — `renderer.js`, `tests/unit/extension-renderer.test.js`.
- 본 세션 나머지: `main.js`(devicesCreated·uptime), `hud.js` v13·스키마·parse-result, `popup.js`·`popup.html`(복원 안내 한 줄·버전 문자열), 문서·체크리스트·STATUS, 전체 검증 → PR.
