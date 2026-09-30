# STATUS.md

## 현재 단계

M1 0a 2차 회신 반영(FIX_GUIDE.md H1~H5) 구현 완료. 사용자 Mac 재측정 대기. 게이트: G1 통과, G2 통과(확정), G3 판정 보류(PLAN.md 게이트 판정 기록).

## 완료

- M0 (PR #1 머지): 훅·settings.json (PLAN.md 부록 M0-A 원문), lint/test 골격, ci.yml(ubuntu). 훅 검증 1~3 통과, CI green
- M1 probe / 픽스처 / sim(S1~S7): 구현 완료 (PR #2, CI green)
- FIX_GUIDE F1: 픽스처 12초 + 프레임마다 움직이는 박스(`geq` luma 126, 우하단 720칸 순회). 프레임 해시 1080p 두 파일 720개 모두 상이
- FIX_GUIDE F2~F4: 드롭률·JS·GPU를 워밍업 1초 제외 측정 창(최대 10초)으로 집계, "전체화면 측정" 버튼과 "창 실행" 버튼, env.windowMode를 run에서 파생, `perf.g3`(전원 연결 + 전체화면 run만, 해상도별 최악값), 스키마 v2(v1 호환), parse-result에 G3 대상 열과 요약
- FIX_GUIDE H1~H5: 프로브 GPU 요청 5초 타임아웃·pagehide 정리·오류 배너·GPU 비의존 export, "G3 진단 일괄 측정" 버튼(전체화면 오버레이 단일 캔버스, 1080p/2160p × B0 video만 / B1 SDR 캔버스 / B2 EDR identity / B3 EDR ITM = 8 run), 스키마 v3(mode, layout, refreshRate, perf.g3 기준선 대비 delta), P0-2 경과 초 표시, S10 헤드룸 클리핑(`sim/headroom.py`)
- FIX_GUIDE F5: S7에 "XDR 16 스케일 1800x1169"(백킹 3600x2338, 캔버스 3600x2025) 행 추가

## 검증 (→ verify)

- 기준: lint, `npm test`, `pytest sim`, 픽스처 검사, 기존 회신 JSON 처리 / 실제: lint 통과, npm test 30/30, pytest 85/85, check-fixtures 4/4 PASS(길이 12초, 합계 882,661바이트), parse-result rc=0("G3 대상 run 없음" 출력) / (1) 클라우드
- `pytest sim`은 이 VM의 `pytest` 실행 파일(uv 격리, numpy 없음) 때문에 `python3 -m pytest sim`으로 실행. CI는 무관
- 미검증: 전체화면 자동 진입·해제, rVFC 실동작, WebGPU/EDR, 픽스처 Safari 재생. 사용자 Mac에서만 가능 / (3)
- CI(ubuntu): d673bca에서 green / (1) 클라우드 CI. H1~H5 커밋의 결과는 push 후 확인 예정

## sim 핵심 수치 (프리셋 정확 / 균형 / 선명)

- S4 음수 채널(RGB 9³ 격자): 0% / 1.33% / 11.34%
- S4 색 패치 ΔE ITP 평균, 채도 효과만: 0 / 4.05 / 19.3 (SDR 측색 대비 0.32 / 6.8 / 30.7)
- S4 피부톤 ΔE ITP 최대, 채도 효과만: 0 / 2.13 / 8.68
- S5 amp_enc 최대: 8.51 / 7.99 / 6.67 (최대 스텝은 세 프리셋 모두 코드 254→255)
- S7: 2160p60 캔버스 8B×fps 3.98 GB/s, 합성 포함 16.7 GB/s (200 GB/s 대비 약 8%)

## 미해결 이슈

- 2차 회신 3건 수신(`results/result-M1-20260930-ac-{low,mid,max}-mixed.json`, schemaVersion 2, 전원 연결, run 8개씩: 창 4 + 전체화면 4). 사용자가 각 측정 전후로 Safari를 종료·재시작해 프로브 멈춤(앞서 보고된 P0-1 대기 상태)을 회피함. 멈춤은 재시작으로만 해결, 근본 원인 미확인(requestAdapter/requestDevice 무응답 가설은 미검증)
- P0-2 (안정 후 기록값): 밝기 낮음 4, 중간 3, 최대 2, encodingMatch 셋 다 nonlinear. 사용자 관찰: "다시 그리기"를 누르면 밝기와 무관하게 항상 2로 고정되고, 약 30초 + 밝기 조절 후에 기록값으로 돌아옴
- G3 데이터(전체화면 run, 모두 identity): 드롭률(콜백 기반) 11~24%, fps 46~53, JS p95 1~2 ms, GPU 0.36~0.41 ms. 창 run은 7~12%(밝기 최대의 colorbars 창 run은 37~45%). ITM run은 3건 모두 0개
- 프로브 한계: 전체화면 출력 캔버스가 1800x1013(좌우 2분할 화면의 반쪽). 실제 전체화면 단일 캔버스 상한 3600x2025의 약 1/4 부하. 또 순수 video 재생 기준선(캔버스 없이)이 없어 드롭이 오버레이 때문인지 video 자체인지 구분 불가. `getVideoPlaybackQuality`의 total이 0~6이라 참고 불가

- S2 C¹ 위반 1488점: `sweep.check`의 한쪽 차분(h=1e-6)과 고정 허용오차 1e-4 때문으로 보이며 곡선 결함 아님(f'(k⁺)=1). 검사법 수정은 Opus가 정함
- 산출 md 표(run_all)가 prettier 정렬 형식이 아님. 현재 stdout 전용이라 커밋 대상 아님
- eslint.config.js에 probe용 브라우저 globals 없음(no-undef 꺼져 있어 lint 통과)
- 픽스처 재생성이 느림: `geq` 방식으로 4개 약 28분(이 VM). 다른 방식은 약 4분이나 프레임별 위치를 줄 수 없음
- 우하단 움직이는 박스가 램프 마지막 100% 계단 패치의 모서리를 일부 덮음(폭 약 174px 중 60px, 높이 약 324px 중 48px). 프로브가 이 패치를 중앙에서 샘플링하면 무관
- S7 디스플레이는 백킹 3600x2338 기준이며 최종 다운샘플 패스 트래픽은 미포함

## Opus 확인 필요

- S10 결과(M4 프리셋 결정 자료): 균형(P=3)은 헤드룸 2에서 입력 코드 247~255(3.5%)가 잘림. 선명(P=4)은 헤드룸 2에서 231~255(9.8%), 헤드룸 4에서도 250~255(2.3%)가 g=1.05 때문에 P를 넘어 잘림. FIX_GUIDE의 'P ≤ H이면 0개' 전제는 g>1 프리셋에서 성립하지 않음
- 프로브 미검증(사용자 Mac 필요): 타임아웃 배너, unconfigure/device.destroy가 Safari 멈춤을 해소하는지, 전체화면 오버레이에서 canvas와 video가 정확히 겹치는지, B1(bgra8unorm/srgb)에서 importExternalTexture 동작
- 결정 완료: G3 dropRate 기준(콜백 기반, 정상 구간), S7 캔버스 정의(축별 min)
- S4/S5 기준 확정: 균형·선명의 음수 채널과 ΔE 목표, S5 스텝 증폭 기준. "정확"이 최상단 스텝 증폭이 가장 큼(끝 기울기 f'(1)≈13). 곡선 완화 여부(M4)
- S6 BT.2446 Method C 열은 원문 재현이 아닌 근사(계수 '미확인')
- S4 ΔE ITP의 LMS 행렬은 기억 기반 계수
- P0-2 참조 HDR 이미지가 저장소에 없음
- S2 C¹ 검사법(한쪽 차분 h=1e-6, 허용오차 1e-4 위반 1488점, 곡선 결함 아님)
- G2 확정: P0-2 결과가 밝기 변경 후 시간에 따라 변해 단발 선택값으로는 확정 불가(회신 3건: 2 / 4 / 1.5). 프리셋 기본 피크 배율 P 결정과 P0-2 측정 방법 재설계는 Opus 판단 필요

## 다음 단계

- (2차 회신으로 조건 A, B, C의 P0-2 수신 완료. 남은 것: ITM run, 기준선, 전체화면 단일 캔버스 재측정은 Opus가 FIX_GUIDE로 정함) 이전 계획: 조건 A(전원 연결, 밝기 중간, 픽스처 4개 × identity/ITM을 "전체화면 측정" 버튼으로, P0-2·P0-3 포함), 조건 B(밝기 낮음)·C(밝기 중간)는 P0-2만. 절차는 `docs/manual-checklist.md`
- `scripts/parse-result.py`로 요약 후 Opus가 G2 확정, G3 판정(PLAN.md 게이트 판정 기록)
- M1 판정 전에는 M2 이후 착수 금지 (PLAN.md D절 게이트)
