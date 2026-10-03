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

## M6 구현 (브랜치 claude/m6-stability, 2026-10-01, Sonnet)

- W-A(renderer.js, M6-1): frameProbe 최적화. 결정 전·restartSource 직후 회차는 vf 먼저 측정(순서 vf → ext → copy → c2d)하고 vf의 colorSpace가 HDR이면 나머지를 건너뛰며(`hdrEarly`, `onProbe(…, 'pending')`) path·pendingCount·noneStreak 불변, 결정 후 회차는 선택 경로 하나만 측정해 값 ≥ 2이면 `mode:'single'`로 끝내고 아니면 같은 회차에서 전체 측정(`mode:'full'`)으로 현행 stepDownPath·onProbe 로직을 그대로 수행. 기존 테스트 2건의 호출 순서·colorSpace 기대값 갱신(성질 약화 없음), 새 테스트 5건
- W-B: `docs/install.md`(신규, 8장 구성, 미확인 사항은 [확인 필요])
- 본 세션: 진단 schemaVersion 10(`frameProbe.mode`·`hdrEarly`), 스키마·parse-result, manifest 1.0.0, popup.html 정적 초기값을 새 기본값(강도 43%)으로 정리, 체크리스트 M6 절
- → verify: lint 통과, npm test 206/206, test:dom 15/15, pytest sim 157/157, 과거 results parse-result 통과 / (1) 로컬 Mac. **soak·전체화면·60Hz·비60fps·4K HDR 첫 attach 효과는 미검증(사용자 Mac 필요)**
- 해석(Opus 확인 요청): ① `SINGLE_OK_MIN = 2`를 renderer 로컬 상수로 둠(detect의 검정 기준과 같은 값, detect가 export하지 않음). ② `restartSource` 직후 첫 회차가 vf를 먼저 재서 `colorSpace`가 즉시 새 값으로 채워짐(이전 테스트의 "null로 비워짐" 기대를 "새 소스 값으로 교체"로 갱신). ③ install.md에서 [확인 필요]로 남긴 것: 안정판 Xcode 호환, "서명되지 않은 확장 허용"의 재시작 시 재설정 필요 여부, 7일 만료 정확한 기간·증상, 재서명 후 설정 유지 여부, 설정 초기화 방법, popup "JSON 저장" 링크 동작, blackFrame 재시도 방법

- M6 사용자 회신(2026-10-01, 수치 JSON 없음, 사용자 보고): 재빌드·실행 후 30분 soak "문제없음", 4K HDR 첫 attach "문제없음, `frameProbe.hdrEarly` true 확인", 전체화면·60Hz·비60fps "문제없음". 드롭률·메모리 수치와 진단 JSON은 제출되지 않아 PLAN D-M6 기준(드롭 < 1%, 메모리 증가 < 15%)의 수치 검증은 [미확인]이며 사용자 판단으로 통과로 본다. M6 판정은 Opus가 게이트 판정 기록에 한다

## T 회차 구현 (브랜치 claude/review-fixes, 2026-10-01, Sonnet)

- FIX_GUIDE T 회차 전 항목 구현. `params.js` 진단 요청 키 `sdrhdr.diagRequest`(`requestDiag`·`subscribeDiagRequest`) 먼저 커밋 후 W-A(renderer)·W-B(popup) 병렬
- W-A `renderer.js`: T1 소스 세대 번호로 진행 중 frameProbe 결과 폐기(`restartSource`·`enterBaseline`에서 증가, `probeVf`의 colorSpace 쓰기도 확인), T3 `probePoll` hidden이면 반환, TA 상수 `SKIP_SAME_FRAME=true` + dirty 플래그(vf: `VideoFrame.timestamp` 동일, copy: `updateCopyTexture`가 'same', ext는 항상 렌더), 생략 tick도 loopTs·srcTs·frameTimes 기록, `sameFrameSkipped` 통계. 기존 테스트 1건(P2)의 `renders` 기대를 TA(e)에 맞게 3→2로 변경(+`sameFrameSkipped` 1 단언), 새 테스트 13건
- W-B `popup`: T2 진단 영역을 열 때 1회 + 2초마다 요청, 닫으면 중단, T4 닫힌 동안 textarea 불변·scrollTop 보존·Blob은 "JSON 저장" 클릭 시 생성, T5(a) `DEFAULT_CUSTOM` 폴백, 안내 문구 한 줄. 새 테스트 6건
- 본 세션: `main.js` 2초 주기 진단 저장 제거·요청 시 보이는 탭만 응답(T2), HUD 갱신 hidden 건너뜀(T3), 진단 schemaVersion 11(`render.sameFrameSkipped`)·스키마·parse-result, manifest 1.0.1·`tonecurve.js` 제거(T5b, 테스트가 직접 로드), 체크리스트 "T 회차 확인", install.md 문구
- → verify: lint 통과, npm test 228/228, test:dom 15/15, pytest sim 157/157, results parse-result 통과 / (1) 로컬 Mac. **TA의 "그리지 않아도 캔버스가 마지막 화면을 유지"(깜박임 없음), popup 진단 영역 동작, 두 탭 응답은 미검증(사용자 Mac 필요)**
- 해석: ① 경로 변경 dirty는 단위 테스트가 약함(vf→copy 폴백만 렌더 확인). ② T2로 popup을 처음 열 때 저장된 진단이 없으면(요청 전) 진단 상자가 비어 있다 — 진단 영역을 펼치면 채워진다

