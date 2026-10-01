# FIX_GUIDE.md — 1.0.0 코드 리뷰 지적 사항 (T 회차)

> 작성: Opus (2026-10-01). 근거: 1.0.0(main `ac304f9`) 정적 코드 리뷰(Sonnet, 대화 기록), `extension/content/{renderer,main,overlay,hud,params}.js`, `extension/popup/popup.js`.
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차(L·N·P·Q·R·S·K1)는 git 이력에 있다. K1은 PLAN D-M6 M6-5에서 종료되었다.
> 브랜치: `claude/review-fixes`. 버전 1.0.0 → 1.0.1.

## 판정 요약

| ID  | 분류                                                                       | 심각도         | 결정                                     |
| --- | -------------------------------------------------------------------------- | -------------- | ---------------------------------------- |
| T1  | 버그: 소스 변경 중 진행 중이던 frameProbe 결과가 새 소스에 적용            | 중(확률 낮음)  | 수정                                     |
| T2  | 자원·버그: 진단 JSON 2초 주기 저장, 여러 탭이 같은 키를 덮어씀             | 중             | 수정(요청 시에만 저장)                   |
| T3  | 자원: 숨긴 탭에서도 frameProbe·HUD 갱신                                    | 낮음           | 수정                                     |
| T4  | UX·자원: popup 진단 상자가 2초마다 다시 그려져 스크롤 초기화, Blob 재생성  | 낮음           | 수정(T2와 함께)                          |
| TA  | 자원: 120Hz에서 같은 소스 프레임을 2~4회 렌더                              | 중(배터리·GPU) | 수정(vf·copy 경로), 사용자 Mac 확인 필수 |
| T5  | 정리: popup 상세 슬라이더 기본값 불일치, 런타임 미사용 `tonecurve.js` 로드 | 낮음           | 수정                                     |
| T6  | 단일 측정 모드에서 영상 중간 HDR 전환 미검사                               | 매우 낮음      | 수정 안 함(아래 사유)                    |
| TB  | 창 크기 드래그 중 캔버스 백킹 재할당                                       | 일시적         | 수정 안 함(수용)                         |

## T1. 소스 변경 중 frameProbe 결과 폐기

- **원인**: `renderer.runProbe`는 경로별 측정 사이에 여러 번 await한다. 그 사이 `restartSource()`가 `path=null`·`colorSpace=null`로 초기화해도, 재개된 이전 회차가 이전 소스의 측정값으로 `path`를 결정하고 `onProbe`를 부른다. 이전 값이 밝으면 새 소스는 경로가 이미 결정된 상태가 되고, 이후 30초 회차는 단일 측정(`mode:'single'`)이라 결정 전 회차의 HDR 조기 판정(M6-1 (a))을 건너뛴다. 새 소스가 HDR이고 경로가 ext면 다음 소스 변경까지 HDR 영상에 ITM이 적용된다.
- **수정 방향**:
  1. renderer에 소스 세대 번호(정수)를 둔다. `restartSource()`와 `enterBaseline()`에서 1 증가시킨다.
  2. `runProbe` 시작 시 세대 번호를 기억하고, **각 await 직후**와 frameProbe를 만들기 직전에 현재 번호와 비교한다. 다르면 `frameProbe`·`path`·`noneStreak`·`pendingCount`·`colorSpace`를 건드리지 않고 `onProbe`도 부르지 않고 반환한다(`probeBusy`는 finally에서 해제).
  3. `probeVf`가 `colorSpace`를 쓰는 시점도 세대 번호를 확인한다(이전 세대의 프레임이 새 세대의 colorSpace를 덮지 않게).
  4. 폐기한 회차는 `probeDue`를 바꾸지 않는다. `restartSource`가 `probeDue = 0`으로 둔 값이 유지되어 다음 poll(≤ 500 ms)에서 새 회차가 즉시 돈다.
- **영향 범위**: `renderer.js`만. main·detect 변경 없음.
- **검증**: 단위 테스트(renderer stub): (a) 측정 중간(예: ext await 중) `restartSource()` 호출 → 이전 회차 완료 후에도 `path === null`, `onProbe` 호출 없음, `frameProbe === null`. (b) 다음 poll에서 새 회차가 vf부터 다시 측정하고 HDR colorSpace면 `hdrEarly` true. (c) 세대가 같으면 기존 동작 그대로(기존 테스트 전부 통과).

