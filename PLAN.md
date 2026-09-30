# PLAN.md — Safari SDR→HDR(EDR) 실시간 변환 확장

> 작성: Opus(계획 단계). 이 문서와 GUIDELINES.md 범위를 벗어나는 설계 변경은 Sonnet이 임의로 하지 않는다. 발견한 이슈는 STATUS.md "Opus 확인 필요"에 기록한다.
> 버전: v1 (2026-09-30 승인)

## 0. 요약
1. 방식: content script가 YouTube `<video>` 프레임을 **WebGPU `importExternalTexture`**로 가져와 WGSL 셰이더에서 inverse tone mapping(ITM)을 적용한다. 결과는 `rgba16float + display-p3 + toneMapping:"extended"` 캔버스로 video 위에 오버레이한다.
2. 핵심 불확실성: Safari 26부터 WebGPU가 기본 활성화된 것은 **확인됨**이다. 그러나 WebGPU 캔버스의 `toneMapping:"extended"`가 실제 EDR로 출력되는지는 2차 출처만 있어 **미확인**이며, Phase 0 게이트 1순위로 판정한다. 대상 환경은 macOS 27.2, 내장 XDR이다.
3. EDR은 상대값이다. SDR white는 1.0이고, JS에서 헤드룸을 조회할 수 없다. 그래서 피크를 nit이 아닌 **배율(×SDR white)**로 받는다. 기본값은 프리셋 3종(정확/균형/선명)으로 제공하고, 채도 부스트를 포함한 상세 슬라이더로 조절한다.
4. 성능 목표: 소스 해상도를 따르며 최대 4K60이다. 캔버스 해상도는 `min(원본 해상도, 표시 크기×DPR)`로 둔다.
5. Phase 0은 두 단계다. 0a는 localhost 프로브 페이지, 0b는 최소 확장으로 YouTube를 실행한다. 둘 다 **사용자 Mac에서 수행**한다. 클라우드에서는 시뮬레이션, 단위 테스트, 정적 DOM 테스트만 한다.
6. 웹 경로가 실패하면 **F-A(확장 + 네이티브 헬퍼: ScreenCaptureKit 영역 캡처 → Metal EDR 오버레이)**로 진행한다. 화면 녹화 권한은 사용자가 허용한다.
7. DRM 처리: `mediaKeys`/`webkitKeys`/`encrypted` 중 하나라도 감지되면 즉시 no-op한다. 우회 설계는 없다.
8. 역할 분리: 요청하신 Opus/Sonnet 구조를 **저장소 `.claude/`와 루트 `CLAUDE.md`**로 도입한다. 클라우드 VM의 `~/.claude`는 세션마다 사라지기 때문이다. Opus는 문서(PLAN/GUIDELINES/FIX_GUIDE)만 쓰고, Sonnet은 구현·테스트·STATUS.md를 맡는다. 서브에이전트는 sim-runner(haiku)와 impl-worker(sonnet)다.
9. Xcode 프로젝트는 사용자 Mac에서 생성해 push한다. GitHub Actions macOS에서는 커밋된 프로젝트를 `CODE_SIGNING_ALLOWED=NO`로 빌드 검증만 한다.
10. 저장소는 현재 빈 상태다(브랜치 `claude/amazing-hypatia-3rbspr`). 승인 후 Opus가 문서 세트를 파일로 작성하고 Sonnet 전환을 요청한다.

---

## A. 가정 목록과 불확실성

표기: **[사실]** 1차/공식 출처, **[2차]** 2차 출처만 있음, **[추정]** 설계 추론, **[미확인]** 근거 없음.

