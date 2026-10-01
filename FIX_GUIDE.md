# FIX_GUIDE.md — M2 끊김 원인 분리(S) + 프로브 지표(K1)

> 작성: Opus. 근거: STATUS.md "M2 0b 4차 회신", `results/result-M2-20261001-ac-mid-*-itm-vf-*.json`, `results/result-M1-20261001-ac-mid-60hz-p06-rerun.json`, 사용자 회신(끊김 '조금', vF5oXa1cVEg는 4K60이 아님, 밝기 최대에서 HDR 효과가 잘 느껴짐, "네이티브 헬퍼 필요할지도?").
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: L·N·P·Q·R 회차 완료(`fb2d5cc`). K1은 미구현이며 그대로 둔다.

## 판정 요약

- **G4 통과(확정).** vf 경로로 YouTube VP9가 즉시 표시되고 JS p95 2 ms, video 드롭 0이다(PLAN.md 게이트 판정 기록).
- **G3c 보류.** 갱신 누락 3~4%와 육안 끊김 '조금'이 남았지만 원인을 가를 자료가 없다. 후보:
  - C-a: YouTube 페이지 자체가 메인 스레드를 써서 rAF가 빠짐(오버레이와 무관). 확장에는 기준선(R0)이 없어 지금은 구분 불가.
  - C-b: 샘플링 위상. 오버레이는 rAF 시점의 현재 프레임을 그리므로, 소스가 60fps가 아닐 때(사용자 메모: vF5oXa1cVEg는 4K60 아님) 프레임 교체 시점과 rAF가 가까우면 유지 길이가 불규칙해진다(예: 24fps에서 3·2 대신 3·3·1). 네이티브 합성은 vsync에 맞춰 교체하므로 차이가 생길 수 있다.
  - C-c: 원본 영상 자체의 끊김(24/30fps를 60Hz에 표시할 때 생기는 고유 cadence). 확장을 꺼도 보이면 확장 문제가 아니다.
- **F-A(네이티브 헬퍼)는 착수하지 않는다.** vf 경로가 비용 기준을 만족하고, F-A는 화면 캡처로 1~2프레임 지연과 자체 지터가 생겨 C-a~C-c 어느 것도 줄인다는 근거가 없다. S 회차 결과가 C-b로 확정되고 웹 경로에서 고칠 수 없을 때 다시 검토한다.
- **60Hz rAF 30Hz(A24)**: 프로브 H.264 대조군까지 30회/s라 확장 문제가 아니다. 0a 4차와 무엇이 달라졌는지 확인한다(S3).
- **밝기별 체감**: 밝기 중간에서는 약하고 최대에서는 잘 느껴짐. M4 프리셋·밝기 대응 결정 자료로 남긴다(이번 회차 구현 없음).

---

## S 회차 결과 (2026-10-01, 기록)

- S4 판정표 1행(C-a): 60fps 소스에서 itm 누락 − baseline 누락 = −3.0%p, 끊김 없음, video 드롭 0 → G3c 통과(ProMotion·창 모드). 상세는 PLAN.md 게이트 판정 기록.
- 비60fps 소스 끊김(C-b/C-c)과 60Hz rAF 30회/s(A24)는 M6로 이월. 이번 회차 추가 수정 없음.
- S 회차 보류 항목(holdHist 경계 제외, 이상 유지 길이 집합, baseline 필드 null, baseline 진입 시 GPU 해제)은 모두 승인.
- **M2 수정 회차는 여기서 닫는다.** 다음 작업은 M3 계획(Opus)이다.

## S1. 확장 기준선 모드 `baseline` (G3c R0)

- **수정 방향**: popup 모드 목록에 진단용 `baseline`을 추가한다(GUIDELINES 2.6-3: 진단 모드는 진단 영역에만). `baseline`에서는 캔버스를 숨기고(원본 표시) rAF 루프는 그대로 돌리되 import·렌더·submit을 하지 않는다. diag의 loopFps·displayMissRate·displayHz는 같은 방식으로 잰다. frameProbe·경로 결정·N2 가드는 실행하지 않는다.
- **영향 범위**: `params.js`(모드 목록), `renderer.js`, `main.js`(가드 제외), popup(선택지), 스키마 m2(`render.mode` enum), 테스트.

## S2. 샘플링 cadence 지표

- **수정 방향**:
  1. 렌더한 rAF마다 "이번에 그린 소스 프레임의 시각"을 기록한다. vf 경로는 `frame.timestamp`(µs), ext·copy 경로는 `video.currentTime`. 최근 600개 링 버퍼(Q2 규칙대로 비움).
  2. 순수 함수 `cadenceStats(srcTimes, loopTimes, displayHz)`:
     - `srcFps`: 서로 다른 소스 시각 사이 간격의 중앙값으로 추정(23.976/24/25/29.97/30/50/59.94/60 중 가장 가까운 값과 원값 둘 다).
     - `holdHist`: 같은 소스 프레임을 연속으로 그린 디스플레이 갱신 수의 분포(1, 2, 3, 4, 5+). 500 ms 넘는 공백 구간은 제외.
     - `irregular`: 이상 유지 길이 집합(`floor(displayHz/srcFps)`, `ceil(displayHz/srcFps)`)에 들지 않는 유지 길이의 비율.
     - `skipped`: 소스 시각이 1/srcFps의 1.5배 넘게 건너뛴 횟수(그리지 못하고 지나간 소스 프레임).
  3. diag `render.cadence`에 위 값을 넣는다. 진단 schemaVersion 5. parse-result에 열 추가.
