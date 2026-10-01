# FIX_GUIDE.md — M2 VideoFrame 입력 경로(R) + 프로브 지표(K1)

> 작성: Opus. 근거: `results/result-M1-20261001-ac-mid-{promotion,60hz}-p06.json`(P0-6), `results/result-M2-20261001-ac-mid-yt-vp9-identity-none.json`(확장, 새 영상 3840×1920 VP9), 사용자 회신 "검은화면 아예 없음".
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: L·N·P·Q 회차 완료(`830da17`). Q5(제품 결정)는 아래 판정으로 불필요해졌다. K1은 미구현이며 그대로 둔다.

## 판정 요약

- **P0-6 결과: `vf`(`new VideoFrame(video)` → `importExternalTexture`)가 유일하게 기준을 통과한다(PLAN.md A23).** 2160p VP9에서 JS p95 2 ms, 디스플레이 갱신 누락 0.2%, 출력 평균 128(비검정). video 직접 import는 검정(A21), `copyExternalImageToTexture`는 p95 14~21 ms(A22), `createImageBitmap`은 비동기 준비 40 ms로 모두 탈락.
- **제품 결정(Q5)은 필요 없다.** 해상도 상한·H.264 강제·F-A 없이 2160p VP9를 처리할 경로가 있다.
- 60Hz 표기 파일은 H.264 대조군(V-ext)까지 모든 변형이 loopFps 30·누락 50%다. 변형과 무관한 환경 문제(rAF가 30Hz로 구동)로 보고 판정에서 제외한다. 저전력 모드 등 원인 후보를 R5에서 확인한다.
- **확장 결과(새 영상 MR_53SGVXXc)**: 첫 frameProbe(1.4초)에서 ext 0, copy 0, c2d 138 → Q1 규칙상 `none` → 즉시 detach. "검은 화면 없음"은 오버레이가 붙지 않아 원본만 보인 것이다(ITM 미적용). copy가 0으로 나온 원인은 미확인(초기 프레임에서 복사 실패 가능). 한 번의 결과로 영구 detach하는 Q1의 `none` 처리는 너무 엄격하므로 R2에서 고친다.

---

## R0. CI 수정: parse-result 테스트의 결과 파일 가정 (먼저 처리)

- **원인**: `sim/test_parse_result.py::test_v1_to_v4_have_no_vp9_paths_section`이 `results/result-M1-*.json` 전부를 v1~v4로 가정한다. 사용자 회신 P0-6 결과(`result-M1-20261001-*-p06.json`, schemaVersion 5)를 `results/`에 넣자 실패했다(`75aa21a` CI ubuntu).
- **수정 방향**: 이 테스트는 파일을 읽어 `schemaVersion < 5`인 것만 넘기도록 한다. 테스트 의도(v1~v4에는 P0-6 절이 없다)는 그대로 유지한다. 결과 파일은 옮기거나 지우지 않는다.
- **검증(1)**: `python3 -m pytest sim` 전부 통과, CI ubuntu green.

## R1. frameProbe에 `vf` 경로 추가

- **수정 방향**: frameProbe에 네 번째 경로 `vf`를 추가한다. `new VideoFrame(video)` → `importExternalTexture({source: frame})` → 기존 ext 진단용 64×36 rgba8unorm 렌더·되읽기 → submit 후 `frame.close()`. 평균 `vf`, 예외 `vfErr`(name), 동기 시간 `vfSyncMs`를 기록한다. `VideoFrame`이 content script에서 정의되지 않으면 `vfErr: 'ReferenceError'`로 기록한다(isolated world 지원 여부 확인용).
- **영향 범위**: `renderer.js`, `hud.js`(normalizeFrameProbe), 스키마 m2, `scripts/parse-result.py`(M2 v4 열), 테스트.

## R2. 경로 선택 순서와 detach 조건 개정

- **수정 방향**:
  1. `choosePath(probe)` 반환값: `'pending' | 'ext' | 'vf' | 'copy' | 'none'`. 기준(c2d)이 8 미만이거나 값 없음 → `pending`. 그 외에는 `ext ≥ 2` → `ext`, 아니면 `vf ≥ 2` → `vf`, 아니면 `copy ≥ 8` → `copy`, 모두 아니면 `none`.
  2. `none`은 즉시 detach하지 않는다. `pending`과 같이 1초 후 다시 frameProbe를 하고, `none`이 **2회 연속**일 때만 detach한다(N2와 같은 기준). 다른 결과가 나오면 연속 카운트를 0으로.
  3. pending 60회 상한, 결정 후 30초 주기 frameProbe는 유지. 결정 후 전환은 "선택된 경로가 검게 나오고 순서상 다음 경로가 밝을 때" 한 단계 아래로만 1회 허용(ext→vf, vf→copy). 위로는 가지 않는다.
