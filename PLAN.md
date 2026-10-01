# PLAN.md — Safari SDR→HDR(EDR) 실시간 변환 확장

> 작성: Opus(계획 단계). 이 문서와 GUIDELINES.md 범위를 벗어나는 설계 변경은 Sonnet이 임의로 하지 않는다. 발견한 이슈는 STATUS.md "Opus 확인 필요"에 기록한다.
> 버전: v1.19 (2026-10-01, M6 판정·전체 마일스톤 완료, 기본값 문구 정리)

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
| A9 | content script(isolated world)에서 `navigator.gpu` 사용 가능 | [확인(0b 1차)] adapter·device·configure 성공, 되읽기 extended | — | **0b** |
| A10 | YouTube MSE(blob:) video는 origin-clean이라 SecurityError가 나지 않음 | [확인(0b 2차)] copyExternalImageToTexture·Canvas2D 읽기 정상, 예외 없음. 검은 결과는 VP9 외부 텍스처 결함(A21) | — | **0b** |
| A11 | 창 모드 페이지 캔버스에서도 EDR 유지 | [미확인] | — | 0a/0b |
| A12 | 배터리/저전력에서 헤드룸 축소 | [추정] | 웹에서 배터리 상태 조회 불가 | 0a 기록 |
| A13 | YouTube 전체화면은 `#movie_player` 요소 전체화면이라 오버레이가 유지됨 | [추정] | — | 0b/M3 |
| A14 | HDR 원본은 설정 버튼 HDR 배지 클래스로 판별 가능 | [추정] | 수동 토글 병행 필수 | M3 |
| A15 | GH Actions macOS 러너에서 Safari 확장 프로젝트를 `CODE_SIGNING_ALLOWED=NO`로 빌드 가능 | [2차] | 커뮤니티 사례. 2026-09-30: 사용자 Xcode 베타가 만든 `project.xcproj`(새 형식)는 러너 Xcode 26.x가 읽지 못함 → CI는 러너 converter로 임시 프로젝트를 만들어 빌드(FIX_GUIDE L1) | M2 CI |
| A16 | converter 기본 동작(`--copy-resources` 미사용)은 extension 폴더를 **참조**하며, 저장소 루트 기준 상대경로라면 CI에서도 유효 | [부분 확인] 사용자 Mac 생성물에 `/Users/` 문자열 없음. 다른 경로 clone에서 Run 가능 여부는 미확인 | 절대경로가 박히면 CI 실패 | M2 CI |
| A17 | JS에서 EDR 헤드룸 수치 조회 불가(`dynamic-range: high`는 boolean) | [사실(스펙)] | 배율 파라미터의 근거 | — |
| A18 | 내장 XDR 헤드룸은 SDR 밝기 설정에 따라 변동(밝기를 낮출수록 커짐) | [확인(0a 2차)] 전원 연결, 안정 후 P0-2: 밝기 낮음 4 / 중간 3 / 최대 2. 밝기 변경·재그리기 직후에는 약 30초 동안 2로 보이다가 안정값에 도달 | 0a P0-2/P0-5 |
| A19 | (F-A) Safari 확장 appex ↔ 헬퍼 앱 통신은 App Group/XPC 또는 localhost 소켓으로 가능하며, 무료 개인 팀 서명에서도 해당 capability 사용 가능 | [미확인] | F-A 착수 시 FA-0 프로브로 확인 | FA-0 |
| A20 | Safari `requestVideoFrameCallback`은 video가 표시하는 모든 프레임마다 호출됨 | [반증(0a 3차)] 60Hz 디스플레이에서 60fps video의 콜백이 약 30회/s(모든 모드, 캔버스 없는 B0 포함). ProMotion에서도 51~56회/s. 같은 run의 presentedFrames 기준 video 표시율은 약 54~57회/s로 video 자체는 정상 표시. 즉 rVFC 구동 오버레이는 60Hz에서 약 30fps로만 갱신됨. 4차(rVFC 비교 run V3)에서는 60Hz 53~56회/s, ProMotion 54~56회/s로 3차의 30회/s는 재현되지 않았으나(원인 미확인), 갱신 누락은 여전히 11~32%. 구동 수단으로 신뢰할 수 없다는 결론은 유지 | 0a 3·4차 |
| A21 | Safari `importExternalTexture`는 VP9 video 프레임을 샘플링할 수 있음 | [반증(0b 2차)] Safari 27.2: YouTube(MSE, VP9)에서 ext 평균 0, 같은 순간 `copyExternalImageToTexture` 97.8·Canvas2D 145.0. 프로브 same-origin VP9 webm(비MSE, main world)도 출력 검정. H.264(0a)는 정상. 예외 없이 검은 텍스처를 반환 → 코덱 의존 결함. 같은 프로브 run에서 VP9 1080p60 video 자체 드롭 327/671(디코드 부하 추정, 원인 미확인) | 0b 2차 |
| A22 | Safari에서 VP9 video → `copyExternalImageToTexture`는 렌더 루프에 쓸 만큼 싸다 | [반증(0b 3차)] 창 모드 60Hz, 복사 호출의 JS 동기 시간 2160p p50 13 ms / p95 14 ms(loopFps 50.6, 디스플레이 갱신 누락 5.6%), 1440p p50 8 ms / p95 12.8 ms. VP9 프레임이 GPU 텍스처로 바로 쓰이지 않고 복사 때 변환·업로드되는 것으로 추정(원인 미확인). frameProbe의 64×36 Canvas2D drawImage도 18~27 ms | 0b 3차 |
| A23 | Safari에서 `new VideoFrame(video)` → `importExternalTexture({source: frame})`는 VP9 프레임을 싸게 샘플링함 | [확인(0a P0-6, 2026-10-01)] 프로브 VP9 2160p60: 출력 평균 128(비검정), JS p95 2 ms, 디스플레이 갱신 누락 0.2%(loopFps 58.8). 1080p p95 2~3 ms. 같은 run에서 video 직접 import는 0(검정), copyExternalImageToTexture p95 14 ms(rgba8)·21 ms(bgra8), createImageBitmap 비동기 준비 40 ms. 0b 4차(2026-10-01): 확장 content script에서도 동작 확인(path vf, vfErr 없음, vf p95 1~2 ms) | 0a P0-6 |
| A24 | 시스템 설정 60Hz에서 Safari rAF가 60회/s로 호출됨 | [관찰(2026-10-01)] 60Hz 설정에서 프로브(H.264 대조군 포함 전 변형)와 확장 모두 rAF 약 30회/s. 0a 4차(2026-09-30) 60Hz에서는 600/600이었음. 저전력 모드 끔. 원인 미확인(설정 값·OS 상태 확인 필요, FIX_GUIDE S3) | 0b 4차 |

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
- **G3 성능** (2026-09-30 3차 개정): 전체화면 오버레이 배치(video 위 단일 캔버스, 캔버스 = min(원본, 표시×DPR)), 전원 연결, 1080p60과 2160p60, 60Hz와 ProMotion 모두에서 (1) **구동 루프의 디스플레이 갱신 누락률(R3) − 기준선(R0) < 1%p**, (2) JS p95 < 4 ms, (3) 움직이는 박스 끊김 육안 "없음". 디스플레이 갱신 누락률 = 측정 창에서 구동 콜백 간격이 디스플레이 갱신 간격의 1.5배를 넘어 놓친 갱신 수 / 기대 갱신 수(기대 갱신 수 = 측정 창 초 × 디스플레이 Hz). 이력: 1차 개정(rVFC 콜백 드롭률)은 rVFC가 표시 프레임보다 적게 호출돼(A20) 폐기. 2차 개정(소스 프레임 슬롯 누락률)은 구동 루프 주기와 소스 fps가 같은 60Hz에서 위상 지터만으로 거짓 누락이 생겨(캔버스 없는 R0가 콜백 600/600인데 5.67%) 폐기.
- **G4 확장 컨텍스트(0b)**: content script에서 `navigator.gpu` 사용 가능, YouTube video SecurityError 없음, 오버레이 EDR이 G2와 동등.
- **G3c 개정(2026-10-01)**: 누락률 기준을 G3와 같이 '확장 렌더(R3) − 같은 페이지 기준선(R0, 렌더 없이 rAF만) < 1%p'로 바꾼다. 확장 쪽 R0은 진단용 `baseline` 모드(FIX_GUIDE S1)로 잰다. 추가로 끊김 원인 분리를 위해 샘플링 cadence 지표(S2)를 기록한다.
- **G3c 복사 경로 비용(0b, 2026-09-30 추가)**: 복사 경로로 YouTube VP9 1080p60·2160p60 재생, 전원 연결, 60Hz와 ProMotion, 전체화면에서 (1) 렌더 루프 콜백의 디스플레이 갱신 누락률 < 1%(기준선 R0 대신 절대값, 확장에는 R0가 없음), (2) JS p95 < 4 ms, (3) 끊김 육안 없음, (4) video 자체 드롭(`getVideoPlaybackQuality`)이 확장 off 대비 +1%p 미만.

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
- **비디오 입력 경로** (2026-10-01 개정, A21~A23): 경로 후보는 `ext`(video 직접 `importExternalTexture`), `vf`(`new VideoFrame(video)` → `importExternalTexture` → 렌더 submit 후 `frame.close()`), `copy`(`copyExternalImageToTexture`, 비용 큼·폴백 전용). attach 직후 frameProbe로 ext → vf → copy 순서로 처음 비검정인 경로를 고른다. 기준 경로(c2d)가 어두우면 보류(pending, 원본 표시). 모든 후보가 검고 c2d가 밝은 결과가 2회 연속이면 detach. 비용 기준은 선택된 경로에 대해 G3c로 판정한다.
- **렌더 루프** (2026-09-30 확정, 0a 4차): `requestAnimationFrame`마다 `importExternalTexture`(매번 재import) → 풀스크린 삼각형 1패스. rVFC는 Safari에서 표시 프레임보다 적게 호출되므로(A20) 구동에 쓰지 않는다. video가 재생 중이 아니면(일시정지·seek 완료·ended) 1회 렌더 후 루프를 멈추고 `play`/`seeked` 이벤트로 재개한다. 탭 비가시 시 정지. ProMotion(120Hz)에서는 60fps 소스에 대해 프레임당 2회 렌더한다. 비용 여유(2160p ITM GPU 약 2.4 ms)로 허용하고, 같은 프레임 재렌더 생략은 M6에서 검토한다.
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

**파라미터와 프리셋 (2026-10-01 M4 확정, 근거 D-M4 M4-A2)**
| 파라미터 | 범위 | 정확 | 균형(기본) | 선명 |
|---|---|---|---|---|
| 피크 배율 P | 1.0–8.0 | 2.0 | 3.0 | 4.0 |
| 확장 시작 k | 0.4–0.9 | 0.5 | 0.45 | 0.45 |
| 곡선 지수 n | 2.0–4 (M5에서 하한 1.5→2.0, D-M5 M5-1) | 2.0 | 2.0 | 2.0 |
| 밝기 g | 0.8–1.5 | 1.0 | 1.0 | 1.0 |
| 채도 s | 0.8–1.5 | 1.0 | 1.0 | 1.2 |
| 하이라이트 채도 hs | 0.5–1.5 | 1.0 | 1.0 | 1.0 |

이전 초안(M2~M4a에서 사용): 정확 P2/k0.75/n3/g1.0/s1.0/hs1.0, 균형 P3/k0.65/n2.5/g1.0/s1.05/hs0.95, 선명 P4/k0.55/n2/g1.05/s1.2/hs1.0.

popup에는 프리셋 선택과 "상세 설정"(위 6개 슬라이더)을 두고, 슬라이더를 움직이면 "사용자 지정"으로 전환한다.

**0b 체감 기록 (2026-10-01, M4 결정 자료)**: 균형 초안(P3/k0.65)으로 YouTube 시청 시 밝기 중간에서는 "자막 같은 부분만 밝고 영상 차이는 크지 않음", 밝기 최대에서는 "HDR 효과가 잘 느껴짐"이나 "하이라이트가 너무 밝음, identity와 itm 사이 어딘가라면 만족". 즉 밝기 최대 기준으로 기본 프리셋은 균형 초안보다 약해야 한다.

