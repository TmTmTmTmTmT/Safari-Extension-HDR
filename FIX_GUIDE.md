# FIX_GUIDE.md — M2 0b 검은 비디오 프레임 진단(N) + 프로브 지표(K1)

> 작성: Opus. 근거: `results/result-M2-20260930-youtube-vp9-{itm,identity}-black.json`, 사용자 회신(stripes 스크린샷·"4단계로 보여져", itm/identity 검은 화면·소리 정상, 144p에서도 동일, Stats for nerds `vp09.00.51.08…`, `bt709`), STATUS.md "M2 0b 1차 회신".
> 대상: Sonnet. 이 문서 범위 밖 설계 변경 금지. 수정 코드는 포함하지 않는다(.claude/rules/handoff.md).
> 이전 회차: F·H·J(M1 프로브), L1~L6(M2 CI·구현 검토, `7edf085`·`c6fc106`) 완료. 내용은 git 이력 참조. K1은 미구현이며 아래에 그대로 둔다.

## 판정 요약

- **G4는 보류.** 세 항목 중 두 개는 자료가 충족됐고, 비디오 프레임이 검게 나오는 결함이 남았다(PLAN.md 게이트 판정 기록 참조).
  - `navigator.gpu`(isolated world): **충족.** gpu/adapter/device/configure 모두 true, configRead `rgba16float`/`display-p3`/`extended`, 렌더 루프 ProMotion ≈115회/s, jsP95 1 ms.
  - SecurityError: 예외는 없다(errors 빈 배열). 그러나 프레임이 검으므로 "YouTube video를 읽을 수 있다"는 G4의 취지는 **미충족**이다. 예외 없는 검은 프레임은 taint와 결과가 같을 수 있어 원인을 가려야 한다.
  - 오버레이 EDR: **잠정 충족.** stripes 스크린샷에서 1.0(A0)·1.25(BC)·1.5(CF)·2.0(E8)이 서로 다르고 3.0 이상은 같은 흰색으로 합쳐졌다. 스크린샷이 1.0을 회색으로 기록한 것은 캡처가 EDR 값을 헤드룸 기준으로 눌러 담았다는 뜻이며, 구분 한계 약 3은 0a 밝기 중간 G2 값(3)과 일치한다. 사용자 육안 확인(N4)으로 확정한다.
- **검은 프레임 원인 가설**(현재 자료로는 구분 불가):
  - H-a: Safari `importExternalTexture`가 이 소스(MSE, VP9)의 프레임을 지원하지 않고 예외 없이 검은 텍스처를 준다.
  - H-b: 코덱과 무관하게 MSE(blob) video가 원인이다.
  - H-c: isolated world(content script)에서 video 프레임 접근이 막힌다.
  - 프로브(same-origin H.264 mp4, main world)는 정상이었으므로 차이는 코덱·MSE·실행 world 셋 중 하나 이상이다.
- 이번 회차는 **원인 판별용 진단(N1·N3)과 사용자 보호 가드(N2)**만 한다. 대체 렌더 경로는 결과를 본 뒤 Opus가 정한다(N5 분기표).

---

## N1. 프레임 경로 3종 되읽기 진단 (`diag.frameProbe`)

- **원인 판별 목표**: 같은 순간 같은 video 프레임을 세 경로로 읽어 어느 경로가 검은지 본다.
- **수정 방향**:
  1. attach 후 video가 `readyState >= 2`이고 재생 중일 때 1회, 이후 5초마다 1회(재생 중일 때만) 실행한다. 렌더 루프와 별개이며 렌더 루프를 막지 않는다(비동기, 실행 중이면 다음 회차 건너뜀).
  2. 경로별 평균 밝기(0~255, RGB 평균)를 구한다. 모두 64×36 크기로 줄여 읽는다.
     - `ext`: `importExternalTexture` → 전용 파이프라인(identity 샘플, 출력 형식 `rgba8unorm`, 64×36 렌더 타깃) → `copyTextureToBuffer`(bytesPerRow 256 정렬) → `mapAsync`. 기존 캔버스 파이프라인·형식은 바꾸지 않는다.
     - `copy`: `queue.copyExternalImageToTexture({source: video, origin: 중앙 64×36 영역의 좌상단}, …)`로 `rgba8unorm` 64×36 텍스처에 복사 → 되읽기. 원본 크기 그대로 중앙 부분만 읽는다(축소 없음).
     - `c2d`: `OffscreenCanvas(64, 36)` 2D 컨텍스트에 `drawImage(video, 0, 0, 64, 36)` → `getImageData` 평균.
  3. 경로마다 예외를 따로 잡아 `name`만 기록한다(예: `SecurityError`). 한 경로 실패가 다른 경로를 막지 않는다.
  4. diag에 `frameProbe: {at(ms, 첫 attach 기준), n(누적 횟수), ext, copy, c2d, extErr, copyErr, c2dErr}`로 최신 1회만 둔다. 픽셀 데이터 자체는 저장하지 않는다(GUIDELINES 2.6).
  5. 평균 계산은 순수 함수(`hud.js` 또는 `detect.js`)로 두고 단위 테스트한다. GPU·Canvas 호출은 `renderer.js`에 둔다.
