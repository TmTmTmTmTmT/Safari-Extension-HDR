# FIX_GUIDE.md — M1 0a 2차 회신 후 프로브 수정

> 작성: Opus. 근거: `results/result-M1-20260930-ac-{low,mid,max}-mixed.json`, 사용자 관찰(STATUS.md 미해결 이슈), PLAN.md B절 G3 개정 기준, 게이트 판정 기록(2026-09-30 2차).
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: 1차 F1~F5 완료(`63291b6`). 내용은 git 이력 참조.

## 판정 요약

- **G2 통과(확정).** 안정 후 헤드룸 밝기 낮음 4 / 중간 3 / 최대 2. 헤드룸 제약은 PLAN.md C절 "0a 헤드룸 제약"으로 M4에 넘긴다.
- **G3 판정 보류.** 2차 전체화면 run은 드롭 11~24%인데 GPU 0.36~0.41 ms, JS p95 ≤ 2 ms로 연산 비용 신호가 없다. 다음 세 가지 때문에 이 수치로는 원인을 가를 수 없다.
  1. video 단독 기준선이 없다. Safari 재생 자체가 떨어뜨리는 프레임인지, 오버레이 때문인지 모른다.
  2. 측정 배치가 실제와 다르다. 좌우 분할이라 캔버스가 1800×1013이다. 실제 확장은 video 위 단일 캔버스(2160p 소스에서 3600×2025)다.
  3. ITM run이 없다(셰이더 선택을 매번 수동으로 바꿔야 해서 누락).
- G3 기준을 PLAN.md B절에서 "기준선 대비 1%p 미만"으로 개정했다. 실패 분기(B절)는 착수하지 않는다.

---

## H1. 프로브 멈춤 (Safari 재시작으로만 복구)

- **증상**: 새로고침을 2회 이상 하면 P0-1이 "(대기)"에서 멈추고, P0-2 줄무늬·P0-3 캔버스가 그려지지 않으며, 픽스처 실행과 JSON export 버튼이 반응하지 않는다. Safari 종료·재시작으로만 복구된다.
- **원인(추정, 미검증)**: 모든 GPU 경로와 export가 `getGpu()`(`probe/probe.js`)의 `requestAdapter()`/`requestDevice()`를 기다린다. 이 Promise가 끝나지 않으면 모든 기능이 조용히 멈춘다. 이전 페이지의 GPU device, 캔버스 context, video 디코더가 해제되지 않아 Safari GPU 프로세스가 새 요청에 응답하지 않는 것으로 추정한다. Chromium에서는 재현되지 않았다.
- **수정 방향**:
  1. `requestAdapter()`와 `requestDevice()`에 각각 5초 타임아웃을 둔다. 타임아웃이면 오류로 처리하고, 오류 영역과 P0-1 출력에 "GPU 응답 없음, Safari를 종료 후 재시작" 안내를 표시한다.
  2. `pagehide`에서 정리한다: 진행 중인 run 중지, 모든 WebGPU 캔버스 context `unconfigure()`, `device.destroy()`, video `pause()` 후 `src` 제거와 `load()`로 디코더 해제.
  3. JSON export는 GPU에 의존하지 않는다. `state.api`가 없으면 타임아웃이 있는 `collectApi()`를 한 번 시도하고, 실패해도 그 오류를 `errors[]`와 `api.configure.error`에 담아 export한다.
  4. 페이지 상단에 오류 배너를 둔다. `errors[]`에 항목이 생기면 보이게 한다(현재 오류 출력이 페이지 아래쪽에 있어 사용자가 보지 못함).
- **영향 범위**: `probe/probe.js`, `probe/index.html`.
- **검증**: 단위 테스트 가능한 부분(타임아웃 래퍼)은 `tests/unit/probe-core.test.js`에 추가 → (1). 멈춤 해소 자체는 (3) 사용자 Mac: Safari 재시작 없이 새로고침 3회 후에도 P0-1이 채워지는지. 해소되지 않아도 배너에 안내가 떠야 한다.

## H2. G3 진단 측정 매트릭스

- **목적**: 개정된 G3 기준(기준선 대비)으로 판정할 데이터를 한 번의 조작으로 얻는다.
- **수정 방향**:
  1. **오버레이 배치**를 추가한다. 전체화면 요소 안에 video를 꽉 채우고(contain), 그 위에 같은 위치·크기로 단일 캔버스를 겹친다. 캔버스 해상도 = `canvasResolution(원본, 전체화면 표시 크기×DPR)`. 좌우 분할 배치는 창 모드의 육안 비교용으로 유지한다.
  2. 모드 4가지를 정의한다.
     - **B0 기준선**: video만. 캔버스를 만들지 않는다. rVFC 콜백·presentedFrames는 같은 방식으로 기록.
     - **B1 SDR 캔버스**: 캔버스를 `bgra8unorm`, `srgb`, toneMapping 없이 설정하고 identity. EDR 합성 비용을 분리하려는 진단 전용 설정이다(GUIDELINES 2.5-3의 고정 설정 예외, 프로브에서만 허용).
     - **B2 EDR identity**: 현재 설정(`rgba16float`, `display-p3`, `extended`) + identity.
     - **B3 EDR ITM**: B2 + ITM 셰이더(균형 프리셋 고정값).
  3. **"G3 진단 일괄 측정" 버튼** 하나를 둔다. 클릭 시 오버레이 전체화면에 진입하고, `ramp-1080p60`과 `ramp-2160p60` 각각에 B0→B1→B2→B3를 순서대로 자동 실행(총 8 run, run 사이 1초 간격)한 뒤 전체화면을 해제한다. 전체화면 진입은 클릭 1회로 충분해야 한다. 중간에 사용자가 전체화면을 나가면 중단하고 완료된 run만 남긴다.
  4. 진행 상황(현재 run / 8)을 전체화면 안 구석에 작게 표시한다. 측정 영역을 가리지 않는다.
  5. 기존 "창 실행"과 "전체화면 측정" 버튼은 유지한다.