**0a 헤드룸 제약 (2026-09-30, M4에서 수치 확정)**: 안정 후 헤드룸은 밝기 최대 약 2, 중간 약 3, 낮음 약 4이고 JS에서 조회할 수 없다. 헤드룸을 넘는 값은 시스템이 잘라 하이라이트 계조가 사라진다. M4 결정 조건: 기본(균형) 프리셋은 밝기 최대(헤드룸 2)에서 하드 클리핑으로 잃는 입력 코드가 없어야 한다. 방법은 (a) 균형 P ≤ 2.0 또는 (b) 헤드룸 추정값 근처 소프트 롤오프 중에서 S10 결과로 고른다.

---

## D. 마일스톤

각 항목에 담당, 배정 이유, 에스컬레이션을 명시한다. 에스컬레이션 공통 규칙: sim-runner 이상 → Sonnet 본 세션 분석, 계획 이탈·설계 충돌 → STATUS.md "Opus 확인 필요" → Opus가 FIX_GUIDE.md/PLAN.md 개정.

| M | 내용 | 산출물 | 담당(이유) | → verify |
|---|---|---|---|---|
| D0 | 문서 세트 | PLAN.md, GUIDELINES.md, CLAUDE.md, .claude/rules·skills·agents(md) | **Opus**(계획·가이드라인 전용) | → verify: 파일 존재, 사용자 검토 |
| M0 | 골격 + 훅 | .claude/hooks/require-plan.sh, settings.json, package.json(devDeps: eslint, prettier, playwright), pytest, ci.yml(ubuntu), STATUS.md 시작 | Sonnet 본 세션(설정·스크립트) | → verify: 부록 M0-A 훅 검증 절차 1~3 통과. `npm test`, `pytest sim` 통과(빈 테스트 포함). CI ubuntu green |
| M1 | 0a 프로브 + 픽스처 + 시뮬레이션 | probe/, scripts/make-fixtures.sh, fixtures/, sim/ S1~S7 | Sonnet이 스크립트 작성, sim-runner(haiku)가 픽스처 생성·스윕 실행(반복·장출력), impl-worker ×2 병렬(probe/ ↔ sim/, 파일 비중첩) | → verify: 클라우드 단위 테스트·pytest·픽스처 검사 통과 → **사용자 Mac 0a 실행** → results/ JSON → Opus G1~G3 판정 |
| M2 | 최소 확장 + Xcode | extension 최소판(고정 균형 프리셋), scripts/make-xcode.sh, ci.yml macOS job | Sonnet(코드, 상세는 D-M2) → **사용자 Mac에서 make-xcode.sh 실행 후 push** | → verify: GH Actions macOS `xcodebuild CODE_SIGNING_ALLOWED=NO` 성공(A15/A16) → 사용자 설치 → 0b G4 판정(Opus) |
| M3 | 감지·수명주기 (상세: D-M3) | SPA 내비, DRM no-op, HDR 원본 스킵, 극장/전체화면/미니플레이어, 리사이즈, PiP 스킵, 광고 전환 | impl-worker(detect.js ↔ overlay.js 병렬), Sonnet 통합 | → verify: tests/dom 통과(sim-runner 실행) + 수동 체크리스트 M3 |
| M4a | HDR 강도 슬라이더 (상세: D-M4a) | ITM 출력과 원본 사이 선형 혼합 강도 1개, popup 슬라이더, 진단 v7 | Sonnet 본 세션(파일 간 결합이 커서 분할하지 않음) | → verify: 단위·pytest(혼합 성질) 통과 + 사용자 Mac 선호 강도 회신 |
| M4 | 알고리즘·프리셋 확정 (상세: D-M4) | 셰이더 최종(파라미터 유니폼화), JS 미러, 프리셋 수치, 기본 강도, popup 프리셋 선택·선명도 슬라이더·채도 슬라이더(M5에서 앞당김) | Opus가 곡선·프리셋 결정(GUIDELINES 개정) → Sonnet 구현 | → verify: S1~S6 기준 통과, JS 미러 vs numpy 오차 < 1e-4, 사용자 Mac 컬러바/램프 확인 |
| M5 | popup + HUD (상세: D-M5) | 기본값 갱신, 상세 슬라이더 6개("하이라이트 밝기" = P, 사용자 지정 프리셋), 진단 영역 정리, 페이지 HUD, 진단 v9 | impl-worker(popup ↔ hud 병렬) | → verify: params 직렬화 테스트, 사용자 Mac에서 슬라이더 반영 < 1초, export JSON 스키마 검증 통과 |
| M6 | 성능·안정화·문서 (상세: D-M6) | frameProbe 비용 절감(HDR 조기 판정·정상 상태 단일 경로), install.md, 측정 절차(soak·전체화면·60Hz·비60fps), 이월 항목 정리, 버전 1.0.0 | Sonnet 본 세션 + impl-worker(renderer ↔ docs 병렬) | → verify: 단위 테스트(프로브 순서), 사용자 Mac 2160p60 30분 soak 드롭 < 1%·메모리 증가 < 15%, 4K HDR 첫 attach 끊김 없음 |
| FA-0~3 | (G1/G2/G4 실패 시) 네이티브 헬퍼 | B절 F-A | Opus 재계획 후 Sonnet | → verify: 각 단계 사용자 Mac, CI는 빌드만 |

게이트: M1 판정 전에는 M2 이후, M2 판정 전에는 M3 이후를 착수하지 않는다.

### D-M3. M3 상세 계획 (2026-10-01, Opus)

목적: 실제 YouTube 사용 흐름(영상 이동, 화면 모드 전환, 광고, DRM·HDR 콘텐츠)에서 오버레이가 **붙어야 할 때만 붙고, 정확한 위치에 있고, 다음 영상으로 넘어가도 계속 동작**하게 한다. 화질(M4)·UI(M5)·성능 튜닝(M6)은 범위 밖이다.

**M3-0. 범위**
- 포함: SPA 이동, video 소스 교체 처리(광고 포함), video 요소 교체, DRM no-op 강화, HDR 원본 자동 스킵, 극장/전체화면/미니플레이어/리사이즈 배치, PiP 스킵, 수명주기 진단, 실제 DOM 스냅샷 기반 `tests/dom`.
- 제외: 프리셋·슬라이더·HDR 수동 토글(M5), 페이지 위 HUD(M5), 프리셋 수치(M4), 비60fps 끊김·60Hz rAF·전체화면 비용(M6), YouTube 외 사이트.

**M3-1. 상태 모델 (main.js)**
- 상태: `idle`(대상 video 없음) → `probing`(경로 결정 중, 캔버스 숨김) → `active`(렌더) / `skipped(reason)`(붙이지 않음, 원본 표시). reason: `drm`, `hdrSource`, `pip`, `blackFrame`, `noGpu`, `disabled`.
- **소스 단위 재시작**: 같은 video 요소에서 소스가 바뀌면(`emptied` 또는 `loadstart`, 그리고 `currentSrc` 변경) renderer의 경로 결정·frameProbe·측정 버퍼·cadence를 초기화하고 `probing`부터 다시 한다. GPU device·캔버스·파이프라인은 재사용한다.
- **요소 교체**: `#movie_player` 아래 `video.html5-main-video`가 다른 요소로 바뀌면(MutationObserver, childList·subtree, 디바운스 250 ms) 이전 요소에서 detach하고 새 요소에 attach한다.
- **SPA 이동**: `document`의 `yt-navigate-finish` 이벤트에서 `findMainVideo`를 다시 실행해 요소 교체 여부를 확인한다. 이벤트 이름은 detect.js 상수로 둔다(셀렉터와 같은 취급). 이벤트가 오지 않아도 위 소스 변경·MutationObserver로 동작해야 한다(이중화).
- **스킵 기록의 수명**:
  - `drm`: GUIDELINES 2.4-2대로 **요소 단위 영구**(같은 요소의 다음 소스에도 적용, 새로고침으로만 해제). 보수적 처리이며 사용자에게 0b 체크리스트로 알린다.
  - `blackFrame`: **소스 단위**(소스가 바뀌면 해제). 현행 요소 단위 WeakSet을 바꾼다.
  - `hdrSource`, `pip`: 소스·상태 단위(조건이 사라지면 재판정).

**M3-2. 감지 (detect.js, 순수 함수 + 셀렉터)**
- DRM: 현행 3신호(`mediaKeys`, `webkitKeys`, `encrypted`/`webkitneedkey` 이벤트) 유지 + 소스 변경 때마다 attach 전 재검사.
- HDR 원본 판정 `isHdrSource({frameColorSpace, badge})`:
  1. 1순위: `VideoFrame.colorSpace`(vf 경로·frameProbe에서 얻음)의 `transfer`가 `pq` 또는 `hlg`이면 HDR. `primaries`가 `bt2020`이고 transfer가 SDR이면 HDR로 보지 않는다(값은 diag에 기록).
  2. 2순위: 플레이어 DOM의 HDR 표시(설정 버튼 품질 배지 등). 셀렉터는 **[미확인]**이며 M3-5 스냅샷으로 확정한다. 확정 전에는 1순위만 쓴다.
  3. HDR이면 `skipped(hdrSource)`. ext 경로(H.264)에서는 1순위 정보가 없으므로 frameProbe의 vf 측정 1회로 colorSpace를 얻는다(렌더는 ext 유지).
- 광고: `#movie_player`의 `ad-showing` 클래스를 진단 플래그로만 기록한다(처리는 소스 단위 재시작이 담당, 광고에도 ITM 적용).
- PiP: `enterpictureinpicture`/`leavepictureinpicture`와 Safari `webkitpresentationmodechanged`(`webkitPresentationMode === 'picture-in-picture'`)로 판정. PiP 중 `skipped(pip)`(렌더 정지, 캔버스 숨김), 해제 시 재판정.
- 화면 모드 판정 순수 함수: `playerMode({isFullscreen, isTheater, isMiniplayer})` → `default|theater|fullscreen|miniplayer`(진단용, 배치 로직은 공통). 극장·미니플레이어 판정 셀렉터는 M3-5 스냅샷으로 확정.

**M3-3. 배치 (overlay.js)**
- 캔버스는 계속 `.html5-video-container` 안 video 바로 뒤. 미니플레이어 전환 시 YouTube가 플레이어를 옮겨도 캔버스가 함께 옮겨지는지 확인하고, 아니면 attach 위치를 다시 잡는다(요소 교체와 같은 경로).
- 갱신 트리거: `ResizeObserver(video)` + `ResizeObserver(container)`, `fullscreenchange`와 **`webkitfullscreenchange`**, video `loadedmetadata`·`resize`. 갱신은 rAF 1회로 모은다(같은 프레임 중복 계산 금지).
- video 요소의 CSS 배치(`style.left/top/width/height`, `object-fit`)를 그대로 따라 contentRect를 계산한다. YouTube가 video에 직접 `left/top`을 주므로 video의 offset 기준으로 캔버스를 맞춘다.
- 캔버스 백킹 크기 = `min(원본, 표시×DPR)`(현행 규칙) 유지. 크기 변경 시 캔버스 재configure 없이 width/height만 바꾼다(configure는 크기와 무관함, M2 동작 유지).

**M3-4. 진단 (hud.js, 스키마 m2 → schemaVersion 6)**
- `lifecycle`: `{state, skipReason, navCount, srcChanges, videoSwaps, playerMode, adShowing, pip, lastEvent, lastEventAt}`.
- `flags.hdrSource`, `video.colorSpace`(`{primaries, transfer, matrix, fullRange}`, frameProbe에서 얻은 마지막 값).
- 이벤트 로그 최근 30개(`{t, ev}`: nav, srcChange, swap, mode, pip, skip). 개인정보 규칙(GUIDELINES 2.6) 유지: URL은 경로+`v`만.

**M3-5. DOM 스냅샷과 tests/dom**
- 사용자 Mac에서 Safari Web Inspector 콘솔에 붙여 넣을 스냅샷 스크립트를 `scripts/dom-skeleton.js`로 둔다. `#movie_player`와 그 조상 3단계까지의 태그·id·class·주요 data-* 속성만 담은 HTML 골격(텍스트·이미지·URL 제거)을 출력한다. 상태: 기본, 극장, 전체화면, 미니플레이어, 광고 재생 중, HDR 영상(설정 메뉴 열린 상태 포함).
- 결과를 `tests/dom/fixtures/yt-<상태>.html`로 커밋하고 Playwright WebKit 테스트로 `findMainVideo`, `playerMode`, HDR 배지 판정, 광고 플래그를 검사한다. 스냅샷 전에는 현재 최소 픽스처로 로직만 테스트하고 셀렉터 확정은 스냅샷 커밋 후에 한다.