## T2. 진단 JSON을 popup 요청 시에만 저장

- **원인**: `main.js`가 2초마다 `buildDiag`를 만들고, 내용이 바뀌면(재생 중에는 frames가 늘어 항상 바뀜) `storage.local.set({sdrhdr.diag})`를 한다. 탭당 시간당 약 1,800회·회당 수 KB이고 숨긴 탭도 쓴다. 키가 하나라 여러 YouTube 탭이 서로 덮어써 popup이 다른 탭의 진단을 보여 줄 수 있다.
- **수정 방향** (GUIDELINES 2.1-5 유지: 메시징 없이 storage만):
  1. 새 키 `sdrhdr.diagRequest`(숫자, 요청 시각 ms). `params.js`에 키와 구독 함수(요청 키 변경 시 콜백)를 추가한다. `browser.*` 접근은 params.js에만 둔다.
  2. popup은 **진단 영역(`#diag-section`)이 열려 있는 동안만** 요청을 쓴다: 열릴 때 1회, 열려 있는 동안 2초마다. 닫히거나 popup이 닫히면 요청이 멈춘다.
  3. content(main)는 2초 주기 `setInterval(writeDiagIfChanged)`를 **제거**한다. 요청 키가 바뀌면 `document.visibilityState === 'visible'`인 탭만 즉시 진단을 1회 만들어 쓴다(변경 비교 `lastDiagKey`는 유지해 같은 내용이면 생략). 숨긴 탭은 무시한다.
  4. `pollMode()`(플레이어 모드 이벤트 기록)는 진단 작성 시와 fullscreenchange 때만 호출된다(현행 이벤트 리스너 유지). 2초 주기 호출이 사라져 `mode:` 이벤트가 덜 세밀해지는 것은 수용한다.
  5. popup이 처음 열릴 때는 저장된 마지막 진단을 먼저 보여 주고(현행), 요청 응답이 오면 갱신한다. 보이는 YouTube 탭이 없으면 응답이 없으므로 진단 상자 위에 "보이는 YouTube 탭에서만 갱신됩니다" 한 줄을 고정 표시한다.
- **영향 범위**: `params.js`(키·구독), `main.js`(주기 제거, 요청 구독), `popup.html/js`(요청 쓰기·안내 문구). 스키마 변경 없음. `docs/install.md`·체크리스트의 "진단 JSON 복사" 안내에 "진단 영역을 펼치면 보이는 탭에서 갱신" 한 줄 추가.
- **검증**: 단위 테스트: (a) main은 시작 후 요청 없이 시간이 지나도 `writeDiag` 0회 (b) 요청 키 변경 시 보이는 탭은 1회 쓰고, `document.visibilityState === 'hidden'`이면 0회 (c) popup은 진단 영역이 닫혀 있으면 요청 0회, 열면 즉시 1회 + 타이머로 2초마다, 닫으면 중단. 사용자 Mac: 진단 영역을 펼쳐 JSON이 갱신되는지, 두 탭(하나는 백그라운드 재생)에서 보이는 탭의 URL이 표시되는지.

## T3. 숨긴 탭의 주기 작업 중단

- **원인**: 렌더 루프는 `document.hidden`이면 멈추지만 `probePoll`(0.5초)은 계속 돌아 30초마다 GPU 되읽기 측정을 하고, main의 HUD 1초 타이머도 계속 돈다.
- **수정 방향**: `probePoll`은 `document.hidden`이면 즉시 반환한다(가시 복귀 시 다음 poll에서 재개, `probeDue`는 그대로). `tickHud`도 `document.hidden`이면 반환한다. 타이머 자체는 유지한다(해제·재등록 로직을 늘리지 않는다).
- **영향 범위**: `renderer.js`, `main.js`.
- **검증**: 단위 테스트: `document.hidden = true`인 동안 poll이 측정을 시작하지 않고, false로 바뀐 뒤 다음 poll에서 측정한다. HUD stub `update` 호출 0회(hidden).

## T4. popup 진단 상자 갱신