- **영향 범위**: `probe/probe.js`, `probe/index.html`, `probe/probe-core.js`(모드별 집계가 순수 함수면).
- **검증**: 모드 순서·집계 순수 함수 단위 테스트 → (1). 실제 동작 (3).

## H3. 결과 스키마와 요약

- **수정 방향**:
  1. run에 `mode`(`B0`/`B1`/`B2`/`B3`/`split`)와 `layout`(`overlay`/`split`)을 추가한다. 기존 run은 `split`으로 간주한다.
  2. `env`에 `refreshRate`(`promotion`/`60hz`/null, 사용자 선택)를 추가한다. P0-5에 선택 UI를 둔다.
  3. `perf.g3`를 개정 기준에 맞춘다. 해상도별로 `baselineDrop`(B0), `itmDrop`(B3), `delta`(B3−B0), `jsP95Max`를 둔다. 대상은 전원 연결 + 전체화면 + overlay run이다. B0 또는 B3가 없으면 해당 해상도는 null.
  4. `scripts/parse-result.py`: 모드별 표(해상도 × B0~B3의 드롭률, dropRatePresented, fps, GPU ms, JS p95)와 G3 요약 표(baselineDrop, itmDrop, delta, jsP95Max)를 출력한다. 판정은 출력하지 않는다(값만).
  5. `docs/result-schema.json`을 갱신하고 schemaVersion을 3으로 올린다. v1, v2 파일도 요약이 되어야 한다.
- **영향 범위**: `probe/probe-core.js`, `probe/probe.js`, `probe/index.html`, `docs/result-schema.json`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`.
- **검증**: 단위 테스트, `results/`의 기존 v1·v2 파일 7건으로 parse-result 오류 없음 → (1).

## H4. P0-2 안정화 안내

- **원인**: 밝기 변경이나 "다시 그리기" 직후에는 약 30초간 헤드룸이 2처럼 보이다가 안정값에 도달한다(2차 관찰). 선택 시점에 따라 값이 달라진다.
- **수정 방향**:
  1. P0-2 영역에 "마지막 그리기 후 경과 초"를 1초 간격으로 표시한다.
  2. 안내 문구를 추가한다: "밝기를 바꾼 뒤 30초 이상 기다린 다음, 다시 그리기를 누르지 말고 선택한다."
  3. `edr`에 `secondsSinceDraw`(선택 시점의 경과 초)를 기록한다.
  4. `docs/manual-checklist.md`의 P0-2 절차에 같은 내용을 반영한다.
- **영향 범위**: `probe/probe.js`, `probe/index.html`, `docs/result-schema.json`, `docs/manual-checklist.md`.
- **검증**: (1) lint/test, 실제 표시는 (3).

## H5. S10 헤드룸 클리핑 시뮬레이션

- **목적**: PLAN.md C절 "0a 헤드룸 제약"의 M4 결정 자료.
- **수정 방향**: `sim/headroom.py`(신규). 프리셋 3종 × 헤드룸 H∈{2,3,4}에 대해 출력 휘도가 H를 넘는 8bit 회색 입력 코드 수, 그 코드 범위, 넘는 비율을 표로 낸다. 곡선은 `sim/tonecurve.py`를 그대로 쓴다. `sim/run_all.py`에 S10을 추가한다. 판정은 하지 않는다.
- **영향 범위**: `sim/headroom.py`, `sim/test_headroom.py`, `sim/run_all.py`.
- **검증**: `pytest sim` 통과 → (1).

---

## 이번 수정 범위 밖 (변경 금지)

- ITM 수식과 프리셋 수치(`probe/shaders.js`, `sim/presets.py`). M4에서 정한다.
- 확장 코드(`extension/`). M1 판정 전 착수 금지.
- 픽스처 재생성. 기존 12초 픽스처를 그대로 쓴다(colorbars는 진단 매트릭스에서 제외).

## 병렬 분할 (impl-worker)

- 작업 1: H1 + H2 + H3 + H4 (`probe/`, `docs/`, `scripts/parse-result.py`, `tests/unit/`). 파일이 겹쳐 한 작업자로 묶는다.
- 작업 2: H5 (`sim/`).

## 사용자 재측정 요청 (수정·push 후)

- 조건: 전원 연결, 밝기 중간. 측정 전 Safari 재시작 1회.
- 1회차: 디스플레이 주사율 기본(ProMotion). P0-5에서 `refreshRate`=ProMotion 선택 → "G3 진단 일괄 측정" 1회 → JSON export.
- 2회차: 시스템 설정 → 디스플레이 → 주사율을 60Hz로 바꾼 뒤 같은 절차. 끝나면 ProMotion으로 되돌린다.
- H1 확인: 2회차 전에 Safari를 재시작하지 말고 새로고침 3회 후 P0-1이 채워지는지 한 줄로 알려 준다.
- P0-2는 다시 하지 않아도 된다(G2 확정).
