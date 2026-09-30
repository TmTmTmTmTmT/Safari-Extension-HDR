# FIX_GUIDE.md — M2 VP9 입력 경로 비용(Q) + 프로브 지표(K1)

> 작성: Opus. 근거: `results/result-M2-20260930-ac-mid-{2160p,1440p}-identity-copy-window.json`, 사용자 회신("영상이 검정색으로 나오다 30초 정도 후부터 제대로 뜸", "stripes는 왼쪽부터 6번째 칸부터 동일").
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: L1~L6, N1~N4, P1~P4(`1aed49a`) 완료. P 회차의 "Opus 확인 필요" 5건은 아래 "P 회차 보류 항목 판정"에서 처리한다. K1은 미구현이며 아래에 그대로 둔다(스키마 번호만 개정).

## 판정 요약

- **복사 경로는 동작한다.** 2160p·1440p VP9에서 path `copy`, 오버레이에 영상 표시, video 자체 드롭 0. G4의 "영상 표시" 조건은 충족.
- **시작 약 30초 검정은 결함(Q1).** 첫 frameProbe가 video가 아직 어두울 때(또는 첫 프레임 디코드 전) 실행돼 copy·c2d가 모두 8 미만 → `choosePath`가 `ext`를 고름 → 30초 뒤 다음 frameProbe에서야 `copy`로 전환. JSON의 `at` 34633·31557, `n` 2가 이와 맞는다.
- **G3c 불통과(2160p).** 복사 호출 JS 동기 시간 p50 13 ms / p95 14 ms로 기준 4 ms를 크게 넘고, 60Hz 창 모드에서 갱신 누락 5.6%(loopFps 50.6). 1440p도 p95 12.8 ms. 복사 방식 그대로는 2160p60 목표를 못 맞춘다(PLAN.md A22).
- 1440p JSON의 누락률 66%·loopFps 20은 export 시 일시정지(`paused: true`)라 일시정지 공백이 섞인 값이다. P 회차 보류 (a)를 Q2로 고친다.
- **EDR 항목 확정.** stripes 1~5번째 줄(1.0/1.25/1.5/2/3) 구분, 6번째(4.0)부터 동일 → 한계 3 = 밝기 중간 G2.
- 다음 단계: VP9에서 더 싼 입력 방식을 프로브 실험(Q3)으로 찾는다. 후보가 없으면 제품 결정(Q5)을 사용자에게 묻는다.

## P 회차 보류 항목 판정

| 항목                                            | 판정                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| (a) displayMissRate에 일시정지·비가시 공백 포함 | 결함. Q2로 수정                                                                                                                                                    |
| (b) 재복사 생략이 currentTime만 사용            | 승인. 60Hz 2160p에서 copySkipped 109/2655로 작동은 함. Q3 결과로 방식이 바뀌면 재검토                                                                              |
| (c) 복사 경로 가드 임계 `c2d >= 8`              | 승인(기존 BLACK_REF_MIN과 일치가 맞음)                                                                                                                             |
| (d) 복사 파이프라인 lazy 생성                   | 승인(경로 결정 전에는 어느 파이프라인이 필요한지 모름)                                                                                                             |
| (e) displayMissRate가 hud.js에 있음             | Q3에서 probe-core에 같은 정의의 함수를 둔다. 두 구현이 같은 테스트 사례를 통과하면 중복을 허용한다(extension과 probe는 로드 방식이 달라 공유 파일을 만들지 않는다) |

---

## Q1. 경로 결정 보류 상태 (시작 30초 검정 수정)

- **원인**: 위 판정 요약. 기준 경로(c2d·copy)가 어두우면 ext 검정 여부를 판단할 수 없는데 `choosePath`가 `ext`로 확정한다.
- **수정 방향**:
  1. `choosePath(probe)`의 결과에 `'pending'`을 추가한다. c2d와 copy가 모두 8 미만이거나 값이 없으면(예외) `'pending'`. ext ≥ 2이고 기준 경로 중 하나 ≥ 8이면 `'ext'`. ext < 2이고 copy ≥ 8이면 `'copy'`. ext < 2이고 copy < 8, c2d ≥ 8이면 `'none'`(N2 가드와 같은 결과: detach).
  2. `'pending'` 동안은 캔버스를 숨긴 채(원본 video 표시) 1초마다 frameProbe를 다시 한다(재생 중일 때만). 60회(약 1분) 넘게 pending이면 더 시도하지 않고 숨긴 상태로 두며 diag `render.path = 'pending'`, errors에 `PathUndecided` 1회 기록.
  3. 한 번 `ext`나 `copy`로 결정된 뒤의 규칙(ext→copy 1회 전환, 30초 주기)은 그대로 둔다.
- **영향 범위**: `detect.js`, `renderer.js`, `main.js`, 스키마(`render.path` enum에 `pending`), 테스트.
- **검증(1)**: `choosePath` 경계 표 테스트(각 분기), pending 반복·60회 상한 stub 테스트.