| # | 항목 | 상태 | 근거/비고 | 검증 |
|---|---|---|---|---|
| A1 | Safari 26.0+에서 WebGPU 기본 활성화 | [사실] | WebKit Safari 26.0 블로그, Apple 릴리스 노트. 사용자 macOS 27.2(Safari 버전은 프로브가 기록) | 0a |
| A2 | Safari 26.0이 WebGPU Canvas 내 HDR **이미지** 지원 | [사실] | WebKit 26.0 블로그 문구 | — |
| A3 | WebGPU `toneMapping:{mode:"extended"}` + rgba16float가 Safari에서 EDR로 출력됨 | [확인(0a)] 2026-09-30 사용자 Mac: configure 성공, 되읽기 extended, 스트라이프 2.0까지 구분. 이전 근거: | pixijs 이슈 주장, 2024-10 WebKit 커밋 "Make HDR canvas testable via Safari"(당시 unstable 플래그). 기본 활성 여부 1차 근거 없음 | **0a 핵심** |
| A4 | WebGPU 캔버스 colorSpace는 `srgb`/`display-p3`만 지원(rec2100 없음) | [사실(스펙)] | webgpu-hdr explainer. 출력은 display-p3로 고정, BT.2020 출력은 불필요 | 0a |
| A5 | rgba16float 캔버스 값은 비선형(감마 인코딩) 확장값으로 해석됨 | [확인(0a)] P0-3 `nonlinear` | 틀리면 출력 인코딩을 반대로 적용 | 0a P0-3 |
| A6 | WebGL HDR(`drawingBufferStorage`/ToneMapping)은 Safari 미지원 | [확인(0a)] `drawingBufferStorage` 없음 | 2023년 WebKit "No signal". 존재 여부만 프로브 | 0a |
| A7 | Canvas2D `colorType:"float16"` HDR은 WebKit에서 구현 진행 중 | [확인(0a)] Safari 27.2 미지원 → G1/G2 1차 폴백 경로 없음 | WebKit PR #71719. 보조 폴백 | 0a |
| A8 | `importExternalTexture` 샘플은 descriptor colorSpace(기본 srgb) 기준 인코딩 RGB | [추정] | BT.709 transfer 처리 방식 미확인 | 0a P0-4 |
| A9 | content script(isolated world)에서 `navigator.gpu` 사용 가능 | [미확인] | — | **0b** |
| A10 | YouTube MSE(blob:) video는 origin-clean이라 SecurityError가 나지 않음 | [추정] | — | **0b** |
| A11 | 창 모드 페이지 캔버스에서도 EDR 유지 | [미확인] | — | 0a/0b |
| A12 | 배터리/저전력에서 헤드룸 축소 | [추정] | 웹에서 배터리 상태 조회 불가 | 0a 기록 |
| A13 | YouTube 전체화면은 `#movie_player` 요소 전체화면이라 오버레이가 유지됨 | [추정] | — | 0b/M3 |
| A14 | HDR 원본은 설정 버튼 HDR 배지 클래스로 판별 가능 | [추정] | 수동 토글 병행 필수 | M3 |
| A15 | GH Actions macOS 러너에서 커밋된 Safari 확장 프로젝트를 `CODE_SIGNING_ALLOWED=NO`로 빌드 가능 | [2차] | 커뮤니티 사례 | M2 CI |
| A16 | converter 기본 동작(`--copy-resources` 미사용)은 extension 폴더를 **참조**하며, 저장소 루트 기준 상대경로라면 CI에서도 유효 | [추정] | 절대경로가 박히면 CI 실패 | M2 CI |
| A17 | JS에서 EDR 헤드룸 수치 조회 불가(`dynamic-range: high`는 boolean) | [사실(스펙)] | 배율 파라미터의 근거 | — |
| A18 | 내장 XDR 헤드룸은 SDR 밝기 설정에 따라 변동(밝기를 낮출수록 커짐) | [확인(0a 2차)] 전원 연결, 안정 후 P0-2: 밝기 낮음 4 / 중간 3 / 최대 2. 밝기 변경·재그리기 직후에는 약 30초 동안 2로 보이다가 안정값에 도달 | 0a P0-2/P0-5 |
| A19 | (F-A) Safari 확장 appex ↔ 헬퍼 앱 통신은 App Group/XPC 또는 localhost 소켓으로 가능하며, 무료 개인 팀 서명에서도 해당 capability 사용 가능 | [미확인] | F-A 착수 시 FA-0 프로브로 확인 | FA-0 |
| A20 | Safari `requestVideoFrameCallback`은 video가 표시하는 모든 프레임마다 호출됨 | [반증(0a 3차)] 60Hz 디스플레이에서 60fps video의 콜백이 약 30회/s(모든 모드, 캔버스 없는 B0 포함). ProMotion에서도 51~56회/s. 같은 run의 presentedFrames 기준 video 표시율은 약 54~57회/s로 video 자체는 정상 표시. 즉 rVFC 구동 오버레이는 60Hz에서 약 30fps로만 갱신됨 | 0a 3차 |

**해석이 갈리는 지점 → 결정**
- 색 방향: 측색적 변환(709→P3 행렬)을 기반으로 하고, 채도·하이라이트 확장은 **프리셋 + 상세 슬라이더**로 둔다(사용자 답변 반영). 프리셋 수치는 S2/S4 시뮬레이션과 0a 헤드룸 측정 후 Opus가 확정한다.
- HDR 원본 판별: DOM 배지 자동 감지와 수동 토글을 함께 쓴다.
- 더 단순한 방법: macOS에는 시스템 레벨 SDR→HDR 기능이 없고, CSS `filter`는 SDR 범위를 넘지 못한다. 웹 쪽에서는 이 설계가 최소 구성이다.

---

## B. Phase 0 타당성 게이트

### 실행 위치
- **0a (사용자 Mac, 확장 없음)**: `python3 -m http.server 8000` 실행 후 Safari에서 `http://localhost:8000/probe/`를 연다(localhost는 secure context). 영상은 저장소 픽스처 mp4(same-origin)를 쓴다.
- **0b (사용자 Mac, 최소 확장)**: M2 산출물을 YouTube SDR 영상(1080p60, 2160p60)에서 실행한다.
- 클라우드는 프로브 코드, 픽스처, 기대값 표를 준비한다. 판정은 사용자 회신을 바탕으로 **Opus가 PLAN.md "게이트 판정" 절에 기록**한다.

### 프로브 항목 (결과 JSON export)
| ID | 내용 | 측정 |
|---|---|---|
| P0-1 API | `navigator.gpu`, adapter 정보/features, `configure({format:'rgba16float', colorSpace:'display-p3', toneMapping:{mode:'extended'}})` 예외 여부, `getConfiguration()` 되읽기, `(dynamic-range: high)`, `(color-gamut: p3)`, Canvas2D float16 생성 가능 여부, WebGL `drawingBufferStorage` 존재 여부, UA/Safari 버전 | 자동 |
| P0-2 EDR 램프 | CSS `#fff` 기준 패치와 셰이더 스트라이프(1.0/1.25/1.5/2/3/4/6/8/16), 참조 HDR 이미지 패치 | 사용자가 "구분 가능한 최고 단계" 선택 → 헤드룸 추정 |
| P0-3 인코딩 | 셰이더 0.5 패치 vs CSS `#808080` vs `#BCBCBC` | 일치 쪽 선택 → A5 판정 |
| P0-4 비디오 | 픽스처 1080p60·2160p60 램프/컬러바 → `importExternalTexture` → identity 셰이더(원본과 나란히) → ITM | 육안 동일성, rVFC 드롭률, JS p50/p95, `timestamp-query` 지원 시 GPU 시간 |
| P0-5 환경 | 창/전체화면, 전원/배터리, SDR 밝기 3단계(낮음/중간/최대) | P0-2 반복 |

