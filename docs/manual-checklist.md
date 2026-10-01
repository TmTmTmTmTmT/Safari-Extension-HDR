# 수동 체크리스트 (사용자 Mac)

대상: M1 Pro, 내장 XDR, macOS 27.2, Safari 27.2. 클라우드에서는 WebGPU/EDR/Safari 동작을 검증할 수 없으므로 아래 항목은 모두 사용자 Mac에서만 확인된다. (PLAN.md E절)

## 체크리스트

- [ ] 0a P0-1~P0-5 실행, JSON export
- [ ] 0b: 오버레이 표시, 컨트롤 클릭 가능, HUD 수치(1080p60/2160p60)
- [ ] 극장/전체화면/미니플레이어/리사이즈/다음 영상 전환
- [ ] HDR 원본 자동 비활성(HUD `hdrSource:true`)
- [ ] EME 사용 페이지에서 HUD `drm:true`, 오버레이 없음
- [ ] 전원/배터리, SDR 밝기 3단계
- [ ] 프리셋 3종 + 상세 슬라이더 체감 메모
- [ ] 30분 soak

## 0a 프로브 실행 절차

준비: 저장소를 받고 픽스처(`fixtures/{ramp,colorbars}-{1080p60,2160p60}.mp4`)가 있는지 확인한다. 없으면 P0-4는 "픽스처 없음"으로 표시되며 다른 항목은 정상 동작한다.