## M7 구현 (브랜치 claude/m7-ux, 2026-10-02, Sonnet)

- 계획: PLAN D-M7(UX 1단계), 근거 `docs/ux-review.md`. 사용자 결정: 프리셋 `vivid` 표시명 **'강조'**(저장 id 불변)
- 본 세션: `params.js`(`curveY`·새 `effectivePeak` = 1 + t(f(g) − 1), `HEADROOM_STEPS`·`peakAdvice`·`RESETTABLE_KEYS`·`KEYS.customPrev`), `main.js`(꺼진 채 시작 → skipped(disabled), 보이지 않는 탭은 진단 미기록 + visibilitychange 즉시 1회, HUD 누락률 null 보존), `hud.js`(라벨 '렌더 fps'·'선명도'·'강조', 2줄 구분자, 진단 schemaVersion 11), 스키마 설명·parse-result 주의 문구, manifest 1.1.0, 체크리스트 M7 절. 테스트 추가(curveY 미러 일치, 기본값 ×1.90, M5 회신 설정 ×2.25, main 2건)
- W-A(impl-worker): popup 전면 개편(M7-3 전체) + 테스트 24건. W-B(impl-worker): install.md(설치 순서·끄기·제거·회복 방법), 체크리스트 구조 개편(완료 절은 `docs/archive/manual-checklist-m1-m6.md`로 이동), make-xcode.sh 안내 1줄
- → verify: lint 통과, npm test 226/226, test:dom 15/15, pytest sim 157/157, 과거 results parse-result 통과 / (1) 로컬 Mac. **popup 화면·다크 모드·스위치·되돌리기·기본값 복원·복사·HUD 표시는 미검증(사용자 Mac 필요)**
- 해석(Opus 확인 요청): ① 같은 편집 세션에서 프리셋을 바꿔 다시 편집하면 되돌리기 안내의 프리셋 이름이 처음 것으로 남음. ② W-B가 보관 파일에서 M3·M4a·M4 전제의 make-xcode 문구와 M4 '(당시 기본값)'을 한 줄씩 고침(줄 수 불변). ③ 상세 슬라이더 저장 throttler를 6개에서 1개로 합침. ④ PLAN M7-3 '진단 영역 고정 토글' 없이 포커스·선택 중 갱신 보류로 대체(계획대로)
- 이월: [확인 필요] install.md 항목(메뉴 이름·두 타깃 서명 필요 여부·확장 데이터 삭제 등), 2·3단계 UX 항목(ux-review 참조)

## M8 구현 (브랜치 claude/m8-plan, 2026-10-02, Sonnet)