### 통과/실패 기준
- **G1 API**: configure 예외 없음, 되읽기가 가능하면 `toneMapping.mode==='extended'`.
- **G2 EDR**: SDR white보다 밝은 단계가 **2개 이상 구분**됨. 참조 HDR 이미지는 밝은데 스트라이프가 1.0에서 포화되면 실패.
- **G3 성능** (2026-09-30 2차 개정): 전체화면 오버레이 배치(video 위 단일 캔버스, 캔버스 = min(원본, 표시×DPR)), 전원 연결, 1080p60과 2160p60 모두에서 **(ITM 오버레이 갱신 누락률 − 기준선 누락률) < 1%p**, JS p95 < 4 ms. 갱신 누락률 = 측정 창(워밍업 제외)에서 소스 프레임 간격 슬롯 중 캔버스가 한 번도 렌더되지 않은 슬롯의 비율(구동 방식과 무관한 정의). 기준선 = 같은 구동 루프를 캔버스 없이 돌린 run. 기준선 자체가 5% 이상이면 측정 환경 문제로 보고 판정 보류. 이력: 1차 개정은 rVFC 콜백 기반 드롭률이었으나, 3차 회신에서 rVFC 자체가 60Hz에서 프레임의 절반만 호출돼(A20) 구동 방식을 분리했다.
- **G4 확장 컨텍스트(0b)**: content script에서 `navigator.gpu` 사용 가능, YouTube video SecurityError 없음, 오버레이 EDR이 G2와 동등.

### 실패 분기 (Opus가 FIX_GUIDE.md 또는 PLAN.md 개정으로 지시)
| 실패 | 1차 대응 | 2차 |
|---|---|---|
| G1/G2 실패, Canvas2D float16 HDR 동작 | WebGPU 렌더 → HDR 2D 캔버스 `drawImage`, 비용 재측정 | F-A |
| G2 전면 실패 | **F-A 착수** | — |
| G3 실패 | 캔버스 해상도 상한 조정, 불필요한 합성 제거(원본 video 레이어 처리 검토), 셰이더 연산 축소 | 소스 4K에서 렌더 2560px 상한(사용자 승인 필요) |
| G4 `navigator.gpu` 없음 | 렌더러를 main world에 주입(확장 리소스 `<script>`), 파라미터는 `postMessage` | F-A |
| G4 taint(SecurityError) | 범위 내 해결 없음(CORS 우회 금지) | F-A |

### F-A: 확장 + 네이티브 헬퍼 (사용자 권한 허용 확정)
- 구성: 확장은 video 콘텐츠 사각형(화면 좌표), 재생 상태, DRM/HDR 플래그를 헬퍼에 전달한다. 헬퍼는 ScreenCaptureKit으로 해당 영역을 캡처(자기 창 제외 필터)하고, 클릭 투과 투명 창의 `CAMetalLayer`(`wantsExtendedDynamicRangeContent`, rgba16Float)에 ITM(WGSL→MSL 이식)을 렌더한다.
- DRM 준수: SCK는 보호 콘텐츠를 검게 캡처하고, 확장의 DRM 플래그를 받으면 캡처를 중지한다.
- 단계: **FA-0** 통신·capability 프로브(A19) → **FA-1** 수동 영역 지정 + Metal EDR 오버레이(단독 동작; F-B 수준으로 EDR 경로 먼저 검증) → **FA-2** 확장 연동(사각형 추적) → **FA-3** DRM/HDR 가드, 지연·지터 측정.
- 비용: 1~2프레임 지연, 스크롤 시 위치 지터, 구현량 증가. 모든 F-A 검증은 사용자 Mac에서만 가능하다(CI는 빌드만).

---

## C. 아키텍처

```
CLAUDE.md  PLAN.md  GUIDELINES.md  STATUS.md  (FIX_GUIDE.md: 오류 시)
.claude/
  settings.json                # PreToolUse hook 등록
  hooks/require-plan.sh
  agents/sim-runner.md  impl-worker.md
  rules/handoff.md  status-md.md
  skills/session-resume/SKILL.md
extension/                     # MV3, 번들러 없음
  manifest.json                # content_scripts: *://www.youtube.com/* (classic scripts, 순서 지정), permissions: storage
  content/
    ns.js                      # globalThis.__sdrhdr 네임스페이스
    detect.js                  # isDrm, isHdrSource, contentRect, 셀렉터 집중
    overlay.js                 # canvas 배치(ResizeObserver, fullscreenchange), pointer-events:none
    renderer.js                # WebGPU device/pipeline, 렌더 루프(C절 "렌더 루프"), importExternalTexture
    itm.wgsl.js                # WGSL 문자열
    params.js                  # 프리셋·기본값, storage 동기화
    hud.js                     # 디버그 HUD + JSON export
    main.js                    # 수명주기: 탐색, SPA 내비, attach/detach
  popup/popup.html, popup.js   # on/off, 프리셋, 상세 슬라이더, HDR 원본 수동 토글, HUD 토글/export
probe/                         # Phase 0a
sim/                           # numpy + pytest
tests/unit/ (node:test + node:vm 로드)   tests/dom/ (Playwright WebKit)
fixtures/  scripts/ (make-fixtures.sh, make-xcode.sh, parse-result.py)
xcode/                         # 사용자 Mac에서 생성 후 push
docs/ (manual-checklist.md, result-schema.json, install.md)
results/                       # 사용자 회신 JSON
.github/workflows/ci.yml
```

