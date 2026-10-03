# FIX_GUIDE.md — 설정 초기화·메모리 증가 (U 회차)

> 작성: Opus (2026-10-03). 근거: 사용자 보고(2026-10-03), STATUS.md "조사: 메모리 증가·재부팅 후 설정 초기화"(Sonnet 코드 읽기), `extension/content/{renderer,main,params,background}.js`, `extension/popup/popup.js`, `xcode/SDRHDR/SDRHDR Extension/SafariWebExtensionHandler.swift`.
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차(T 포함)는 git 이력에 있다. T 회차 판정 보류 항목(TA 깜박임, T2 popup)은 체크리스트 "T 회차 확인" 절로 계속 받는다.
> 브랜치: `claude/m8-plan`의 PR #14가 머지된 뒤 새 브랜치 `claude/u-fixes`(base는 PR #14가 머지된 브랜치). 버전 1.2.0 → 1.2.1.

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
