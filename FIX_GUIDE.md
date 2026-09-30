# FIX_GUIDE.md — M1 0a 1차 회신 후 프로브 측정 수정

> 작성: Opus. 근거: `results/result-M1-20260930-battery-max-fullscreen.json`, PLAN.md B절 G3 기준, 게이트 판정 기록(2026-09-30).
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).

## 요약

G1 통과, G2 잠정 통과, G3 판정 불가. G3 판정 불가 원인은 두 가지다.

1. 측정 조건 미충족: 배터리 상태, 모든 run이 창 모드(`fullscreen:false`, 캔버스 1000×563).
2. 측정 방법 결함: 픽스처 길이 3초라 run이 3초에 끝나고 기동 구간이 지배한다. 드롭률이 run마다 1~30%로 흩어지고, identity가 ITM보다 나쁜 경우가 있다. 셰이더 비용이 아니라 측정 잡음이다(JS p95 ≤ 2 ms, GPU 0.11~0.16 ms).

아래 F1~F5를 적용하고 사용자에게 조건 A 재측정을 요청한다.

---

## F1. 픽스처 길이 부족

- **원인**: `scripts/make-fixtures.sh`의 `DUR=3`. 프로브는 `RUN_MAX_SEC=10`이지만 `ended`에서 먼저 끝난다. 3초 중 첫 구간(디코더 기동, 첫 rVFC 전 프레임, 캔버스 초기 configure)이 드롭률을 부풀린다. 정지 영상이라 연속 프레임이 동일해 프레임 누락을 눈으로 확인할 수도 없다.
- **수정 방향**:
  - 픽스처 길이를 12초로 늘린다. 합계 크기 20MB 이하를 유지한다(정지 패턴이라 여유 있음).
  - 램프·컬러바의 측정 패치 영역 밖(우하단 모서리)에 프레임마다 위치가 바뀌는 작은 박스를 넣는다. 모든 프레임이 서로 다르게 되어 identity 좌우 비교에서 프레임 동기와 누락을 눈으로 확인할 수 있다. 램프 계단 패치와 컬러바 색 영역은 가리지 않는다.
  - `scripts/check-fixtures.sh`의 길이 기준을 11~13초로 바꾼다.
- **영향 범위**: `scripts/make-fixtures.sh`, `scripts/check-fixtures.sh`, `fixtures/*.mp4`, `docs/manual-checklist.md`(측정 시간 안내).
- **검증**: check-fixtures 4/4 PASS(길이 포함), 합계 크기 기록. ffprobe로 인접 두 프레임 해시가 다름을 1회 확인(sim-runner 위임 가능). → (1) 클라우드.

## F2. G3 드롭률 지표 정의 (Opus 결정)

- **결정**: G3 판정 지표는 **정상 구간의 rVFC 콜백 기반 드롭률**이다. 오버레이 캔버스는 rVFC 콜백마다 한 번 갱신되므로, 콜백이 빠진 프레임이 곧 오버레이가 놓친 프레임이다. `presentedFrames` 기반 값은 video 레이어 자체의 누락을 보는 보조 지표로 유지하되 판정에 쓰지 않는다.
- **원인(현재 결함)**: 드롭률을 run 전체(기동 구간 포함)로 계산한다.
- **수정 방향**:
  - 측정 창은 첫 rVFC 콜백 후 1.0초(워밍업)를 제외한 구간, 최대 10초로 한다.
  - 기대 프레임 수 = 측정 창의 `mediaTime` 구간 × 소스 fps. 드롭률 = (기대 − 측정 창 콜백 수) / 기대. 이는 현재 `computeDropRate` 식과 같고 구간만 바뀐다.
  - JS p50/p95/max, GPU 시간도 같은 측정 창으로 집계한다.
  - 결과 JSON run에 `warmupSec`, `windowSec`을 추가한다. `docs/result-schema.json`을 함께 갱신한다.
- **영향 범위**: `probe/probe-core.js`, `probe/probe.js`, `docs/result-schema.json`, `tests/unit/probe-core.test.js`.
- **검증**: 워밍업 제외 로직 단위 테스트(콜백 시각·mediaTime 시퀀스 입력 → 기대 드롭률). → (1) 클라우드.

## F3. 전체화면 측정이 기록되지 않음

