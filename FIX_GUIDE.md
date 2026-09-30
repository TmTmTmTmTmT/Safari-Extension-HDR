# FIX_GUIDE.md — M1 0a 3차 회신 후 렌더 루프 검증

> 작성: Opus. 근거: `results/result-M1-20260930-ac-mid-{promotion,60hz}-matrix.json`, PLAN.md A20·B절 G3(2차 개정)·C절 렌더 루프(개정), 게이트 판정 기록(3차).
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: 1차 F1~F5(`63291b6`), 2차 H1~H5(`5fedb89`) 완료. 내용은 git 이력 참조.

## 판정 요약

- **원인 확정(관측)**: Safari의 rVFC 콜백이 video 표시 프레임보다 적게 호출된다. 60Hz 디스플레이에서 60fps video의 콜백은 약 30회/s이고, 캔버스가 전혀 없는 B0 기준선도 같다. 같은 run의 `presentedFrames`로 추정한 video 표시율은 약 54~57회/s라 video 자체는 정상 표시된다. rVFC마다 그리는 현재 설계는 오버레이가 60Hz에서 약 30fps로만 갱신된다.
- **비용은 문제 아님**: 3600×2025 단일 캔버스에서도 GPU ≤ 2.6 ms, JS p95 ≤ 2 ms. EDR(B2)과 SDR(B1) 캔버스 차이도 run 간 편차(같은 조건 2회에서 15% vs 41%) 안에 묻힌다.
- **결정**: 렌더 루프를 rAF 구동으로 바꾼다(PLAN.md C절 개정, GUIDELINES 2.5-1 개정). G3는 구동 방식과 무관한 "갱신 누락률"로 다시 정의했다(PLAN.md B절). 이번 수정은 rAF 구동이 누락을 없애는지 확인하는 측정이다.

---

## J1. 프로브에 rAF 구동 루프 추가

- **원인**: 현재 오버레이·분할 배치 run은 모두 rVFC 콜백에서 `importExternalTexture`와 렌더를 한다. 이 구동 자체가 A20에 따라 프레임을 놓친다.
- **수정 방향**:
  1. run에 구동 방식 `driver`(`raf` / `rvfc`)를 둔다. `raf`는 `requestAnimationFrame` 콜백마다 `importExternalTexture`(매번 재import) → 렌더한다. video가 일시정지·ended면 렌더하지 않는다.
  2. 모든 run에서 rVFC를 **관측 전용**으로 병행 등록해 `metadata.presentedFrames`와 `mediaTime`을 기록한다(렌더는 하지 않음). 이 값으로 video 표시율을 계산한다.
  3. `raf` run은 rAF 콜백의 `timestamp`를 측정 창(워밍업 1초 제외, 최대 10초) 동안 기록한다.
- **영향 범위**: `probe/probe.js`, `probe/probe-core.js`.
- **검증**: 아래 J2의 순수 함수 단위 테스트 → (1). 실제 동작은 (3).

## J2. 갱신 누락률 지표

- **정의(PLAN.md B절)**: 측정 창을 소스 프레임 간격(1/소스 fps) 슬롯으로 나눴을 때 캔버스가 한 번도 렌더되지 않은 슬롯의 비율.
- **수정 방향**:
  1. 순수 함수 `missRate(renderTimes, windowStart, windowEnd, srcFps)`를 `probe-core.js`에 둔다. 렌더 시각 목록(rAF timestamp 또는 rVFC 콜백 시각)으로 계산한다. 캔버스가 없는 기준선 run(B0)은 "렌더했을 시각" = 같은 루프의 콜백 시각으로 계산한다.
  2. run 기록에 `missRate`, `loopFps`(구동 콜백 회/s), `videoPresentedFps`(관측 rVFC의 presentedFrames 증가량 / 측정 창 초)를 추가한다. 기존 `dropRate`, `dropRatePresented`는 그대로 둔다.
- **영향 범위**: `probe/probe-core.js`, `tests/unit/probe-core.test.js`.
- **검증**: 단위 테스트. 규칙적 60Hz 시퀀스 → 0, 30Hz(격슬롯) → 0.5, 120Hz → 0, 16.7 ms 슬롯에 3프레임 공백 1회 → 기대값. → (1).