- **영향 범위**: `extension/content/renderer.js`, `hud.js`(또는 `detect.js`), `main.js`(diag 반영), `docs/result-schema-m2.json`(schemaVersion 2, `frameProbe` 선택 필드 + `flags.blackFrame`), `scripts/parse-result.py`(M2 v2 열 추가, v1 호환), 테스트.
- **검증(1)**: lint, `npm test`(평균 함수, bytesPerRow 패딩 제거 로직, diag 스키마 v2), `python3 -m pytest sim`(v1·v2 파싱). CI green.
- **검증(3)**: N4 절차의 JSON.

## N2. 검은 프레임 가드 (사용자 보호)

- **원인**: 현재 오버레이가 원본 video를 검은 화면으로 덮는다. GUIDELINES 2.4-3("검은 프레임 연속 감지는 detach 방향으로만")의 범위에서 막는다.
- **수정 방향**:
  1. 순수 함수 `isBlackOverlay(probe)`: `ext`가 2 미만이고 `c2d` 또는 `copy`가 8 이상이면 true(예외로 값이 없으면 판단하지 않음).
  2. N1 결과가 **2회 연속** true면 detach하고, `flags.blackFrame = true`, errors에 `{at:'blackFrame', name:'BlackFrame', message:'ext≈0 while c2d/copy>0'}`를 기록한다. 해당 video 요소는 이번 페이지 수명 동안 재attach하지 않는다(DRM WeakSet과 별도 집합. 새로고침하면 초기화).
  3. 진단 편의를 위해 popup 모드가 `stripes`일 때는 가드를 적용하지 않는다(video를 그리지 않으므로).
- **영향 범위**: `detect.js`(순수 함수), `main.js`, 테스트.
- **검증(1)**: 순수 함수 경계값 테스트(ext 0/1.9/2, c2d 7.9/8, null 조합), 2회 연속 조건 테스트(가능한 범위의 stub).

## N3. 프로브에 VP9 픽스처 대조 추가

- **목표**: H-a(코덱) 대 H-b/H-c를 가른다. same-origin·main world·비MSE에서 VP9가 검은지 본다.
- **수정 방향**: `scripts/make-fixtures.sh`에 `ramp-1080p60.webm`(VP9, libvpx-vp9, 12초, bt709 태그, 기존 램프와 같은 내용) 생성을 추가하고 커밋한다(파일 크기 1 MB 안팎 목표, 넘으면 STATUS.md에 기록). 2160p VP9는 만들지 않는다(인코딩 시간). 프로브 P0-4 픽스처 목록에 이 파일을 추가해 기존 "창 실행"·"전체화면 측정"으로 identity를 볼 수 있게 한다. `check-fixtures.sh`에 webm 검사(코덱 vp9, 1920×1080, 60fps)를 추가한다.
- **영향 범위**: `scripts/make-fixtures.sh`, `scripts/check-fixtures.sh`, `fixtures/ramp-1080p60.webm`, `probe/probe.js`(목록만), 필요 시 `probe/index.html`.
- **검증(1)**: check-fixtures PASS. (3) N4 절차.
- MSE 재생 경로는 이번에 만들지 않는다(N1 결과로 필요할 때 Opus가 지시).

## N4. 사용자 Mac 확인 절차 (docs/manual-checklist.md 0b 절에 추가)

1. 확장 갱신: `git pull` 후 Xcode에서 다시 Run(확장 코드는 참조 방식이라 재생성 불필요 [추정]. 반영이 안 되면 Safari 재시작).
2. 같은 YouTube 영상(VP9)에서 `identity` 모드로 재생 10초 이상 → popup JSON 복사 → `results/result-M2-<날짜>-ac-mid-yt-vp9-identity-probe.json`. 가드가 작동하면 오버레이가 사라지고 원본이 보이는 것이 정상이다.
3. 가능하면 H.264로 재생되는 영상 1개로 같은 절차(Stats for nerds Codecs가 `avc1`인 영상. 없으면 생략하고 [미확인]).
4. 프로브: `python3 -m http.server 8000` → `http://localhost:8000/probe/` → P0-4에서 `ramp-1080p60.webm` "창 실행"(identity) → 오른쪽 출력이 검은지 한 줄 메모 + JSON export.
5. stripes 판독: 캔버스는 왼쪽부터 9줄(1.0 / 1.25 / 1.5 / 2 / 3 / 4 / 6 / 8 / 16)이다. 밝기 중간에서 30초 이상 기다린 뒤, 왼쪽부터 세어 서로 구분되는 마지막 줄의 번호와 값을 적는다.

## N5. 결과별 다음 단계 (Opus 판정용, 구현 대상 아님)