**M3-6. 작업 분할**
- W-A(impl-worker): `detect.js`(감지 순수 함수·셀렉터 상수·이벤트 이름), `tests/dom/**`, `scripts/dom-skeleton.js`, detect 단위 테스트.
- W-B(impl-worker): `overlay.js`(배치·트리거), overlay 단위 테스트.
- 본 세션(Sonnet): `main.js` 상태 모델 통합, `renderer.js` 소스 단위 재시작·colorSpace 수집, `hud.js`·스키마·parse-result, 체크리스트. W-A·W-B 완료 후 통합한다.
- 순서: 1단계(W-A·W-B 병렬, 최소 픽스처) → 2단계(본 세션 통합) → 사용자 스냅샷 수집 → 3단계(셀렉터 확정·픽스처 교체) → 사용자 M3 체크리스트.

**M3-7. 검증**
- (1) lint, `npm test`, `npm run test:dom`(로컬 Mac에서는 WebKit 실행 가능), `python3 -m pytest sim`. 상태 전이 표 테스트: 소스 변경 → probing, DRM 소스 → skipped(drm) 후 다음 소스도 skipped(drm), blackFrame 후 다음 소스 → probing, HDR → skipped(hdrSource), PiP 진입/해제.
- (2) CI ubuntu·macos green.
- (3) 사용자 Mac 수동 체크리스트(docs/manual-checklist.md M3 절, 회신 JSON 포함):
  1. 홈 → 영상 A 재생 → 추천 영상 B 클릭(SPA) → B에도 오버레이(진단 `navCount`·`srcChanges` 증가, state active)
  2. 극장 모드 ↔ 기본 ↔ 전체화면 ↔ 미니플레이어 전환 각각에서 오버레이 위치 일치, 컨트롤 클릭 가능
  3. 창 크기 조절 중·후 위치 일치
  4. 광고가 있는 영상에서 광고 → 본편 전환 시 오버레이 유지(검은 화면 없음)
  5. HDR 영상(YouTube HDR 표시 영상)에서 오버레이 없음, 진단 `skipReason: hdrSource`, `video.colorSpace.transfer`
  6. PiP 진입 시 원본 PiP 정상, 복귀 시 오버레이 재개
  7. DRM 콘텐츠(YouTube 영화·TV 무료 영화 등 EME 사용 페이지)에서 오버레이 없음, `skipReason: drm`. 이후 같은 탭에서 일반 영상으로 이동 시 skipped(drm) 유지(새로고침 시 해제)가 정상
- 판정: 1~6 모두 예, 7은 오버레이 없음이면 M3 완료. 실패 항목은 FIX_GUIDE로 처리.

**M3-8. 스냅샷 1차 분석과 3단계 지침 (2026-10-01, Opus)**

사용자가 5개 스냅샷(창 모드, 극장 모드, 확장 끔, 설정 메뉴 열림, HDR 영상+확장 켬+설정 메뉴)을 회신했다. 스냅샷 원문은 이 대화에서 받았으며 커밋은 Sonnet이 3단계에서 한다.

관찰(사실):
- O1 `#movie_player > .html5-video-container > video.video-stream.html5-main-video` 구조는 5개 모두 같다. 현행 `SELECTORS`(player/container/video)는 **확정**한다.
- O2 조상 3단계(`div#container` → `ytd-player#ytd-player` → `div#player-container.ytd-watch-flexy`)는 창·극장에서 같다. `ytd-watch-flexy`가 4단계 이상 위에 있어 스냅샷에 들어오지 않았다. 따라서 **극장 판정 근거(`ytd-watch-flexy[theater]` 등)는 이번 스냅샷으로 확인할 수 없다**.
- O3 `#movie_player` 클래스 차이(창 ↔ 극장): 창에만 `ytp-fit-cover-video`, 극장에 `ytp-autohide`·`ytp-progress-bar-snap`(마우스 상태에 따라 변함). 레이아웃 판정에 쓸 안정 신호가 아니다. **`#movie_player` 클래스로 극장을 판정하지 않는다.**
- O4 "확장 끔"과 "확장 켬"의 골격에 차이가 없다(캔버스는 스크립트가 `canvas`를 건너뛰어 원래 보이지 않음). 확장이 YouTube DOM 구조를 바꾸지 않는다는 근거로만 쓴다(캔버스 위치 검증 아님).
- O5 설정 버튼은 `button.ytp-settings-button.ytp-4k-quality-badge`. HDR 영상 스냅샷에서도 같은 `ytp-4k-quality-badge`였다. 메뉴 항목 텍스트는 스크립트가 지우므로 "2160p60 HDR" 같은 표기를 볼 수 없다. **DOM 기반 HDR 배지(2순위)는 근거가 없다**(현행 추측값 `.ytp-hdr-badge`는 스냅샷에 없음).
- O6 광고(`ad-showing`), 미니플레이어, 전체화면 스냅샷은 아직 없다.

결정:
- D1 HDR 원본 판정은 **M3에서 1순위(`VideoFrame.colorSpace.transfer`)만** 쓴다. 2순위(DOM 배지)는 M3 범위에서 뺀다. `MODE_SELECTORS.hdrBadge`와 `readPlayerFlags().hdrBadge`는 진단용으로 남기되 판정(`main.js`)에 연결하지 않는다(현행 유지). 추측 셀렉터는 `.ytp-settings-button.ytp-hdr-quality-badge`로 바꾸고 [미확인] 주석을 유지한다(O5의 `ytp-<품질>-quality-badge` 패턴에 맞춘 추정). 체크리스트 5번은 `video.colorSpace.transfer`와 `skipReason`으로 판정한다.
- D2 극장·미니플레이어 판정은 진단용(`playerMode`)이며 배치에 쓰지 않으므로(M3-2) 셀렉터 미확정 상태로 M3 완료를 막지 않는다. 확정은 D3 재수집 결과가 오면 하고, 오지 않으면 [미확인]으로 M3를 닫는다.
- D3 `scripts/dom-skeleton.js` 수정(사용자 재수집용):
  1. 조상 수집을 고정 3단계가 아니라 `ytd-watch-flexy`, `ytd-miniplayer`, `ytd-app` 중 먼저 만나는 요소까지(상한 10단계)로 바꾼다.
  2. 속성 이름 수집 대상 태그에 `ytd-app`, `ytd-watch-flexy`, `ytd-miniplayer`, `ytd-player`를 넣고, 이름 목록을 `theater`, `fullscreen`, `full-bleed-player`, `active`, `miniplayer-is-active`, `hidden`으로 한다(값은 버리고 이름만, 현행 규칙 유지).
  3. `#movie_player` 하위는 출력이 1,500줄을 넘어 붙여 넣기 부담이 크다. 하위 전개를 `.html5-video-container`, `.ytp-chrome-bottom .ytp-right-controls`, `.ytp-settings-menu`, `.ytp-ad-module`, `.video-ads`(존재 시)로 한정하는 옵션 상수 `FULL = false`를 둔다(기본은 한정 출력). 텍스트·URL 제거 규칙은 그대로.
- D4 픽스처: 이번 5개 중 **창 모드 → `tests/dom/fixtures/yt-default.html`, 극장 → `yt-theater.html`, HDR+설정 → `yt-hdr-settings.html`** 3개만 커밋한다. GUIDELINES 2.3-4에 따라 D3-3과 같은 범위(조상, `#movie_player` 태그·클래스, video 컨테이너, 오른쪽 컨트롤, 설정 메뉴)로 잘라서 넣는다. "확장 끔"·"설정 띄움"은 O4·O5 근거로만 쓰고 커밋하지 않는다.
- D5 3단계 테스트(Playwright WebKit, 위 픽스처): `findMainVideo`가 video·container·player를 찾음, `isAdShowing` false, `readPlayerFlags().hdrBadge` false(3개 모두, O5), `playerMode`는 `yt-theater.html`에서도 **`default`가 나오는 것을 현재 한계로 고정**하는 테스트를 두고 이름에 "[미확인] 조상 미포함"을 적는다(D3 재수집 후 바꾼다). 기존 `m3-*.html` 최소 픽스처 테스트는 로직 검사로 유지한다.
- D6 2단계 설계 해석(STATUS.md 기록) 승인: renderer 오류를 모두 `skipped(noGpu)`로 요소 단위 처리, `milestone` 'M2' 유지, 이벤트 로그 `lifecycle.events`, 설정 토글 시 noGpu 요소 재시도. 문서상 추가 변경 없음.

3단계 작업 순서(Sonnet):
1. D3 `dom-skeleton.js` 수정 → lint.
2. D1 `detect.js` hdrBadge 추측값 교체(주석 유지), D4 픽스처 3개, D5 테스트 → `npm test`, `npm run test:dom`.
3. `docs/manual-checklist.md`에 M3 절(M3-7 (3)의 7개 항목, 회신 JSON 파일명 `results/result-M3-<YYYYMMDD>-<항목>.json`, 재수집 절차: 미니플레이어·광고·전체화면 스냅샷을 D3 스크립트로)을 쓴다.
4. STATUS.md·PR #5 갱신, push.
→ verify: lint·unit·test:dom 통과 / 픽스처 3개 커밋 / (3) 사용자 M3 체크리스트와 D3 재수집은 미검증

### D-M4a. HDR 강도 슬라이더 (2026-10-01, Opus)

배경: 0b 체감 기록("identity와 itm 사이 어딘가라면 만족")과 M3 회신의 사용자 요청("HDR 강도를 itm 기준으로 드래그식 조절"). 프리셋 수치 확정(M4) 전에 사용자가 직접 세기를 고르게 하고, 그 선택값을 M4 기본값 결정 자료로 쓴다.

**M4a-1. 정의**
- 강도 `t` ∈ [0, 1], 저장 단위 0.01. 출력은 **선형광 P3 공간에서** `out = mix(idP3, itmP3, t)`. `idP3`는 identity 모드와 같은 값(sRGB EOTF → 709→P3), `itmP3`는 현행 ITM 결과(OETF 직전). 혼합 후 기존 확장 sRGB OETF(부호 보존)로 인코딩한다.
- 성질(테스트로 고정): t=0이면 identity 출력과 같고, t=1이면 현행 itm 출력과 같다. 두 곡선이 모두 단조이므로 혼합도 단조다. 피크는 `1 + t(P−1)`(균형 P=3이면 t=0.5에서 2.0).
- 기본값 **0.5**. 근거: 균형 초안 P=3에서 피크 2.0 = 밝기 최대 헤드룸(약 2)이므로 C절 "0a 헤드룸 제약" M4 조건 (a)와 같은 효과(하드 클리핑 없음). 최종 기본값은 M4에서 사용자 회신을 보고 확정한다.
- 강도는 프리셋과 독립된 최상위 값이다. M5에서 프리셋을 바꿔도 강도는 유지한다. `identity`·`stripes`·`baseline` 모드에는 영향이 없다.

