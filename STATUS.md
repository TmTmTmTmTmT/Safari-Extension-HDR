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

## M4-A 결과 (브랜치 claude/m4-algorithm, 2026-10-01, Sonnet, sim만 변경)

- 추가: `sim/explore.py`(S11, 격자 300개 × 클래스별 C1~C5 판정), `sim/test_explore.py`, `run_all`에 S11 포함. 확장 코드 변경 없음. 재현: `.venv/bin/python -m sim.explore`
- 통과 수(S2 C¹ 검사 포함 기준): 정확 2/300, 균형 26/300, 선명 84/300. S2 C¹ 위반만 걸린 행(n=1.5 계열)을 허용하면 각각 +7, +28, +69
- 가장 강한 통과 후보(피크 기준, 값만): 정확 P2·k0.45~0.5·n2·s1.0 amp_t1 3.09~3.33, 피크@0.45 1.45 / 균형 P3·k0.45·n2·s1.0 amp 4.35, 피크 1.9 / 선명 P4·k0.45·n2·s1.0 amp 5.29, 피크 2.35. 모두 격자 가장자리(k 최저 0.45, n 2.0)에 있어 격자가 탐색 한계를 건드린다
- 관찰: ① amp_enc 최대는 항상 코드 254(꼭대기)이고 s와 무관, 꼭대기 기울기 f'(1)에 비례. ② P=3·k0.55 기준 n1.5 amp 4.04, n2.0 5.19, n2.5 6.34, n3.0 7.49 — n을 낮추는 것이 효과가 크다. ③ n=1.5는 S2 C¹ 검사에 걸리지만 STATUS "S2 C¹ 위반은 검사법 문제" 항목과 같은 현상으로 의심(미확인). ④ s=1.05는 음수 채널 1.33%, s=1.2는 11.34%(S4와 일치). ⑤ k≥0.45에서 미드톤(Y=0.18, 0.4)은 항상 항등(비 1.0)
- → verify: pytest sim 149/149, lint 통과 / (1) 로컬 Mac. 수치 선택은 하지 않았다(Opus)

## Opus 확인 필요 (M4-A)

- n=1.5 계열을 후보로 인정할지(S2 C¹ 검사법 수정 또는 면제 결정). 인정하면 같은 피크에서 amp가 약 20% 낮다
- 격자 확장 필요 여부: n ∈ (1.5, 2.0) 사이(예 1.75), 선명 쪽 P>4. k는 C3(≥0.45)가 하한이라 확장 불가
- 프리셋 수치 확정(C절 표 개정)과 M4-B 착수 지시

## M4-B·M4-E 구현 (브랜치 claude/m4-algorithm, 2026-10-01, Sonnet)

- 프리셋 확정값 반영(PLAN M4-A2): `sim/presets.py`, `params.js` `PRESETS`(accurate/balanced/vivid), 기본 강도 0.45. sim 테스트 중 이전 초안 수치에 묶인 기대값 7곳은 임계값을 프리셋(k 등)에서 가져오게 바꿨다(성질은 약화하지 않음): test_banding·test_refs(항등 구간 = 프리셋 k), test_color(hs 무효 구간 = 휘도 ≤ k 패치, `sat_hs_sweep`의 mid/hi 구분을 이름이 아니라 휘도로), test_compare(k<0.5이면 Y∈(k,0.5]에서 편차 존재), test_headroom(g=1.05 복사본으로 게인 성질 확인)
- 셰이더: ITM 파라미터 uniform `ItmParams`(f32 12개 = 필드 9 + 패딩 3, 48바이트, binding 2, 필드 순서 = `params.UNIFORM_ORDER`), `itm_lin`·`itm_mix`(선형 P3 혼합 → P3 휘도 채도 → OETF)·`sharpen`(4탭 언샤프, 유니폼 분기). 휘도 계수를 정밀값(0.2126390059…)으로 통일해 JS 미러·numpy와 일치
- JS 미러 `content/tonecurve.js`(런타임 미사용, 테스트 전용), `sim/export_ref.py` → `tests/unit/fixtures/tonecurve-ref.json`(240 KB, `.prettierignore` 추가), `sim/test_export_ref.py`가 커밋된 참조의 최신성 검사, `extension-tonecurve.test.js`가 오차 < 1e-4 검사
- renderer `setParams`(바뀐 값만 병합, writeBuffer만), main은 preset·strength·sharpness·saturation 변경 시 `setParams`만 호출, popup에 프리셋 select·선명도·채도 슬라이더, 진단 schemaVersion 8(`render.preset`·`sharpness`·`saturation`), 스키마·parse-result 갱신, checklist M4 절
- → verify: lint 통과, npm test 176/176, test:dom 14/14, pytest sim 157/157, 과거 results parse-result 통과, v8 합성 진단 parse-result 확인 / (1) 로컬 Mac. **WGSL 컴파일·선명도 GPU 비용·체감은 미검증(사용자 Mac 필요)**
- 해석(계획 문구 보강, Opus 확인 요청): ① 채도 슬라이더 표시 범위 50~150%(저장 0.5~1.5). ② `LUMA_709` 계수를 sim과 같은 유도값(0.2126390059, 0.7151686788, 0.0721923154)으로 통일해 기존 WGSL의 반올림 값(0.2126/0.7152/0.0722)과 약 4e-5 차이. ③ 선명도는 `texture_external`에도 `textureDimensions`를 쓰며 이 호출이 Safari 27.2에서 허용되는지는 미검증. ④ 프리셋 `선명`의 popup 문구는 "선명 (밝기 중간 이상 권장)"