- 계획: PLAN D-M8(UX 2단계). 사용자 결정: 권한·background·단축키·아이콘 추가, 컨테이너 앱 한국어화 제외. install.md [확인 필요] 5건 해소(두 타깃 서명 필요, 서명되지 않은 확장 허용은 재시작마다, 사이트 접근 선택지, 메뉴 이름, 빌드 폴더)
- 본 세션: `params.js`(`statusOf`·`MSG`·`setEnabled`·`notify` 키), `renderer.js`(`setBypass`·`getStats().undecided/bypass`), popup 버전 v1.2.0, install.md·체크리스트 M8 절
- W-A: `main.js`(현재 탭 상태 입력, getState 응답, background 알림, HUD 수명 분리, 상태 칩, 단축키)·`hud.js`(한국어 상태 문구·`createChip`) + 테스트·DOM 테스트. W-B: popup 상태 줄·상태 알림 체크박스·단축키 안내. W-C: `background.js`, manifest 1.2.0(background·icons·default_icon), `scripts/make-icons.py`와 PNG(확장 14개·앱 10개·Icon.png), 테스트
- → verify: lint 통과, npm test 282/282, test:dom 18/18, pytest sim 157/157 / (1) 로컬 Mac. **Safari의 tabs.sendMessage·background service_worker 로드·배지·아이콘·단축키·칩·화면은 미검증(사용자 Mac 필요)**
- 해석(Opus 확인 요청): ① 상태 칩이 영상 전환마다 '판정 중(원본 표시)'을 잠깐 띄움 → wait 레벨을 칩에서 제외할지. ② Option+Shift+H 직후 'HDR 변환 켜짐' 칩 뒤에 storage 반영으로 상태 칩이 이어서 뜰 수 있음. ③ `drmNow`는 mediaKeys/webkitKeys만 읽음(encrypted 이벤트만 있으면 '이전 DRM 영상' 문구로 표시될 수 있음). ④ 앱 아이콘 슬롯만 여백 약 9.8%(macOS 규격), 확장·Icon.png는 꽉 채움. ⑤ popup 켜기 스위치가 `cur.enabled`를 갱신하지 않아 기본값 복원 때 옛 enabled가 되살아나던 M7 결함을 W-B가 한 줄 수정
- 이월: manifest background 형식이 Safari에서 로드되지 않으면 `{"scripts":[…],"persistent":false}`로 교체(사용자 Mac 확인 후), `tabs.sendMessage`가 거부되면 `activeTab` 권한 추가

## 병합 (claude/amazing-hypatia-3rbspr → claude/m8-plan, 2026-10-03, Sonnet, 사용자 지시: 버그 수정 우선)

- 두 줄기(T 회차 1.0.1 ↔ M7·M8 1.2.0)를 통합. 충돌은 T 회차 방식을 우선: 2초 주기 진단 저장 제거·popup 진단 요청(`sdrhdr.diagRequest`)·숨긴 탭 HUD 중단·`tonecurve.js` manifest 제외·`sameFrameSkipped`. M7·M8 쪽은 그 위에 얹음(popup 진단 영역은 열렸을 때만 textarea 갱신, Blob은 저장 클릭 시)
- 버전: manifest 1.2.0 유지(T 회차 수정 포함). 진단 schemaVersion은 두 줄기가 각각 11을 써서 **12로 올림**(12 = 새 effectivePeak 공식 + sameFrameSkipped). 스키마·parse-result 안내 갱신
- 테스트: `tonecurve.js`가 manifest에 없으므로 curveY 미러 테스트는 따로 로드. popup 테스트에 진단 요청 3건 포함
- → verify: lint 통과, npm test 301/301, test:dom 18/18, pytest sim 157/157 / (1) 로컬 Mac

## 조사: 메모리 증가·재부팅 후 설정 초기화 (2026-10-03, Sonnet, 코드 읽기만, 변경 없음)

- **메모리**: 코드상 누수 경로는 찾지 못함. 확인한 것: VideoFrame은 모든 경로에서 `finally`로 close, probe 텍스처·버퍼는 destroy, `destroy()`는 `device.destroy`·`ctx.unconfigure`, 오버레이·main의 ResizeObserver·MutationObserver·리스너·타이머는 detach 때 해제, 통계 링 버퍼와 `errors`·`events`는 상한 있음, setInterval은 start() 1회만 등록, HUD·칩 DOM은 container 변경·끄기 때 제거. 프레임마다 bindGroup·encoder·외부 텍스처를 새로 만드는 것은 설계(GUIDELINES 2.5-1)라 GC 대기 중 WebContent 메모리가 오르내리는 것은 정상 범위일 수 있으나 Safari에서 실제 회수 속도는 **미검증**. M6 soak는 메모리 수치 없이 사용자 판단으로 통과했으므로 증가 여부 자체가 수치로 확인된 적 없음
- **설정 초기화**: 코드에서 설정을 지우는 경로는 popup '기본값으로 되돌리기'의 `storage.local.remove` 하나뿐이고, 저장소는 `storage.local`(session·sync 미사용)이라 재부팅만으로 코드가 지우지는 않음. 가능한 원인은 Safari 쪽: ① 서명되지 않은 확장은 Safari 재시작마다 꺼져 다시 켜야 함(사용자 확인) → 이때 확장 저장소가 지워지는지 **미확인**, ② Xcode Run으로 다시 설치하면 저장소가 새로 시작되는지 **미확인**, ③ 사용자가 '초기화'라 느끼는 것이 실제로는 '켜기 꺼짐/사이트 접근 허용 초기화'일 가능성
- Opus 확인 필요: 두 건 모두 원인 특정에 측정이 필요함. 제안(계획 문서 필요): (a) background.js `onStartup`/`onInstalled`에서 저장소 기존 키 유무만 `sdrhdr.boot`에 기록해 재부팅 후 저장소가 비었는지 코드 버그인지 가름, (b) 체크리스트에 메모리 측정 절차 재수행(5·30분 Activity Monitor 수치 기록)과 설정 초기화 재현 절차 추가

