# GUIDELINES.md — 코딩 규칙

> 작성: Opus(계획 단계). 근거: PLAN.md H절 "GUIDELINES.md 요지". 이 문서와 PLAN.md 범위를 벗어나는 판단은 Sonnet이 하지 않고 STATUS.md "Opus 확인 필요"에 기록한다.
> 버전: v1.7 (2026-10-01, T 회차: 2.5-7 재렌더 생략, 2.6-2 요청 시 진단, 3-1 JS 미러 런타임 미로드). 개정은 Opus만 한다.

규칙 표기: **[필수]** 위반 시 PR 불가, **[권장]** 예외는 PR 본문에 사유 기록.

---

## 1. 범위·금지 사항

1. **[필수]** DRM(EME/FairPlay) 신호가 하나라도 있으면 즉시 no-op한다. DRM 회피, 화면 캡처 우회, CORS 우회 코드는 작성하지 않는다.
2. **[필수]** 요청 없는 기능, 옵션, 설정 항목, 추상화 계층을 추가하지 않는다. PLAN.md C절 파일 구조 밖에 새 최상위 디렉터리를 만들지 않는다.
3. **[필수]** 번들러, 런타임 의존성, 원격 코드 로드를 도입하지 않는다(필요하면 Opus 승인). background는 `extension/content/background.js` 하나만 두며(PLAN D-M8), 상태를 저장하지 않고 배지·아이콘 갱신과 설정 백업·복원(FIX_GUIDE U1)만 한다. 네트워크 요청 금지.
4. **[필수]** 네이티브 헬퍼(F-A) 코드는 PLAN.md "게이트 판정 기록"에 Opus의 착수 지시가 있기 전까지 작성하지 않는다.
5. **[필수]** 클라우드 VM에서 WebGPU, EDR 출력, Safari 확장 동작, 성능을 "검증했다"고 기록하지 않는다. 해당 항목은 "미검증(사용자 Mac 필요)"으로 쓴다.

## 2. 확장 코드 구조 (extension/)

### 2.1 로딩 방식
1. **[필수]** content script는 manifest `content_scripts[].js` 배열 순서로 로드되는 classic script다. ES module(`import`/`export`), `type="module"`을 쓰지 않는다.
2. **[필수]** 전역 이름은 `globalThis.__sdrhdr` 하나만 쓴다. `ns.js`가 첫 번째로 로드되어 객체를 만들고, 이후 파일은 자기 하위 키(`__sdrhdr.detect`, `__sdrhdr.params` 등)에만 할당한다.
3. **[필수]** 각 파일은 IIFE로 감싸 지역 스코프를 유지한다. 파일 최상위에서 DOM 조회, `navigator.gpu` 접근, 이벤트 등록 같은 부작용을 실행하지 않는다. 부작용 시작점은 `main.js` 하나다.
4. **[필수]** 파일 간 의존은 manifest 순서로만 해결한다. 뒤에 로드되는 파일의 심볼을 앞 파일이 로드 시점에 참조하지 않는다(호출 시점 참조는 허용).
5. **[필수]** `browser.*` API 접근은 `params.js`(storage), `main.js`(수명주기·메시지), `popup.js`, `background.js`에만 둔다. 메시지는 세 종류만 쓴다(PLAN D-M8 M8-1 `MSG`, FIX_GUIDE V1): popup → 현재 탭 content `sdrhdr:getState`(응답: 상태 객체)·`sdrhdr:getDiag`(응답: 진단 객체), content → background `sdrhdr:state`(배지 정보). 네이티브 메시지(`runtime.sendNativeMessage`)는 background만 쓰며 `backup:set`·`backup:get` 두 종류, 데이터는 설정 키(`params.BACKUP_KEYS`)뿐이다(FIX_GUIDE U1). 메시지·응답에 URL·제목을 넣지 않는다(2.6-1). 새 권한은 Opus 승인 없이 추가하지 않는다(D-M8 M8-0 (a)의 `activeTab` 예외와 FIX_GUIDE U1의 `nativeMessaging`만 허용).

### 2.2 순수 함수 / 부작용 분리
1. **[필수]** 다음은 순수 함수로 작성한다. 입력은 인자로만 받고, DOM·GPU·`browser.*`·시간에 의존하지 않는다.
   - `detect`: DRM 판정(`mediaKeys`/`webkitKeys`/이벤트 기록을 인자로 받는 형태), HDR 원본 판정, 콘텐츠 사각형(letterbox) 계산
   - `params`: 프리셋 정의, 범위 클램프, 직렬화/역직렬화, "사용자 지정" 전환 판정
   - 톤 커브 JS 미러(셰이더와 동일 수식)
   - 캔버스 해상도 계산 `min(원본, contentRect×DPR)`