- **원인**: `storage.onChanged`로 진단이 올 때마다 textarea 값을 통째로 바꾸고 Blob·object URL을 새로 만든다. 스크롤 위치가 맨 위로 돌아간다.
- **수정 방향**: (1) 진단 영역이 닫혀 있으면 textarea를 갱신하지 않고 최신 진단만 변수에 보관한다(열릴 때 반영). (2) 갱신 시 textarea의 `scrollTop`을 보존한다. (3) Blob·object URL은 "JSON 저장" 링크를 누를 때 만든다(이전 URL은 그때 해제).
- **영향 범위**: `popup.js`(+ 필요 시 popup.html 안내 문구 1줄).
- **검증**: popup 단위 테스트(가짜 DOM): 닫힌 상태에서 진단 변경 시 textarea 불변, 열면 반영, scrollTop 보존, Blob 생성은 저장 클릭 시 1회.

## TA. 같은 소스 프레임 재렌더 생략 (vf·copy 경로)

- **원인**: 렌더 루프는 rAF마다 그린다. ProMotion(120Hz)에서 60fps 영상은 같은 소스 프레임을 2회, 30fps는 4회, 24fps는 5회 그린다. 2160p ITM 1회 GPU 약 2.4 ms(G3)라 절반 이상이 같은 그림을 다시 그리는 데 쓰인다. PLAN D-M6 M6-5는 "프레임 변화 신호가 없다"는 이유로 보류했지만, vf 경로는 매 rAF에 만드는 `VideoFrame.timestamp`가 그 신호다(S2 cadence가 이미 이 값을 쓴다). copy 경로는 `updateCopyTexture`가 이미 `currentTime`이 같으면 복사를 생략한다.
- **수정 방향**:
  1. renderer에 "다시 그려야 함" 플래그(dirty)를 둔다. 켜는 조건: `setParams`, `setMode`, `restartSource`, 경로 변경(결정·한 단계 전환·vf→copy 폴백), `onWake`(play·seeked), 가시 복귀, 캔버스 백킹 크기(`canvas.width/height`)가 직전 렌더와 다름, GPU 초기화 직후 첫 렌더.
  2. **vf 경로**: `VideoFrame`을 만든 뒤 `frame.timestamp`가 숫자이고 직전에 실제로 그린 timestamp와 같으며 dirty가 아니면, 프레임을 즉시 닫고 import·렌더·submit을 하지 않는다. timestamp가 없으면(undefined) 항상 그린다.
  3. **copy 경로**: `updateCopyTexture`가 같은 프레임이라 복사를 생략했고 dirty가 아니면 렌더·submit도 생략한다.
  4. **ext 경로**: 신호가 없으므로 현행대로 매번 그린다.
  5. 생략한 tick도 **루프 통계는 기록**한다: `loopTs`·`srcTs`·`frameTimes`(JS 시간)를 현행처럼 push하고 `frames`는 실제 렌더만 센다. 이렇게 해야 `loopFps`·`displayMissRate`·cadence(S2)의 의미가 바뀌지 않는다. 생략 횟수 `sameFrameSkipped`를 getStats·진단에 추가한다(schemaVersion 11, `render.sameFrameSkipped`, 스키마·parse-result 갱신).
  6. 되돌리기 쉬운 형태: renderer 상단 이름 있는 상수 `SKIP_SAME_FRAME = true` 하나로 끄고 켤 수 있게 한다(사용자 노출 설정 아님, GUIDELINES 1-2 위반 아님).
