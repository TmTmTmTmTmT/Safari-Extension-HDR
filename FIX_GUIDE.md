# FIX_GUIDE.md — M2 VP9 복사 경로(P) + 프로브 지표(K1)

> 작성: Opus. 근거: 사용자 회신 frameProbe JSON(2026-09-30 13:47, ext 0 / copy 97.8 / c2d 145.0, 가드 detach 후 원본 정상 표시), `results/result-M1-20260930-probe-vp9-split-fullscreen.json`(프로브 VP9 오른쪽 출력 검정), 회신 "대부분 vp9, avc1 없음", "stripes: 프로브 밝기 중간 4, 조금 올리면 3", 확장 설명에 "`description` 매니페스트 엔트리가 없거나 비어 있습니다".
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: L1~L6, N1~N4(`36b880d`) 완료. N 회차 판정은 아래 "N5 판정"에 남긴다. K1은 미구현이며 그대로 둔다.

## 판정 요약

- **N5 판정: 표 1행(H-a).** ext≈0, copy>0, c2d>0이고 프로브의 same-origin·비MSE·main world VP9도 검다. 원인은 MSE나 isolated world가 아니라 **Safari 27.2 `importExternalTexture`의 VP9 결함**이다(PLAN.md A21). H.264는 0a에서 정상이었다.
- **G4: 통과(조건부).** 확장 컨텍스트 조건은 모두 충족(PLAN.md 게이트 판정 기록). 조건은 복사 경로(P2)가 YouTube VP9에서 영상을 그리고 G3c 비용 기준을 통과하는 것이다.
- YouTube 대부분이 VP9이므로 복사 경로는 선택이 아니라 기본 경로가 된다. H.264 강제(코덱 협상 조작)는 main world 주입이 필요하고 YouTube H.264는 1080p가 상한이라 2160p 목표와 충돌하므로 채택하지 않는다.
- 관찰 두 가지(원인 미확인, P3로 측정):
  - 회신 JSON의 `loopFps` 8.7(프레임 291개/약 33초)은 이전 1차(약 115)보다 크게 낮다. frameProbe 2회째가 33초에 실행돼 5초 주기와도 맞지 않는다. frameProbe(특히 4K `drawImage`·`copyExternalImageToTexture`·`mapAsync`)가 메인 스레드나 GPU 큐를 막았을 가능성이 있다.
  - 프로브 VP9 1080p60 run에서 video 자체 드롭 327/671. Safari의 VP9 디코드 부하가 클 수 있다.
- stripes: 확장 오버레이에서 1.25·1.5·2가 구분되고 한계 약 3, 프로브 밝기 중간에서 4(조금 밝히면 3). G2 기준(흰색 위 2단계 이상)과 같아 EDR 항목은 충족으로 본다. 회신의 "유튜브에선 stripes 해도 영상이 보임"은 가드가 이미 detach한 video에 재attach하지 않아서다(정상 동작). stripes 확인은 **모드를 stripes로 먼저 고른 뒤 새로고침**해야 한다.

---

## P1. manifest `description` 추가

- **원인**: Safari 확장 설정 화면에 "`description` 매니페스트 엔트리가 없거나 비어 있습니다" 표시.
- **수정 방향**: `extension/manifest.json`에 `description`(한 문장, 예: "DRM 없는 SDR 영상을 EDR로 확장 표시")을 추가하고 manifest 단위 테스트의 필수 키에 넣는다.
- **검증(1)**: `npm test`. (3) Safari 확장 설명에 문구 표시.

## P2. 비디오 입력 경로 선택과 복사 경로 (PLAN.md C절 "비디오 입력 경로")

- **수정 방향**:
  1. renderer에 입력 경로 상태 `path: 'ext' | 'copy'`를 둔다. attach 직후 첫 frameProbe 결과로 정한다: `isBlackOverlay`가 true(ext≈0, copy 또는 c2d ≥ 8)이고 `copy` ≥ 8이면 `copy`, 아니면 `ext`. 첫 frameProbe 전에는 렌더하지 않는다(캔버스를 숨겨 원본 video가 보이게 한다. `visibility:hidden` 등, 판정 후 표시).
  2. `copy` 경로: video 크기(`videoWidth×videoHeight`)의 `rgba8unorm` 텍스처(usage `TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT`, copyExternalImageToTexture 요구사항)를 만들고, 렌더할 때마다 `queue.copyExternalImageToTexture({source: video}, {texture}, [w, h])` 후 일반 `texture_2d<f32>` 샘플로 같은 ITM/identity 수식을 적용한다. 셰이더는 외부 텍스처용과 수식이 같아야 하며, 차이는 바인딩 타입과 샘플 함수뿐이다(수식 본문 공유, GUIDELINES 3.1). video 크기가 바뀌면(화질 변경) 텍스처를 다시 만든다.
  3. 같은 video 프레임 재복사 생략: 렌더 직전 `video.currentTime`(또는 `getVideoPlaybackQuality().totalVideoFrames`)이 직전 복사 때와 같으면 복사를 건너뛰고 이전 텍스처로 렌더한다. ProMotion에서 60fps 소스 복사를 절반으로 줄이는 목적이다.
  4. N2 가드는 유지하되 판정 대상을 "선택된 경로의 출력"으로 바꾼다: `copy` 경로에서 `copy`도 ≈0이고 c2d > 8이면 detach. 경로 전환은 attach당 1회(ext→copy)만 하고 반대 방향 전환은 하지 않는다.
  5. frameProbe는 경로 선택 후 30초마다로 늘린다(비용 절감). `stripes` 모드에서는 실행하지 않는다.
  6. diag에 `render.path`('ext'|'copy')를 추가한다(schemaVersion 3).