**역할**
- **content script**: 런타임 로직 전체를 맡는다. 메인 플레이어 video 1개만 대상이다. 캔버스는 `.html5-video-container` 안 video 바로 뒤에 둔다. 컨트롤은 DOM상 뒤에 있으므로 z-index를 유지한다. letterbox는 `videoWidth/Height`로 콘텐츠 사각형을 계산한다. 캔버스 해상도는 `min(videoWidth×videoHeight, contentRect×DPR)`다.
- **렌더 루프** (2026-09-30 개정, 확정은 FIX_GUIDE.md J 측정 후): `requestAnimationFrame`마다 `importExternalTexture`(매번 재import) → 풀스크린 삼각형 1패스. rVFC는 Safari에서 표시 프레임보다 적게 호출되므로(A20) 구동에 쓰지 않는다. video가 재생 중이 아니면(일시정지·seek 완료·ended) 1회 렌더 후 루프를 멈추고 `play`/`seeked` 이벤트로 재개한다. 탭 비가시 시 정지.
- **DRM 가드**: `mediaKeys`, `webkitKeys`, `encrypted`/`webkitneedkey` → 즉시 detach, 해당 video는 영구 no-op. 검은 프레임이 연속되면 보조로 detach.
- **popup**: `storage.local`에 쓰기만 하고, content script가 `storage.onChanged`로 반영한다.
- **background**: 두지 않는다(필요 시 Opus 승인).
- **네이티브 래퍼**: converter 템플릿 앱, 설정 안내만 한다. F-A 채택 시에만 헬퍼 기능을 추가한다.

**ITM 셰이더 (초안, M4에서 Opus 확정)**
1. 샘플 RGB → sRGB EOTF 선형화
2. 밝기 게인 g 적용(SDR 구간 전체, 기본 1.0)
3. Y(BT.709). 곡선은 `Y≤k` 항등, 그 위는 `t=(Y−k)/(1−k)`, `g(t)=t+(P'−1)tⁿ`, `P'=(P−k)/(1−k)` → f(1)=P, C¹, P≥1이면 단조
4. RGB×f(Y)/Y(색상 보존) → 채도 s(휘도 기준 mix) + 하이라이트 채도 보정 hs(확장 구간만)
5. 709→P3 행렬 → 확장 sRGB OETF(부호 보존) → 출력(A5 결과에 따라)

**파라미터와 프리셋(초안 수치, S2/S4/0a 후 확정)**
| 파라미터 | 범위 | 정확 | 균형(기본) | 선명 |
|---|---|---|---|---|
| 피크 배율 P | 1.0–8.0 | 2.0 | 3.0 | 4.0 |
| 확장 시작 k | 0.4–0.9 | 0.75 | 0.65 | 0.55 |
| 곡선 지수 n | 1.5–4 | 3 | 2.5 | 2 |
| 밝기 g | 0.8–1.5 | 1.0 | 1.0 | 1.05 |
| 채도 s | 0.8–1.5 | 1.0 | 1.05 | 1.2 |
| 하이라이트 채도 hs | 0.5–1.5 | 1.0 | 0.95 | 1.0 |

popup에는 프리셋 선택과 "상세 설정"(위 6개 슬라이더)을 두고, 슬라이더를 움직이면 "사용자 지정"으로 전환한다.

**0a 헤드룸 제약 (2026-09-30, M4에서 수치 확정)**: 안정 후 헤드룸은 밝기 최대 약 2, 중간 약 3, 낮음 약 4이고 JS에서 조회할 수 없다. 헤드룸을 넘는 값은 시스템이 잘라 하이라이트 계조가 사라진다. M4 결정 조건: 기본(균형) 프리셋은 밝기 최대(헤드룸 2)에서 하드 클리핑으로 잃는 입력 코드가 없어야 한다. 방법은 (a) 균형 P ≤ 2.0 또는 (b) 헤드룸 추정값 근처 소프트 롤오프 중에서 S10 결과로 고른다.

---

## D. 마일스톤

각 항목에 담당, 배정 이유, 에스컬레이션을 명시한다. 에스컬레이션 공통 규칙: sim-runner 이상 → Sonnet 본 세션 분석, 계획 이탈·설계 충돌 → STATUS.md "Opus 확인 필요" → Opus가 FIX_GUIDE.md/PLAN.md 개정.