## Q2. 측정 창에서 일시정지·비가시 공백 제외

- **수정 방향**: 루프 타임스탬프 링 버퍼에서 연속 콜백 간격이 500 ms를 넘으면 그 간격은 측정 창의 끊김으로 보고 누락 수와 분모(측정 시간) 모두에서 뺀다. `loopFps`도 같은 규칙. 추가로 `play`·`seeked`·가시 복귀 때 링 버퍼(타임스탬프, JS 시간, 복사 시간)를 비운다. `displayHz` 추정은 그대로(중앙값).
- **영향 범위**: `hud.js`(순수 함수), `renderer.js`, 테스트.
- **검증(1)**: 60Hz 규칙 시퀀스 중간에 2초 공백 1회 → 누락 0, 60Hz에 33 ms 공백 1회 → 1/600 유지.

## Q3. 프로브 P0-6: VP9 입력 방식 비용 실험

- **목표**: 2160p VP9에서 JS 동기 시간 p95 < 4 ms이고 출력이 검지 않은 입력 방식을 찾는다.
- **픽스처**: `fixtures/ramp-2160p60.webm`(VP9, 기존 `ramp-2160p60.mp4`를 재인코딩, `-row-mt 1`과 빠른 speed 사용, 12초, bt709). 크기가 2 MB를 넘으면 STATUS.md에 기록. `check-fixtures.sh`에 추가. G3 일괄 측정 목록에는 넣지 않는다.
- **변형**(각각 같은 렌더: 캔버스 = min(원본, 전체화면×DPR), identity 셰이더):
  - V-ext: `importExternalTexture({source: video})`(대조군, VP9는 검정 예상)
  - V-copy8: `copyExternalImageToTexture` → `rgba8unorm`(현 확장 방식)
  - V-copyB: 같은 복사 → `bgra8unorm`
  - V-bmp: `await createImageBitmap(video)` → `copyExternalImageToTexture({source: bitmap})` → `bitmap.close()`
  - V-bmpR: `createImageBitmap(video, {resizeWidth: 캔버스 폭, resizeHeight: 캔버스 높이})` → 복사
  - V-vf: `new VideoFrame(video)` → `importExternalTexture({source: frame})` → 렌더 후 `frame.close()`(WebCodecs 경로)
  - 비동기 변형(bmp, bmpR)은 이전 프레임의 결과 텍스처로 렌더하고 새 비트맵이 준비되면 교체한다(렌더 루프를 기다리게 하지 않음). 준비 지연 p50을 따로 잰다.