1. 저장소 루트에서 `python3 -m http.server 8000`을 실행한다.
2. Safari에서 `http://localhost:8000/probe/`를 연다. (localhost는 secure context)
3. 페이지 상단 "P0-5 환경"에서 칩/디스플레이를 확인하고 전원(전원 연결/배터리), SDR 밝기(낮음/중간/최대), 주사율(ProMotion/60Hz)을 현재 조건대로 선택한다. macOS 버전은 기본값 27.2이며 다르면 고친다. 창 모드는 선택하지 않는다(각 run의 실제 전체화면 상태에서 자동 기록).
4. P0-1: 페이지를 열면 자동 실행된다. 예외가 표시되면 그대로 두고 진행한다(JSON에 기록됨).
5. P0-2: 화면에 "마지막 그리기 후 경과 N초"가 1초마다 갱신된다. 밝기를 바꾼 뒤 30초 이상 기다린 다음, "다시 그리기"를 누르지 말고(누르면 경과 초가 0으로 돌아간다) 선택한다. 선택 시점의 경과 초가 `edr.secondsSinceDraw`로 기록된다. 왼쪽 흰색 패치(CSS #fff)와 오른쪽 줄무늬(1.0/1.25/1.5/2/3/4/6/8/16)를 비교해, SDR white보다 밝게 구분되는 가장 오른쪽 단계를 라디오로 고른다. 어느 단계도 흰색 위로 구분되지 않으면 "1.0"을 고른다. 참조 HDR 이미지가 있으면 파일로 열어 비교 항목을 고른다(없으면 "사용 안 함").
6. P0-3: 두 행에서 캔버스 0.5 패치가 #808080 쪽과 #BCBCBC 쪽 중 어디와 경계 없이 이어지는지 고른다.
7. P0-4 (G3): "G3 진단 일괄 측정" 버튼을 1회 누른다. 전체화면에 들어가 ramp-1080p60, ramp-2160p60 각각 R0(rAF 루프만, 캔버스 없음) → R2(rAF + EDR identity) → R3(rAF + EDR ITM) → V3(rVFC + EDR ITM, 기존 방식 비교용)를 자동 실행하고(총 8 run, run 사이 1초) 끝나면 전체화면 안에 끊김 질문이 뜬다. 진행 상황(현재 run / 8)은 전체화면 왼쪽 위 구석에 작게 표시된다. 도중에 전체화면을 나가면 중단되고 완료된 run만 남는다. 이 버튼은 한 조건(전원, 밝기, 주사율)당 1회면 된다. 아래는 기존 좌우 분할 측정(육안 비교용, G3 대상 아님, rVFC 구동)이다. 셰이더를 identity로 두고 픽스처별 "전체화면 측정" 버튼을 누른다. 전체화면 진입 후 자동으로 측정이 시작되고(첫 프레임 후 1초 워밍업 제외, 최대 10초) 끝나면 전체화면이 자동으로 해제된다. 4개 픽스처를 모두 한 뒤 셰이더를 ITM으로 바꿔 같은 4개를 반복한다. identity 좌우 비교에서 왼쪽 원본과 오른쪽 출력이 육안으로 동일한지, 움직이는 박스가 동기되는지 한 줄로 메모한다(창 모드로 보려면 "창 실행" 버튼. 창 run은 G3 대상이 아니다).
8. 조건마다 "JSON export"를 눌러 파일을 저장한다. 파일명에 조건이 붙는다. G3 조건(전원 연결 + 전체화면 + overlay 배치)을 만족하는 run이 없으면 페이지에 경고가 표시된다(export는 진행됨). 이 경우 전원 선택과 버튼 사용을 확인하고 다시 측정한다.
9. 조건 변경 후 페이지를 새로고침하면 run 기록이 초기화된다. 조건 하나당 새로고침 → 측정 → export 순서를 권장한다.

## 0a-6 프로브 P0-6 VP9 입력 방식 (FIX_GUIDE Q3·Q4-3)

준비: `git pull` 후 `fixtures/ramp-2160p60.webm`, `ramp-1080p60.webm`, `ramp-2160p60.mp4`가 있는지 확인한다(`bash scripts/check-fixtures.sh`). 전제 조건: 전원 연결, SDR 밝기 중간. 0a 절차 1~3(서버 실행, 프로브 열기, P0-5 환경 입력)은 그대로다. 주사율 선택값도 조건대로 고른다.

1. 프로브 페이지를 새로고침한다(run 기록 초기화).
2. 페이지 아래 "P0-6 VP9 입력 방식"의 "일괄 측정"을 1회 누른다. 전체화면에 들어가 ramp-2160p60.webm, ramp-1080p60.webm은 V-ext / V-copy8 / V-copyB / V-bmp / V-bmpR / V-vf 전 변형, ramp-2160p60.mp4는 V-ext와 V-copy8만 자동 실행한다(총 14 run, 변형당 앞 1초 제외 8초). 진행 상황은 전체화면 왼쪽 위 구석에 작게 표시된다. 지원되지 않는 변형은 예외 이름을 기록하고 건너뛴다. 도중에 전체화면을 나가면 중단되고 완료된 변형만 남는다.
3. 끝나면 전체화면이 자동으로 해제되고 결과 표가 페이지에 나온다. 표를 그대로 두고 "JSON export"를 눌러 저장한다(`vp9Paths`에 기록, schemaVersion 5).
4. ProMotion과 60Hz 각 1회 한다. 60Hz는 시스템 설정 → 디스플레이에서 주사율을 60Hz로 바꾸고 새로고침한 뒤 P0-5 주사율도 60Hz로 고르고 1~3을 반복한다. 끝나면 주사율을 ProMotion으로 되돌린다.
5. 파일명 끝에 조건을 붙여 `results/`에 둔다(예: `result-M1-<날짜>-ac-mid-vp9paths-promotion.json`, `…-vp9paths-60hz.json`). 확인하지 못한 항목은 [미확인]으로 적는다.

`python3 scripts/parse-result.py`가 "P0-6 VP9 입력 방식" 표를 값만 출력한다(판정 없음). 열: JS 동기 시간(jsP50/P95/Max), 비동기 준비 지연(asyncP50/P95, V-bmp·V-bmpR만), displayMissRate, displayHz, loopFps, meanBrightness(마지막 프레임 출력, 0~255), videoDropped/videoTotal, errorName.

## 0b M2 확장 실행 절차

전제 조건: 전원 연결, SDR 밝기 중간(헤드룸 3). 밝기 최대는 하이라이트가 잘리는 알려진 제약이 있어 쓰지 않는다. 영상은 DRM 없는 SDR YouTube 영상이며, 영상마다 페이지를 새로 로드한다.

설치 절차 요약:

1. 저장소 루트에서 `scripts/make-xcode.sh`를 실행하고 출력(절대경로 검사, `xcodebuild -list`)을 확인한다.
2. `xcode/`를 커밋하고 push한다. Xcode 개인 팀 서명(`DEVELOPMENT_TEAM`) 변경은 커밋하지 않는다.
3. Xcode에서 개인 팀으로 서명해 실행한다.
4. Safari 설정에서 확장을 켜고 youtube.com 권한을 허용한다. 확장이 보이지 않으면 개발자 메뉴의 "서명되지 않은 확장 허용"을 확인한다 [미확인].

측정 조합: 해상도 1080p60, 2160p60 각각에 대해 모드 `stripes`, `identity`, `itm`을 popup에서 고르고, 창과 전체화면 둘 다 확인한다.

기입 항목(체크리스트 사본에 적는다):

- stripes: 구분되는 최고 단계(1.0/1.25/1.5/2/3/4/6/8/16). 밝기 중간 G2 값(3)과 비교한다.
- 오버레이가 video 영역에 정확히 겹치는지(예/아니오, 어긋난 방향)
- 플레이어 컨트롤 클릭 가능 여부
- 일시정지 상태로 페이지 로드 → 오버레이에 첫 프레임 표시(예/아니오)
- itm 모드 끊김 육안(없음/가끔/자주)
- 조건마다 popup의 진단 JSON을 "복사"로 복사해 `results/result-M2-<YYYYMMDD>-<전원>-<밝기>-<해상도>-<모드>.json`으로 저장한다. "JSON 저장" 링크의 Safari popup 동작은 [미확인]이므로 복사를 기본 경로로 한다. 전원은 `ac`, 밝기는 `mid`, 해상도는 `1080p60`/`2160p60`, 모드는 `stripes`/`identity`/`itm`으로 적는다.
- 확인하지 못한 항목은 비워 두지 말고 [미확인]으로 적는다.

### 0b 끊김 원인 분리 절차 (FIX_GUIDE S1~S3)

확장 렌더가 끊김의 원인인지 가르기 위한 절차다. 이 클라우드 환경에서는 Safari 확장·WebGPU·`VideoFrame` 동작을 검증하지 못했다. 확인하지 못한 항목은 [미확인]으로 적는다. 이 절차가 아래 "이전 회차" 소절들을 대체한다.

1. `git pull` → Xcode Run → Safari 재시작, "서명되지 않은 확장 허용"을 다시 확인한다. 전원 연결, 저전력 모드 끔, ProMotion, 밝기 **최대**(체감이 잘 되는 조건).
2. 영상마다(vF5oXa1cVEg, MR_53SGVXXc, 그리고 확실한 60fps 영상 1개) Stats for nerds의 `Current / Optimal Res`에 표시된 `@fps` 값을 적는다.
3. 같은 영상, 창 모드, 각 30초씩 일시정지 없이 아래를 한다. 영상마다 페이지를 새로 로드하고, 모드를 바꾼 뒤에도 30초를 새로 잰다.
   - popup 모드 `baseline` → popup JSON 복사·저장
   - popup 모드 `itm` → popup JSON 복사·저장, 끊김 육안(없음/가끔/자주)
   - popup에서 확장 끔 → 끊김 육안(없음/가끔/자주). **확장 off에서도 같은 끊김이 보이는지가 핵심**
4. 60Hz 확인: 시스템 설정 → 디스플레이 → 주사율 목록의 정확한 표기(예: "60Hz", "59.94Hz", "ProMotion")를 적고 60Hz로 바꾼 뒤, 프로브 P0-4 "G3 진단 일괄 측정"을 1회 실행해 JSON을 export한다(0a 4차와 같은 절차로 30회/s 여부를 비교). 끝나면 ProMotion으로 되돌린다.

`baseline`은 진단용 모드다: 캔버스를 숨겨 원본이 보이고, rAF 루프만 돌며 렌더·submit을 하지 않는다. JSON의 `render.mode`가 `baseline`이고 `render.path`는 null, `render.frames`는 0이다. 파일명은 `results/result-M2-<YYYYMMDD>-ac-max-<해상도>-<baseline|itm>-<영상ID>.json` 형식을 쓴다. 판정 자료: `render.displayMissRate`(baseline과 itm 비교), `render.displayHz`, `render.loopFps`, `render.cadence`(srcFps, srcFpsNominal, holdHist, irregular, skipped; itm에서만 채워짐), `render.videoDropped/videoTotal`. `python3 scripts/parse-result.py`가 값만 표로 출력한다(판정 없음).

### 0b 이전 회차 절차 (보관, 위 "끊김 원인 분리 절차"로 대체됨)

#### 0b VideoFrame 경로 확인 절차 (FIX_GUIDE R4)

확장은 첫 frameProbe 결과로 `ext` → `vf` → `copy` 순서로 처음 비검정인 경로를 고른다(`render.path`). 아래 순서로 확인하며, 이 절차가 아래 "복사 경로 확인 절차"와 "경로 보류·측정 창 확인 절차"를 대체한다. 확인하지 못한 항목은 [미확인]으로 적는다. 이 클라우드 환경에서는 `VideoFrame`·WebGPU·Safari 확장 동작을 검증하지 못했다.

1. `git pull` → Xcode Run → Safari 재시작, "서명되지 않은 확장 허용"을 다시 확인한다.
2. 전원 연결, 밝기 중간, **저전력 모드 끔**(시스템 설정 → 배터리). ProMotion.
3. 영상 2개(vF5oXa1cVEg, MR_53SGVXXc)에서 각각 2160p60, 모드 `itm`, 창 모드로 30초 재생 후 popup JSON을 복사해 저장한다(일시정지하지 말 것). 오버레이가 뜨기까지 걸린 시간과, 하이라이트가 원본보다 밝아 보이는지 한 줄 적는다. `frameProbe.vfErr`가 `ReferenceError`이면 content script에서 `VideoFrame`이 없는 것이므로 그대로 적는다.
4. 같은 영상 전체화면 30초 후 JSON을 저장하고 끊김 육안(없음/가끔/자주)을 적는다.
5. 화질을 1080p60으로 바꾸고 새로고침한 뒤 전체화면 30초 후 JSON을 저장한다.
6. 시스템 설정 → 디스플레이 → 60Hz로 바꾸고 4번을 반복한다. 이때 프로브 P0-6 일괄 측정도 1회 다시 하고 JSON을 export한다(60Hz 재측정, 루프 30Hz 현상 확인용). 끝나면 ProMotion으로 되돌린다.
7. 비교: 확장을 끈 상태로 같은 영상 2160p60 전체화면 30초를 재생하고 Stats for nerds의 "dropped of" 숫자를 적는다.

파일명은 `results/result-M2-<YYYYMMDD>-ac-mid-<해상도>-itm-vf-<window|fullscreen>[-60hz]-<영상ID>.json` 형식으로 둔다. 판정 자료: `render.path`, `render.vfMsP50/P95`, `render.displayMissRate`, `render.displayHz`, `render.videoDropped/videoTotal`, `frameProbe.vf/vfErr/vfSyncMs`. `python3 scripts/parse-result.py`가 값만 표로 출력한다.

#### 0b 복사 경로 확인 절차 (FIX_GUIDE P4)

VP9 영상에서 외부 텍스처가 검어(PLAN.md A21) 확장은 첫 frameProbe 결과로 복사 경로(`render.path:"copy"`)를 고른다. 아래 순서로 확인한다. 확인하지 못한 항목은 [미확인]으로 적는다.

1. `git pull` → Xcode Run → Safari 재시작 후 "서명되지 않은 확장 허용"을 다시 확인한다.
2. 전원 연결, 밝기 중간, 창 모드. YouTube VP9 영상(이후 모두 같은 영상)을 **2160p60**으로 재생하고 모드를 `itm`으로 둔다. 영상이 보이는지, 원본보다 하이라이트가 밝아 보이는지 한 줄 적는다. 30초 재생 후 popup JSON을 복사해 `results/result-M2-<날짜>-ac-mid-2160p60-itm-copy-window.json`으로 저장한다.
3. 같은 영상을 전체화면으로 30초 재생하고 JSON을 `results/result-M2-<날짜>-ac-mid-2160p60-itm-copy-fullscreen.json`으로 저장한다. 끊김 육안(없음/가끔/자주)을 적는다.
4. 화질을 1080p60으로 바꾸고 페이지를 새로고침한다. 전체화면 30초 후 JSON(`…-1080p60-itm-copy-fullscreen.json`)을 저장하고 끊김 육안을 적는다.
5. 비교 기준: 확장을 popup에서 끈 상태로 같은 영상 2160p60 전체화면 30초를 재생하고 Stats for nerds의 "dropped of" 숫자를 적는다.
6. 60Hz: 시스템 설정 → 디스플레이 → 주사율을 60Hz로 바꾸고 3번만 반복한다(파일명에 `60hz`를 붙인다). 끝나면 주사율을 ProMotion으로 되돌린다.
7. stripes: popup에서 모드를 `stripes`로 **먼저** 바꾼 뒤 페이지를 새로고침한다(가드가 이미 detach한 video에는 재attach하지 않는다). 밝기 중간에서 30초 기다린 뒤 왼쪽부터 구분되는 마지막 줄 번호를 적는다(줄은 1.0 / 1.25 / 1.5 / 2 / 3 / 4 / 6 / 8 / 16 순서).

#### 0b 경로 보류·측정 창 확인 절차 (FIX_GUIDE Q1·Q2, Q4-1·2)

1. `git pull` → Xcode Run 재실행 → Safari 재시작 후 "서명되지 않은 확장 허용"을 다시 확인한다(Q1·Q2 반영 확인용).
2. 전원 연결, 밝기 중간, 창 모드, 같은 YouTube 영상 2160p60, 모드 `itm`. 페이지를 새로 열어 재생을 시작하고 **재생 시작 직후 검은 화면이 없이 원본이 보이다가 오버레이로 바뀌는지**, 바뀌기까지 몇 초 걸렸는지 한 줄 적는다([미확인]이면 그렇게 적는다). 재생 중 30초 뒤 **일시정지하지 말고** popup JSON을 복사해 `results/result-M2-<날짜>-ac-mid-2160p60-itm-q-window.json`으로 저장한다. `render.path`가 `pending`이면(errors에 `PathUndecided` 포함 여부도) 그대로 적는다.

JSON의 `render.path`, `render.displayMissRate`, `render.displayHz`, `render.copyMsP50/P95`, `render.videoDropped/videoTotal`, `frameProbe.ms`가 G3c 판정 자료다(PLAN.md G3c). `python3 scripts/parse-result.py`가 값만 표로 출력한다.

`python3 scripts/parse-result.py`는 `milestone:'M2'` 파일을 `docs/result-schema-m2.json`으로 검증하고 값만 표로 출력한다(판정 없음).

## 재측정 절차 (FIX_GUIDE.md "사용자 재측정 요청", 렌더 루프 rAF 검증)

공통 조건: 전원 연결, SDR 밝기 중간. 측정 전 Safari를 재시작 1회 한다. P0-2는 G2 확정으로 다시 하지 않아도 된다.

- 1회차: 디스플레이 주사율 기본(ProMotion). P0-5에서 주사율=ProMotion을 선택하고 "G3 진단 일괄 측정"을 1회 실행한다. 전체화면 안에 뜨는 끊김 질문("R3 실행 중 우하단 움직이는 박스가 끊겼나?")에 없음/가끔/자주 중 하나를 고른다. 전체화면을 이미 나갔다면 페이지의 "끊김" 선택 상자에서 고른다. 그 뒤 JSON export를 저장한다(`perf.visualJudder`에 기록).
- H1 확인: 1회차 후 Safari를 재시작하지 말고 페이지를 새로고침 3회 한다. 매번 P0-1이 "(대기)"에서 멈추지 않고 채워지는지 한 줄로 회신한다. 멈추면 페이지 상단 오류 배너에 "GPU 응답 없음, Safari를 종료 후 재시작"이 뜨는지 함께 알린다. 이때도 JSON export는 동작해야 한다.
- 2회차: 시스템 설정 → 디스플레이에서 주사율을 60Hz로 바꾼 뒤 새로고침하고, P0-5에서 주사율=60Hz를 선택해 같은 절차(일괄 측정 1회 → 끊김 질문 → export)를 한다. 끝나면 주사율을 ProMotion으로 되돌린다.
- 각 회차 파일을 `results/`에 두고 push한다. `python3 scripts/parse-result.py`가 해상도 x R0/R2/R3/V3 모드별 표(missRate, loopFps, videoPresentedFps, gpuMs, jsP95)와 G3 요약 표(baselineMiss, itmMiss, delta, rvfcMiss, loopFps, videoPresentedFps, jsP95Max, gpuMsMax)를 출력한다.

## M3 감지·수명주기 확인 절차 (PLAN D-M3 M3-7 (3), M3-8)

전제: 전원 연결, SDR 밝기 중간. `git pull` → `scripts/make-xcode.sh` → Xcode Run → Safari 재시작, 확장 켬(popup 모드 `itm`). 확장 팝업의 진단 JSON(schemaVersion 6)은 항목마다 "복사"로 복사해 `results/result-M3-<YYYYMMDD>-<항목번호>.json`으로 저장한다(예: `result-M3-20261002-1.json`). 확인하지 못한 항목은 비우지 말고 [미확인]으로 적는다. `python3 scripts/parse-result.py`가 `lifecycle` 표(state, skipReason, navCount, srcChanges, videoSwaps, playerMode, adShowing, pip, hdrSource, colorSpace, 이벤트 로그)를 값만 출력한다.

각 항목의 "예/아니오"와 진단 JSON 값을 체크리스트 사본에 적는다.

1. SPA 이동: 홈 → 영상 A 재생 → 추천 영상 B 클릭. B에도 오버레이가 있는가(예/아니오). 진단 `navCount`·`srcChanges` 증가, `lifecycle.state` active.
2. 화면 모드 전환: 기본 ↔ 극장 ↔ 전체화면 ↔ 미니플레이어를 각각 전환해 오버레이가 영상 영역에 정확히 겹치는가, 컨트롤(재생·설정·전체화면)이 클릭되는가. 미니플레이어 전환 후 캔버스가 플레이어와 함께 움직이는가(어긋난 방향을 적는다). 진단 `playerMode`.
3. 창 크기 조절: 조절 중과 후 오버레이 위치가 맞는가.
4. 광고: 광고가 있는 영상에서 광고 → 본편 전환 시 오버레이가 유지되는가(검은 화면 없음). 진단 `adShowing`(광고 중), `srcChanges`.
5. HDR 영상: YouTube에서 HDR 표시가 있는 영상. 오버레이가 없는가(원본 그대로). 진단 `lifecycle.skipReason: hdrSource`, `video.colorSpace.transfer`(pq 또는 hlg 기대). **DOM 배지는 판정에 쓰지 않는다(PLAN M3-8 D1).**
6. PiP: PiP 진입 시 원본 PiP가 정상 재생되는가, 복귀 시 오버레이가 재개되는가. 진단 `lifecycle.pip`, 이벤트 로그.
7. DRM: EME를 쓰는 페이지(YouTube 영화·TV 무료 영화 등)에서 오버레이가 없는가, `skipReason: drm`. 이후 같은 탭에서 일반 영상으로 이동해도 skipped(drm)이 유지되는가(새로고침하면 해제되는 것이 정상).

판정: 1~6 모두 예, 7은 오버레이 없음이면 M3 완료. 실패 항목은 FIX_GUIDE로 처리한다.

### M3 DOM 스냅샷 재수집 (극장·미니플레이어·광고·전체화면 셀렉터 확정용)

2026-10-01 1차 스냅샷에는 조상에 `ytd-watch-flexy`가 없어 극장 판정 근거를 확인하지 못했다. 개선된 `scripts/dom-skeleton.js`로 다시 수집한다(조상은 `ytd-watch-flexy`·`ytd-miniplayer`·`ytd-app`까지, `#movie_player` 하위는 video 컨테이너·오른쪽 컨트롤·설정 메뉴·광고 모듈만). 텍스트·URL·제목·속성 값은 출력되지 않는다.

1. 터미널(Terminal.app)에서 `cd ~/Safari_Extention-HDR && pbcopy < scripts/dom-skeleton.js`로 스크립트를 복사한다. Safari 콘솔이 아니다.
2. 상태를 만든 뒤 Safari Web Inspector 콘솔에 붙여 넣고 실행한다. 출력이 클립보드에도 복사되므로 채팅이나 에디터에 붙여 넣는다.
3. 수집할 상태와 파일명(`tests/dom/fixtures/`): `yt-theater-full.html`(극장), `yt-miniplayer.html`(영상 재생 중 홈으로 이동해 미니플레이어가 뜬 상태), `yt-ad.html`(광고 재생 중), `yt-fullscreen.html`(전체화면, Web Inspector를 별도 창으로 분리해야 콘솔 사용 가능). 채팅에 상태 이름과 함께 붙여 주면 파일로 저장해 커밋한다.

## M4a HDR 강도 슬라이더 확인 절차 (PLAN D-M4a)

전제: 전원 연결. `git pull` → `scripts/make-xcode.sh` → Xcode Run → Safari 재시작, 확장 켬, popup 모드 `itm`. WGSL 컴파일은 이 단계가 처음이다(클라우드·로컬 모두 미검증). 컴파일 오류가 나면 영상이 원본 그대로이고 진단 `errors`에 `uncapturederror`가 남는다. popup 진단 JSON(schemaVersion 7)에 `render.strength`가 들어간다.

밝기 **최대**와 **중간** 각각에서 같은 SDR 영상으로 아래를 한다.

1. popup의 "HDR 강도" 슬라이더를 0 ↔ 100으로 드래그한다.
   - (a) 드래그 후 1초 안에 화면에 반영되는가(예/아니오). 일시정지 상태에서도 반영되는가.
   - 0%는 색 변환만 한 SDR(확장 off와 거의 같은 밝기), 100%는 이전 itm과 같은 느낌이어야 한다.
2. (b) 가장 마음에 드는 강도 %를 적는다.
3. (c) 하이라이트가 하얗게 뭉개지기 시작하는 강도 %를 적는다.
4. 선호 강도로 맞춘 상태에서 popup의 진단 JSON을 "복사"해 `results/result-M4a-<YYYYMMDD>-<밝기: max|mid>.json`으로 저장한다.
5. popup 모드를 `identity`·`stripes`로 바꾸면 슬라이더가 비활성화되는가, 다시 `itm`이면 활성화되는가. 브라우저를 다시 열었을 때 슬라이더 값이 유지되는가.

판정: (a) 예면 M4a 완료. (b)(c)는 M4 기본 강도·프리셋 결정 자료(Opus). 확인하지 못한 항목은 [미확인]으로 적는다.

## M4 프리셋·곡선·선명도·채도 확인 절차 (PLAN D-M4 M4-C, M4-E)

전제: 전원 연결. `git pull` → `scripts/make-xcode.sh` → Xcode Run → Safari 재시작, 확장 켬, popup 모드 `itm`. 셰이더 구조가 바뀌었으므로(ITM 파라미터 uniform화, 선명도·채도 추가) 첫 실행에서 컴파일 오류가 없는지 본다. 오류가 있으면 영상이 원본 그대로이고 진단 `errors`에 `uncapturederror`가 남는다. popup 진단 JSON은 schemaVersion 8이며 `render.preset`·`strength`·`sharpness`·`saturation`이 들어간다. 새 기본값은 프리셋 균형, 강도 45%, 선명도 0%, 채도 100%이고 첫 화면은 M4a 때와 달라 보일 수 있다(곡선이 바뀜).

밝기 **최대**와 **중간** 각각에서, 하이라이트가 많은 SDR 영상 2개(하늘·조명·흰 옷 등)로 한다.

1. 프리셋 비교(강도 45%, 선명도 0%, 채도 100%): 정확 / 균형 / 선명을 바꿔 가며 본다. 선호 프리셋을 적는다. 선명은 밝기 최대에서 하이라이트가 잘릴 수 있다(피크 약 2.35배, 헤드룸 약 2).
2. 뭉개짐 시작 강도: 프리셋마다 강도 슬라이더를 올리며 하이라이트가 뭉개지기 시작하는 %를 적는다(이전 초안에서는 약 70%). 균형은 85% 이상이거나 100%까지 없는 것이 목표다.
3. 중간톤·피부: 균형 프리셋에서 피부톤·중간 밝기가 원본과 달라 보이는가(예/아니오). 밝은 조명 아래 피부(하이라이트 쪽)도 본다.
4. 선명도 슬라이더(균형, 강도 45%): 0 ↔ 100으로 드래그. (a) 1초 안 반영 (b) 윤곽에 흰 테두리(헤일로)나 거친 노이즈가 보이기 시작하는 % (c) 끊김이 늘었는가(없음/가끔/자주). 선명도 0%와 100%에서 진단 `render.loopFps`·`jsP95`·`displayMissRate`를 각각 기록한다(JSON 2개).
5. 채도 슬라이더(균형, 강도 45%): 50 ↔ 150으로 드래그. (a) 1초 안 반영 (b) 마음에 드는 % (c) 색이 과하게 느껴지는 %. 0%에 가까워지면 흑백에 가까워져야 하고 100%는 이전과 같아야 한다.
6. 설정 유지: popup을 닫았다 열어도 프리셋·슬라이더 값이 유지되는가. 모드를 `identity`·`stripes`로 바꾸면 프리셋·슬라이더가 비활성화되고 `itm`으로 돌아오면 활성화되는가.
7. 진단 JSON: 선호 프리셋·선호 강도 상태에서 밝기별로 1개씩 `results/result-M4-<YYYYMMDD>-<밝기: max|mid>-<프리셋: accurate|balanced|vivid>.json`으로 저장한다.

판정: 균형에서 뭉개짐 시작이 85% 이상(또는 없음)이고 중간톤 변화 "아니오"이며 선명도·채도 (a) 예, 선명도 100%에서 끊김 "없음"이면 M4 완료. 아니면 Opus가 FIX_GUIDE로 곡선 식 변경 또는 선명도 4탭 축소를 지시한다. 확인하지 못한 항목은 [미확인]으로 적는다.

## M5 상세 슬라이더·HUD 확인 절차 (PLAN D-M5 M5-6)

전제: 전원 연결, SDR 밝기 중간~최대. `git pull`(또는 이미 해당 브랜치) → Xcode Run → Safari 재시작 → 확장 켬. 기본값이 바뀌었다(2026-10-01 지시: 사용자 지정 곡선 P2.0·k0.40·n2.0·밝기 1.22·곡선 채도 1.03·하이라이트 채도 1.03, 강도 43%·선명도 0·채도 105%). 이미 저장된 설정은 그대로이므로 예전 값이 보일 수 있다. popup 진단 JSON은 schemaVersion 9다. 확인하지 못한 항목은 [미확인]으로 적는다.

1. popup 구성: 위에서부터 켜기, 프리셋(정확/균형/선명/사용자 지정), HDR 강도, 선명도, 채도, "유효 피크 ×N.NN", "상세 설정"(접힘), "페이지 HUD 표시" 체크박스, "진단"(접힘) 순서인가. 모드 select와 진단 JSON은 "진단" 안에만 있는가.
2. 상세 슬라이더(상세 설정 펼침): 하이라이트 밝기·확장 시작·곡선 지수·밝기·곡선 채도·하이라이트 채도 6개. 각각 움직이면 (a) 1초 안에 화면에 반영되는가 (b) 프리셋 select가 "사용자 지정"으로 바뀌는가. 곡선 지수는 2.0 아래로 내려가지 않는가.
3. 프리셋 전환: 다른 프리셋(예: 균형)을 고르면 상세 슬라이더 값이 그 프리셋 값으로 바뀌는가. 다시 "사용자 지정"을 고르면 직전에 만든 값이 돌아오는가.
4. 유효 피크: 하이라이트 밝기를 올리면 "유효 피크" 숫자가 같이 바뀌고(= 1 + 강도 x (하이라이트 밝기 x 밝기 − 1)), 2.0을 넘으면 "밝기 최대에서 하이라이트가 잘릴 수 있음" 안내가 나오는가. 실제로 밝기 최대에서 하이라이트가 잘려 보이는 지점(유효 피크 값)을 적는다.
5. 설정 유지: popup을 닫았다 열어도, Safari를 재시작해도 사용자 지정 값·프리셋·슬라이더가 유지되는가.
6. 페이지 HUD: "페이지 HUD 표시"를 켜면 플레이어 왼쪽 위에 5줄 HUD(상태·경로 / 프리셋·강도·선명·채도 / 유효 피크 / fps·JS p95·누락 / 해상도)가 뜨는가. (a) 컨트롤 클릭을 막지 않는가 (b) 1초마다 갱신되는가 (c) 끄면 사라지는가 (d) 켜 둔 상태로 끊김이 눈에 띄게 늘지 않는가(없음/가끔/자주) (e) 전체화면·극장 모드에서도 위치가 맞는가. HUD를 켠 상태의 진단 JSON 1개를 `results/result-M5-<YYYYMMDD>-hud.json`으로 저장한다(`flags.hud` true 확인).
7. 진단 영역: "진단"을 펼쳐 모드를 `identity`·`stripes`·`baseline`으로 바꾸면 프리셋·슬라이더가 비활성화되고 `itm`으로 돌아오면 활성화되는가.
8. 사용자 지정 상태에서 진단 JSON 1개를 `results/result-M5-<YYYYMMDD>-custom.json`으로 저장한다(`render.preset` custom, `render.custom`, `render.effectivePeak` 확인).

판정: 2(a)(b)·6(a)(b)(c)(d)가 모두 예(또는 없음)이면 M5 완료. 실패 항목은 FIX_GUIDE로 처리한다.

## 회신 방법

1. export한 JSON을 저장소 `results/result-<M>-<YYYYMMDD>[-조건].json`으로 두고 브랜치에 push한다. (M1 프로브는 `<M>`이 `M1`)
2. 이 체크리스트 사본에 체크 표시와 한 줄 코멘트를 적어 함께 push한다.
3. 스크린샷은 레이아웃 확인용이다. macOS 스크린샷은 EDR 밝기를 증명하지 못하므로 밝기 판정은 JSON의 선택값(`edr.maxDistinctStep`, `edr.encodingMatch`)으로 한다. 노출을 고정한 휴대폰 사진은 선택 사항이다.
4. push 후 `python3 scripts/parse-result.py`로 요약 표를 볼 수 있다("G3 대상(overlay)" 열, 모드별 표, G3 요약 표, visualJudder 포함). 스크립트는 값만 출력하고 판정은 하지 않는다. G1~G3 판정은 Opus가 PLAN.md 게이트 판정 기록에 기입한다.

## JSON 스키마

`docs/result-schema.json` (env, api, edr, perf, flags, errors). `python3 scripts/parse-result.py results/`가 이 스키마로 검증한다(`jsonschema` 모듈이 없으면 필수 키/타입 검사로 대체).