| M | 내용 | 산출물 | 담당(이유) | → verify |
|---|---|---|---|---|
| D0 | 문서 세트 | PLAN.md, GUIDELINES.md, CLAUDE.md, .claude/rules·skills·agents(md) | **Opus**(계획·가이드라인 전용) | → verify: 파일 존재, 사용자 검토 |
| M0 | 골격 + 훅 | .claude/hooks/require-plan.sh, settings.json, package.json(devDeps: eslint, prettier, playwright), pytest, ci.yml(ubuntu), STATUS.md 시작 | Sonnet 본 세션(설정·스크립트) | → verify: 부록 M0-A 훅 검증 절차 1~3 통과. `npm test`, `pytest sim` 통과(빈 테스트 포함). CI ubuntu green |
| M1 | 0a 프로브 + 픽스처 + 시뮬레이션 | probe/, scripts/make-fixtures.sh, fixtures/, sim/ S1~S7 | Sonnet이 스크립트 작성, sim-runner(haiku)가 픽스처 생성·스윕 실행(반복·장출력), impl-worker ×2 병렬(probe/ ↔ sim/, 파일 비중첩) | → verify: 클라우드 단위 테스트·pytest·픽스처 검사 통과 → **사용자 Mac 0a 실행** → results/ JSON → Opus G1~G3 판정 |
| M2 | 최소 확장 + Xcode | extension 최소판(고정 균형 프리셋), scripts/make-xcode.sh, ci.yml macOS job | Sonnet(코드) → **사용자 Mac에서 make-xcode.sh 실행 후 push** | → verify: GH Actions macOS `xcodebuild CODE_SIGNING_ALLOWED=NO` 성공(A15/A16) → 사용자 설치 → 0b G4 판정(Opus) |
| M3 | 감지·수명주기 | SPA 내비, DRM no-op, HDR 원본 스킵, 극장/전체화면/미니플레이어, 리사이즈, PiP 스킵, 광고 전환 | impl-worker(detect.js ↔ overlay.js 병렬), Sonnet 통합 | → verify: tests/dom 통과(sim-runner 실행) + 수동 체크리스트 M3 |
| M4 | 알고리즘·프리셋 확정 | 셰이더 최종, JS 미러, 프리셋 수치 | Opus가 곡선·프리셋 결정(GUIDELINES 개정) → Sonnet 구현 | → verify: S1~S6 기준 통과, JS 미러 vs numpy 오차 < 1e-4, 사용자 Mac 컬러바/램프 확인 |
| M5 | popup + HUD | 프리셋/상세 UI, HUD, export 스키마 | impl-worker(popup ↔ hud 병렬) | → verify: params 직렬화 테스트, 사용자 Mac에서 슬라이더 반영 < 1초, export JSON 스키마 검증 통과 |
| M6 | 성능·안정화·문서 | 해상도 정책 튜닝, install.md(7일 재서명, "서명되지 않은 확장 허용" 재설정) | Sonnet | → verify: 사용자 Mac 2160p60 30분 soak에서 드롭 < 1%, HUD 메모리 추세 평탄 |
| FA-0~3 | (G1/G2/G4 실패 시) 네이티브 헬퍼 | B절 F-A | Opus 재계획 후 Sonnet | → verify: 각 단계 사용자 Mac, CI는 빌드만 |

게이트: M1 판정 전에는 M2 이후, M2 판정 전에는 M3 이후를 착수하지 않는다.

---

## E. 검증 매트릭스

| 항목 | (1) 클라우드 | (2) GH Actions macOS | (3) 사용자 Mac |
|---|---|---|---|
| 톤 커브 수치, 프리셋 범위 | ✅ pytest | — | 육안 |
| JS 미러 = numpy | ✅ node:test | — | — |
| detect/contentRect/params | ✅ node:test | — | — |
| DOM 감지(정적 픽스처) | ✅ Playwright WebKit* | — | 실제 YouTube |
| WGSL | ⚠️ naga 파싱만 | — | 실제 컴파일 |
| manifest | ✅ 스키마 검사 | ✅ 빌드 경고 | — |
| Xcode 빌드 | ❌ | ✅ 무서명 | 서명·설치 |
| WebGPU/EDR/성능/DRM no-op/전체화면 | ❌ | ❌ | ✅ 유일 |

\* Playwright WebKit은 **Safari 확장 환경이 아니다**. content script 주입, isolated world, `browser.*`, WebGPU/EDR은 검증 범위 밖이며 DOM 판별 로직만 검증한다.

**수동 체크리스트** (docs/manual-checklist.md)
- [ ] 0a P0-1~P0-5 실행, JSON export
- [ ] 0b: 오버레이 표시, 컨트롤 클릭 가능, HUD 수치(1080p60/2160p60)
- [ ] 극장/전체화면/미니플레이어/리사이즈/다음 영상 전환
- [ ] HDR 원본 자동 비활성(HUD `hdrSource:true`)
- [ ] EME 사용 페이지에서 HUD `drm:true`, 오버레이 없음
- [ ] 전원/배터리, SDR 밝기 3단계
- [ ] 프리셋 3종 + 상세 슬라이더 체감 메모
- [ ] 30분 soak

**회신 형식**
1. `results/result-<M>-<YYYYMMDD>.json`: `env{macOS, safari, chip, display, power, sdrBrightness}`, `api{…}`, `edr{maxDistinctStep, encodingMatch}`, `perf{srcRes, canvasRes, fps, dropRate, jsP50, jsP95, gpuMs?}`, `flags{drm, hdrSource, fullscreen}`, `errors[]`
2. 체크리스트 사본(체크 + 한 줄 코멘트)
3. 스크린샷은 레이아웃 확인용이다. macOS 스크린샷은 EDR을 증명하지 못하므로 밝기 판정은 JSON 선택값과 노출 고정 휴대폰 사진(선택)으로 한다.
4. results/에 push하면 sim-runner가 `scripts/parse-result.py`로 요약하고, Opus가 판정한다.

---

## F. 시뮬레이션·수치 검증