2. **[필수]** DOM 조작(`overlay.js`), GPU(`renderer.js`), 수명주기(`main.js`), HUD(`hud.js`)는 순수 함수를 호출만 하고 판정 로직을 중복 구현하지 않는다.
3. **[권장]** 부작용 모듈은 생성 함수가 `{ attach, detach }` 또는 `{ start, stop }` 형태의 해제 가능한 객체를 반환한다. 모든 리스너·Observer·rVFC 핸들은 detach에서 해제한다.

### 2.3 셀렉터·DOM
1. **[필수]** YouTube 셀렉터 문자열과 클래스명은 `detect.js`에만 둔다. 다른 파일은 detect의 함수로 요소를 받는다.
2. **[필수]** 셀렉터가 실패하면 예외를 던지지 않고 no-op한다(오버레이를 붙이지 않음). HUD에는 실패 사유를 남긴다.
3. **[필수]** 대상 video는 메인 플레이어 1개다. 캔버스는 `.html5-video-container` 안 video 바로 뒤에 두고 `pointer-events:none`을 유지한다. 플레이어 컨트롤의 z-index 순서를 바꾸지 않는다.
4. **[필수]** DOM 판별 로직을 바꾸면 `tests/dom/` 정적 픽스처를 함께 갱신한다. 픽스처는 실제 YouTube DOM 스냅샷에서 필요한 부분만 잘라 쓴다.

### 2.4 DRM 가드
1. **[필수]** attach 전과 attach 후 모두 검사한다. attach 후에는 `encrypted`/`webkitneedkey` 이벤트와 `mediaKeys`/`webkitKeys` 변화를 감시한다.
2. **[필수]** 한 번 DRM으로 판정된 video 요소는 영구 no-op이다(같은 요소에 재attach 금지). 판정 해제 로직을 만들지 않는다.
3. **[필수]** 검은 프레임 연속 감지는 보조 신호로만 쓰며, detach 방향으로만 작동한다.
4. **[필수]** DRM 영구 no-op은 **요소 단위**다(같은 요소의 이후 소스에도 적용). 검은 프레임·HDR 원본·PiP 스킵은 **소스 또는 상태 단위**이며 소스가 바뀌거나 조건이 사라지면 재판정한다(PLAN D-M3 M3-1).
5. **[필수]** DRM 판정 후에도 HUD·상태 칩의 **텍스트 표시**는 허용한다(PLAN D-M8 M8-0 (c)). 영상 프레임·캔버스·GPU 접근, DRM 판정 해제, 재attach는 하지 않는다. 현재 소스의 DRM 신호는 표시 문구 구분을 위해 읽기만 한다.

### 2.5 렌더러
1. **[필수]** 프레임 구동은 PLAN.md C절 "렌더 루프"를 따른다(2026-09-30 확정: `requestAnimationFrame` 구동, rVFC는 Safari에서 표시 프레임보다 적게 호출되어 구동에 쓰지 않음). `importExternalTexture`는 렌더할 때마다 다시 호출한다(외부 텍스처 재사용 금지).
2. **[필수]** 일시정지·seek 시 1회 렌더, 탭 비가시(`visibilitychange`) 시 루프 정지.
3. **[필수]** 캔버스 설정은 `format:'rgba16float'`, `colorSpace:'display-p3'`, `toneMapping:{mode:'extended'}`로 고정한다. Phase 0 판정 전에 다른 값을 시도하는 분기를 넣지 않는다(폴백 경로는 Opus 지시 후).
4. **[필수]** GPU 초기화 실패, device lost, SecurityError는 잡아서 detach하고 HUD에 기록한다. 페이지 재생을 방해하지 않는다.
5. **[권장]** 파이프라인·샘플러·유니폼 버퍼는 attach 시 1회 생성하고 파라미터 변경 시 유니폼만 갱신한다.
6. **[필수]** 비디오 입력 경로는 PLAN C절 "비디오 입력 경로"(ext → vf → copy 자동 선택)를 따른다. 소스가 바뀌면 경로 결정부터 다시 한다. `VideoFrame`은 submit 직후 반드시 `close()`한다(예외 경로 포함).
7. **[필수]** 같은 소스 프레임은 다시 그리지 않는다(vf: `VideoFrame.timestamp` 동일, copy: 복사 생략). 단 설정·모드·경로·소스·캔버스 크기 변경, play·seeked, 가시 복귀 뒤에는 반드시 다시 그린다. 생략한 tick도 루프 통계(loopTs·srcTs·frameTimes)는 기록한다(FIX_GUIDE TA).