| frameProbe(유튜브)          | 프로브 VP9 | 해석                          | 다음 단계 후보                                               |
| --------------------------- | ---------- | ----------------------------- | ------------------------------------------------------------ |
| ext≈0, copy>0, c2d>0        | 검음       | H-a: 외부 텍스처가 VP9 미지원 | 프레임마다 `copyExternalImageToTexture` 경로(비용 측정 필요) |
| ext≈0, copy>0, c2d>0        | 정상       | H-b: MSE 경로 문제            | 위와 같음 + 프로브 MSE 사례로 확인                           |
| ext≈0, copy≈0, c2d>0        | —          | WebGPU 비디오 경로 전반 불가  | Canvas2D 중간 단계(비용 큼) 또는 F-A 검토                    |
| 셋 다 ≈0 또는 SecurityError | —          | H-c 또는 보호 프레임          | B절 G4 실패 분기: main world 주입 시험                       |
| ext>0인데 화면 검음         | —          | 합성·출력 단계 문제           | 캔버스 합성 재조사                                           |

---

## K1. G3 지표를 3차 개정 정의로 교체

- **원인**: 프로브의 `missRate`는 소스 프레임 슬롯 기준(2차 개정 정의)이다. 구동 루프 주기와 소스 fps가 같은 60Hz에서는 rAF 위상 지터만으로 한 슬롯에 2회, 다음 슬롯 0회가 생겨 거짓 누락이 잡힌다. 4차 60Hz 파일에서 캔버스 없는 R0가 콜백 601/600인데 `missRate` 5.67%, R2 7.5%, R3 0%로 작업과 무관하게 흔들렸다. 구현 작업자가 J 회차에서 미리 보고한 문제와 같다.
- **수정 방향**:
  1. 순수 함수 `displayMissRate(loopTimes, windowStart, windowEnd, displayHz)`를 `probe-core.js`에 둔다. 측정 창에서 연속 콜백 간격이 `1.5 / displayHz`를 넘으면 `round(간격 × displayHz) − 1`개 갱신을 놓친 것으로 센다. 결과 = 놓친 갱신 수 / (측정 창 초 × displayHz).
  2. `displayHz`는 측정 창의 콜백 간격 중앙값에서 추정해 60 또는 120 중 가까운 값으로 반올림한다. 추정값을 run에 `displayHz`로 기록한다. 사용자가 고른 `env.refreshRate`는 참고로만 두고, 둘이 다르면 페이지에 "주사율 선택값과 측정값이 다름" 경고를 표시한다(4차에서 표기가 뒤바뀐 문제 방지).
  3. run에 `displayMissRate`, `displayHz`를 추가한다. 기존 `missRate`(슬롯 기반)는 이름을 바꾸지 말고 보조로 남긴다.
  4. `perf.g3`의 `baselineMiss`/`itmMiss`/`delta`를 `displayMissRate` 기준으로 바꾸고, `rvfcMiss`는 기존 그대로 둔다. `perf.g3`에 `displayHz`를 추가한다. schemaVersion 5.
  5. `scripts/parse-result.py`: 모드별 표와 G3 요약에 `displayMissRate`, `displayHz` 열을 추가한다. v1~v4 파일 11건 오류 없이 처리한다. 판정은 출력하지 않는다.
- **영향 범위**: `probe/probe-core.js`, `probe/probe.js`, `docs/result-schema.json`, `scripts/parse-result.py`, `tests/unit/probe-core.test.js`.
- **검증(1)**: 단위 테스트. 60Hz 규칙 시퀀스(±2 ms 지터 포함) → 0, 120Hz → 0, 60Hz에서 33 ms 공백 1회 → 1/600, displayHz 추정(16.7 ms → 60, 8.3 ms → 120). `results/` 11건 parse-result 오류 없음.
- **검증(3)**: 필요 없음. 다음 Safari 업데이트 때 회귀 확인용으로 쓴다.

---

## 이번 수정 범위 밖 (변경 금지, N·K 공통)

- ITM 수식, 프리셋 수치(M4).
- K1은 `probe/` 지표 전용이며 M2 브랜치에 섞지 않는다. N3의 프로브 변경은 픽스처 목록 추가만이다.
- 대체 렌더 경로(copyExternalImageToTexture 구동, Canvas2D 중간 단계, main world 주입)는 N5 판정 전 구현 금지.
- 커밋된 `xcode/`의 수기 편집·형식 변환(GUIDELINES 7-5).

## 병렬 분할 (N 회차)

- W-A: N1 + N2 (`extension/`, 스키마, parse-result, 테스트).
- W-B: N3 (`scripts/make-fixtures.sh`, `check-fixtures.sh`, `fixtures/*.webm`, `probe/` 목록) + N4 체크리스트 문구(`docs/manual-checklist.md`).
- 파일 비중첩. 픽스처 인코딩은 sim-runner로 실행해도 된다.

## 병렬 분할 (K1)

- K1만 있다. impl-worker 1개. M2 착수와 파일이 겹치지 않으므로(`probe/` vs `extension/`) 병렬로 진행해도 된다.