- M4 1차 회신(2026-10-01, `results/result-M4-20261001-accurate-first.json`, 프리셋 accurate·강도 43%·선명도 0·채도 105%, 밝기 미기재): 사용자 보고 "잘됨". 새 셰이더(uniform·혼합·채도)가 Safari 27.2에서 컴파일·동작(errors 없음, path vf, loopFps 71·displayMissRate 0·JS p95 1 ms·video 드롭 0, 30fps 소스). 체크리스트 M4 절의 나머지(프리셋 비교, 뭉개짐 시작 강도, 선명도 GPU 비용·끊김, 채도 선호)는 [미확인]. 확장 끄고 켜기를 반복한 이벤트 로그는 정상(중복 disable은 popup 모드 토글)

## M5 진행 (브랜치 claude/m5-ui, 2026-10-01, Sonnet)

- 1단계 완료(PLAN M5-5): `params.js` 기본값 갱신(정확·강도 0.53·채도 1.05), `RANGES.n` 하한 2.0(`sim/presets.py`·`sim/sweep.py` 격자 동일), 사용자 지정(`custom`·`normalizeCustom`·`curveOf`·`effectivePeak`·`DETAIL_STEPS`·키 `sdrhdr.custom`/`sdrhdr.hud`), renderer `setParams`가 custom 병합·getStats에 custom·effectivePeak, main이 custom 변경 전달·진단에 hud, 진단 schemaVersion 9(`render.custom`·`effectivePeak`, `flags.hud`, preset에 custom), 스키마·parse-result
- → verify: lint 통과, npm test 181/181, test:dom 14/14, pytest sim 157/157 / (1) 로컬 Mac
- 2단계 완료: W-A popup(프리셋 select 사용자 지정 포함, 상세 설정 슬라이더 6개 — min/max/step은 params에서, 이동 시 preset custom + custom 전체를 한 번에 저장, 유효 피크 표시와 2.0 초과 경고, 진단 영역 `<details>` 분리, HUD 체크박스, `tests/unit/extension-popup.test.js`), W-B 페이지 HUD(`hud.js`에 `hudLines(info)`·`createHud(container)` 추가, 단위·`tests/dom/m5-hud.spec.js`)
- 본 세션 연결: main.js가 설정 `hud`가 켜진 동안 attach 때 HUD를 만들고 1초 주기로 `hudLines`(summarize·displayMissRate 재사용)로 갱신, 끄거나 detach하면 제거. 체크리스트 M5 절 추가
- 해석(Opus 확인 요청): ① `hudLines`는 PLAN 문구(stats, lifecycle, settings)와 달리 main이 계산한 평탄한 `info` 객체 1개를 받는다. ② HUD 삽입 위치 함수를 `detect.js`가 아니라 `createHud(container)`가 `container.parentNode` 직접 사용(container는 detect.findMainVideo 결과라 셀렉터는 detect에만 남음). ③ 상세 슬라이더 표시 소수 자릿수는 `DETAIL_STEPS`에서 계산
- → verify: lint 통과, npm test 200/200, test:dom 15/15, pytest sim 157/157 / (1) 로컬 Mac. **popup UI·HUD 표시·상세 슬라이더 반영은 미검증(사용자 Mac 필요)**

- M5 1차 회신(2026-10-01, `results/result-M5-20261001-custom-hud.json`, 프리셋 custom·HUD 켬): 사용자 지정 곡선 {P2.6, k0.4, n2, g1.11, s1, hs1.03}, 강도 53%·채도 105%, 유효 피크 2.0(= 1 + 0.53 × (2.6×1.11 − 1))에서 errors 없음, path vf, 갱신 누락 6.9%·loopFps 57·JS p95 1 ms·드롭 0(HUD 켠 상태, 60fps 소스, 영상 일시정지 중 캡처). 체크리스트 M5 절의 개별 항목(반영 속도, 프리셋 전환, HUD 위치·갱신·끊김 판정 등)은 사용자 보고가 없어 [미확인]. 누락률 6.9%는 HUD 영향인지 페이지 부하인지 분리하지 않음(M2의 baseline 4.8%와 같은 규모)

## 기본값 변경 (2026-10-01, 사용자 지시, 브랜치 claude/m6-stability)

- popup 스크린샷의 설정을 기본값으로: 프리셋 `custom`, 곡선 {P2.0, k0.40, n2.0, g1.22, s1.03, hs1.03}(`params.DEFAULT_CUSTOM`), 강도 0.43, 선명도 0, 채도 1.05, HUD 꺼짐. 유효 피크 1.6192. 저장된 설정이 있으면 그대로 유지되며 기본값은 저장값이 없는 키에만 쓰인다
- 변경: `params.js`(`DEFAULT_PRESET='custom'`, `DEFAULT_CUSTOM`, `normalizeCustom` 누락 기본값 = `DEFAULT_CUSTOM`, `curveOf`가 프리셋 id가 아니면 custom 사용), 관련 단위·popup 테스트 기대값, 체크리스트 M5 문구
- PLAN M5-0(기본값 정확·53%)과 달라진 사용자 지시라 Opus에 알림: 다음 PLAN 개정 때 M5-0 문구와 D-M6 soak 조건("정확 프리셋·기본값")을 새 기본값 기준으로 고친다
- → verify: lint 통과, npm test 200/200 / (1) 로컬 Mac

## 다음 단계

1. (완료) 로컬 Mac 세션 준비
2. (완료) M3-6 1~3단계
3. 사용자: 개선된 `scripts/dom-skeleton.js`로 극장·미니플레이어·광고·전체화면 재수집(docs/manual-checklist.md M3 절) → 셀렉터 확정(Sonnet) → M3 체크리스트 7항목