- **전제 [미확인]**: WebGPU 캔버스는 해당 프레임에 `getCurrentTexture`를 부르지 않으면 직전에 표시한 내용을 유지한다(스펙상 새 텍스처를 present하지 않으면 표시가 바뀌지 않음). Safari 27.2에서 실제로 유지되는지(깜박임·검은 프레임 없음)는 사용자 Mac에서만 확인 가능하다. 깜박이면 `SKIP_SAME_FRAME = false`로 되돌리고 FIX_GUIDE에 기록한다.
- **영향 범위**: `renderer.js`, `hud.js`(진단 필드), 스키마, parse-result.
- **검증**: 단위 테스트(renderer stub): (a) vf 경로에서 같은 timestamp 두 tick → 두 번째는 import·submit 없음, frame.close 호출됨, loopTs는 2개, frames 1, sameFrameSkipped 1 (b) timestamp가 바뀌면 렌더 (c) dirty 조건 각각(setParams, 캔버스 크기 변경, onWake, 경로 전환) 후에는 같은 timestamp여도 렌더 (d) timestamp undefined면 항상 렌더 (e) copy 경로 같은 currentTime → 렌더 생략 (f) ext 경로는 항상 렌더 (g) `SKIP_SAME_FRAME=false` 동작은 소스 상수라 테스트하지 않는다. 사용자 Mac(ProMotion, 60fps·30fps SDR 영상, HUD 켬): 깜박임·검은 프레임 없음, HUD fps가 이전과 같은 수준(약 120), 진단 `sameFrameSkipped`가 60fps에서 약 절반·30fps에서 약 3/4, 끊김 육안 변화 없음. 가능하면 활성 상태 보기(Activity Monitor) GPU 탭의 Safari GPU 시간 전후 비교.

## T5. 정리

- (a) popup `bindDetail`의 범위 밖 입력 기본값이 `PRESETS.accurate`다 → `params.DEFAULT_CUSTOM`으로 바꾼다.
- (b) `content/tonecurve.js`는 테스트 전용 JS 미러인데 manifest `content_scripts`에 들어 있어 모든 YouTube 페이지에서 로드된다 → manifest 목록에서 뺀다(파일은 유지). 이 파일을 manifest로 로드하던 테스트(`extension-load`의 네임스페이스 키 목록, `extension-manifest`의 파일 순서, `extension-wgsl`의 계수 비교)는 `tonecurve.js`를 명시적으로 로드하도록 고친다. GUIDELINES 3-1의 "JS 미러는 `content/tonecurve.js`"는 유지하고 "런타임 미로드(테스트 전용)"를 덧붙인다(아래 GUIDELINES 개정).
- 검증: 기존 테스트 통과, manifest 테스트가 새 목록을 검사.

## T6. 수정하지 않는 항목 (사유)

- **T6 단일 측정 모드의 영상 중간 HDR 전환**: vf 경로는 단일 측정 회차에서도 `probeVf`가 `colorSpace`를 갱신하고, main `onProbe`가 매 회차 `probe.colorSpace`로 HDR을 검사하므로 이미 30초 안에 잡는다. ext 경로(H.264)만 못 잡지만, YouTube HDR은 VP9·AV1이고 소스 변경 시 전체 측정을 하므로 실사용 영향이 없다고 본다.
- **TB 창 크기 드래그 중 캔버스 재할당**: 드래그 동안에만 일시적이고 끝나면 안정된다. 디바운스는 위치 지연(오버레이 어긋남)을 만들어 수용한다.

## 버전·문서

- manifest `version` 1.0.0 → 1.0.1. 진단 schemaVersion 11(`render.sameFrameSkipped`).
- 체크리스트에 "T 회차 확인" 절(사용자 Mac): TA 깜박임·HUD fps·`sameFrameSkipped`, T2 진단 영역 갱신·두 탭, T1·T3은 단위 테스트로 갈음.
- STATUS.md에 회차 결과 기록.

## 이번 수정 범위 밖 (변경 금지)

- 곡선·프리셋·기본값·WGSL 수식, 경로 선택 규칙(choosePath·stepDownPath), 수명주기 상태 전이, DRM 가드, 오버레이 배치, HUD 표시 내용.

## 병렬 분할

- W-A(impl-worker): `renderer.js` T1·T3(probePoll 부분)·TA + `tests/unit/extension-renderer.test.js`.
- W-B(impl-worker): `popup/*` T2(popup 쪽)·T4·T5(a) + `tests/unit/extension-popup.test.js`.
- 본 세션(Sonnet): `params.js`(T2 키·구독, W-B 시작 전에 먼저 커밋해 W-B가 사용), `main.js` T2·T3(HUD), `hud.js`·스키마·parse-result(TA 진단), manifest(T5(b)·버전), 관련 테스트(load·manifest·wgsl·main), 체크리스트·install.md 문구, STATUS.
- 순서: 본 세션 params 먼저 → W-A·W-B 병렬 → 본 세션 나머지 통합 → lint·test·test:dom·pytest → PR.
