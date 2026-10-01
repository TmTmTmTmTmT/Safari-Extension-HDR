# STATUS.md

## 현재 단계

M2 완료(PR #4 머지, `b29006c`, 2026-10-01). M3 계획 작성 완료(PLAN.md D-M3, GUIDELINES v1.3, 브랜치 `claude/m3-lifecycle`). 다음: **로컬 Mac 세션(Sonnet)에서 M3 1단계 구현**. 클라우드 세션은 종료하고 이후 작업은 로컬 세션에서 한다(docs/local-session.md).

## 완료

- M0 (PR #1): 훅·settings.json, lint/test 골격, ci.yml(ubuntu)
- M1 (PR #2): 0a 프로브, 결과 스키마·parse-result, 픽스처, sim S1~S7·S10. G1·G2·G3 통과
- M2 (PR #4): `extension/` 최소판, Xcode 프로젝트(`xcode/`, 사용자 Xcode 베타 생성 `project.xcproj`), `scripts/make-xcode.sh`, ci.yml macos job(러너 converter 임시 프로젝트 무서명 빌드), 진단 popup(schemaVersion 5), 프로브 P0-6(VP9 입력 방식 실험). G4 통과, G3c 통과(ProMotion·창 모드, 60fps 소스)
- M2 수정 회차 L·N·P·Q·R·S(세부는 git 이력과 PLAN.md 게이트 판정 기록)

## 핵심 사실 (M3 이후에도 유효)

- Safari 27.2 `importExternalTexture(video)`는 VP9 프레임을 예외 없이 검게 반환(A21). 확장은 입력 경로를 ext → vf(`new VideoFrame(video)` → importExternalTexture, A23) → copy 순서로 자동 선택. YouTube 대부분이 VP9라 실사용은 vf 경로
- vf 경로 비용: 2160p JS p95 1~2 ms, video 드롭 0. 누락률은 YouTube 페이지 자체 부하(baseline 4.8%)가 지배
- 헤드룸(안정 후): 밝기 낮음 4 / 중간 3 / 최대 2. 체감은 밝기 최대에서 가장 좋으나 균형 초안은 하이라이트가 과함(PLAN.md C절 0b 체감 기록)
- 60Hz 설정에서 rAF 30회/s(A24, 원인 미확인, M6)

## 검증 (마지막 상태)

- (1) lint 통과, `npm test` 129/129, `python3 -m pytest sim` 106/106, check-fixtures 6/6, results 전체 parse-result rc=0
- (2) CI ubuntu(`test:dom` WebKit 포함)·macos green (`9dc8d43`)
- (3) 사용자 Mac 0b 1~5차: PLAN.md 게이트 판정 기록 참조

## sim 핵심 수치 (프리셋 정확 / 균형 / 선명, M4 자료)

- S4 음수 채널(RGB 9³ 격자): 0% / 1.33% / 11.34%
- S4 색 패치 ΔE ITP 평균(채도 효과만): 0 / 4.05 / 19.3
- S5 amp_enc 최대: 8.51 / 7.99 / 6.67
- S10 헤드룸 2에서 잘리는 입력 코드: 0 / 9개(247~255) / 25개(231~255)

## 미해결 이슈

- K1 미구현(프로브 지표 정리, schemaVersion 6 예정). 별도 소규모 PR
- M6 이월: 비60fps 소스 끊김 원인 분리(cadence 지표 사용), 60Hz rAF 30회/s(A24), 전체화면 비용 측정
- S2 C¹ 위반 1488점은 검사법 문제(곡선 결함 아님). 검사법 수정은 Opus 결정
- 커밋된 `xcode/`는 Xcode 베타 형식이라 러너에서 빌드하지 않음(CI는 임시 프로젝트로 빌드). 안정판 Xcode로 재생성 여부는 필요 시 결정
- eslint probe globals 없음, run_all md 표 정렬, 픽스처 재생성 느림, 움직이는 박스 겹침(사소)

## Opus 확인 필요

- M4: 기본 프리셋 수치(밝기 최대 체감 기준 균형 초안보다 약하게), P와 밝기 대응, S4/S5 기준, S6 근사·ΔE ITP 계수, 참조 HDR 이미지 부재

## M3 진행 (브랜치 claude/m3-lifecycle)

- 1단계 완료(`6f2796f`): W-A detect.js 감지 함수·dom-skeleton·테스트, W-B overlay.js(rAF 합류, ResizeObserver video+container, webkitfullscreenchange)
- 2단계 완료: detect.nextLifecycle(상태 전이 표)·findPlayer, findMainVideo가 player도 반환, renderer.restartSource·VideoFrame.colorSpace 수집(frameProbe·getStats), main.js 상태 모델 재작성(소스 단위 재시작, 요소 교체, nav 이벤트+MutationObserver(#movie_player, 250ms) 이중화, DRM 요소 영구·blackFrame/hdrSource 소스 단위·pip 상태 단위, skip 시 renderer.stop+캔버스 숨김으로 GPU 재사용), hud.js schemaVersion 6(lifecycle·flags.hdrSource·video.colorSpace), result-schema-m2.json·parse-result.py v6, tests/unit/extension-lifecycle·main 추가
- 설계 해석(계획 문구 보강, Opus 확인 요청 아님): renderer 오류는 모두 skipped(noGpu)로 요소 단위 처리(원인은 errors[]). `milestone`은 'M2' 유지. 이벤트 로그는 lifecycle.events. HDR 배지(2순위)는 셀렉터 확정 전이라 미사용. 설정 껐다 켜면 noGpu 요소도 재시도
- 셀렉터 [미확인]: 극장·미니플레이어·HDR 배지(추측값, 스냅샷 후 확정)
- → verify: lint 통과, npm test 161/161, test:dom 7/7, pytest sim 106/106(.venv), check-fixtures, 과거 results parse-result rc=0, v6 합성 진단 parse-result 출력 확인 / (1) 로컬 Mac
- 미검증(사용자 Mac): 실제 Safari에서 SPA 이동·소스 교체·PiP·미니플레이어 캔버스 이동·HDR/DRM 스킵 동작. M3 체크리스트(docs/manual-checklist.md M3 절)는 3단계에서 작성
- 로컬 환경: Homebrew Python은 PEP 668로 `pip --user` 불가 → `.venv`(프로젝트 루트, 커밋 안 함)에서 `.venv/bin/python -m pytest sim`. docs/local-session.md 11행은 아직 `pip --user` 안내

- 3단계 완료(PLAN M3-8): dom-skeleton.js 개선(조상은 ytd-watch-flexy/miniplayer/app까지, 하위 한정 출력, FULL=false), 실제 스냅샷 픽스처 3개(yt-default·yt-theater·yt-hdr-settings, 극장 속성·HDR 배지는 미확인으로 고정), detect hdrBadge 추측 셀렉터 교체(판정 미사용), tests/dom 실제 스냅샷 테스트, manual-checklist M3 절·재수집 절차
- → verify: lint 통과, npm test 161/161, test:dom 14/14(WebKit), 스크립트를 WebKit에서 실제 픽스처로 실행해 출력 확인 / (1) 로컬 Mac. 사용자 Mac 체크리스트·셀렉터 확정(극장·미니플레이어·광고·전체화면 재수집)은 미검증

## 다음 단계

1. (완료) 로컬 Mac 세션 준비
2. (완료) M3-6 1~3단계
3. 사용자: 개선된 `scripts/dom-skeleton.js`로 극장·미니플레이어·광고·전체화면 재수집(docs/manual-checklist.md M3 절) → 셀렉터 확정(Sonnet) → M3 체크리스트 7항목