**M4a-2. 파일별 작업**
| 파일 | 내용 |
|---|---|
| `content/params.js` | 키 `sdrhdr.strength`(기본 0.5), 범위 상수 `STRENGTH = {min:0, max:1, step:0.01, default:0.5}`, `normalizeSettings`가 숫자 아님·범위 밖을 기본값/클램프로 처리 |
| `content/itm.wgsl.js` | ITM 프래그먼트에 uniform `strength: f32`(16바이트 정렬 구조체, group 0의 다음 binding) 추가, OETF 직전에 위 혼합. ITM 곡선 본문(`ITM_FN`)은 바꾸지 않는다. ext·vf·copy 세 ITM 변형 모두 같은 혼합 |
| `content/renderer.js` | attach 시 uniform 버퍼 1개 생성(GUIDELINES 2.5-5), bind group에 포함, `setStrength(t)`는 `queue.writeBuffer`만 하고 정지 상태면 1회 렌더(`setMode`와 같은 방식). 파이프라인 재생성 금지 |
| `content/main.js` | 설정의 `strength`를 attach 시 전달, `onSettings`에서 바뀌면 `setStrength`만 호출(재attach 금지) |
| `popup/popup.html`, `popup.js` | "HDR 강도" `<input type="range" min=0 max=100 step=1>` + % 표시. 입력 중 100 ms 간격으로 `storage.local`에 저장(값 0~1로 변환). 모드가 `itm`이 아니면 비활성. 다른 UI 추가 금지 |
| `content/hud.js`, `docs/result-schema-m2.json`, `scripts/parse-result.py` | schemaVersion 7: `render.strength`(number|null). parse-result 표에 열 추가 |
| `sim/` | 혼합 함수 추가(`tonecurve.py` 또는 새 함수), pytest: t=0 → identity, t=1 → itm, t ∈ {0.25, 0.5, 0.75}에서 단조·NaN 없음·피크 = 1+t(P−1). S10(헤드룸 클리핑) 표에 t 축(0.25/0.5/0.75/1.0) 추가 |
| `tests/unit` | params 클램프, WGSL 문자열에 혼합·uniform 존재, `ITM_FN`이 probe와 같음(기존 테스트를 곡선 부분 비교로 조정), renderer stub에서 `setStrength`가 writeBuffer 1회·파이프라인 생성 없음 |

**M4a-3. 검증**
- (1) lint, `npm test`, `npm run test:dom`, `.venv/bin/python -m pytest sim`.
- (3) 사용자 Mac(체크리스트 M4a 절, Sonnet 작성): 밝기 최대와 중간 각각에서 itm 모드로 슬라이더를 움직여 (a) 드래그 후 1초 안에 반영되는지, (b) 가장 마음에 드는 강도 %, (c) 하이라이트가 하얗게 뭉개지기 시작하는 강도 %를 적고, 선호 강도에서 진단 JSON 1개씩 `results/result-M4a-<YYYYMMDD>-<밝기>.json`으로 저장.
- 판정: (a) 예면 M4a 완료. (b)(c)는 M4 기본 강도·프리셋 결정 자료(Opus).

**M4a-4. 범위 밖**: 프리셋 선택·6개 상세 슬라이더(M5), 헤드룸 자동 추정, 소프트 롤오프(M4), 페이지 위 HUD.