## J3. 진단 매트릭스 교체

- **수정 방향**: "G3 진단 일괄 측정"의 모드를 다음 4개로 바꾼다. 해상도 2개 × 4 = 8 run(기존 절차·전체화면 흐름 유지).
  - **R0 기준선**: `raf`, 캔버스 없음(루프는 돌고 렌더는 안 함).
  - **R2 EDR identity**: `raf` + B2 설정.
  - **R3 EDR ITM**: `raf` + B3 설정.
  - **V3 비교**: `rvfc` + B3 설정(기존 방식, 개선 폭 비교용).
  - B1(SDR 캔버스)은 제외한다. 3차에서 EDR 합성 비용이 편차 안에 묻혀 판정에 쓰지 않는다. 코드는 지우지 말고 매트릭스에서만 뺀다.
- 매트릭스 끝에 전체화면 안에서 짧은 질문을 띄운다: "R3 실행 중 우하단 움직이는 박스가 끊겼나?" 선택지 없음 / 가끔 / 자주 → `perf.visualJudder`에 기록. 전체화면을 나간 뒤 페이지에서 골라도 된다.
- **영향 범위**: `probe/probe.js`, `probe/index.html`.
- **검증**: 모드 순서 순수 함수 단위 테스트 → (1).

## J4. 스키마와 요약

- **수정 방향**:
  1. schemaVersion 4. run에 `driver`, `missRate`, `loopFps`, `videoPresentedFps` 추가. `mode`에 `R0`/`R2`/`R3`/`V3` 추가. `perf.visualJudder` 추가.
  2. `perf.g3`를 해상도별 `{baselineMiss(R0), itmMiss(R3), delta(R3−R0), rvfcMiss(V3), loopFps(R3), videoPresentedFps(R3), jsP95Max, gpuMsMax}`로 바꾼다. 대상은 전원 연결 + 전체화면 + overlay run.
  3. `scripts/parse-result.py`: 모드별 표(해상도 × R0/R2/R3/V3의 missRate, loopFps, videoPresentedFps, gpuMs, jsP95)와 G3 요약 표. 판정은 출력하지 않는다. v1~v3 파일 9건도 오류 없이 처리한다.
  4. `docs/result-schema.json`, `docs/manual-checklist.md`(재측정 절차) 갱신.
- **영향 범위**: `probe/probe-core.js`, `probe/probe.js`, `docs/result-schema.json`, `docs/manual-checklist.md`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`.
- **검증**: 단위 테스트, `results/` 9건 parse-result 오류 없음 → (1).

---

## 이번 수정 범위 밖 (변경 금지)

- ITM 수식, 프리셋 수치(M4).
- `extension/` (M1 판정 전 착수 금지).
- 픽스처 재생성.

## 병렬 분할

- J1~J4는 모두 `probe/`·`docs/`·`scripts/parse-result.py`·`tests/unit/`에 걸쳐 파일이 겹친다. impl-worker 1개로 진행한다.

## 사용자 재측정 요청 (수정·push 후)

- 조건: 전원 연결, 밝기 중간. Safari 재시작 후 시작.
- ProMotion 1회, 60Hz 1회. 각각 "G3 진단 일괄 측정" → 끊김 질문 답 → JSON export.
- 2차 H1 확인(아직 회신 없음): Safari 재시작 없이 새로고침 3회 후 P0-1이 채워지는지, 멈추면 배너가 뜨는지 한 줄.

## 재판정 규칙 (Opus, 미리 고정)

- R3 − R0 < 1%p(두 해상도, 두 주사율 모두)이고 R0 < 5%, JS p95 < 4 ms, 끊김 "없음" → **G3 통과**.
- R0 자체가 5% 이상 → rAF도 Safari에서 누락. 원인 분석 후 재계획(F-A 검토 포함).
- R3 − R0 ≥ 1%p → 비용 문제. B절 G3 실패 분기(해상도 상한 조정 등) 착수.