### 2.6 진단·개인정보 (M2 추가)
1. **[필수]** 진단 JSON(`sdrhdr.diag`, 결과 파일)에는 영상 제목, 채널, 쿠키, 계정 정보, 전체 URL을 넣지 않는다. 페이지는 경로와 `v` 쿼리만 기록한다.
2. **[필수]** 진단은 저장소에 쓰지 않는다. popup이 현재 탭에 `sdrhdr:getDiag` 메시지로 요청하면 content가 응답으로만 돌려준다(FIX_GUIDE V1). 외부로 전송하지 않는다. content script는 주기적으로 진단을 쓰지 않고, popup의 요청 키(`sdrhdr.diagRequest`)가 바뀔 때 **보이는 탭만** 1회 쓴다(FIX_GUIDE T2).
3. **[필수]** `stripes`·`identity`·`baseline` 모드는 진단용이며 popup의 "진단" 영역(`<details>`, 기본 접힘) 밖으로 노출하지 않는다(PLAN D-M5 M5-2). 페이지 HUD는 사용자 확인용이라 이 규칙 대상이 아니지만 개인정보 규칙(2.6-1)은 따른다.
   - 해석(PLAN D-M7 M7-0 (a)): 모드가 `itm`이 아닐 때 진단 영역을 자동으로 펼치는 것, 일반 영역에 모드 이름 없이 "진단 모드라 조정이 잠김" 안내를 두는 것은 허용한다. 모드 select와 모드 이름은 진단 영역 안에만 둔다.

### 2.7 수명주기 (M3 추가)
1. **[필수]** YouTube 이벤트 이름(`yt-navigate-finish` 등)과 클래스명(`ad-showing` 등)은 detect.js 상수로만 둔다(셀렉터와 같은 취급).
2. **[필수]** SPA 이동 처리는 이벤트와 DOM 관찰(MutationObserver, video 소스 변경 이벤트)을 이중으로 둔다. 어느 하나가 없어도 다음 영상에서 동작해야 한다.
3. **[필수]** MutationObserver는 `#movie_player` 범위로 한정하고 디바운스한다. `document` 전체 관찰 금지.
4. **[필수]** 셀렉터 확정은 실제 DOM 스냅샷(`tests/dom/fixtures/yt-*.html`) 커밋 후에 한다. 추측 셀렉터는 [미확인] 주석과 함께 두고 실패 시 no-op 한다.

## 3. 셰이더·수치 일관성

1. **[필수]** ITM 수식은 세 곳에 존재한다: WGSL(`itm.wgsl.js`), JS 미러, numpy(`sim/`). 하나를 바꾸면 **같은 커밋에서** 셋 다 갱신한다.
   - M2 예외: JS 미러는 M4에서 만든다. M2는 WGSL 본문이 `probe/shaders.js`와 같고 상수가 `params.js`·`sim/presets.py` 균형 값과 같음을 테스트한다(PLAN D-M2 M2-5).
   - M4a 예외: 강도 혼합(PLAN D-M4a)은 WGSL과 numpy 두 곳에 같은 커밋으로 넣는다. JS 미러는 M4에서 만들 때 혼합을 포함한다. WGSL 테스트는 곡선 본문(`ITM_FN`)이 probe와 같음을 계속 검사한다.
   - M4(PLAN D-M4) 이후: JS 미러는 `content/tonecurve.js` 한 곳이다(런타임 미로드, manifest `content_scripts`에 넣지 않고 테스트가 직접 로드, FIX_GUIDE T5). ITM 상수는 WGSL uniform으로 옮기고 probe 셰이더와의 문자열 일치 검사는 끝낸다. 대신 JS 미러 vs numpy 참조(`tests/unit/fixtures/tonecurve-ref.json`, `python -m sim.export_ref`로 재생성) 오차 < 1e-4와 WGSL uniform 필드 순서 = `params.js` 직렬화 순서를 검사한다.
2. **[필수]** JS 미러 vs numpy 오차 < 1e-4 테스트를 유지한다. 테스트 입력은 램프, 컬러바, 프리셋 3종 + 범위 경계값을 포함한다.
3. **[필수]** 곡선·프리셋 수치는 PLAN.md C절 초안을 쓰고, 변경은 M4에서 Opus가 GUIDELINES/PLAN 개정으로만 한다. Sonnet은 S2/S4/S5 결과를 STATUS.md에 보고만 한다.
4. **[필수]** 셰이더 출력에 NaN/Inf가 나오지 않게 `Y=0` 분기를 명시한다(`f(Y)/Y` 계산).
5. **[필수]** 파라미터 범위(PLAN.md C절 표)는 `params.js` 한 곳에서 정의하고 popup, 셰이더 유니폼, 테스트가 이를 참조한다.
6. **[권장]** WGSL은 클라우드에서 naga 파싱 검사만 가능하다. 파싱 통과를 "컴파일 검증"으로 쓰지 않는다.

## 4. 테스트

