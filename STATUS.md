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

- M3 체크리스트 1차 회신(2026-10-01, `results/result-M3-20261001-1-6.json`, parse-result rc=0): 1 SPA 이동 통과(navCount 4·srcChanges 3, 소스 변경 후 약 1.2초에 hdrSource 판정), 2 화면 모드(극장·전체화면·기본) 위치·조작 문제 없음, 3 창 크기 문제 없음, 5 HDR 영상 오버레이 해제(transfer pq, bt2020, 3840x2160), 7 DRM 오버레이 없음(JSON 미첨부, 사용자 보고). 4 광고는 프리미엄 계정이라 [미확인]. 6 PiP는 Apple 네이티브 UI로 들어가 확장 동작 없음(예상, pipEnter→skip:pip→pipLeave 이벤트 확인), 복귀 후 오버레이 재개는 사용자 응답에 명시 없음 [미확인]. 미니플레이어는 이벤트 로그에 없음 [미확인]
- 이 회신의 `render`·`loopFps` null은 마지막 상태가 skipped(hdrSource)라 restartSource가 측정 버퍼를 비웠기 때문(정상)
- 사용자 스냅샷 2차(ytd-watch-flexy 조상 포함, 라벨 없음): `ytd-watch-flexy`에 theater 속성 없음, 설정 버튼 클래스 `ytp-hd-quality-badge`. 극장 상태 스냅샷이 아니라 theater 속성명 확정에는 쓰지 않았고 커밋하지 않음

## Opus 확인 필요 (M3)

- M3 판정 요청: 1·2·3·5·7 통과, 4·6(복귀 재개)·미니플레이어 [미확인]. 광고는 비프리미엄 계정·광고 있는 영상이 필요하다. 판정은 Opus가 PLAN.md 게이트 판정 기록에 한다
- 사용자 요청(M4/M5 계획 반영): HDR 강도를 itm 기준으로 드래그(슬라이더)로 조절. 어떤 파라미터를 "강도"에 대응시킬지(헤드룸·k·s 등)와 프리셋 관계는 설계 결정이라 구현하지 않았다. M5 popup 상세 UI와 겹친다
- 관찰: HDR 4K 소스 첫 frameProbe에서 `c2dSyncMs` 608 ms(메인 스레드 동기 점유), 전체 644 ms. 소스 변경·attach마다 반복될 수 있다. 체감 끊김 보고는 없었다. M6 후보로 기록하고 처리 여부는 Opus 결정

## M4a 진행 (브랜치 claude/m4a-strength, PR #5 머지 후 main에서 분기)

- 구현 완료: WGSL 강도 혼합(`itm_mix`, uniform binding 2, ITM_FN 본문은 probe와 동일 유지, 혼합은 `ext_eotf(itm())` 역변환으로 선형 값을 얻어 `mix(idLin, itmLin, t)` 후 OETF), renderer `setStrength`(writeBuffer만, 파이프라인 재생성 없음, 정지 상태 1회 렌더), params `sdrhdr.strength`·`STRENGTH`·`normalizeStrength`, main `onSettings`에서 `setStrength`만 호출, popup 슬라이더(100 ms 저장 throttle, itm 외 비활성), hud·스키마·parse-result v7(`render.strength`), sim `itm_linear_strength`·S10b(t 축)·`test_strength.py`, manual-checklist M4a 절
- 해석(계획 문구 보강, Opus 확인 요청): ① 계획은 "t=0이면 identity 출력과 같다"고 했으나 식(`idP3 = 709→P3(sRGB EOTF)`)대로 구현해 t=0은 **색역 변환을 한 SDR**이며 identity 모드(변환 없이 그대로 기록)와 약간 다르다. 식과 문구 중 식을 따랐다. ② `idLin`에는 밝기 게인 g를 적용하지 않는다(균형 g=1이라 현재 영향 없음)
- → verify: lint 통과, npm test 167/167, test:dom 14/14, pytest sim 140/140, parse-result 과거 results rc=0 / (1) 로컬 Mac. **WGSL 컴파일·슬라이더 반영 속도·체감은 미검증(사용자 Mac 필요)**. naga/tint 없고 Playwright WebKit에 WebGPU 없음

- M4a 판정 통과(PLAN 게이트 기록, 2026-10-01): 슬라이더 1초 내 반영, WGSL 컴파일·동작 확인. 선호 강도 중간 40~60%/최대 40~50%, 뭉개짐 시작 중간 70~80%/최대 약 70%. 진단 JSON `results/result-M4a-20261001-strength68.json`(밝기 미기재). M4 입력(기본 강도 후보 0.45, 곡선 상단 압축·hs가 뭉개짐 주원인일 가능성 [추정])은 PLAN D-M4a M4a-6. 하이라이트(화이트포인트) 휘도 슬라이더는 M5로 이월
- 다음 마일스톤 M4(알고리즘·프리셋 확정)는 Opus 계획부터. 이 브랜치(claude/m4-inputs)는 PLAN v1.12·v1.13 문서와 결과 JSON만 담는다

## 다음 단계

1. (완료) 로컬 Mac 세션 준비
2. (완료) M3-6 1~3단계
3. 사용자: 개선된 `scripts/dom-skeleton.js`로 극장·미니플레이어·광고·전체화면 재수집(docs/manual-checklist.md M3 절) → 셀렉터 확정(Sonnet) → M3 체크리스트 7항목