| # | 내용 | 판정 기준 | 작성 | 실행 | 에스컬레이션 |
|---|---|---|---|---|---|
| S1 | 톤 커브 `sim/tonecurve.py` | 단조, `Y≤k` 항등(<1e-6), f(1)=P, C¹, NaN/음수 없음 | Sonnet | sim-runner | 기준 해석 충돌 → Opus |
| S2 | 파라미터 스윕(프리셋 범위 격자) + 표 | 위반 행 표시, 프리셋 3종 통과 | Sonnet | sim-runner(반복·장출력) | 위반·NaN → Sonnet → 프리셋 재조정은 Opus |
| S3 | 램프/컬러바 예상 출력표(인코딩 전후, P3) | 0a/M4 참조표 생성 | Sonnet | sim-runner | 수식 불일치 → Sonnet |
| S4 | 709→P3 후 음수/초과 채널, 채도·hs에 따른 hue shift(ΔE ITP), 피부톤 패치 | 정확 프리셋: 음수 채널 0%. 균형/선명 ΔE 목표는 결과 보고 Opus 확정 | Sonnet | sim-runner | 목표 설정 → Opus |
| S5 | 8bit 계조 확장 밴딩(하이라이트 인접 코드 스텝) | 스텝 증폭 ≤ 기준(Opus 확정). 초과 시 곡선 완화 | Sonnet | sim-runner | → Opus |
| S6 | 자체 곡선 vs BT.2446 Method C 역변환 vs BT.2408 display-light(EDR에서 항등 = 기준선) | 미드톤 보존·확장량 비교표 | Sonnet | sim-runner | 방법 선택 → Opus |
| S7 | 프레임 예산 모델: 캔버스 해상도×8B×fps, 합성 레이어, 16.6 ms | 1080p/1440p/2160p(XDR 14"/16" 전체화면 캔버스 크기 포함) 표 | Sonnet | sim-runner | 0a 실측과 2배 괴리 → Opus |
| S8 | DOM 감지 픽스처 테스트 | Playwright WebKit 통과(범위 한정) | impl-worker | sim-runner | 실제 DOM 불일치 → Sonnet |
| S9 | 픽스처 생성(ffmpeg 1080p60/2160p60 램프·컬러바, bt709 태그) | 해상도·fps·태그 검사 | Sonnet(스크립트) | sim-runner | 태그 오류 → Sonnet |
| S10 | 헤드룸 클리핑: 프리셋 3종 × 헤드룸 H∈{2,3,4}에서 H를 넘는 출력으로 잘리는 8bit 입력 코드 수, 잘리는 구간의 입력 휘도 범위 | 값만 출력(M4에서 Opus가 선택 기준으로 사용) | Sonnet | sim-runner | → Opus |

---

## G. 위험 요소와 완화책

| 위험 | 완화 |
|---|---|
| Safari extended toneMapping 미지원(A3) | 0a 최우선 게이트 → F-A |
| 2160p60 합성 부하(rgba16f 추가 레이어) | 캔버스 = min(원본, 표시×DPR), rAF 구동(C절 렌더 루프), 비가시·일시정지 시 정지, S7 모델로 예측 |
| 배터리(EDR 백라이트 + GPU) | popup 원클릭 off, HUD 전력 조건 기록. 자동 off는 불가(API 없음) |
| 색 왜곡(피부톤, hue shift) | 휘도 기반 비율 스케일, 정확 프리셋 = 측색적, S4 |
| 8bit 밴딩 확대 | S5로 곡선 기울기 제한. 디더링은 필요 판정 시에만 |
| 헤드룸 변동(XDR 밝기 의존) | 0a에서 밝기 3단계 측정 후 기본 P 결정, 과도 P는 시스템 클리핑 |
| YouTube DOM 변경 | 셀렉터를 detect.js에 집중, 실패 시 no-op, 픽스처 스냅샷 갱신 절차 |
| SPA 내비 누락 | `yt-navigate-finish` + MutationObserver, video 교체 시 detach |
| DRM 감지 누락 | 다중 신호 + 검은 프레임 보조 감지 |
| Safari/macOS 업데이트 회귀 | 프로브 페이지를 회귀 도구로 유지, 업데이트마다 P0-1 |
| 무료 서명 7일 만료, 허용 설정 리셋 | install.md 절차화 |
| 훅 오작동(PLAN.md 존재만 검사) | 역할 분리는 규칙+훅 병행. 훅은 "계획 없는 구현"만 막음을 CLAUDE.md에 명시 |

---

## H. 저장소 구조·문서·에이전트·규칙

### 도입 방식 (요청 구조 → 프로젝트 스코프로 이식)
- 클라우드 세션은 `~/.claude`를 보존하지 않으므로 **저장소 루트 `CLAUDE.md` + `.claude/`**에 둔다. 사용자 Mac 로컬 세션에서도 같은 파일이 적용된다.
- 경로 치환: `~/.claude/rules/…` → `.claude/rules/…`, 훅 command → `"$CLAUDE_PROJECT_DIR/.claude/hooks/require-plan.sh"`.
- 요청하신 파일 내용(handoff.md, status-md.md, session-resume SKILL.md, sim-runner.md, impl-worker.md, require-plan.sh, settings.json)은 **원문 그대로** 쓰고, 경로만 위처럼 바꾼다.
- 작성 주체: md 문서(CLAUDE.md, rules, skills, agents, PLAN.md, GUIDELINES.md)는 Opus가 작성한다(D0). 실행 코드인 require-plan.sh와 settings.json은 Sonnet이 M0에서 설치하고 차단 동작을 검증한다.