- **영향 범위**: `extension/content/renderer.js`, `itm.wgsl.js`(복사 경로용 셰이더 조립. 수식 본문은 probe/shaders.js와 동일 유지), `detect.js`(경로 선택 순수 함수 `choosePath(probe)`), `main.js`, `hud.js`, `docs/result-schema-m2.json`, `scripts/parse-result.py`, 테스트.
- **검증(1)**: `choosePath` 경계 테스트, WGSL 일관성 테스트 확장(두 셰이더의 수식 본문 동일), 스키마 v3, stub으로 복사 호출·텍스처 재생성·재복사 생략 조건. (3) P4.

## P3. 비용 측정 진단 (G3c 자료)

- **수정 방향**:
  1. diag `render`에 `displayMissRate`(K1과 같은 정의: 콜백 간격 > 1.5/displayHz를 놓친 갱신으로 셈, displayHz는 간격 중앙값으로 60/120 추정)와 `displayHz`, `copyMsP50`/`copyMsP95`(복사 호출의 JS 동기 시간), `copySkipped`(재복사 생략 횟수), `videoDropped`/`videoTotal`(`getVideoPlaybackQuality`)을 추가한다. `displayMissRate` 계산은 순수 함수로 두고 K1 구현 시 프로브와 공유할 수 있게 한다(지금은 extension 쪽에만 둔다. probe 파일은 수정하지 않는다).
  2. frameProbe 1회에 걸린 시간 `frameProbe.ms`(시작~모든 경로 완료)와 경로별 동기 시간을 기록한다. `loopFps` 8.7 관찰의 원인 확인용이다.
- **영향 범위**: `renderer.js`, `hud.js`, 스키마, parse-result, 테스트.
- **검증(1)**: `displayMissRate` 단위 테스트(FIX_GUIDE K1 검증 사례와 같은 입력: 60Hz 규칙 ±2 ms → 0, 120Hz → 0, 60Hz 33 ms 공백 1회 → 1/600, displayHz 추정).

## P4. 사용자 Mac 확인 절차 (docs/manual-checklist.md 0b 절 갱신)

1. `git pull` → Xcode Run → Safari 재시작 후 "서명되지 않은 확장 허용" 재확인.
2. 전원 연결, 밝기 중간, 창 모드. YouTube VP9 영상(같은 영상)을 **2160p60**으로 재생, 모드 `itm`. 영상이 보이는지, 원본보다 하이라이트가 밝아 보이는지 한 줄. 30초 재생 후 popup JSON → `results/result-M2-<날짜>-ac-mid-2160p60-itm-copy-window.json`.
3. 같은 영상 전체화면 30초 → JSON(`…-fullscreen.json`). 끊김 육안(없음/가끔/자주).
4. 화질 1080p60으로 바꾸고 페이지 새로고침 → 전체화면 30초 → JSON. 끊김 육안.
5. 비교 기준: 확장을 popup에서 끈 상태로 같은 영상 2160p60 전체화면 30초 → Stats for nerds의 "dropped of" 숫자 기록.
6. 60Hz: 시스템 설정 → 디스플레이 → 주사율 60Hz로 바꾸고 3번만 반복.
7. stripes: popup에서 모드를 `stripes`로 **먼저** 바꾼 뒤 페이지 새로고침 → 밝기 중간 30초 대기 → 왼쪽부터 구분되는 마지막 줄 번호.

---

## N5 판정 (기록)

- 결과: YouTube frameProbe ext 0 / copy 97.8 / c2d 145.0(예외 없음), 프로브 VP9 오른쪽 출력 검정 → 표 1행(H-a). 가드는 2회 연속 후 detach해 원본이 정상 표시됨(N2 동작 확인, (3)).

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

## 이번 수정 범위 밖 (변경 금지, P·K 공통)

- ITM 수식, 프리셋 수치(M4).
- K1은 `probe/` 지표 전용이며 M2 브랜치에 섞지 않는다. N3의 프로브 변경은 픽스처 목록 추가만이다.
- Canvas2D 중간 단계, main world 주입, 코덱 협상 조작(H.264 강제)은 구현 금지.
- ITM 수식·프리셋 수치(M4), 캔버스 설정 고정값(GUIDELINES 2.5-3).
- 커밋된 `xcode/`의 수기 편집·형식 변환(GUIDELINES 7-5).

## 병렬 분할 (P 회차)

- P1~P3는 모두 `renderer.js`·`hud.js`·스키마를 건드려 파일이 겹친다. impl-worker 1개(또는 본 세션)가 순서대로 한다: P1 → P3(측정 필드) → P2.
- P4 체크리스트 문구는 같은 작업자가 마지막에 반영한다.

## 병렬 분할 (K1)

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