- **측정**(변형마다 전체화면 8초, 앞 1초 제외): JS 동기 시간 p50/p95/max, 비동기 준비 지연 p50/p95(해당 시), `displayMissRate`(Q2와 같은 정의, probe-core 순수 함수), loopFps, 출력 평균 밝기(64×36 되읽기 1회, 마지막 프레임), video 드롭(`getVideoPlaybackQuality` 차이), 예외 name. 변형이 지원되지 않으면(예외) 건너뛰고 기록.
- **실행 대상**: `ramp-2160p60.webm`, `ramp-1080p60.webm`, 대조로 `ramp-2160p60.mp4`(H.264)에서 V-ext와 V-copy8만.
- **UI**: P0-4 아래 "P0-6 VP9 입력 방식" 절에 "일괄 측정" 버튼 1개(전체화면 진입 후 자동 실행, 진행 표시 최소). 결과 표를 페이지에 출력.
- **스키마**: 결과 JSON에 `vp9Paths: [{fixture, variant, ...위 측정값}]` 추가, **schemaVersion 5**. `parse-result.py`에 표 추가(판정 없음). K1은 schemaVersion 6으로 번호만 미룬다.
- **영향 범위**: `probe/`(probe.js, probe-core.js, index.html, shaders.js는 copy 샘플용 셰이더 추가만), `fixtures/ramp-2160p60.webm`, `scripts/make-fixtures.sh`, `scripts/check-fixtures.sh`, `docs/result-schema.json`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`, `sim/test_parse_result.py`.
- **검증(1)**: 순수 함수 테스트, check-fixtures, parse-result(v1~v5). (3) Q4.

## Q4. 사용자 Mac 절차 (docs/manual-checklist.md에 추가)

1. `git pull` → 확장은 Xcode Run 재실행(Q1·Q2 반영 확인용).
2. 확장: YouTube 같은 영상 2160p60, 창 모드, 재생 시작 직후 검은 화면 없이 원본 → 오버레이로 바뀌는지(몇 초 걸리는지) 한 줄. 재생 중 30초 후 **일시정지하지 말고** popup JSON 복사.
3. 프로브: 전원 연결, 밝기 중간, 새로고침 → P0-6 "일괄 측정" → 끝나면 JSON export. ProMotion과 60Hz 각 1회.

## Q5. 제품 결정 대기 (Q3 결과 후 Opus가 사용자에게 묻는다. 구현 대상 아님)

- Q3에서 2160p 기준을 통과하는 변형이 있으면 확장 복사 경로를 그 방식으로 바꾼다(다음 FIX_GUIDE).
- 없으면 선택지(사용자 결정):
  1. VP9는 해상도 상한을 두고(복사 비용이 기준 안인 해상도까지만) 그 이상은 no-op.
  2. main world에서 코덱 협상을 조작해 H.264(최대 1080p, 외부 텍스처 경로)를 받게 함. PLAN.md B절·C절 개정 필요.
  3. F-A(네이티브 헬퍼) 착수.

---

## K1. G3 지표를 3차 개정 정의로 교체

- **원인**: 프로브의 `missRate`는 소스 프레임 슬롯 기준(2차 개정 정의)이다. 구동 루프 주기와 소스 fps가 같은 60Hz에서는 rAF 위상 지터만으로 한 슬롯에 2회, 다음 슬롯 0회가 생겨 거짓 누락이 잡힌다. 4차 60Hz 파일에서 캔버스 없는 R0가 콜백 601/600인데 `missRate` 5.67%, R2 7.5%, R3 0%로 작업과 무관하게 흔들렸다. 구현 작업자가 J 회차에서 미리 보고한 문제와 같다.
- **수정 방향**:
  1. 순수 함수 `displayMissRate(loopTimes, windowStart, windowEnd, displayHz)`를 `probe-core.js`에 둔다. 측정 창에서 연속 콜백 간격이 `1.5 / displayHz`를 넘으면 `round(간격 × displayHz) − 1`개 갱신을 놓친 것으로 센다. 결과 = 놓친 갱신 수 / (측정 창 초 × displayHz).
  2. `displayHz`는 측정 창의 콜백 간격 중앙값에서 추정해 60 또는 120 중 가까운 값으로 반올림한다. 추정값을 run에 `displayHz`로 기록한다. 사용자가 고른 `env.refreshRate`는 참고로만 두고, 둘이 다르면 페이지에 "주사율 선택값과 측정값이 다름" 경고를 표시한다(4차에서 표기가 뒤바뀐 문제 방지).
  3. run에 `displayMissRate`, `displayHz`를 추가한다. 기존 `missRate`(슬롯 기반)는 이름을 바꾸지 말고 보조로 남긴다.
  4. `perf.g3`의 `baselineMiss`/`itmMiss`/`delta`를 `displayMissRate` 기준으로 바꾸고, `rvfcMiss`는 기존 그대로 둔다. `perf.g3`에 `displayHz`를 추가한다. schemaVersion 6(Q3가 5를 씀).
  5. `scripts/parse-result.py`: 모드별 표와 G3 요약에 `displayMissRate`, `displayHz` 열을 추가한다. v1~v4 파일 11건 오류 없이 처리한다. 판정은 출력하지 않는다.
- **영향 범위**: `probe/probe-core.js`, `probe/probe.js`, `docs/result-schema.json`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`.
- **검증(1)**: 단위 테스트. 60Hz 규칙 시퀀스(±2 ms 지터 포함) → 0, 120Hz → 0, 60Hz에서 33 ms 공백 1회 → 1/600, displayHz 추정(16.7 ms → 60, 8.3 ms → 120). `results/` 11건 parse-result 오류 없음.
- **검증(3)**: 필요 없음. 다음 Safari 업데이트 때 회귀 확인용으로 쓴다.

---

## 이번 수정 범위 밖 (변경 금지, Q·K 공통)

- ITM 수식, 프리셋 수치(M4).
- K1은 `probe/` 지표 전용이며 M2 브랜치에 섞지 않는다. N3의 프로브 변경은 픽스처 목록 추가만이다.
- Canvas2D 중간 단계, main world 주입, 코덱 협상 조작(H.264 강제)은 구현 금지.
- ITM 수식·프리셋 수치(M4), 캔버스 설정 고정값(GUIDELINES 2.5-3).
- 커밋된 `xcode/`의 수기 편집·형식 변환(GUIDELINES 7-5).

## 병렬 분할 (Q 회차)

- W-A: Q1 + Q2 (`extension/`, 스키마 m2, 테스트, 체크리스트 Q4-1·2 문구).
- W-B: Q3 (`probe/`, 픽스처, `docs/result-schema.json`, parse-result, probe 테스트, 체크리스트 Q4-3 문구). 2160p VP9 인코딩은 sim-runner로 돌려도 된다.
- `docs/manual-checklist.md`와 `scripts/parse-result.py`가 겹친다. 체크리스트는 W-A가 0b 절, W-B가 0a 절 아래 새 절로 나눠 쓰고, parse-result는 W-B만 수정한다(W-A는 m2 스키마 enum 변경만이며 parse-result 변경이 필요 없게 한다).

## 병렬 분할 (K1)

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
