# FIX_GUIDE.md — M1 0a 4차 회신 후 프로브 지표 정리

> 작성: Opus. 근거: `results/result-M1-20260930-ac-mid-actual60hz-raf.json`, `…-actualpromotion-raf.json`, PLAN.md B절 G3(3차 개정)·게이트 판정 기록(4차).
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: F1~F5(`63291b6`), H1~H5(`5fedb89`), J1~J4(`7abf8a8`) 완료. 내용은 git 이력 참조.

## 판정 요약

- **M1 판정 완료.** G1·G2·G3 통과. M2 착수 가능(PLAN.md D절).
- G3는 rAF 구동으로 통과했다. rAF run은 전부 콜백 수가 기대 디스플레이 갱신 수와 같았다(60Hz 600/600, ProMotion 1200/1200). JS p95 ≤ 1.05 ms, 2160p ITM GPU 60Hz 5.3 ms / ProMotion 2.4 ms, 끊김 육안 "없음".
- H1(프로브 멈춤)은 사용자가 재시작 없이 새로고침 3회 후 P0-1이 유지됨을 확인했다. 해소로 본다(재발 시 배너가 안내).
- 이번 수정은 **M2를 막지 않는다.** 프로브를 Safari 업데이트 회귀 도구로 계속 쓰기 위해 지표 정의를 PLAN.md와 맞춘다.

---

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

## 이번 수정 범위 밖 (변경 금지)

- ITM 수식, 프리셋 수치(M4).
- `extension/`는 M2에서 PLAN.md D절 절차로 착수한다. 이 FIX_GUIDE와 섞지 않는다.

## 병렬 분할

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
