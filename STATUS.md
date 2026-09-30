# STATUS.md

## 현재 단계

M1 (0a 프로브 + 픽스처 + 시뮬레이션) 클라우드 구현 완료. 사용자 Mac 0a 실행과 Opus G1~G3 판정 대기.

## 완료

- M0 (PR #1 머지): 훅·settings.json (PLAN.md 부록 M0-A 원문), lint/test 골격, ci.yml(ubuntu). 훅 검증 1~3 통과, CI green
- M1 probe: `probe/`(index.html, probe.js, probe-core.js, shaders.js), `docs/result-schema.json`, `docs/manual-checklist.md`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`
- M1 픽스처 (S9): `scripts/make-fixtures.sh`, `scripts/check-fixtures.sh`, `fixtures/{ramp,colorbars}-{1080p60,2160p60}.mp4` (합계 약 229KB, 커밋 포함)
- M1 sim (S1~S7): `sim/` tonecurve, presets, sweep(S2), refs(S3), color(S4), banding(S5), compare(S6), budget(S7), run_all + 테스트

## 검증 (→ verify)

- 기준: `npm run lint`, `npm test`, `pytest sim`, 픽스처 검사 통과 / 실제: lint 통과, npm test 12/12, pytest 71/71, check-fixtures 4/4 PASS, `python -m sim.run_all` exit 0 / (1) 클라우드
- `pytest sim`은 이 VM의 `pytest` 실행 파일(uv 격리 환경, numpy 없음) 때문에 `python3 -m pytest sim`으로 실행. CI는 같은 python에 pytest·numpy를 설치하므로 무관
- S1 판정 기준(단조, Y≤k 항등, f(1)=P, C¹, NaN/음수 없음): 프리셋 3종 통과 / (1)
- 미검증: probe.js 브라우저 실행, WGSL 컴파일, WebGPU/EDR, 픽스처 Safari 재생. 사용자 Mac에서만 가능 / (3)
- CI(ubuntu) 결과: push 후 확인 예정

## sim 핵심 수치 (프리셋 정확 / 균형 / 선명)

- S4 음수 채널(RGB 9³ 격자): 0% / 1.33% / 11.34%
- S4 색 패치 ΔE ITP 평균, 채도 효과만: 0 / 4.05 / 19.3 (SDR 측색 대비 0.32 / 6.8 / 30.7)
- S4 피부톤 ΔE ITP 최대, 채도 효과만: 0 / 2.13 / 8.68
- S5 amp_enc 최대: 8.51 / 7.99 / 6.67 (최대 스텝은 세 프리셋 모두 코드 254→255)
- S7: 2160p60 캔버스 8B×fps 3.98 GB/s, 합성 포함 16.7 GB/s (200 GB/s 대비 약 8%)

## 미해결 이슈

- S2 C¹ 위반 1488점: `sweep.check`의 한쪽 차분(h=1e-6)과 고정 허용오차 1e-4 때문으로 보이며 곡선 결함 아님(f'(k⁺)=1). 검사법 수정은 Opus가 정함
- 산출 md 표(run_all)가 prettier 정렬 형식이 아님. 현재 stdout 전용이라 커밋 대상 아님
- eslint.config.js에 probe용 브라우저 globals 없음(no-undef 꺼져 있어 lint 통과)

## Opus 확인 필요

- S4/S5 기준 확정: 균형·선명의 음수 채널과 ΔE 목표, S5 스텝 증폭 기준. "정확"이 최상단 스텝 증폭이 가장 큼(끝 기울기 f'(1)≈13). 곡선 완화 여부
- S6 BT.2446 Method C 열은 원문 재현이 아닌 근사(계수 '미확인'). 비교 방법 선택 전 원문 확인 필요
- S4 ΔE ITP의 LMS 행렬은 기억 기반 계수. 기준 확정 전 검증 필요
- P0-2 참조 HDR 이미지가 저장소에 없음. 현재 사용자가 로컬 파일을 열어 비교. 저장소에 둘지 결정
- G3 dropRate 기준값: rVFC 콜백 수 기반(`perf.dropRate`) vs presentedFrames 기반(`dropRatePresented`)
- S7 캔버스 크기를 "종횡비 유지한 축별 min(원본, 표시×DPR)"으로 해석. 정의 확인

## 다음 단계

- 사용자 Mac에서 `docs/manual-checklist.md`대로 0a 실행 후 `results/result-M1-*.json` push
- `scripts/parse-result.py`로 요약 후 Opus가 G1~G3 판정(PLAN.md 게이트 판정 기록)
- M1 판정 전에는 M2 이후 착수 금지 (PLAN.md D절 게이트)