- **영향 범위**: `detect.js`, `renderer.js`, `main.js`, 테스트(경계 표 갱신: Q1 표 + vf 분기 + none 2회 연속).

## R3. 렌더 루프 `vf` 경로

- **수정 방향**: `vf` 경로에서는 렌더마다 `const frame = new VideoFrame(video)` → `device.importExternalTexture({source: frame})` → 외부 텍스처용 기존 파이프라인(ITM/identity, 수식 변경 없음)으로 렌더 → `queue.submit` 후 `frame.close()`. 예외 시 frame을 닫고 R2의 다음 경로로 1회 전환한다. 프레임 생성 실패가 연속 3회면 errors에 기록한다. 같은 프레임 재생성 생략은 하지 않는다(비용이 작음, 필요하면 M6).
- 진단: `render.path`에 `vf` 추가, `vfMsP50/P95`(VideoFrame 생성+import 동기 시간) 추가. 진단 schemaVersion 4.
- **영향 범위**: `renderer.js`, `hud.js`, 스키마 m2, parse-result, 테스트(stub: frame.close 호출 보장—정상·예외 경로 모두).

## R4. 사용자 Mac 절차 (docs/manual-checklist.md 0b 절 갱신)

1. `git pull` → Xcode Run → Safari 재시작, 서명되지 않은 확장 허용.
2. 전원 연결, 밝기 중간, **저전력 모드 끔**(시스템 설정 → 배터리). ProMotion.
3. 영상 2개(vF5oXa1cVEg, MR_53SGVXXc)에서 각각 2160p60, 모드 `itm`, 창 모드 30초 → popup JSON(일시정지하지 말 것). 오버레이가 뜨기까지 걸린 시간, 하이라이트가 원본보다 밝아 보이는지 한 줄.
4. 같은 영상 전체화면 30초 → JSON, 끊김 육안.
5. 화질 1080p60으로 새로고침 → 전체화면 30초 → JSON.
6. 시스템 설정 → 디스플레이 → 60Hz로 바꾸고 4번 반복. 이때 프로브 P0-6 일괄 측정도 1회 다시 하고 JSON export(60Hz 재측정, 루프 30Hz 현상 확인용).
7. 비교: 확장 off로 같은 영상 2160p60 전체화면 30초, Stats for nerds의 "dropped of".

## R5. 60Hz 루프 30Hz 현상 기록 (구현 대상 아님)

- R4-6 재측정에서도 H.264 V-ext loopFps가 30이면 STATUS.md에 기록하고 Opus로 반환한다. 이 경우 G3c 60Hz 항목 판정 방법을 다시 정한다.

---

## Q 회차 보류 항목 판정 (기록)

| 항목                                  | 판정                                               |
| ------------------------------------- | -------------------------------------------------- |
| (a) P0-6 측정 8초(앞 1초 제외 후 8초) | 승인                                               |
| (b) P0-6 JS 시간은 rAF 콜백 전체      | 승인. 판정에는 이쪽이 더 적합(구동 루프 비용 전체) |
| (c) 밝기 되읽기는 별도 64×36 재렌더   | 승인(입력 경로가 검은지만 보면 됨)                 |
| (d) 예외 변형은 수치 null + errorName | 승인                                               |
| (e) 결정 후 pending/none은 경로 불변  | R2-3으로 대체                                      |
| (f) K1 미구현, schemaVersion 6        | 유지                                               |

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

## 이번 수정 범위 밖 (변경 금지, R·K 공통)

- ITM 수식, 프리셋 수치(M4).
- K1은 `probe/` 지표 전용이며 M2 브랜치에 섞지 않는다. N3의 프로브 변경은 픽스처 목록 추가만이다.
- Canvas2D 중간 단계, main world 주입, 코덱 협상 조작(H.264 강제)은 구현 금지.
- 프로브(`probe/`)는 이번 회차에 수정하지 않는다.
- ITM 수식·프리셋 수치(M4), 캔버스 설정 고정값(GUIDELINES 2.5-3).
- 커밋된 `xcode/`의 수기 편집·형식 변환(GUIDELINES 7-5).

## 병렬 분할 (R 회차)

- R1~R3는 모두 `renderer.js`·`detect.js`·`hud.js`·스키마를 건드린다. R0(CI 수정, 테스트 1개)는 본 세션이 먼저 처리해 push한다. 이후 impl-worker 1개가 R1 → R2 → R3 → R4(체크리스트) 순서로 한다.

## 병렬 분할 (K1)

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