| 대상 | 도구 | 위치 | 비고 |
|---|---|---|---|
| 순수 함수(detect/params/curve/해상도) | `node:test` + `node:vm` | `tests/unit/` | `npm test` |
| DOM 판별(정적 픽스처) | Playwright WebKit | `tests/dom/` | `npm run test:dom`, Safari 확장 환경 아님 |
| 톤 커브·색·밴딩·예산 모델 | numpy + pytest | `sim/` | `pytest sim`, S1~S7 |
| manifest | 스키마 검사 | `tests/unit/` | |

1. **[필수]** 단위 테스트는 `node:vm`으로 extension 파일을 manifest 순서대로 새 context에 로드해 `__sdrhdr`를 검사한다. 테스트용으로 소스에 `export`나 조건부 코드를 추가하지 않는다.
2. **[필수]** 순수 함수 추가·변경 시 해당 단위 테스트를 같은 커밋에 포함한다.
3. **[필수]** 테스트를 skip·삭제·약화해서 통과시키지 않는다. 기준 자체가 틀렸다고 판단되면 STATUS.md "Opus 확인 필요"에 기록한다.
4. **[필수]** 반복·장출력 실행(스윕, 전체 테스트, 픽스처 생성, results/ 파싱)은 sim-runner에 위임한다. 결과는 요약만 STATUS.md에 기록한다.
5. **[권장]** 시뮬레이션 산출 표(S2/S3/S7)는 `sim/out/`이 아닌 재생성 가능한 스크립트로 남기고, 결과 요약만 커밋한다.

## 5. 작업 보고 형식

모든 작업 완료 보고(STATUS.md, PR 본문)는 다음 형식을 쓴다.

```
→ verify: <PLAN.md 기준> / <실제 결과> / <검증 위치: (1) 클라우드 | (2) GH Actions macOS | (3) 사용자 Mac>
```

- (3)이 필요한 항목은 사용자 회신 전까지 "미검증"으로 표기한다.
- 수치 결과는 핵심 값만 적고 로그 전문은 옮기지 않는다.

## 6. 코드 스타일

1. **[필수]** `npm run lint`(eslint) 및 prettier 통과. 설정은 M0에서 정한 것을 따른다.
2. **[필수]** JS는 `'use strict'` 범위(IIFE 내부)에서 작성하고, `var` 대신 `const`/`let`을 쓴다.
3. **[권장]** 주석은 "왜"만 쓴다. 수식은 PLAN.md 해당 절 번호를 참조한다(예: `// PLAN C-ITM 3`).
4. **[권장]** 매직 넘버(행렬, 계수)는 이름 있는 상수로 두고 출처(BT.709, Display P3 등)를 주석으로 남긴다.
5. **[필수]** Python(`sim/`)은 numpy만 필수 의존성으로 한다. 추가 패키지는 Opus 승인.

## 7. 커밋·브랜치·PR

1. **[필수]** 커밋 메시지: `feat|fix|sim|test|ci|docs|chore(scope): 요약`. scope 예: `detect`, `renderer`, `probe`, `sim`, `hook`.
2. **[필수]** 커밋 메시지, PR 제목·본문, 코드 주석에 모델 식별자를 넣지 않는다.
3. **[필수]** `main`에 직접 push하지 않는다. 세션 지정 브랜치에서 작업하고 마일스톤당 draft PR 1개를 연다.
4. **[필수]** PR 본문에 verify 결과를 (1)/(2)/(3)으로 구분하고, 수동 미완 항목은 "미검증"으로 명시한다.
5. **[필수]** Xcode 프로젝트(`xcode/`, `*.pbxproj`)는 클라우드에서 수기 편집하지 않는다. 사용자 Mac에서 push한 커밋만 인정한다.
6. **[필수]** 게이트 마일스톤(M1, M2)은 사용자 회신 JSON(`results/`)과 Opus 판정(PLAN.md 게이트 판정 기록)이 있어야 머지 대상이 된다.
7. **[필수]** 사용자에게 보이는 변경을 담은 PR은 `manifest.json` version을 올린다(기능 minor, 수정 patch). popup 헤더의 정적 버전 문자열은 manifest와 같아야 하며 단위 테스트로 검사한다(PLAN D-M7).

## 8. 역할·문서 규칙 (요약)

- 역할 분리, 전환 규칙, 서브에이전트 위임 → `CLAUDE.md`
- 핸드오프, FIX_GUIDE.md 필수 항목 → `.claude/rules/handoff.md`
- STATUS.md 기록 → `.claude/rules/status-md.md`
- 세션 재개 → `.claude/skills/session-resume/SKILL.md`
- **[필수]** 계획에 없는 설계 이슈는 코드로 해결하지 않고 STATUS.md "Opus 확인 필요"에 기록한 뒤 Opus 단계로 반환한다.