**M4a-5. 구현 후 결정 (2026-10-01, Opus)**
- 해석 승인 ①: t=0은 **색역 변환(709→P3)을 한 SDR**로 한다(구현 그대로). 문구 "identity 출력과 같다"는 "곡선·게인·채도 없이 색 변환만 한 SDR"로 고쳐 읽는다. identity 모드는 진단용(GUIDELINES 2.6-3)이라 일치시킬 필요가 없다.
- 해석 승인 ②: `idLin`에 밝기 게인 g를 적용하지 않는다(구현 그대로). g는 ITM 쪽 파라미터다.
- 하이라이트(화이트포인트) 휘도 슬라이더(사용자 요청)는 **M5로 이월**한다. M5 계획 때 정할 것: (a) 대응 파라미터(피크 배율 P 또는 확장 시작 k, 또는 "피크 nit 대신 헤드룸 배율"로 표시), (b) 강도 t와의 관계(피크 = 1 + t(P−1)이라 곱으로 겹침: 독립 두 슬라이더 / P를 피크 슬라이더로 노출하고 t는 곡선 혼합만 / 하나로 통합 중 택1), (c) 상한(헤드룸 2~4, A18)과 S10b 표, (d) M4a 체크리스트 (b)(c) 회신값. M5 착수 전까지 구현하지 않는다.
- M4a 판정은 체크리스트 M4a 절 (a) 회신 후 기록한다(WGSL 컴파일 포함 미검증 상태로 PR #6 머지됨, 사용자 지시).

**M4a-6. 사용자 회신과 M4 입력 자료 (2026-10-01, Opus)**
- 회신: 드래그 후 1초 안 반영(예). 선호 강도: 밝기 중간 40~60%, 최대 40~50%. 하이라이트가 뭉개지기 시작: 중간 70~80%, 최대 약 70%. 진단 JSON 1개(`strength` 0.68, 밝기 미기재, 3840×1920 SDR bt709, path vf, errors 없음, frames 1220, JS p95 1 ms).
- 해석: 균형 P=3에서 t=0.7의 피크는 2.4다. 밝기 최대(헤드룸 약 2)에서는 헤드룸 초과 클리핑으로 설명되지만, 중간(헤드룸 약 3)에서도 비슷한 지점(70~80%)에서 뭉개짐이 보였다. 따라서 뭉개짐의 주원인은 헤드룸 클리핑만이 아니라 **곡선 상단의 압축(n=2.5, k=0.65 위 구간이 빠르게 피크로 감)과 하이라이트 채도 감소(hs 0.95)**일 가능성이 크다 [추정]. M4에서 S2·S10b와 함께 확인한다.
- M4 결정 입력: (1) 기본 강도 후보 **0.45**(두 밝기 선호 구간의 공통부, 균형 P=3에서 피크 1.9 ≤ 헤드룸 2). (2) 강도 상한 표시 또는 경고 기준 후보 0.7. (3) 곡선 상단 형태(n, k)와 소프트 롤오프 검토 근거.

### D-M6. M6 상세 계획 (2026-10-01, Opus)

목적: 오래 켜 두고 써도 끊김·메모리 증가가 없게 하고, 다시 설치할 때 따라 할 문서를 남긴다. 기능 추가는 하지 않는다.

**M6-1. frameProbe 비용 절감 (renderer.js)**
근거: 4K HDR 첫 frameProbe에서 `c2dSyncMs` 608 ms(M3 회신), 정상 상태 30초마다 `copySyncMs` 12~22 ms·`c2dSyncMs` 22~31 ms(M4·M5 회신). 30초마다 프레임 1~2개를 놓칠 수 있는 메인 스레드 점유다.
- (a) **HDR 조기 판정**: 경로 결정 전 첫 회차는 vf를 **먼저** 측정한다(현행 ext → vf → copy → c2d 순서를 vf → ext → copy → c2d로). vf 측정에서 얻은 `colorSpace`가 `detect.isHdrSource`로 HDR이면 나머지(ext·copy·c2d)를 측정하지 않고 바로 `onProbe`를 부른다(frameProbe의 ext/copy/c2d는 null, `hdrEarly: true`). main은 현행대로 skipped(hdrSource) 처리. 순서 변경이 경로 선택 결과(choosePath의 ext 우선)를 바꾸지 않음을 테스트로 고정한다.
- (b) **정상 상태 단일 경로**: 경로가 결정된 뒤의 30초 주기 회차는 **선택 경로 하나만** 측정한다. 그 값이 검정 기준(< 2) 아래일 때만 같은 회차에서 나머지(아래 단계 경로와 c2d)를 추가 측정해 현행 `stepDownPath`·`nextBlackStreak` 판정을 그대로 한다. 밝으면 c2d·copy를 측정하지 않는다. frameProbe 진단 객체에 `mode: 'full' | 'single'`를 추가한다.
- (c) 결정 전(pending 포함) 회차와 소스 변경 후 첫 회차는 (a) 규칙의 전체 측정을 유지한다(경로 선택 근거 보존).
- 효과 기대 [추정]: 정상 상태에서 c2d·copy 동기 시간(약 35~50 ms/30초)이 사라지고, 4K HDR 첫 attach의 600 ms 점유가 vf 1회(약 1 ms)로 준다.
- 진단: schemaVersion 10(`frameProbe.mode`, `frameProbe.hdrEarly`). 스키마·parse-result 갱신.

**M6-2. 측정 절차 (체크리스트 M6 절, 코드 변경 없음)**
- (1) **30분 soak**: 2160p60 SDR 영상, 창 모드, 기본 설정(M5-0 개정값), HUD 켬. 시작 5분 시점과 30분 시점에 (a) 진단 JSON 저장(`videoDropped/videoTotal`), (b) 활성 상태 보기(Activity Monitor)에서 youtube.com 웹 콘텐츠 프로세스 메모리, (c) HUD의 fps·누락%. 기준: 드롭률 < 1%, 메모리 증가 < 15%(5분 → 30분), 끊김 육안 없음.
- (2) **전체화면 비용**: 같은 영상 전체화면 2분, 확장 켬(itm) vs popup 진단 영역의 `baseline` 각각 진단 JSON. 기준: 누락률 차(itm − baseline) < 1%p, JS p95 ≤ 4 ms. 넘으면 M6-4로.
- (3) **60Hz 확인(A24)**: 시스템 설정 디스플레이 주사율 60Hz, HUD fps를 확장 켬(itm)과 `baseline`에서 각각 본다. 둘 다 약 30이면 Safari·OS 쪽 현상으로 기록하고 종료(확장 범위 밖). itm만 30이면 FIX_GUIDE.
- (4) **비60fps 소스(C-b/C-c)**: 24·25·30fps 영상 1개씩 itm과 확장 끔에서 끊김 육안 비교. 확장 끔에서도 같으면 원본 cadence(C-c)로 기록하고 종료.
- (5) **4K HDR 첫 attach**: HDR 영상을 새로 열 때 첫 1초 안에 멈칫함이 있는지(없음/있음), 진단 `frameProbe.hdrEarly` true 확인.

**M6-3. 문서**
- `docs/install.md`(신규): 요구 환경(macOS·Safari 버전, Xcode), 빌드(`scripts/make-xcode.sh`는 최초 1회, 이후 Xcode Run만), 서명(개인 팀, `DEVELOPMENT_TEAM` 커밋 금지), Safari 설정(확장 켜기, youtube.com 허용, 개발자 메뉴 "서명되지 않은 확장 허용"은 Safari 재시작마다 [확인 필요]), 무료 개인 팀 서명의 7일 만료와 재빌드 방법, popup 사용법(프리셋·강도·선명도·채도·상세 설정·유효 피크·HUD), 문제 해결(영상이 원본 그대로일 때 진단 JSON의 `errors`·`lifecycle.skipReason` 읽는 법, HDR·DRM 영상은 의도적으로 건너뜀).
- 확인하지 않은 내용은 [확인 필요]로 표기한다(GUIDELINES 1-5 정신).
- manifest `version` 0.1.0 → **1.0.0**(M6 완료 시점, 이 PR에 포함).

**M6-4. 조건부: 전체화면 해상도 상한 (M6-2 (2)가 기준을 넘을 때만)**
- 캔버스 백킹 크기 상한을 표시×DPR의 0.75배로 낮추는 순수 함수 인자 추가(`canvasResolution`에 scaleCap). 기본은 1.0(현행)이고 측정 결과로 Opus가 값을 정한다. 이번 PR에서는 구현하지 않는다.

**M6-5. 이월 항목 정리 (결정)**
- K1(프로브 지표 정리, schemaVersion 6 예정): 프로브는 M1·M2 판정 도구였고 확장 진단이 대체했다 → **종료(불필요)**.
- S2 C¹ 검사법: `RANGES.n` 하한 2.0으로 n<2를 쓰지 않으므로 → **종료**.
- 같은 소스 프레임 재렌더 생략(ProMotion 2회 렌더, C절): rVFC가 Safari에서 표시 프레임보다 적게 호출(A20)되어 프레임 변화 신호로 쓸 수 없고 `currentTime`은 프레임 단위가 아니다 → **보류**(GPU 예산 내, 측정상 문제 없음).
- M3 [미확인](광고, PiP 복귀, 미니플레이어, 극장 셀렉터): 진단·사용자 체감 영향 없음 → 보류, 회귀 시 FIX_GUIDE.
- 진단 `milestone: 'M2'` 표기: 스키마 호환을 위해 유지.

**M6-6. 작업 분할과 검증**
- W-A(impl-worker): `renderer.js` M6-1 + 단위 테스트(첫 회차 vf 우선·HDR 조기 종료·정상 상태 단일 경로·검정 시 확장 측정·경로 선택 결과 불변).
- W-B(impl-worker): `docs/install.md`.
- 본 세션(Sonnet): hud.js·스키마·parse-result v10, manifest 버전, 체크리스트 M6 절, STATUS.
- (1) lint·npm test·test:dom·pytest sim. (2) CI. (3) 사용자 체크리스트 M6 절. 판정: (1) soak 기준 충족, (5) 멈칫함 없음이면 M6 완료(2)(3)(4)는 기록, (2) 초과 시 M6-4 지시.

**M5 판정 완료 (2026-10-01)**: 게이트 판정 기록 "M5 UI" 행 참조. M6 착수.

**M6 판정 완료 (2026-10-01)**: 게이트 판정 기록 "M6 성능·안정화" 행 참조. M0~M6 전체 완료(확장 1.0.0). 이후 변경은 새 요청 단위로 Opus가 계획(D-절 추가)한 뒤 Sonnet이 구현한다. 남은 보류 항목: M3 [미확인](광고, PiP 복귀, 미니플레이어, 극장 셀렉터), 같은 프레임 재렌더 생략(M6-5), 선명도 GPU 비용 실측, install.md [확인 필요] 항목, M6 soak 수치.

### D-M5. M5 상세 계획 (2026-10-01, Opus)

목적: 사용자가 프리셋을 출발점으로 곡선을 직접 조정하고(하이라이트 밝기 포함), 페이지 위에서 상태를 확인할 수 있게 한다. 진단용 UI는 일반 조작과 분리한다(GUIDELINES 2.6-3).

**M5-0. 기본값 갱신 (M4 사용자 선택 반영)**
- 사용자 선택(2026-10-01): 프리셋 정확, 강도 53%, 선명도 0, 채도 105%. 기본값을 이 값으로 바꾼다: `DEFAULT_PRESET = 'accurate'`, `STRENGTH.default = 0.53`, `SATURATION.default = 1.05`, `SHARPNESS.default = 0`(그대로). 근거: 단일 사용자 도구이고 사용자가 직접 고른 값이다. 정확 P=2에서 t=0.53이면 피크 1.53으로 밝기 최대 헤드룸(약 2) 안이다.
- 이미 저장된 설정은 그대로 둔다(기본값은 저장값이 없을 때만 쓰임).
- **개정(2026-10-01, 사용자 지시)**: 기본값을 popup에서 사용자가 맞춘 설정으로 다시 바꿨다. 프리셋 `custom`, 곡선 `DEFAULT_CUSTOM` = {P 2.0, k 0.40, n 2.0, g 1.22, s 1.03, hs 1.03}, 강도 0.43, 선명도 0, 채도 1.05, HUD 꺼짐. 유효 피크 1 + 0.43 × (2.0 × 1.22 − 1) ≈ 1.62로 밝기 최대 헤드룸(약 2) 안이다. `normalizeCustom`의 누락 기본값도 `DEFAULT_CUSTOM`. 현재 기본값의 기준은 이 줄과 `params.js`다.

**M5-1. 상세 슬라이더와 사용자 지정 프리셋 (하이라이트 슬라이더 결정, M4a-5 해소)**
- 결정(M4a-5 (a)(b)): 별도 "하이라이트 슬라이더"를 두지 않고, 상세 슬라이더 6개 중 피크 배율 P를 **"하이라이트 밝기"**라는 이름으로 맨 위에 둔다. 강도 t는 곡선 혼합 비율로 유지한다(피크 = 1 + t(P·g − 1)). 두 값이 겹치는 것은 popup에 **유효 피크** 표시로 해결한다.
- 상세 슬라이더(상세 영역 `<details>` 안, 기본 접힘): 하이라이트 밝기 P(1.0–8.0, 0.1), 확장 시작 k(0.4–0.9, 0.01), 곡선 지수 n(2.0–4.0, 0.1), 밝기 g(0.8–1.5, 0.01), 곡선 채도 s(0.8–1.5, 0.01), 하이라이트 채도 hs(0.5–1.5, 0.01). 범위는 `params.RANGES` 한 곳(GUIDELINES 3-5).
- `RANGES.n` 하한을 1.5 → **2.0**으로 바꾼다(M4-A2: n<2는 k에서 곡률 무한대, 무릎선 위험). `sim/presets.py` RANGES와 sim 스윕 격자도 같은 하한으로 맞춘다(S2 격자의 n=1.5 행 제거, 성질 테스트는 유지).
- 사용자 지정: 상세 슬라이더를 움직이면 프리셋이 `'custom'`으로 바뀌고 값은 `sdrhdr.custom`(객체 `{P,k,n,g,s,hs}`)에 저장한다. 처음 사용자 지정으로 들어갈 때는 직전 프리셋 값을 복사해 시작한다. 프리셋 select에 "사용자 지정"이 추가되고, 다른 프리셋을 고르면 상세 슬라이더가 그 프리셋 값을 보여 준다(읽기 전용 아님: 움직이면 다시 custom).
- `normalizeCustom(raw)`: 각 값 `RANGES`로 클램프·step 반올림, 누락·비숫자는 `PRESETS.accurate` 값. `toUniformArray`는 preset이 `'custom'`이면 custom 값을 쓴다.
- 유효 피크 표시: popup에 "유효 피크 ×N.NN"(= 1 + t(P·g − 1)). 2.0을 넘으면 "밝기 최대에서 하이라이트가 잘릴 수 있음" 안내를 같은 줄에 표시한다. 계산은 params의 순수 함수 `effectivePeak(settings)`.

**M5-2. popup 정리**
- 일반 영역(위에서 아래): 켜기, 프리셋(정확/균형/선명/사용자 지정), HDR 강도, 선명도, 채도, 유효 피크 표시, 상세 설정(`<details>` 6개 슬라이더), HUD 표시 체크박스.
- 진단 영역(`<details>`, 기본 접힘, 제목 "진단"): 모드 select(itm/identity/stripes/baseline), 진단 JSON·복사·저장. 모드가 itm이 아니면 일반 영역의 셰이더 컨트롤 비활성(현행 유지).
- 슬라이더 공통 동작은 M4와 같다(100 ms 저장, change 시 flush).

**M5-3. 페이지 HUD (hud.js)**
- 키 `sdrhdr.hud`(기본 false). 켜면 플레이어(`#movie_player`) 안 왼쪽 위에 작은 텍스트 상자를 둔다: `pointer-events:none`, 고정폭 글꼴 11px, 반투명 배경, z-index 지정 없음(컨트롤 아래 순서 유지 원칙과 같게 DOM 순서로 캔버스 뒤·컨트롤 앞). 셀렉터·삽입 위치는 detect.js 함수로 받는다(GUIDELINES 2.3-1).
- 내용(1초 갱신, 진단 수집 주기와 별개로 렌더 통계만 읽음): `state/skipReason`, `path`, `preset t=xx% sh=xx% cs=xx%`, `유효 피크 ×N.NN`, `loopFps`, `JS p95`, `miss%`, `video WxH`. 개인정보 규칙(GUIDELINES 2.6) 동일: URL·제목 없음.
- HUD는 진단용이 아니라 사용자 확인용이므로 일반 영역에 둔다(GUIDELINES 2.6-3 대상 아님). 순수 함수 `hudLines(stats, lifecycle, settings)` → 문자열 배열(테스트 대상), DOM 생성·갱신은 main.js에서 호출되는 `createHud(player)` → `{update(lines), destroy}`.
- 비용: 1초에 한 번 textContent 갱신만 한다. 렌더 루프와 무관.

**M5-4. 진단 v9**
- `render.preset`에 `'custom'` 허용, `render.custom`(`{P,k,n,g,s,hs}` 또는 null, preset이 custom일 때만), `render.effectivePeak`, `flags.hud`. 스키마·parse-result 갱신.

**M5-5. 작업 분할**
- 1단계(본 세션 Sonnet): params(`RANGES.n`, 기본값, custom, `effectivePeak`, `toUniformArray`), sim RANGES·격자, main(custom·hud 설정 전달), renderer 변경 없음 확인, 스키마 v9. 단위 테스트.
- 2단계(impl-worker 병렬, 파일 비중첩): W-A `popup/*`(M5-1·M5-2 UI), W-B `content/hud.js`의 HUD 부분(`hudLines`, `createHud`)과 `detect.js`의 HUD 삽입 위치 함수 + 테스트. main.js의 HUD 연결은 2단계 후 본 세션이 한다.
- 체크리스트 M5 절(Sonnet): (1) 상세 슬라이더 반영 < 1초, 움직이면 "사용자 지정"으로 바뀌는지, 다른 프리셋 선택 시 값이 바뀌는지, 브라우저 재시작 후 사용자 지정 값 유지 (2) 하이라이트 밝기를 올릴 때 유효 피크 표시와 경고 (3) HUD 켜기/끄기, 위치(컨트롤 가리지 않음), 내용 갱신, 끊김 변화 없음 (4) 진단 영역 접힘·모드 변경 동작 (5) 기본값(설정 초기화 후 정확·53%·105%) 확인 방법: Safari 확장 설정에서 데이터 삭제가 어려우면 [미확인]으로 둔다.

**M5-6. 검증**
- (1) lint, `npm test`(params custom 직렬화·클램프·effectivePeak·hudLines 테스트 포함), `npm run test:dom`(HUD 삽입 위치 함수 픽스처 테스트), pytest sim(RANGES 변경 반영).
- (2) CI green.
- (3) 사용자 Mac 체크리스트 M5 절. 판정: (1)(3) 예이면 M5 완료.

**M5-7. 범위 밖**: 헤드룸 자동 추정, 프리셋 이름 변경·추가 저장, 단축키, 선명도 알고리즘 고도화(M4-D), M6 항목(성능·soak·문서).

### D-M4. M4 상세 계획 (2026-10-01, Opus)

목적: 사용자 회신(M4a-6)의 "강도 70% 부근부터 하이라이트가 뭉개짐"을 곡선으로 해결하고, 프리셋 3종 수치와 기본 강도를 확정한다. 세 곳(WGSL·JS 미러·numpy)의 수식 일치를 테스트로 묶는다.

**M4-0. 근거와 가설**
- 기존 S5: 하이라이트 인접 코드 스텝 증폭 `amp_enc` 최대 정확 8.51 / 균형 7.99 / 선명 6.67. 강도 t로 섞으면 대략 `1 + t(amp−1)`이라 균형 t=0.7에서 약 6, t=0.5에서 약 5다.
- 가설 H1 [추정]: 뭉개짐의 주원인은 곡선 꼭대기 기울기(`f'(1) = 1 + n(P'−1)`, 균형 약 15)로 8bit 상단 코드 몇 개가 넓은 휘도 범위에 퍼지는 것(계단·번짐)과 하이라이트 채도 감소(hs<1)다. 헤드룸 클리핑은 밝기 최대에서만 추가 원인이다(밝기 중간에서도 같은 지점에서 뭉개짐).
- 따라서 같은 피크를 유지하면서 꼭대기 기울기를 낮추는 방향(k를 낮춰 확장 구간을 넓히고 n을 낮춰 기울기를 분산)을 찾는다.

**M4-1. 확정 사항 (지금 결정)**
- 기본 강도 **0.45**(M4a-6). `params.STRENGTH.default`와 sim·테스트 기대값을 바꾼다.
- 곡선 식(C절 ITM 3)은 유지한다. 1차 탐색은 파라미터만 바꾼다. M4-A에서 기준을 만족하는 조합이 없을 때만 Opus가 식 변경(꼭대기 기울기 상한이 있는 형태)을 별도로 정한다.
- 판정 기준(M4-A 결과로 Opus가 수치를 고를 때 적용):
  - C1 `amp_enc` 최대(회색 램프, t=1): 정확 ≤ 3.5, 균형 ≤ 4.5, 선명 ≤ 5.5. 근거: 사용자 허용 지점(균형 t≈0.5~0.6, 현재 amp 약 5)을 t=1까지 밀어낸다.
  - C2 기본 강도 0.45에서 피크 `1 + 0.45(P·g−1)` ≤ 2.0(정확·균형, 밝기 최대 헤드룸). 선명은 ≤ 2.5 허용(밝기 중간 이상 사용 전제, 프리셋 설명에 표기).
  - C3 미드톤 보존: k ≥ 0.45(피부·중간 밝기는 항등 구간에 남긴다).
  - C4 S4 음수 채널: 정확 0% 유지, 균형 ≤ 2%, 선명 ≤ 12%(현재 수준 이하).
  - C5 단조·C¹·NaN 없음(S1), 혼합 성질(test_strength) 유지.
- hs(하이라이트 채도) 기본은 정확·균형 **1.0**으로 올린다(채도 감소로 하얗게 보이는 효과 제거, H1 후반). 선명 1.0 유지.

**M4-A. sim 탐색 (Sonnet, 코드는 sim/만, 확장 코드 변경 없음)**
- S11 신규 `sim/explore.py` + 테스트: 격자 k ∈ {0.45, 0.5, 0.55, 0.6, 0.65}, n ∈ {1.5, 2.0, 2.5, 3.0}, P ∈ {2.0, 2.5, 3.0, 3.5, 4.0}, g = 1.0, s ∈ {1.0, 1.05, 1.2}, hs = 1.0에서 열: `amp_enc` 최대(t=1, t=0.45), 꼭대기 기울기 f'(1), 기본 강도 피크, S4 음수 채널 %, 미드톤(Y=0.18, 0.4) 출력/입력 비, C1~C5 통과 여부. 통과 행만 모은 요약 표(프리셋별 후보 상위 5개, 정렬: amp_enc 최대 오름차순 → 피크 내림차순)를 출력한다.
- 결과는 값만 STATUS.md에 요약하고 Opus에 반환한다. Sonnet은 수치를 고르지 않는다.
- → Opus가 PLAN C절 프리셋 표를 개정한다(M4-A 결과 기록 포함).

**M4-A2. 프리셋 확정 (2026-10-01, Opus, 근거 STATUS "M4-A 결과"·`sim/explore.py`)**
| 프리셋 | 선택 | amp_t1 | amp@0.45 | 피크@0.45 | 음수 채널 | 이전 초안 amp_t1 |
|---|---|---|---|---|---|---|
| 정확 | P2 k0.5 n2 s1.0 | 3.33 | 2.25 | 1.45 | 0% | 8.51 |
| 균형 | P3 k0.45 n2 s1.0 | 4.35 | 2.93 | 1.9 | 0% | 7.99 |
| 선명 | P4 k0.45 n2 s1.2 | 5.29 | 3.58 | 2.35 | 11.34% | 6.67 |
- 선택 이유: 각 클래스에서 C1~C5를 만족하는 후보 중 **피크가 가장 큰 것**(HDR 효과 유지). 정확은 같은 피크에서 k 0.5를 골라 미드톤 항등 구간을 넓혔다. 균형의 꼭대기 계단 증폭은 강도 100%에서 4.35로, 사용자가 뭉개짐을 본 이전 초안 강도 70% 지점(약 5.9)보다 낮다. 따라서 균형의 뭉개짐 시작은 100% 근처 또는 그 이상으로 밀릴 것으로 본다 [추정, M4-C로 확인].
- k를 0.65 → 0.45로 낮춘 결과 확장 구간이 넓어진다(입력 sRGB 코드 약 178부터). 0b 체감("자막 같은 부분만 밝음")에도 맞는 방향이다. 피부 하이라이트(밝은 조명 피부 코드 245/205/180)는 확장 구간에 들어가므로 M4-C에서 피부 변화를 본다.
- 정확·균형 s를 1.0으로 내렸다(음수 채널 0%). 채도 취향은 M4-E 채도 슬라이더로 조절한다. 선명은 s 1.2 유지(음수 11.34% ≤ 12%).
- 선명 g를 1.05 → 1.0(격자 밖 값 회피, 피크 기준 C2 유지). 선명은 피크@0.45가 2.35로 밝기 최대 헤드룸(약 2)을 넘으므로 popup 설명에 "밝기 중간 이상 권장"을 붙인다.
- n=1.5 계열: 수학적으로는 n>1이면 C¹이지만 n<2는 k에서 곡률이 무한대(기울기가 √t처럼 급변)라 그라데이션에서 무릎선이 보일 위험이 있다. 이번에는 채택하지 않는다. S2 C¹ 검사법은 STATUS 기존 항목대로 미수정(n<2 미사용이라 영향 없음). 격자 확장(n 1.75, 선명 P>4)도 하지 않는다. M4-C에서 뭉개짐이 남으면 재검토한다.
- 기본 강도 0.45 유지(M4-1).
- M4-B 착수를 지시한다. `sim/presets.py`·`params.js`·참조 JSON은 위 표 값으로 바꾼다. 기존 sim 테스트 중 이전 초안 수치에 묶인 기대값(S4·S5·S10 등)은 새 값으로 갱신하되, 테스트의 성질(단조·항등 구간·클리핑 정의 등)은 약화하지 않는다(GUIDELINES 4-3).

**M4-B. 구현 (Opus 표 개정 후, Sonnet)**
| 파일 | 내용 |
|---|---|
| `content/params.js` | `PRESETS`(정확/균형/선명, C절 개정 표), 키 `sdrhdr.preset`(기본 `'균형'` 대신 ASCII id `'balanced'`, 나머지 `'accurate'`·`'vivid'`), 키 `sdrhdr.sharpness`·`sdrhdr.saturation`, 상수 `SHARPNESS`·`SATURATION`(M4-E), `normalizeSettings`에 preset·sharpness·saturation, `STRENGTH.default` 0.45 |
| `content/tonecurve.js` (신규, manifest에서 params.js 다음) | JS 미러: `srgbEotf`, `srgbOetfExt`, `curveF`, `itmLinear`, `itmLinearStrength`, `saturateP3`, `sharpenPixel`(sim/tonecurve.py·sim/sharpen.py와 같은 식). DOM·GPU 의존 없음 |
| `content/itm.wgsl.js` | ITM 상수(P,K,N,G,S,HS)를 uniform으로 옮긴다: `struct ItmParams { strength, P, k, n, g, s, hs, sharp, csat, pad0, pad1, pad2: f32 }`(48바이트), binding 2. 곡선 식 본문은 그대로. 선명도·채도는 M4-E. 이후 probe 셰이더와의 문자열 일치 검사는 종료한다(GUIDELINES 3-1 개정) |
| `content/renderer.js` | 유니폼 버퍼 48바이트, `setStrength`→`setParams({strength, preset 값, sharp, csat})`로 일반화(writeBuffer만). 파이프라인 재생성 없음 |
| `content/main.js` | preset·strength·sharpness·saturation 변경 시 `setParams`만 호출 |
| `popup/` | 프리셋 select(정확/균형/선명), 강도 슬라이더 유지, **선명도 슬라이더·채도 슬라이더** 추가(M4-E). 다른 UI 추가 금지(상세 슬라이더 6개·하이라이트 슬라이더는 M5) |
| `hud.js`·스키마·parse-result | schemaVersion 8: `render.preset`, `render.sharpness`, `render.saturation` |
| `sim/presets.py`, `sim/sharpen.py`(신규) | presets는 C절 개정 표와 같은 값. sharpen은 M4-E 참조 구현 |
| `tests/unit` | JS 미러 vs numpy 참조 오차 < 1e-4: `sim/`에 참조 생성 스크립트(`python -m sim.export_ref`)를 두고 `tests/unit/fixtures/tonecurve-ref.json`(램프 256, 9³ 격자, 프리셋 3종 × t ∈ {0, 0.45, 1} × 채도 csat ∈ {0.5, 1.0, 1.5}, 선명 3×3 이웃 샘플 × sharp ∈ {0, 0.5, 1}, 범위 경계값)을 커밋, JS 테스트가 비교. WGSL은 uniform 필드 순서·크기와 `params.js` 직렬화 순서가 같은지 문자열·바이트 검사 |

**M4-C. 사용자 확인 (체크리스트 M4 절, Sonnet 작성)**
- 밝기 최대·중간 각각, 하이라이트가 많은 SDR 영상 2개(하늘·조명·흰 옷 등)에서 프리셋 3종을 기본 강도 45%로 비교: 선호 프리셋, 뭉개짐이 시작하는 강도 %(프리셋별), 피부·중간톤이 원본과 달라 보이는지(예/아니오).
- 선명도·채도 슬라이더: 각각 0 ↔ 최대로 드래그해 (a) 1초 안 반영 (b) 선명도 100%에서 윤곽에 흰 테두리(헤일로)나 거친 노이즈가 보이기 시작하는 % (c) 채도 슬라이더로 마음에 드는 %와 색이 과하게 느껴지는 % (d) 선명도를 올렸을 때 끊김이 늘었는지(없음/가끔/자주), 진단 `render.loopFps`·`jsP95`·`displayMissRate`를 선명도 0과 100에서 각각 기록. 기본값(선명도 0, 채도 100%)이 이전 화면과 같은지.
- 판정: 균형 프리셋에서 뭉개짐 시작이 강도 85% 이상(또는 100%까지 없음)이고 미드톤 변화 "아니오"이며 선명도·채도 (a) 예, (d) "없음"이면 M4 완료. 아니면 Opus가 FIX_GUIDE로 곡선 식 변경을 지시한다.
- 회신 JSON: `results/result-M4-<YYYYMMDD>-<밝기>-<프리셋>.json`.

**M4-E. 선명도·채도 슬라이더 (사용자 요청, M4에 포함)**
- 둘 다 `itm` 모드에서만 동작한다(identity·stripes·baseline은 진단용이라 제외). 프리셋·강도와 독립이고 프리셋을 바꿔도 값을 유지한다.
- **채도** `csat` ∈ [0.5, 1.5], step 0.01, 기본 1.0, popup은 "채도 NN%"(50~150). 위치: 강도 혼합 **뒤**의 선형 Display P3에서 `Y' = dot(c, LUMA_P3)`, `c' = Y' + csat·(c − Y')`, 이후 확장 sRGB OETF. 프리셋의 `s`(곡선 쪽 채도)와 별개이며 강도 t에 영향받지 않는다. `LUMA_P3`는 P3 원색에서 유도한 휘도 계수(0.2290, 0.6917, 0.0793, sim에서 계산해 테스트로 고정). csat=1이면 출력이 기존과 같다.
- **선명도** `sharp` ∈ [0, 1], step 0.01, 기본 0, popup은 "선명도 NN%". 위치: ITM 전, 입력 sRGB 인코딩 값에서 **휘도만** 언샤프 마스크. 이웃 4탭(상·하·좌·우, 소스 텍셀 1칸, 소스 크기는 `textureDimensions(tex)`): `blur = (n+s+e+w)/4`, `d = dot(center − blur, LUMA709)`, `d = clamp(d, −0.10, 0.10)`(헤일로 제한), `out = clamp(center + sharp·SHARP_GAIN·d, 0, 1)`(RGB 모두에 같은 d를 더함), `SHARP_GAIN = 2.0`. `sharp == 0`이면 추가 샘플링 없이(유니폼 분기) 기존 경로와 같다. 나머지 ITM 단계는 그대로.
- 비용 가정 [추정]: 4탭 추가는 캔버스 해상도(표시×DPR 이하)에서 GPU 약 4~5배 샘플링이지만 현재 2160p ITM GPU 약 2.4~5.3 ms에 비해 예산 내일 것으로 본다. 사용자 Mac 측정(M4-C (d))으로 확인하고, 초과하면 Opus가 4탭을 2탭(가로·세로 대각 제외) 또는 반해상도 블러로 줄이는 지침을 낸다.
- 테스트: numpy `sim/sharpen.py`(평탄 입력 불변, sharp=0 항등, 계단 입력에서 오버슈트가 `SHARP_GAIN·0.10·sharp` 이하, 출력 [0,1]), `test_saturation`(csat=1 항등, csat=0 → 회색 `Y'` 일치, 회색 입력 불변, 휘도 보존), JS 미러 vs numpy 오차 < 1e-4, WGSL 문자열 검사(uniform 필드 순서·분기·`textureDimensions`).
- 스키마 v8: `render.sharpness`(0~1), `render.saturation`(0.5~1.5).

**M4-D. 범위 밖**: 상세 슬라이더 6개·하이라이트(화이트포인트) 슬라이더(M5), 선명도 알고리즘 고도화(CAS 등, 4탭 언샤프로 부족하면 M5), 헤드룸 자동 추정, HUD, BT.2446/2408 방식 채택(S6 비교는 참고만).

**M3 판정 완료 (2026-10-01)**: 게이트 판정 기록 "M3 수명주기" 행 참조. M4a 착수 가능.

**M2 판정 완료 (2026-10-01)**: G4 통과, G3c 통과(ProMotion·창 모드, 60fps 소스). M3 착수 가능. 렌더러 입력 경로는 C절 "비디오 입력 경로"(ext → vf → copy)로 확정. M6 이월: 비60fps 소스 끊김(샘플링 위상 C-b 대 원본 cadence C-c 분리), 60Hz rAF 30회/s(A24), 전체화면 비용 측정, K1.

**M1 판정 완료 (2026-09-30)**: G1·G2·G3 통과. M2(최소 확장 + Xcode) 착수 가능. M2의 렌더러는 C절 확정 렌더 루프(rAF)로 구현한다.

### D-M2. M2 상세 계획 (2026-09-30, Opus)

목적은 **G4 판정(확장 컨텍스트에서 WebGPU·YouTube video·EDR이 동작하는가)**이다. 화질·UI·수명주기 완성도는 목표가 아니다. 아래에 없는 기능은 M3 이후로 미룬다.

**M2-0. 범위**
- 포함: content script 최소판(메인 video 1개에 attach, DRM 가드, 오버레이 배치, rAF 렌더 루프, 3개 렌더 모드), 진단 기록, 진단용 최소 popup, `scripts/make-xcode.sh`, ci.yml macOS job, 0b 체크리스트, 결과 JSON 스키마.
- 제외(M3 이후): SPA 내비(`yt-navigate-finish`)·video 교체 재attach, HDR 원본 스킵, 광고 전환, 미니플레이어·PiP, 검은 프레임 보조 감지, 프리셋 선택·상세 슬라이더, 페이지 위 HUD, JS 톤 커브 미러. M2 테스트는 **영상마다 페이지를 새로 로드**하는 것으로 이를 대신한다.
- 프리셋: C절 **균형 초안 수치(P3/k0.65/n2.5/g1.0/s1.05/hs0.95)를 고정**한다. 0a G3에서 쓴 셰이더와 같아 비교 기준이 된다. 밝기 최대(헤드룸 2)에서 하이라이트가 잘리는 것은 알려진 제약(C절 0a 헤드룸 제약)이므로 0b 측정은 **SDR 밝기 중간(헤드룸 3)**에서 한다. 프리셋 수치 변경은 M4다.

**M2-1. 파일 (C절 구조의 부분집합, 새 파일 없음)**

| 파일 | M2 내용 |
|---|---|
| `extension/manifest.json` | MV3, `name` "SDR HDR", `version` "0.1.0". `content_scripts`: matches `https://www.youtube.com/*`, `run_at` `document_idle`, `all_frames` false, js 순서 `content/ns.js, detect.js, params.js, itm.wgsl.js, hud.js, renderer.js, overlay.js, main.js`. `permissions`: `["storage"]`만. `action.default_popup` `popup/popup.html`. background·host_permissions·web_accessible_resources·icons 없음(converter 경고는 허용, 로그만 기록) |
| `content/ns.js` | `globalThis.__sdrhdr = globalThis.__sdrhdr \|\| {}` |
| `content/detect.js` | 셀렉터 상수(`#movie_player`, `.html5-video-container`, `video.html5-main-video`). 순수: `isDrm({mediaKeys, webkitKeys, sawEncryptedEvent})`, `contentRect(boxW, boxH, videoW, videoH)`(letterbox, object-fit contain 가정). DOM: `findMainVideo(doc)` → `{video, container}` 또는 `null`(예외 없음) |
| `content/params.js` | 균형 프리셋 상수, C절 파라미터 범위 표, 모드 목록 `['itm','identity','stripes']`, 저장 키(`sdrhdr.enabled` 기본 true, `sdrhdr.mode` 기본 `'itm'`, `sdrhdr.diag`), 순수 `normalizeSettings(raw)`(잘못된 값 → 기본값). `browser.storage.local` 읽기와 `onChanged` 구독 함수(호출 시점에만 실행) |
| `content/itm.wgsl.js` | `probe/shaders.js`의 VERTEX, STRIPES(단계 1.0/1.25/1.5/2/3/4/6/8/16과 인코딩 방식 그대로), VIDEO_IDENTITY, VIDEO_ITM을 복사. 수식·인코딩 변경 금지. ITM 상수는 `params.js` 균형 프리셋 값으로 문자열을 조립한다(값의 출처를 한 곳으로) |
| `content/hud.js` | M2는 페이지 표시 없이 순수 함수만: `summarize(frameTimesMs, loopTimestamps)` → `{frames, loopFps, jsP50, jsP95}`, `buildDiag(state)` → M2-4 스키마 객체 |
| `content/renderer.js` | `createRenderer(canvas, video, onError)` → `{start, stop, setMode, destroy}`. GPU 초기화(`requestAdapter`/`requestDevice`에 5초 타임아웃, 프로브 H1과 같은 방식), configure는 GUIDELINES 2.5-3 고정값, 3개 파이프라인을 attach 시 1회 생성, C절 렌더 루프(rAF, 매 프레임 재import, 일시정지·seek 완료·ended 시 1회 렌더 후 정지, `play`/`seeked`로 재개, 탭 비가시 정지). `stripes` 모드는 video를 import하지 않고 스트라이프만 그린다. 프레임당 JS 시간(rAF 콜백 시작~`queue.submit` 직후)과 콜백 타임스탬프를 최근 600개 링 버퍼에 둔다. device lost·SecurityError·기타 예외 → `onError` |
| `content/overlay.js` | `createOverlay(container, video)` → `{canvas, update, destroy}`. canvas를 container 안 video 바로 뒤에 삽입, `position:absolute`, `pointer-events:none`, z-index 지정 없음(DOM 순서로 컨트롤 아래 유지). `contentRect`로 위치·크기, 백킹 크기는 `min(원본, 표시×DPR)`(프로브 `canvasResolution`과 같은 규칙, 순수 함수는 detect.js에 둔다). `ResizeObserver(video)`, `fullscreenchange`로 갱신 |
| `content/main.js` | 유일한 부작용 시작점. 흐름: 설정 읽기 → `enabled`면 `findMainVideo` → 없으면 1초 간격 최대 30회 재시도 후 포기(diag에 사유) → DRM 검사 → attach(overlay + renderer) → attach 후 `encrypted`/`webkitneedkey` 리스너와 `mediaKeys` 확인(renderer 프레임마다 저비용 검사) → DRM이면 detach, 해당 video는 WeakSet에 넣어 영구 no-op. `enabled` false로 바뀌면 detach, true로 바뀌면 재attach(DRM 요소 제외). `mode` 변경은 `setMode`만. 2초마다 `buildDiag` 결과를 `sdrhdr.diag`에 쓴다(바뀐 경우만) |
| `popup/popup.html`, `popup.js` | 켜기/끄기 체크박스, 모드 선택(itm/identity/stripes), `sdrhdr.diag` JSON 표시(읽기 전용 textarea + "복사" 버튼 + "JSON 저장" 링크). 저장 링크의 Safari popup 동작은 [미확인]이라 복사를 기본 경로로 둔다. 페이지 조작·메시징 없음 |

**M2-2. G4 판정 매핑**
| G4 항목 | 수단 | 자료 |
|---|---|---|
| content script에서 `navigator.gpu` 사용 가능 | diag `api.gpu`, `api.adapter`, `api.configure`, `api.configRead` | JSON |
| YouTube video SecurityError 없음 | diag `errors[]`에 `SecurityError` 없음, `render.frames` 증가 | JSON |
| 오버레이 EDR이 G2와 동등 | `stripes` 모드에서 사용자가 구분 가능한 최고 단계 선택, 밝기 중간 G2 값(3)과 비교 | 체크리스트 기입 |
| (참고, 판정 외) 표시·조작 | 오버레이가 video 영역에 정확히 겹침, 컨트롤 클릭 가능, `itm` 모드 끊김 육안, `loopFps`·`jsP95` | 체크리스트 + JSON |

- `navigator.gpu` 없음 → no-op, diag `api.gpu:false`, 사유 기록. B절 실패 분기(main world 주입)는 Opus 판정 후에만 착수한다.

**M2-3. Xcode·CI**
- `scripts/make-xcode.sh`(사용자 Mac 전용, 저장소 루트에서 실행): `xcode/`가 이미 있으면 중단(덮어쓰기 금지, 재생성은 사용자가 삭제 후). `xcrun safari-web-extension-converter extension --project-location xcode --app-name SDRHDR --bundle-identifier "${BUNDLE_ID:-io.github.tmtmtmtmtmt.sdrhdr}" --macos-only --swift --no-open --no-prompt` 실행(`--copy-resources` 쓰지 않음, A16). 옵션 이름은 [2차]이므로 스크립트는 먼저 `--help` 출력에 각 옵션이 있는지 확인하고 없으면 중단·안내한다. 생성 후 검사: pbxproj에 저장소 절대경로(`$PWD`, `/Users/`)가 있으면 실패 코드와 함께 A16 실패를 알린다(수정하지 않음 → Opus). 마지막에 `xcodebuild -list` 출력과 커밋 안내를 출력한다.
- 서명: 사용자가 Xcode에서 개인 팀을 지정하되 그 변경(`DEVELOPMENT_TEAM`)은 **커밋하지 않는다**. push할 커밋은 스크립트 직후 생성 상태다. `.gitignore`에 `xcode/**/xcuserdata/`, `xcode/**/build/`, `*.xcuserstate` 추가.
- **2026-09-30 개정(FIX_GUIDE L1)**: 아래 macos job 설명은 L1로 대체한다. CI는 러너 converter로 임시 프로젝트를 만들어 빌드하고, 커밋된 `xcode/`는 A16 검사만(형식이 `project.pbxproj`면 빌드도) 한다.
- (원안) ci.yml `macos` job(`runs-on: macos-latest`, 모든 push·PR): `xcode/`에 `.xcodeproj`가 없으면 "Xcode 프로젝트 없음(M2 사용자 단계 대기)"을 출력하고 성공 종료. 있으면 `xcodebuild -version` 기록 → pbxproj 절대경로 검사(위와 같은 규칙) → `xcodebuild -project <찾은 경로> -alltargets -configuration Debug CODE_SIGNING_ALLOWED=NO build`. scheme은 쓰지 않는다(converter scheme은 xcuserdata에 있을 수 있음).
- 기존 ubuntu job에 manifest 검사 단위 테스트가 포함되므로 별도 job은 없다.

**M2-4. 진단 JSON (`docs/result-schema-m2.json`)**
- 최상위: `schemaVersion:1`, `milestone:'M2'`, `extVersion`, `createdAt`(ISO), `page{url 경로만(쿼리의 v만 유지), title 없음}`, `env{ua, dpr, screen{w,h}, dynamicRangeHigh, colorGamutP3}`, `api{gpu, adapter, device, configure, configRead{format,colorSpace,toneMapping}}`, `video{videoWidth, videoHeight, srcIsBlob, paused}`, `canvas{width, height, cssWidth, cssHeight}`, `render{mode, frames, loopFps, jsP50, jsP95}`, `flags{drm, attached, fullscreen}`, `errors[{at, name, message}]`(최대 20개).
- 사용자 관측값(구분 최고 단계, 겹침, 컨트롤, 끊김)은 JSON에 넣지 않고 체크리스트 사본으로 회신한다.
- 파일명 `results/result-M2-<YYYYMMDD>-<전원>-<밝기>-<해상도>-<모드>.json`. `scripts/parse-result.py`는 `milestone:'M2'`를 인식해 값만 표로 출력한다(판정 없음). 기존 v1~v4 처리는 유지.

**M2-5. 테스트 (클라우드 (1))**
- `tests/unit/extension-manifest.test.js`: manifest 필수 키, js 순서가 M2-1과 같고 파일이 존재, permissions가 `["storage"]`, background·host_permissions 없음, matches 값.
- `tests/unit/extension-load.test.js`: `node:vm`으로 manifest 순서 로드. 로드 시 `document`·`navigator.gpu`·`browser` 접근이 없음(접근 시 throw하는 stub), `__sdrhdr`에 `detect/params/itm/hud/renderer/overlay/main` 키 존재.
- 순수 함수: `isDrm` 3신호 각각·조합, `contentRect`(16:9 in 16:9, 4:3 pillarbox, 21:9 letterbox, 0 크기), 캔버스 해상도(프로브 테스트와 같은 사례), `normalizeSettings`, `summarize`, `buildDiag` 결과가 `docs/result-schema-m2.json`을 만족.
- WGSL 일관성: `itm.wgsl.js` 조립 문자열의 ITM 상수가 `params.js` 균형 값 및 `sim/presets.py` 균형 값과 같음, 셰이더 본문(상수 제외)이 `probe/shaders.js`와 같음. JS 톤 커브 미러는 M4에서 만든다(GUIDELINES 3.1 M2 예외).
- `tests/dom/m2-detect.spec.js`: 최소 정적 픽스처(`#movie_player > .html5-video-container > video.html5-main-video`, 컨트롤 형제 포함)에서 `findMainVideo` 성공, 셀렉터 누락 픽스처에서 `null`. 실제 YouTube 스냅샷은 M3.
- `scripts/make-xcode.sh`: `bash -n`과 shellcheck(설치돼 있으면)만. 실행 검증은 (3).

**M2-6. 작업 분할 (impl-worker 2개 병렬, 파일 비중첩)**
- W1: `extension/**`, `tests/unit/extension-*.test.js`, `tests/dom/m2-detect.spec.js`(+ 픽스처 html).
- W2: `scripts/make-xcode.sh`, `.github/workflows/ci.yml`, `.gitignore`, `docs/result-schema-m2.json`, `docs/manual-checklist.md` 0b 절, `scripts/parse-result.py` M2 지원(+ 그 테스트).
- W1의 `buildDiag` 스키마 테스트는 W2의 스키마 파일을 쓰므로, 스키마는 M2-4 정의를 그대로 따르고 통합은 Sonnet 본 세션이 한다.
- K1(FIX_GUIDE)은 이 브랜치에 섞지 않는다.

**M2-7. 절차와 verify**
1. Sonnet 구현 → → verify: lint, `npm test`, `npm run test:dom`, `python3 -m pytest sim` 통과, CI ubuntu green, macOS job "프로젝트 없음" 성공 / (1)(2).
2. 사용자 Mac: 브랜치 pull → `scripts/make-xcode.sh` → 출력 확인 → `xcode/` 커밋·push → → verify: CI macOS `xcodebuild … CODE_SIGNING_ALLOWED=NO` 성공, 절대경로 검사 통과(A15/A16) / (2).
3. 사용자 Mac: Xcode에서 개인 팀 서명으로 실행 → Safari 설정에서 확장 켜기, youtube.com 권한 허용(확장이 안 보이면 개발자 메뉴 "서명되지 않은 확장 허용" [미확인]) → 체크리스트 0b(전원 연결, 밝기 중간, SDR 1080p60·2160p60 각각 `stripes`·`identity`·`itm`, 창·전체화면) → JSON을 `results/`에 push → → verify: G4 판정 자료 / (3).
4. Opus가 게이트 판정 기록에 G4를 기입한다. 통과 전에는 M3 착수와 M2 PR 머지를 하지 않는다.

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
| G3 성능 | 2026-09-30 | 4차: results/result-M1-20260930-ac-mid-actual60hz-raf.json, …-actualpromotion-raf.json (이전 회차 이력은 git) | **통과** | B절 3차 개정 기준. rAF 구동 run 전부 콜백 수 = 기대 갱신 수(60Hz 600/599~600, ProMotion 1200~1201/1199~1200) → 디스플레이 갱신 누락 0, R3−R0 = 0%p(두 해상도·두 주사율). JS p95 ≤ 1.05 ms. GPU(2160p ITM, 3600×2025) 60Hz 5.3 ms / ProMotion 2.4 ms로 예산 내. 끊김 육안 "없음"(두 주사율). 비교용 rVFC 구동(V3)은 11~32% 누락. 주: 사용자 보고로 4차 두 파일의 refreshRate 표기가 뒤바뀜(loopFps 60/120으로 확인, 파일명은 실제 주사율로 저장). 제한: 픽스처 기준이며 YouTube 실제 재생은 G4(0b)에서 함께 확인 |
| G4 확장 컨텍스트 | 2026-10-01 | 1~3차(이전 행 근거) + 4차 results/result-M2-20261001-ac-mid-*-itm-vf-*.json | **통과** | 확장 컨텍스트 조건 세 가지 충족(2026-09-30 기록 유지). 2026-09-30의 조건(YouTube VP9 영상 표시 + 비용)은 vf 경로로 해소: 영상 2개 path vf, 오버레이 즉시 표시, JS p95 2 ms, video 드롭 0. 남은 디스플레이 갱신 누락 3~4%와 육안 끊김 '조금'은 원인 미분리(YouTube 페이지 자체 부하·샘플링 위상 가능) → G3c 행에서 계속. F-A는 착수하지 않는다: vf 경로가 비용 기준을 만족하고, 남은 끊김은 원인 미확인이며 F-A(화면 캡처 1~2프레임 지연)가 이를 줄인다는 근거가 없다. FIX_GUIDE S 회차 결과로 재검토 |
| G3c 복사 경로 비용 | 2026-09-30 | results/result-M2-20260930-ac-mid-{2160p,1440p}-identity-copy-window.json | **불통과(2160p)** | 2160p: 복사 JS p95 14 ms(기준 4 ms), 갱신 누락 5.6%(기준 1%). video 드롭 0. 1440p는 export 시 일시정지 상태라 누락률·loopFps가 일시정지 공백에 오염됨(복사 p95 12.8 ms로 이미 기준 초과). 전체화면·ProMotion·1080p 측정 전이지만 복사 시간만으로 판정 가능. FIX_GUIDE Q3 실험 후 재판정 |
| G3c 입력 경로 후보(프로브 P0-6) | 2026-10-01 | results/result-M1-20261001-ac-mid-{promotion,60hz}-p06.json | **vf 후보 채택** | 첫 파일(ProMotion 표기, 추정 displayHz 60): V-vf 2160p JS p95 2 ms·누락 0.2%·비검정, 1080p p95 2 ms·누락 0. copy 계열·createImageBitmap 계열은 모두 기준 초과. 둘째 파일(60Hz 표기)은 H.264 V-ext 대조군까지 모든 변형이 loopFps 30·누락 50%라 환경 문제(rAF 30Hz 구동)로 보고 판정에 쓰지 않는다(원인 미확인, 재측정). 확장 적용 후 G3c 재판정(FIX_GUIDE R4) |
| G3c vf 경로(확장) | 2026-10-01 | results/result-M2-20261001-ac-mid-{promotion-2160p-itm-vf-vF5,promotion-2160p-itm-vf-MR5,promotion-1080p-itm-vf-vF5,60hz-1080p-itm-vf-vF5}.json | **보류** | ProMotion 설정 창 모드: JS p95 2 ms(기준 4 ms 충족), video 드롭 0(충족), 디스플레이 갱신 누락 3.1~4.4%(절대 기준 1% 초과), 육안 끊김 조금(1080p 동일). 확장에는 기준선(R0)이 없어 누락이 오버레이 탓인지 YouTube 페이지 탓인지 가를 수 없다 → FIX_GUIDE S1 기준선 모드로 R3−R0 판정으로 되돌린다(G3와 같은 차분 기준). 60Hz는 A24로 판정 보류 |
| G3c vf 경로(확장) 재판정 | 2026-10-01 | results/result-M2-20261001-ac-max-promotion-2160p60-{itm-vf,baseline}-9qT.json | **통과(ProMotion·창 모드)** | 60fps 소스(9qT9KyyGGhM, 3840×1920, srcFps 59.94): 누락 itm 1.8% − baseline 4.8% = −3.0%p(개정 기준 < 1%p 충족), JS p95 1 ms, vf p95 1 ms, video 드롭 0(Stats for nerds 포함), 끊김 육안 없음. cadence: 유지 1회 570 / 2회 14, irregular 2.4%, skipped 18(기준선 누락 4.8%와 같은 규모 → 페이지 부하 C-a로 봄). 이전 회차 끊김 '조금'은 비60fps 소스(vF5oXa1cVEg)에서 관찰 → C-b/C-c 미분리, M6 항목. 미측정: 전체화면, 60Hz(A24, 사용자 판단으로 생략) → M6에서 확인 |
| M3 수명주기 | 2026-10-01 | results/result-M3-20261001-1-6.json + 사용자 보고 | **통과(범위 조정)** | 체크리스트 1 SPA(navCount 4·srcChanges 3, 소스 변경 후 약 1.2초에 판정)·2 화면 모드(극장·전체화면·기본)·3 창 크기·5 HDR 원본 스킵(transfer pq, bt2020)·7 DRM 통과. 4 광고(프리미엄 계정), 6 PiP 복귀 후 재개, 미니플레이어, 극장·미니플레이어 셀렉터 확정은 **사용자 결정으로 생략**하고 [미확인]으로 남긴다(진단용 `playerMode`만 영향, 배치·스킵 로직과 무관). PiP 진입 시 Apple 네이티브 PiP로 넘어가 확장이 동작하지 않는 것은 예상 동작. 후속: 회귀 발견 시 FIX_GUIDE. M6 후보 추가: HDR 4K 첫 frameProbe에서 `c2dSyncMs` 608 ms(메인 스레드 점유, 소스 변경·attach마다 반복 가능, 체감 보고 없음). PR #5 머지 가능 |
| M4a 강도 슬라이더 | 2026-10-01 | 사용자 회신(체크리스트 M4a) + 진단 JSON 1개(`results/result-M4a-20261001-strength68.json`로 저장 예정) | **통과** | (a) 드래그 후 1초 안 반영. WGSL 강도 혼합 셰이더가 Safari 27.2에서 컴파일·동작(errors 없음, path vf, frames 1220, JS p95 1 ms). 선호·뭉개짐 강도는 D-M4a M4a-6에 M4 입력으로 기록. 측정 조건 중 진단 JSON의 밝기는 미기재 |
| M4 알고리즘·프리셋 | 2026-10-01 | results/result-M4-20261001-accurate-first.json + 사용자 회신 | **통과(범위 조정)** | 새 셰이더(uniform 파라미터·강도 혼합·채도)가 Safari 27.2에서 컴파일·동작(errors 없음, path vf, 갱신 누락 0, JS p95 1 ms, 드롭 0). 사용자 선택: 정확 프리셋·강도 53%·선명도 0·채도 105% → M5-0에서 기본값으로 채택. 체크리스트 M4 절 중 뭉개짐 시작 강도(균형 85% 목표), 중간톤 비교, 선명도 GPU 비용·헤일로는 사용자가 원하는 설정을 찾아 측정하지 않음 → [미확인]. 선명도는 기본 0이라 비용 영향 없음, 사용자가 쓰기 시작하면 체크리스트 M4 4번으로 확인. M5 착수 |
| M5 UI | 2026-10-01 | results/result-M5-20261001-custom-hud.json + 사용자 회신("체크리스트 제대로 나옴") | **통과** | 상세 슬라이더·사용자 지정 저장·유효 피크(2.0)·HUD(flags.hud true)가 Safari 27.2에서 동작, errors 없음, JS p95 1 ms, 드롭 0. 사용자 보고로 체크리스트 M5 절 항목 충족. 갱신 누락 6.9%(HUD 켬, 60fps 소스)는 M2 baseline 4.8%와 같은 규모라 M6-2 soak에서 다시 본다 |
| M6 성능·안정화 | 2026-10-01 | 사용자 회신(체크리스트 M6 절, 진단 JSON 미제출) | **통과(사용자 판단)** | 30분 soak·전체화면·60Hz·비60fps 모두 "문제없음", 4K HDR 첫 attach 멈칫함 없음·`frameProbe.hdrEarly` true 확인(M6-1 (a) 동작). 드롭률·메모리 증가 수치는 제출되지 않아 D-M6 수치 기준(드롭 < 1%, 메모리 < 15%)은 [미확인]이며 사용자 판단으로 통과. 전체화면 비용 기준 초과 보고 없음 → M6-4(해상도 상한) 착수하지 않음. A24(60Hz rAF 30회/s)는 이번 회신에서 문제없음으로 보고되어 관찰 종료. 버전 1.0.0. **전체 마일스톤(M0~M6) 완료** |

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