- **영향 범위**: `renderer.js`, `hud.js`(순수 함수), 스키마 m2, `scripts/parse-result.py`, 테스트.
- **검증(1)**: 24fps 소스·60Hz 규칙 시퀀스(3·2 반복) → irregular 0, 3·3·1 섞인 시퀀스 → 해당 비율, 60fps·60Hz → holdHist 1에 집중, 프레임 건너뜀 1회 → skipped 1.

## S3. 사용자 Mac 절차 (docs/manual-checklist.md 0b 절)

1. `git pull` → Xcode Run → Safari 재시작, 서명되지 않은 확장 허용. 전원 연결, 저전력 모드 끔, ProMotion, 밝기 **최대**(체감이 잘 되는 조건).
2. 영상마다(vF5oXa1cVEg, MR_53SGVXXc, 그리고 확실한 60fps 영상 1개) Stats for nerds의 `Current / Optimal Res`에 표시된 `@fps` 값을 적는다.
3. 같은 영상, 창 모드, 각 30초씩 일시정지 없이:
   - 모드 `baseline` → popup JSON
   - 모드 `itm` → popup JSON, 끊김 육안(없음/가끔/자주)
   - popup에서 확장 끔 → 끊김 육안(없음/가끔/자주). **확장 off에서도 같은 끊김이 보이는지가 핵심**
4. 60Hz 확인: 시스템 설정 → 디스플레이 → 주사율 목록의 정확한 표기(예: "60Hz", "59.94Hz", "ProMotion")를 적고 60Hz로 바꾼 뒤, 프로브 P0-4 "G3 진단 일괄 측정"을 1회 실행해 JSON export(0a 4차와 같은 절차로 30회/s 여부 비교).

## S4. 결과별 다음 단계 (Opus 판정용, 구현 대상 아님)

| 관찰                                         | 해석              | 다음                                                   |
| -------------------------------------------- | ----------------- | ------------------------------------------------------ |
| itm 누락 − baseline 누락 < 1%p               | C-a(페이지 부하)  | G3c 통과 처리(차분 기준)                               |
| 확장 off에서도 같은 끊김                     | C-c(원본 cadence) | 확장 문제 아님, G3c 육안 항목 통과                     |
| irregular·skipped가 크고 off에서는 끊김 없음 | C-b(샘플링 위상)  | 프레임 교체 동기화 방법 검토(Opus), 필요 시 F-A 재검토 |
| 60Hz G3 매트릭스도 30회/s                    | 환경 변화(A24)    | 60Hz 판정 방법 재정의                                  |

---

## R 회차 보류 항목 판정 (기록)

| 항목                                                                         | 판정                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| (a) VideoFrame 생성 실패 3회까지 프레임 건너뜀, import·렌더 예외는 즉시 전환 | 승인                                                                            |
| (b) `onWarn` 훅                                                              | 승인                                                                            |
| (c) 결정 후 전환은 한 단계만                                                 | 승인. ext·vf 모두 검고 copy만 밝은 경우는 관측되지 않았다. 관측되면 재검토      |
| (d) none 1회째는 pending으로 두고 60회 상한에 합산                           | 승인                                                                            |
| (e) vf 검정 판정 `vf<2 && (c2d                                               | copy)>=8`                                                                       | 승인(ext와 같은 임계) |
| (f) 체크리스트 이전 소절 유지                                                | 승인. S 회차 문구 반영 시 0b 절의 지난 회차 소절은 "이전 회차" 아래로 접어 둔다 |

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

## 이번 수정 범위 밖 (변경 금지, S·K 공통)

- ITM 수식, 프리셋 수치(M4).
- K1은 `probe/` 지표 전용이며 M2 브랜치에 섞지 않는다. N3의 프로브 변경은 픽스처 목록 추가만이다.
- Canvas2D 중간 단계, main world 주입, 코덱 협상 조작(H.264 강제)은 구현 금지.
- 프로브(`probe/`)는 이번 회차에 수정하지 않는다.
- ITM 수식·프리셋 수치·밝기 대응(M4), F-A 코드.
- ITM 수식·프리셋 수치(M4), 캔버스 설정 고정값(GUIDELINES 2.5-3).
- 커밋된 `xcode/`의 수기 편집·형식 변환(GUIDELINES 7-5).

## 병렬 분할 (S 회차)

- S1·S2는 `renderer.js`·`hud.js`·스키마가 겹친다. impl-worker 1개가 S1 → S2 → S3(체크리스트) 순서로 한다.

## 병렬 분할 (K1)

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