- **원인**: P0-5의 창 모드는 사용자 선택값(`env.windowMode: fullscreen`)인데, 실제 run은 모두 창에서 실행됐다(`runs[].fullscreen:false`). `r` 키 경로가 발견되기 어렵고, 선택값과 실제 상태가 달라도 경고가 없다.
- **수정 방향**:
  - 픽스처별로 "전체화면 측정" 버튼을 둔다. 클릭 처리기 안에서 비교 영역을 전체화면으로 요청하고(사용자 제스처 요건 충족), `fullscreenchange` 후 run을 자동 시작한다. run이 끝나면 전체화면을 자동 해제한다.
  - `env.windowMode`는 사용자 선택이 아니라 run의 실제 전체화면 상태에서 파생한다. P0-5의 창 모드 선택 UI는 제거한다.
  - export 시 G3 조건(전원 연결 + 전체화면)을 만족하는 run이 없으면 페이지에 경고를 표시한다(JSON export는 막지 않음).
- **영향 범위**: `probe/index.html`, `probe/probe.js`, `docs/manual-checklist.md`(P0-4 절차 단순화).
- **검증**: Playwright WebKit에서 버튼 존재·클릭 시 전체화면 요청 호출만 확인 가능(선택). 실제 동작은 (3) 사용자 Mac.

## F4. 대표 perf 값이 마지막 run

- **원인**: `perf` 최상위 값이 마지막 run 하나다. 판정에 쓸 수 없다.
- **수정 방향**:
  - `perf` 최상위에 G3 대상 run(전원 연결 + 전체화면)만 모아 소스 해상도별 최악값(드롭률 최대, JS p95 최대)을 둔다. 대상 run이 없으면 `null`.
  - `scripts/parse-result.py`는 run별 표에 "G3 대상" 열을 추가하고, 대상 run만 모은 요약 표를 따로 출력한다. 판정은 출력하지 않는다(값만).
- **영향 범위**: `probe/probe-core.js`, `docs/result-schema.json`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`.
- **검증**: 단위 테스트, 이번 회신 JSON으로 parse-result 실행 시 "G3 대상 run 없음" 출력. → (1) 클라우드.

## F5. S7 예산 모델에 실제 화면 설정 반영

- **원인**: S7은 16" 패널 네이티브(3456×2234)를 기준으로 했다. 실제 설정은 스케일 1800×1169 @ DPR 2, 백킹 3600×2338이다.
- **수정 방향**: `sim/budget.py` 표에 "XDR 16 스케일 1800×1169" 행(16:9 캔버스 3600×2025)을 추가한다. 기존 행은 유지한다.
- **영향 범위**: `sim/budget.py`, `sim/test_budget.py`.
- **검증**: `pytest sim` 통과. → (1) 클라우드.

---

## 이번 수정 범위 밖 (변경 금지)

- `probe/shaders.js`의 ITM 수식과 프리셋 수치. M4에서 Opus가 정한다.
- 기존 `videoQuality` 필드는 이번 회신에서 total 0/1로 의미가 없었다. 이번에는 제거하지 말고 그대로 둔다(판정에 안 씀).

## 사용자 재측정 요청 (F1~F4 적용·push 후)

- **조건 A(필수)**: 전원 연결, SDR 밝기 중간, P0-4 픽스처 4개 × identity/ITM을 "전체화면 측정" 버튼으로. P0-2·P0-3도 같은 조건에서 1회.
- **조건 B, C(G2 확정용)**: 전원 연결, SDR 밝기 낮음 / 중간에서 P0-2만. 이번 회신이 밝기 최대(헤드룸 최소)였으므로 헤드룸 범위를 확정해 프리셋 기본 P를 정한다.
- identity 좌우 비교(움직이는 박스 동기 포함) 결과를 한 줄로 적는다.

## STATUS.md "Opus 확인 필요" 처리

- G3 dropRate 기준값: F2에서 결정(콜백 기반, 정상 구간).
- S7 캔버스 정의("종횡비 유지 축별 min"): 승인. PLAN C절 의도와 같다.
- 나머지(S4/S5 기준, S6 BT.2446 원문, ΔE ITP 계수, 참조 HDR 이미지, S2 C¹ 검사법)는 M4 계획 개정에서 정한다. 이번 수정에서 다루지 않는다.