### CLAUDE.md 구성 (요청 원문 + 프로젝트 절)
1. **개발 역할 분담 — Opus/Sonnet**: 요청 원문 전체(원칙, 표, Opus/Sonnet 책임, 전환 규칙, 서브에이전트 위임 표·규칙, 세부 규칙 위치).
2. **프로젝트 범위**: DRM 감지 즉시 no-op, 회피·캡처 우회 금지, 대상은 YouTube SDR, 네이티브 헬퍼는 PLAN.md F-A 승인 후에만.
3. **환경 한계**: 클라우드 VM에는 Safari/Xcode/HDR 디스플레이가 없으므로 WebGPU·EDR·Safari 동작을 "검증했다"고 쓰지 않는다. 검증 가능 범위는 E절 (1)(2)다.
4. **명령**: `npm run lint`, `npm test`, `npm run test:dom`, `pytest sim`.
5. **문서 세트 위치**: 루트 PLAN.md / GUIDELINES.md / FIX_GUIDE.md / STATUS.md.

### GUIDELINES.md 요지 (Opus 작성)
- 번들러·런타임 의존성 없음. content script는 manifest 순서의 classic script이며 `globalThis.__sdrhdr` 네임스페이스를 쓴다. 테스트는 `node:vm`으로 로드한다.
- 순수 함수(detect/contentRect/params/curve)와 DOM·GPU 부작용 코드를 분리한다.
- 셀렉터는 detect.js에만 둔다. DRM 가드는 attach 전후 모두 검사한다.
- 셰이더 수식을 바꾸면 WGSL·JS 미러·numpy를 함께 갱신한다(오차 < 1e-4 테스트).
- 요청 없는 기능, 옵션, 추상화는 금지한다. 모든 작업 보고는 "→ verify: 기준 / 실제 결과 / 검증 위치(1·2·3)" 형식으로 한다.
- 커밋: `feat|fix|sim|test|ci|docs|chore(scope):`. 모델 식별자는 커밋·PR에 넣지 않는다.

### 서브에이전트 (요청 정의 그대로)
| 에이전트 | model | 호출 주체 | 본 프로젝트 용도 |
|---|---|---|---|
| Explore(내장) | haiku | Opus, Sonnet | 코드·문서 조사 |
| sim-runner | haiku | Sonnet | pytest/npm test/Playwright 실행, 스윕, 픽스처 생성 스크립트 실행, results/ 파싱 |
| impl-worker | sonnet | Sonnet | PLAN.md에 분리된 독립 단위(probe↔sim, detect↔overlay, popup↔hud) 병렬 구현 |

### 브랜치/PR 규칙
- `main` 보호. 작업은 `claude/<milestone>-<topic>` 브랜치에서 한다(현재 지정 브랜치는 `claude/amazing-hypatia-3rbspr`로, D0·M0을 여기서 진행).
- 마일스톤당 draft PR 1개. 본문에 verify 결과를 (1)/(2)/(3)으로 구분하고, 수동 미완 항목은 "미검증"으로 명시한다.
- 머지 조건: CI green. 게이트 마일스톤(M1, M2)은 사용자 회신 JSON + Opus 판정(PLAN.md 기록)까지 필요하다.
- Xcode 프로젝트 변경은 사용자 Mac에서 push한 커밋만 인정한다(클라우드에서 pbxproj 수기 편집 금지).

### 진행 순서
1. Opus(D0, 완료): CLAUDE.md, PLAN.md, GUIDELINES.md, .claude/rules·skills·agents(md) 작성, 문서 커밋·push.
2. Sonnet: session-resume 절차 → M0(부록 M0-A 원문 설치) → M1.

---