## U 회차 구현 (브랜치 claude/u-fixes, 2026-10-03, Sonnet)

- 사용자 보고: Xcode 다시 Run·Mac 재부팅 시 슬라이더 값 초기화, 4K 재생 중 kernel_task+Safari 페이지 약 13 GB(HUD 끔). Opus FIX_GUIDE U 회차
- 본 세션: `params.BACKUP_KEYS`·`KEYS.restoredAt`, `main.js` 진단 `devicesCreated`(detach된 renderer 누적)·`uptimeS`·`gpuBusySkipped`·`sameFrameSkipped` 전달, `hud.js` buildDiag 필드·schemaVersion 13, 스키마·parse-result, popup 복원 안내 한 줄·버전 v1.2.1, install.md·체크리스트 U 절
- W-A: `background.js` 백업(1초 디바운스, 원본 값)·복원(저장소가 모두 비고 백업이 있을 때 1회, restoredAt), manifest 1.2.1·`nativeMessaging`, `SafariWebExtensionHandler.swift` backup:set/get(UserDefaults, ≤16 KB, 로그는 type만), 테스트. xcodebuild 무서명 빌드 성공
- W-B: `renderer.js` GPU in-flight 상한 2(`onSubmittedWorkDone`, 세대 번호로 늦은 settle 무시), busy tick 생략(`gpuBusySkipped`), `getStats` inflight·uptimeS·devicesCreated, 테스트 7건. 본 세션이 busy tick에서 `srcTs`도 직전 소스로 기록하게 보정(loopTs와 인덱스 정렬, FIX_GUIDE S2 가정 유지)
- → verify: lint 통과, npm test 323/323, test:dom 18/18, pytest sim 157/157, xcodebuild 무서명 빌드 성공, 과거 results parse-result 통과 / (1) 로컬 Mac. **Safari의 nativeMessaging·UserDefaults 유지·복원, onSubmittedWorkDone 동작, 메모리 영향은 미검증(사용자 Mac 필요)**
- 해석(Opus 확인 요청): ① 복원은 저장소가 비었을 때만 네이티브 조회. 백업에 BACKUP_KEYS 키가 하나도 없으면 복원 안 함. ② busy 검사는 경로 확정 뒤·VideoFrame 생성 전. probe submit은 in-flight에 세지 않음. ③ busy tick의 srcTs 보정(위)

## M9 구현 (브랜치 claude/m9-presets, 2026-10-03, Sonnet)

- 계획: PLAN D-M9(내 프리셋: 현재 설정 저장·불러오기·삭제, 최대 20개). 저장 값은 곡선 6 + 강도·선명도·채도, 켜기·진단 모드·HUD·알림은 제외. 네이티브 백업(U1)에는 포함, 기본값 복원 대상에서는 제외
- 본 세션: `params.js`(`KEYS.userPresets`, `normalizeUserPresets`·`snapshotValues`·`upsertUserPreset`·`removeUserPreset`·`applyUserPresetEntries` 순수 함수, `BACKUP_KEYS`에 추가), `background.js` 백업 목록, manifest·popup 헤더 1.3.0, install.md "내 프리셋"·체크리스트 M9 절
- W(impl-worker): popup `내 프리셋` 영역(저장·같은 이름 2단계 덮어쓰기·불러오기 한 번의 set·곡선 백업/되돌리기 재사용·삭제 2단계·진단 모드 잠금·onChanged 갱신·textContent) + 테스트 12건
- → verify: lint 통과, npm test 339/339, test:dom 18/18, pytest sim 157/157 / (1) 로컬 Mac. **popup 화면·불러오기 반영·재시작 뒤 유지는 미검증(사용자 Mac 필요)**
- 해석(Opus 확인 요청): ① 불러오기는 현재 preset 종류와 무관하게 `custom`이 불러올 곡선과 다르면 백업(같으면 이전 안내를 숨김). ② 저장 직후 이름 입력을 비움. ③ `up-list`·`up-name`은 진단 모드에서 잠그지 않고 저장·불러오기·삭제 버튼만 잠금

## 다음 단계

1. (완료) 로컬 Mac 세션 준비
2. (완료) M3-6 1~3단계
3. 사용자: 개선된 `scripts/dom-skeleton.js`로 극장·미니플레이어·광고·전체화면 재수집(docs/manual-checklist.md M3 절) → 셀렉터 확정(Sonnet) → M3 체크리스트 7항목