## 근거 링크
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [Safari 26.0 Release Notes (Apple)](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes)
- [News from WWDC25: WebKit in Safari 26 beta](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [WebKit commit "[WebGPU] Make HDR canvas testable via Safari"](https://www.mail-archive.com/webkit-changes@lists.webkit.org/msg220796.html)
- [webgpu-hdr EXPLAINER](https://github.com/ccameron-chromium/webgpu-hdr/blob/main/EXPLAINER.md)
- [pixijs #12019 (2차 출처)](https://github.com/pixijs/pixijs/issues/12019)
- [webgl-hdr EXPLAINER](https://github.com/ccameron-chromium/webgl-hdr/blob/master/EXPLAINER.md) / [Intent to Implement: drawingBufferStorage](https://groups.google.com/a/chromium.org/g/blink-dev/c/KhHQFVladnQ)
- [WebKit PR #71719](https://github.com/WebKit/WebKit/pull/71719) / [ColorWeb-CG HDR canvas](https://github.com/w3c-cg/ColorWeb-CG/blob/main/hdr_html_canvas_element.md)
- [MDN importExternalTexture](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/importExternalTexture) / [MDN requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [Safari 확장 CI 사례](https://rxliuli.com/blog/two-pitfalls-of-safari-cloud-signing-in-github-actions/)
- 주: webkit.org, mail-archive는 이 VM의 egress 정책으로 본문 조회가 차단되어 검색 요약으로만 확인했다.

---

## 확정된 사용자 환경·결정 (질문 회신 반영)
- Mac: **Apple M1 Pro 10-core CPU, 내장 XDR(Liquid Retina XDR)**, macOS 27.2, **Safari 27.2**. A1 전제(WebGPU 기본 활성)는 충족한다. S7 예산 모델은 M1 Pro GPU(14/16코어, 약 200 GB/s 메모리 대역폭)와 XDR 네이티브 해상도(14" 3024×1964 / 16" 3456×2234)를 기준으로 한다. 14"/16" 여부는 0a 프로브의 `screen` 값으로 확정한다.
- 0a 1차(2026-09-30) 확정: `screen` 1800×1169 @ DPR 2 → **16" 모델**, 스케일 해상도 설정(백킹 3600×2338, 패널 3456×2234로 다운샘플). 전체화면 16:9 캔버스 상한은 3600×2025다. S7은 이 행을 추가해 갱신한다(FIX_GUIDE.md F5).
- 성능: 소스 해상도 추종, 최대 2160p60.
- 색: 프리셋 3종 + 상세 슬라이더(채도 부스트 포함).
- Xcode: 사용자 Mac에서 생성 후 push.
- 폴백: 웹 경로 실패 시 F-A 진행(화면 녹화 권한 허용).
- 저장소: **공개, 이름 `Safari_Extention-HDR`로 변경됨.** macOS CI는 모든 PR과 push에서 실행한다(공개 저장소는 표준 러너 무료). G절 과금 위험 항목은 삭제한다.
- 저장소 이름 변경에 따른 D0 선행 작업:
  1. `git remote -v`를 확인하고, 필요하면 `git remote set-url`로 새 이름을 지정한다(GitHub 리다이렉트가 있어도 명시적으로 교체).
  2. 이 세션의 GitHub MCP 권한 범위는 옛 이름(`tmtmtmtmtmt/claude`)이다. PR 생성이 거부되면 `add_repo`로 새 이름을 추가한다.
  3. 푸시는 지정 브랜치 `claude/amazing-hypatia-3rbspr`로 한다.

남은 질문 없음.

---

## 게이트 판정 기록 (Opus 전용 기입)

| 게이트 | 일자 | 근거 파일 | 판정 | 후속 지시 |
|---|---|---|---|---|
| G1 API | 2026-09-30 | results/result-M1-20260930-battery-max-fullscreen.json | **통과** | configure 예외 없음, 되읽기 `rgba16float`/`display-p3`/`extended`. 조건 무관 항목이라 재측정 불필요 |
| G2 EDR | 2026-09-30 | results/result-M1-20260930-ac-{low,mid,max}-mixed.json | **통과** | 전원 연결 3단계 밝기 모두 SDR white 위 2단계 이상 구분(안정 후 4 / 3 / 2, 최소 조건인 밝기 최대에서도 1.25·1.5·2). 1차 잠정 판정 확정. 헤드룸 제약은 C절 "0a 헤드룸 제약"으로 M4에 넘김 |
| G3 성능 | 2026-09-30 | 1차: …battery-max-fullscreen.json / 2차: …ac-{low,mid,max}-mixed.json / 3차: result-M1-20260930-ac-mid-{promotion,60hz}-matrix.json | **rVFC 구동으로는 불통과, 원인은 비용 아님 → 렌더 루프 개정 후 재판정** | 3차(오버레이 단일 캔버스 3600×2025 포함, B0~B3 각 2회): GPU ≤ 2.6 ms, JS p95 ≤ 2 ms로 비용 여유. 그러나 rVFC 콜백이 60Hz에서 약 30회/s(B0 기준선 포함 전 모드 50% 누락), ProMotion에서 51~56회/s(B0 8~13.5%, 5% 초과로 기준선 판정 보류 조건). 오버레이 비용(B3−B0)은 60Hz에서 −0.2%p/+2.0%p로 구분 불가. 원인은 Safari rVFC 호출 빈도(A20). C절 렌더 루프를 rAF 구동으로 개정하고 FIX_GUIDE.md J1~J4 측정 후 재판정. B절 실패 분기(해상도 축소, F-A) 착수 안 함 |
| G4 확장 컨텍스트 | — | — | 대기 | — |

---

## 부록 M0-A: M0에서 Sonnet이 설치할 파일 원문

아래 두 파일은 사용자 제공 원문이다. 경로만 프로젝트 스코프로 바꿨다. 내용은 임의로 수정하지 않는다.

### `.claude/hooks/require-plan.sh` (실행 권한 755)
```bash
#!/usr/bin/env bash
# PLAN.md 없이 코드 구현 시작 금지 (CLAUDE.md 전환 규칙 5)
input=$(cat)
file=$(printf '%s' "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$file" ] && exit 0

# 문서 및 .claude 설정 파일은 항상 허용
case "$file" in
  *.md|*/.claude/*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -z "$(find "$root" -maxdepth 3 -name PLAN.md -not -path '*/node_modules/*' -print -quit 2>/dev/null)" ]; then
  echo "차단: PLAN.md 없음. Opus 단계에서 계획 문서를 먼저 작성해야 함 (CLAUDE.md 전환 규칙 5)." >&2
  exit 2
fi
exit 0
```

### `.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/require-plan.sh\""
          }
        ]
      }
    ]
  }
}
```

### M0 훅 검증 절차 (→ verify)
1. `echo '{"tool_input":{"file_path":"/x/a.js"}}' | CLAUDE_PROJECT_DIR=<빈 임시 디렉터리> .claude/hooks/require-plan.sh; echo $?` → `2` 출력과 차단 메시지 확인
2. 같은 입력을 저장소 루트(`CLAUDE_PROJECT_DIR=$PWD`)로 실행 → `0`
3. `file_path`가 `*.md`인 입력 → 항상 `0`
4. 결과를 STATUS.md에 한 줄로 기록한다. PLAN.md를 rename하는 방식은 쓰지 않는다(문서 훼손 위험).
