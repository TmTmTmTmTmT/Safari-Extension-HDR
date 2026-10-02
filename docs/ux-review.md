# UI·사용성 개선점 리뷰 (v1.0.0 기준)

- 작성: 2026-10-02, Opus(계획 단계). 코드 수정 없음. 구현은 이 문서를 바탕으로 PLAN.md를 고친 뒤 Sonnet이 맡는다.
- 대상: popup, 페이지 HUD·오버레이, 컨테이너 앱(xcode/), manifest, docs/install.md, docs/manual-checklist.md
- 방법: 7개 관점(popup 레이아웃, popup 상태 피드백, 페이지 경험, 컨테이너 앱·온보딩, 접근성·언어, 설정 모델, 진단 루프)에서 코드와 문서를 읽고 리뷰 → 관점별로 근거(file:line)·실현성·범위를 반박 검증 → 빠진 영역 점검 → 같은 문제끼리 병합. 발견 114건 중 검증 통과 113건, 누락 점검으로 4건 추가, 병합 후 **54건**.
- 한계: 화면을 직접 보지 않고 코드만 읽어 판단했다. "화면 확인" 표시가 있는 항목은 사용자가 Mac에서 봐야 확정된다(CLAUDE.md 환경 한계). 성능과 알고리즘 품질은 다루지 않았다.
- Opus 직접 재확인: UX-03은 수치까지 계산했다. 기본값에서 표시는 ×1.62, 실제는 ×1.90이다. M5 회신 설정에서는 표시 ×2.00, 실제 ×2.25이다. UX-04(곡선 덮어쓰기)와 UX-11(make-xcode.sh가 기존 xcode/ 폴더를 거부함)도 코드로 확인했다.

## 1. 요약

우선순위별 건수: P1 11건, P2 18건, P3 25건.

가장 큰 문제는 세 가지다.

1. **지금 무엇이 일어나고 있는지 보이지 않는다.** '켜기'가 체크돼 있어도 영상이 원본으로 나올 수 있다. 원인은 진단 모드, DRM, 이미 HDR인 원본, 렌더 오류 등이다. 그런데 popup 첫 화면과 HUD는 그 이유를 말하지 않고, 원인은 접힌 진단 JSON 안에만 있다(UX-01, 02, 09, 13).
2. **표시되는 수치와 문구가 실제 동작과 다르다.** 유효 피크가 실제보다 낮게 계산돼 하이라이트 잘림 경고가 필요할 때 뜨지 않는다(UX-03). '선명 (밝기 중간 이상 권장)' 문구는 헤드룸 근거와 반대로 읽힌다(UX-05). '밝기'와 '선명'이 각각 두 가지 뜻으로 쓰인다(UX-12, 17).
3. **실수했을 때 되돌릴 수 없다.** 사용자 지정 곡선(현재 기본값)이 경고 없이 덮어써진다(UX-04). 기본값으로 되돌리는 기능이 없다(UX-06). 렌더 오류와 검은 프레임에서 회복하는 방법이 화면에도 문서에도 없다(UX-10).

## 2. 주제별 묶음

### 상태 가시성: 지금 무엇이 일어나고 있는가

'켜기'가 체크돼 있어도 DRM·HDR 원본·오류·진단 모드 때문에 원본이 보일 수 있습니다. 그런데 popup 첫 화면과 HUD는 그 이유를 알려 주지 않습니다. 상태 줄, HUD 수명, 진단 출처, 꺼짐 표현을 함께 정비해야 사용자가 '고장'으로 오해하지 않습니다.

관련: UX-01, UX-02, UX-07, UX-09, UX-13, UX-14, UX-15, UX-20, UX-23, UX-24, UX-41, UX-45

### 실수 회복과 안전망

바로 저장되는 슬라이더에는 되돌리기·기본값 복원·덮어쓰기 경고가 없습니다. 렌더 오류, 검은 프레임, 크기 변경 같은 일시 장애에서도 회복 경로가 보이지 않습니다. storage 접근만으로 만들 수 있는 안전망부터 둡니다.

관련: UX-04, UX-06, UX-10, UX-21, UX-34, UX-43

### 용어·수치·설명의 정확성

유효 피크 계산이 셰이더보다 낮게 나오고, '밝기'·'선명'이 두 가지 뜻으로 쓰입니다. 선명 프리셋 안내는 근거와 반대 방향으로 읽힙니다. 수치와 문구가 실제 동작과 맞아야 사용자가 올바른 손잡이를 고릅니다.

관련: UX-03, UX-05, UX-08, UX-12, UX-16, UX-17, UX-30, UX-31, UX-37, UX-38, UX-39

### popup·HUD 레이아웃, 조작 효율, 접근성

슬라이더 폭과 위치가 흔들리고, 그룹 경계가 없고, 다크 모드가 빠져 있고, HUD가 작고 대비가 약합니다. 원본과 빠르게 비교하는 수단도 없습니다. 시각 확인이 필요한 항목이 많아 사용자 판정과 함께 진행합니다.

관련: UX-18, UX-22, UX-32, UX-33, UX-40, UX-42, UX-51, UX-52

### 진단·회신 워크플로

복사 피드백이 없고, 진단 내용이 2초마다 바뀌고, 측정 조건·측정 창 정보가 빠져 있습니다. 파일명도 손으로 조립해야 합니다. 그래서 회신 JSON이 오염되거나 아예 제출되지 않는 일이 반복됐습니다. 진단 영역 안에서만 개선합니다.

관련: UX-19, UX-26, UX-27, UX-28, UX-29, UX-35, UX-36

### 설치·컨테이너 앱·문서 온보딩

컨테이너 앱은 영어 Xcode 템플릿 그대로이고, 아이콘·도움말이 없으며, 오류 처리가 비어 있습니다. 문서에는 make-xcode 재실행 지시, 7일 만료 증상, 설치 순서 같은 막히는 지점이 남아 있습니다. xcode/ 수정 범위는 Opus와 사용자가 정합니다.

관련: UX-11, UX-25, UX-44, UX-46, UX-47, UX-48, UX-49, UX-50, UX-53, UX-54

## 3. 단계별 진행안

### 1단계: 즉시 적용 가능한 다듬기와 정확성 수정(권한·background 변경 없이 popup·HUD·문서 위주)

사용자가 기능 상태를 오해하거나 막히는 지점부터 없앱니다. 진단 모드 잠금 안내, 유효 피크 계산 교정, 곡선 덮어쓰기 보호, 기본값 복원, 잘못된 문구('밝기'·'선명'), 회복 방법 문서화, make-xcode 지시 수정이 여기에 들어갑니다. 대부분 한두 파일이고, Opus의 계획·문구 개정과 함께 진행합니다.

대상: UX-01, UX-03, UX-04, UX-05, UX-06, UX-07, UX-08, UX-09, UX-10, UX-11, UX-12, UX-17, UX-18, UX-19, UX-26, UX-30, UX-33, UX-34, UX-36, UX-37, UX-39, UX-41, UX-49, UX-50

### 2단계: 상태 피드백 구조(상태 줄·HUD 수명·권한·메시징·background)

'지금 이 영상에 적용 중인지'를 popup, HUD, 툴바에서 한눈에 보이게 합니다. storage만으로 되는 popup 상태 줄과 HUD 수명 분리를 먼저 하고, DRM·PathUndecided·권한 미허용 안내를 그 위에 얹습니다. 현재 탭의 정확한 상태와 배지는 tabs/activeTab 권한, 메시징(GUIDELINES 2.1-5 개정), background 도입을 Opus·사용자가 결정한 뒤 진행합니다(UX-09 2단계 포함).

대상: UX-02, UX-13, UX-14, UX-15, UX-20, UX-23, UX-24, UX-38, UX-44, UX-45

### 3단계: 그 외 개선(설명 보강, 진단·회신 워크플로, 페이지 동작, 컨테이너 앱, 접근성)

슬라이더 의미 설명, 측정 조건·측정 상태·파일명 자동화로 회신 품질을 높입니다. 일시정지 리사이즈, 페이드, 검정 지연 같은 페이지 동작을 다듬고, A/B 비교 단축키, 컨테이너 앱 한국어화·오류 처리, 7일 만료 안내, 접근성 보강을 진행합니다. 스키마 변경과 이전 계획에서 범위 밖으로 둔 항목은 Opus 계획 개정 뒤에 합니다.

대상: UX-16, UX-21, UX-22, UX-25, UX-27, UX-28, UX-29, UX-31, UX-32, UX-35, UX-40, UX-42, UX-43, UX-46, UX-47, UX-48, UX-51, UX-52, UX-53, UX-54

## 4. 사용자 결정이 필요한 사항

아래 결정에 따라 PLAN 개정 범위가 달라진다.

1. popup 일반 영역에 '진단 모드라 조정이 잠김' 같은 상태 안내 줄을 두거나, itm이 아닐 때 진단 영역을 자동으로 펼치는 것이 GUIDELINES 2.6-3(진단 모드 비노출, 기본 접힘)에 어긋난다고 보시나요?
2. popup이 현재 탭의 정확한 상태를 보여 주도록 tabs/activeTab 권한 추가, popup과 content 사이 메시징 허용(GUIDELINES 2.1-5 개정), background 스크립트 도입(배지·아이콘 상태 표시)을 받아들이시겠나요, 아니면 '마지막으로 진단을 쓴 탭' 기준의 근사치로 충분한가요?
3. 유효 피크 공식을 셰이더와 같은 1 + t·(curve(g) − 1)로 바꾸면 진단 render.effectivePeak의 의미가 과거 회신과 달라집니다. 바꾸시겠나요? 바꾼다면 schemaVersion도 올릴까요?
4. 선명 프리셋 안내의 의도는 '화면 밝기 중간 이하 권장'(헤드룸 기준)이 맞나요?
5. vivid 프리셋 표시명을 무엇으로 바꿀까요('강조', '화사', '생생' 등)? 아니면 슬라이더 '선명도'를 '윤곽 선명화'로 바꾸는 쪽이 좋을까요?
6. '기본값으로 되돌리기'에 HUD 표시와 진단 모드도 포함할까요? 버튼은 일반 영역과 진단 영역 중 어디에 둘까요?
7. DRM으로 판정된 페이지에 HUD나 상태 칩 같은 텍스트 DOM을 넣어 'DRM 영상: 변환 안 함(새로고침 필요)'을 표시하는 것이 'DRM 영상은 감지 즉시 no-op' 원칙에 맞다고 보시나요?
8. noGpu·blackFrame 재시도는 문서와 상태 안내만으로 충분한가요, 아니면 전용 키(sdrhdr.retry)를 쓰는 '다시 시도' 버튼을 둘까요?
9. 이전 계획에서 범위 밖으로 둔 단축키를 이제 넣을까요? 넣는다면 원본 보기와 켜기 토글에 쓸 키 조합(예: Option+H, Option+Shift+H)은 무엇으로 할까요?
10. 컨테이너 앱(xcode/ 아래 Main.html·Script.js·ViewController.swift 등)을 한국어화하고 수정해도 되나요? make-xcode.sh 재생성 때 덮어써지는 문제는 어떻게 처리할까요(문서화 또는 스크립트 후처리)?
11. 진단 영역은 단일 사용자 도구이니 지금처럼 popup에 접힌 채로 둘까요, 아니면 일반 사용 화면에서 더 숨길까요(예: 별도 토글 뒤로)?
12. 코드를 바꿀 때마다 manifest 패치 버전을 올리는 규칙을 도입할까요? 매니페스트 테스트는 버전 고정 비교에서 형식 검사로 바꿀까요?
13. 측정 조건(전원·화면 밝기·저전력)과 측정 태그를 진단 JSON에 넣는 스키마 확장(schemaVersion 11)을 진행할까요?
14. 툴바·앱 아이콘을 추가할까요(PLAN 492행 'icons 없음' 결정 번복)? 디자인은 어떤 모양으로 할까요?
15. 확인 요청: Safari popup에서 'JSON 저장' 링크를 누르면 무엇이 일어나나요? 다크 모드 popup은 어떻게 보이나요? 일시정지 상태에서 전체화면으로 전환하면 검은 화면이 보이나요?

## 5. 전체 목록

| ID              | 우선 | 심각도 | 노력 | 표면        | 분류          | 제목                                                                                                                                                | 화면 확인 |
| --------------- | ---- | ------ | ---- | ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| [UX-01](#ux-01) | P1   | high   | S    | popup       | 상태 피드백   | 진단 모드(itm 외)를 켠 채 잊으면 popup 조정이 이유 표시 없이 잠기고, 원인은 접힌 '진단' 안에 숨어 있음                                              | 예        |
| [UX-02](#ux-02) | P1   | high   | M    | popup       | 상태 피드백   | popup 첫 화면에 '지금 변환 중인지, 왜 원본인지' 상태 요약이 없고 진단 JSON 안에만 있음                                                              |           |
| [UX-03](#ux-03) | P1   | high   | M    | 공통        | 상태 피드백   | 유효 피크가 밝기 g를 곡선 뒤에서 곱해 실제보다 낮게 나오고, 잘림 경고가 필요할 때 뜨지 않음                                                         |           |
| [UX-04](#ux-04) | P1   | high   | M    | popup       | 오류 회복     | 이름 있는 프리셋에서 상세 슬라이더를 건드리면 저장된 사용자 지정 곡선(현재 기본값)이 경고·되돌리기 없이 덮어써짐                                    |           |
| [UX-05](#ux-05) | P1   | medium | S    | popup       | 문구·용어     | '선명 (밝기 중간 이상 권장)' 문구가 헤드룸 근거와 반대로 읽혀 화면 밝기 최대에서의 잘림을 유도함                                                    |           |
| [UX-06](#ux-06) | P1   | medium | S    | popup       | 오류 회복     | 설정을 기본값으로 되돌리는 수단이 없고, install.md도 초기화 방법을 [확인 필요]로 남김                                                               |           |
| [UX-07](#ux-07) | P1   | medium | S    | popup       | 상태 피드백   | '켜기'가 눈에 띄지 않는 작은 체크박스이고, 꺼진 상태에서도 나머지 조작이 정상처럼 보이며, 라벨이 무엇을 켜는지 말하지 않음                          | 예        |
| [UX-08](#ux-08) | P1   | medium | S    | popup       | 상태 피드백   | 유효 피크 줄이 뜻과 안전 한계를 알려 주지 않고, 경고는 강조 없이 같은 줄에 붙어 줄바꿈되며 VoiceOver에도 알려지지 않음                              | 예        |
| [UX-09](#ux-09) | P1   | medium | S    | 공통        | 상태 피드백   | 진단이 탭 구분 없는 단일 키라 popup이 어느 탭·어느 시점의 진단인지 알 수 없고, 다른 탭이 덮어씀                                                     |           |
| [UX-10](#ux-10) | P1   | medium | S    | 공통        | 오류 회복     | noGpu·blackFrame에서 회복하는 방법(다른 영상 이동, 켜기 껐다 켜기, 새로고침)이 문서와 화면 어디에도 없고, 모든 렌더 오류가 'WebGPU 없음'으로 안내됨 |           |
| [UX-11](#ux-11) | P1   | medium | S    | 문서        | 오류 회복     | 체크리스트 M3·M4a·M4 전제가 make-xcode.sh 재실행을 지시해 스크립트가 오류로 멈추고, 문서끼리 서로 어긋남                                            |           |
| [UX-12](#ux-12) | P2   | medium | M    | 공통        | 문구·용어     | '밝기'가 상세 슬라이더 g와 macOS 화면 밝기를 동시에 가리켜 경고를 잘못 읽게 됨                                                                      |           |
| [UX-13](#ux-13) | P2   | medium | M    | HUD         | 상태 피드백   | HUD가 attach에 묶여 있어 DRM·렌더 오류·셀렉터 실패·꺼짐일 때 사라지고, 가이드라인의 'HUD에 사유 기록' 요구와 어긋남                                 |           |
| [UX-14](#ux-14) | P2   | medium | M    | 공통        | 오류 회복     | DRM 영상을 한 번 보면 같은 탭의 이후 일반 영상도 표시 없이 원본으로 재생되고, 회복 방법(새로고침)이 보이지 않음                                     |           |
| [UX-15](#ux-15) | P2   | medium | S    | HUD         | 상태 피드백   | 진단 모드(baseline·identity·stripes)나 일시정지 중에도 HUD가 'active'와 프리셋·강도를 그대로 보여 정상 동작처럼 알림                                | 예        |
| [UX-16](#ux-16) | P2   | medium | M    | popup       | 문구·용어     | HDR 강도 0%가 '끄기'가 아니라는 점과, 강도·하이라이트 밝기·밝기 세 손잡이의 역할 차이가 popup에 없음                                                |           |
| [UX-17](#ux-17) | P2   | medium | M    | 공통        | 문구·용어     | 프리셋 '선명', 슬라이더 '선명도', HUD의 '선명'이 서로 다른 기능을 같은 말로 부름                                                                    |           |
| [UX-18](#ux-18) | P2   | medium | S    | popup       | 시각 디자인   | 슬라이더가 라벨 뒤 기본 폭으로 붙어 짧고 시작 위치가 들쭉날쭉하며, 값 자릿수가 바뀌면 드래그 중 트랙이 밀림                                         | 예        |
| [UX-19](#ux-19) | P2   | medium | S    | 진단        | 상태 피드백   | 진단 '복사' 버튼이 성공·실패를 알리지 않고 실패를 조용히 무시해, 이전 클립보드 내용을 회신할 수 있음                                                |           |
| [UX-20](#ux-20) | P2   | medium | M    | 공통        | 상태 피드백   | 입력 경로 판정을 포기(60회 보류)해도 상태가 계속 'probing·경로 pending'으로 보여 사용자가 계속 기다림                                               |           |
| [UX-21](#ux-21) | P2   | medium | M    | 페이지      | 오류 회복     | 일시정지 상태에서 전체화면·극장·창 크기를 바꾸면 캔버스를 다시 그리지 않아 검은 화면이 멈춘 프레임을 가릴 수 있음                                   | 예        |
| [UX-22](#ux-22) | P2   | medium | M    | 페이지      | 조작 효율     | 원본과 빠르게 비교(A/B)하거나 켜고 끄는 수단이 popup뿐이라 느리고, 다른 탭까지 꺼짐                                                                 | 예        |
| [UX-23](#ux-23) | P2   | medium | M    | 페이지      | 상태 피드백   | 기본 설정(HUD 꺼짐)에서는 방해 없이 보면서 변환 상태를 알 방법이 없음                                                                               | 예        |
| [UX-24](#ux-24) | P2   | medium | S    | 공통        | 온보딩        | youtube.com 접근 미허용이나 대상 밖 페이지(임베드·music)에서도 popup은 '켜기' 체크, 앱은 'currently on'이라 동작 중으로 오해함                      | 예        |
| [UX-25](#ux-25) | P2   | medium | M    | 공통        | 오류 회복     | 7일 서명 만료가 언제 오는지, 이미 왔는지 알 방법이 없어 '확장 고장'으로 오인하기 쉬움                                                               | 예        |
| [UX-26](#ux-26) | P2   | medium | S    | popup       | 상태 피드백   | popup에 이름·버전 표시가 없어 새 빌드 반영 여부를 popup 항목 순서로 추측함                                                                          |           |
| [UX-27](#ux-27) | P2   | medium | M    | 진단        | 상태 피드백   | 측정 직후·일시정지 중에 캡처한 진단을 걸러 주는 안내가 없어 오염된 수치가 판정 자료로 들어감                                                        |           |
| [UX-28](#ux-28) | P2   | medium | M    | 진단        | 안전한 기본값 | 측정 조건(화면 밝기·전원·저전력)을 기록할 칸이 진단 JSON에 없어 회신에서 반복적으로 빠짐                                                            |           |
| [UX-29](#ux-29) | P2   | medium | M    | 진단        | 조작 효율     | 결과 파일명을 절마다 다른 규칙으로 손수 조립하고 저장·push까지 해야 해서 진단 JSON 미제출이 반복됨                                                  |           |
| [UX-30](#ux-30) | P3   | low    | M    | popup       | 일관성        | 슬라이더 값 단위가 %·소수·×로 섞여 있고, 중립점과 기본값이 표시되지 않음                                                                            | 예        |
| [UX-31](#ux-31) | P3   | low    | M    | popup       | 문구·용어     | 채도 3종, 확장 시작, 곡선 지수, 선명도, 프리셋의 의미가 popup에 없어 시행착오로만 조정함                                                            | 예        |
| [UX-32](#ux-32) | P3   | low    | S    | popup       | 정보 구조     | 상세 설정 영역이 시각적으로 구분되지 않고, HUD 체크박스 소속이 모호하며, 펼침 상태를 기억하지 않음                                                  | 예        |
| [UX-33](#ux-33) | P3   | low    | S    | popup       | 시각 디자인   | popup에 color-scheme 선언이 없어 다크 모드에서 밝은 패널로 뜰 수 있음(컨테이너 앱과 불일치)                                                         | 예        |
| [UX-34](#ux-34) | P3   | low    | S    | popup       | 오류 회복     | 정적 HTML 초기값이 실제 기본값과 다르고, storage 읽기·쓰기 실패를 처리하지 않아 잘못된 상태가 남음                                                  | 예        |
| [UX-35](#ux-35) | P3   | low    | S    | 진단        | 일관성        | 'JSON 저장' 링크가 M2 이후 동작 미확인 상태로 버튼 옆에 링크 모양으로 놓여 있고, 진단이 없어도 활성임                                               | 예        |
| [UX-36](#ux-36) | P3   | low    | S    | 진단        | 상태 피드백   | 재생 중에는 진단 textarea가 약 2초마다 통째로 바뀌어 읽기·선택·스크롤이 끊기고, 특정 시점을 고정할 수 없음                                          | 예        |
| [UX-37](#ux-37) | P3   | low    | S    | 진단        | 문구·용어     | 진단 모드 옵션이 itm·identity·stripes·baseline 내부 id로만 표시됨                                                                                   |           |
| [UX-38](#ux-38) | P3   | low    | S    | HUD         | 문구·용어     | HUD 첫 줄이 skipped(hdrSource)·pending·vf 같은 영어 내부 식별자라 정상 건너뜀과 오류를 구분하기 어려움                                              |           |
| [UX-39](#ux-39) | P3   | low    | S    | HUD         | 문구·용어     | HUD 'fps'가 영상 fps가 아닌 렌더 루프 횟수이고, 측정 불가 누락률을 0.0%로 표시함                                                                    |           |
| [UX-40](#ux-40) | P3   | low    | S    | HUD         | 접근성        | HUD가 11px 고정, 55% 반투명 배경, 왼쪽 위 상시 표시라 EDR 하이라이트 위 대비가 약하고 미니플레이어를 크게 가림                                      | 예        |
| [UX-41](#ux-41) | P3   | low    | S    | 진단        | 상태 피드백   | 확장을 끈 채 페이지를 열면 lifecycle이 'disabled'가 아니라 'idle'로 기록됨                                                                          |           |
| [UX-42](#ux-42) | P3   | low    | S    | 페이지      | 시각 디자인   | 영상 시작·다음 영상·PiP 복귀·다시 켜기 때마다 원본에서 변환으로 밝기가 갑자기 튐                                                                    | 예        |
| [UX-43](#ux-43) | P3   | low    | S    | 페이지      | 오류 회복     | 경로가 정해진 뒤 출력이 검게 바뀌면 최대 약 60초 동안 검은 캔버스가 영상을 가릴 수 있음                                                             |           |
| [UX-44](#ux-44) | P3   | low    | M    | 공통        | 시각 디자인   | 확장 툴바 아이콘과 앱 아이콘이 없어 Dock과 Safari 툴바에서 알아보기 어려움                                                                          | 예        |
| [UX-45](#ux-45) | P3   | low    | L    | 공통        | 상태 피드백   | 켜짐·꺼짐과 탭별 변환·건너뜀·오류 상태를 툴바 배지나 아이콘으로 보여 줄 수단이 없음                                                                 | 예        |
| [UX-46](#ux-46) | P3   | low    | M    | 컨테이너 앱 | 온보딩        | 컨테이너 앱이 영어 Xcode 템플릿 그대로라 설치 다음 단계를 안내하지 않고, 이름·버전·설명이 표면마다 다름                                             | 예        |
| [UX-47](#ux-47) | P3   | low    | M    | 컨테이너 앱 | 오류 회복     | 컨테이너 앱이 상태 조회 실패를 알리지 않고, 'Quit and Open…' 버튼은 설정 열기에 실패해도 앱을 종료함                                                | 예        |
| [UX-48](#ux-48) | P3   | low    | S    | 컨테이너 앱 | 상태 피드백   | 컨테이너 앱 창의 확장 켜짐·꺼짐 표시가 창을 연 순간 한 번만 갱신됨                                                                                  |           |
| [UX-49](#ux-49) | P3   | low    | S    | 문서        | 온보딩        | install.md 최초 설치 절차가 막히기 쉬운 지점을 건너뛰고, 앱 위치·다시 열기·끄기·제거 방법이 없음                                                    | 예        |
| [UX-50](#ux-50) | P3   | low    | M    | 문서        | 정보 구조     | 수동 체크리스트가 현행·보관·완료 절차를 한 파일에 섞고 있고, 상단 요약·HUD 표기·값이 낡음                                                           |           |
| [UX-51](#ux-51) | P3   | low    | S    | popup       | 접근성        | 슬라이더의 접근 가능한 이름에 값이 섞이고 aria-valuetext가 없어 VoiceOver가 %나 × 단위 없이 읽음                                                    | 예        |
| [UX-52](#ux-52) | P3   | low    | S    | 페이지      | 접근성        | 오버레이 캔버스와 HUD에 aria-hidden이 없어 VoiceOver 탐색에 끼어들 수 있음                                                                          | 예        |
| [UX-53](#ux-53) | P3   | low    | M    | 공통        | 상태 피드백   | 외장 SDR 모니터처럼 EDR이 없는 화면에서도 변환이 계속돼 하이라이트가 잘릴 수 있는데, 감지도 안내도 없음                                             | 예        |
| [UX-54](#ux-54) | P3   | low    | S    | 공통        | 온보딩        | 도움말 진입점이 없음: 컨테이너 앱의 'SDRHDR Help'(⌘?)는 막다른 길이고 popup에도 문서 안내가 없음                                                    | 예        |

심각도: high = 상태를 오해하거나 막히거나 잘못 조작하기 쉬움, medium = 자주 불편하거나 혼란스러움, low = 다듬기. 노력: S = 한 파일 소규모, M = 여러 파일이나 새 상호작용, L = 권한·background·네이티브 같은 구조 변경.

## 6. 항목 상세

### UX-01

**진단 모드(itm 외)를 켠 채 잊으면 popup 조정이 이유 표시 없이 잠기고, 원인은 접힌 '진단' 안에 숨어 있음**  
P1 · high · 노력 S · popup · 상태 피드백 · 화면 확인 필요

- **문제**: 체크리스트(0b 3번, M6 2·3번)를 따라 모드를 baseline·identity·stripes로 바꾸면 그 값이 sdrhdr.mode에 저장되어 Safari를 재시작해도 남습니다. 그런데 M6 2번에는 itm으로 되돌리는 단계가 없습니다. 다음에 popup을 열면 '진단'은 접혀 있어 모드 select가 보이지 않고, 프리셋과 슬라이더 9개는 disabled 상태인데 안내가 없습니다. 스타일에 :disabled 규칙이 없어 라벨과 값('43%')이 평소 색 그대로라, 잠겼다는 사실조차 분명하지 않습니다. baseline이면 원본, identity면 SDR처럼 보이므로 사용자는 '확장이 고장 났다'고 판단합니다. 그 상태에서 보낸 체감 회신도 틀어집니다.
- **권고**: popup.js의 setItmControlsEnabled(init과 mode change가 함께 씀)에서 mode !== 'itm'이면 다음을 합니다. (1) `$('diag-section').open = true`로 진단 영역을 자동으로 펼칩니다. (2) 진단 영역 맨 위에 '진단 모드 사용 중: HDR 효과가 꺼져 있습니다' 한 줄과 [itm으로 복귀] 버튼을 둡니다. 버튼은 storage.local.set({[K.mode]:'itm'}) 후 select와 컨트롤 상태를 갱신합니다. (3) 일반 영역 '켜기' 아래에 모드 이름 없이 '진단 모드라 화질 조정이 잠겨 있습니다. 아래 진단에서 정상 모드로 되돌리세요'를 표시하고, 비활성 컨트롤에 aria-describedby로 연결합니다. (4) popup.html 스타일에 `label:has(:disabled){opacity:.45}`를 추가합니다. 아울러 체크리스트 0b 3번과 M6 2·3번 끝에 'popup 모드를 itm으로 되돌린다'를 추가합니다.
- **근거**:
  - [extension/popup/popup.js:121](../extension/popup/popup.js#L121) — 모드가 itm이 아니면 프리셋 disabled
  - [extension/popup/popup.js:120](../extension/popup/popup.js#L120) — 비활성 판단이 mode에만 연결됨
  - [extension/popup/popup.html:79](../extension/popup/popup.html#L79) — 진단 영역 details, 기본 접힘
  - [extension/popup/popup.html:14](../extension/popup/popup.html#L14) — label 스타일에 :disabled 규칙 없음
  - [docs/manual-checklist.md:205](../docs/manual-checklist.md#L205) — M6에서 모드를 baseline으로 바꾸게 함(되돌리기 단계 없음)
  - [docs/manual-checklist.md:72](../docs/manual-checklist.md#L72) — 0b에서 baseline 사용 지시
  - [extension/content/params.js:26](../extension/content/params.js#L26) — baseline은 캔버스를 숨기는 진단용
  - [PLAN.md:381](../PLAN.md#L381) — itm이 아니면 일반 영역 셰이더 컨트롤 비활성
  - [GUIDELINES.md:59](../GUIDELINES.md#L59) — 진단 모드는 진단 영역 밖에 노출 금지
- **제약·주의**: GUIDELINES 2.6-3에 따라 모드 select와 모드 이름은 진단 영역 밖에 둘 수 없고, 진단 영역은 기본 접힘이어야 합니다. itm이 아닐 때만 자동으로 펼치는 것과 일반 영역에 안내 줄을 두는 것이 이 규칙에 맞는지는 Opus가 해석합니다. 어긋난다면 자동 펼침과 진단 영역 안의 버튼만 적용합니다. 새 UI 요소는 GUIDELINES 1-2에 따라 Opus 승인이 필요합니다. storage 값만 쓰므로 tabs 권한, background, 메시징은 필요 없습니다. tests/unit/extension-popup.test.js의 disabled 기대값(168·170·173행)은 유지하고 테스트를 보강합니다.

### UX-02

**popup 첫 화면에 '지금 변환 중인지, 왜 원본인지' 상태 요약이 없고 진단 JSON 안에만 있음**  
P1 · high · 노력 M · popup · 상태 피드백 · 선행: UX-41

- **문제**: '켜기'가 체크돼 있어도 DRM·HDR 원본·PiP·blackFrame·noGpu·영상 없음 상태면 원본이 그대로 보입니다. 그런데 popup 일반 영역에는 이를 알리는 줄이 없습니다. 확인하려면 진단을 펼친 뒤 높이 160px textarea에서 긴 JSON을 읽어야 합니다. lifecycle은 env·api·video 등 여러 블록 뒤에 있고 errors는 이벤트 로그 뒤 맨 끝에 있습니다. 그다음 install.md 7장 표와 대조해야 합니다. 정상적인 건너뜀(hdrSource·drm)과 실패(noGpu)가 겉보기에 같아서 사용자는 설정을 의심하거나 고장으로 오해합니다. HUD는 기본으로 꺼져 있고 detach된 상태에서는 아예 없습니다.
- **권고**: popup.html의 '켜기' 바로 아래에 읽기 전용 `<div id="status" role="status">`를 둡니다. popup.js의 showDiag와 기존 storage.onChanged 리스너에서 diag.lifecycle.state·skipReason, errors[0].name, flags.attached, lifecycle.adShowing을 읽습니다. 이를 정상·건너뜀·오류 세 갈래의 한국어 문장과 다음 행동 한 줄로 바꿉니다. 예시는 다음과 같습니다. active → '변환 중'. probing → '준비 중(원본 표시)'. skipped/drm → 'DRM 영상: 변환 안 함(새로고침하면 해제)'. hdrSource → '이미 HDR 영상: 원본 표시'. pip → 'PiP 중: 원본'. blackFrame → '입력이 검게 읽혀 중단: 다른 영상으로 이동하거나 켜기를 껐다 켜기'. noGpu → '렌더 오류(name)'. idle이고 attached=false → '이 페이지에 대상 영상 없음'. 진단 없음 → 'YouTube 영상 탭을 열면 자동 표시'. 꺼짐은 popup이 직접 읽은 cur.enabled를 우선하고, 토글 직후에는 예상 상태를 먼저 보여 줍니다. 매핑은 params.js 순수 함수 하나로 두어 HUD(UX-38)와 함께 씁니다. 진단 영역 안에서는 같은 요약을 위에 두고, 원문 textarea는 '원문 JSON' 하위 접힘 영역으로 옮깁니다.
- **근거**:
  - [docs/install.md:127](../docs/install.md#L127) — 상태 확인을 진단 JSON을 펼쳐 읽는 방식으로 안내
  - [extension/popup/popup.js:138](../extension/popup/popup.js#L138) — popup은 진단을 textarea에 그대로 표시
  - [extension/content/main.js:531](../extension/content/main.js#L531) — 진단 lifecycle.state
  - [extension/content/main.js:532](../extension/content/main.js#L532) — 진단 lifecycle.skipReason
  - [extension/content/main.js:401](../extension/content/main.js#L401) — 셀렉터 실패는 errors에만 기록
  - [extension/popup/popup.html:20](../extension/popup/popup.html#L20) — textarea 높이 160px
  - [GUIDELINES.md:25](../GUIDELINES.md#L25) — popup은 진단 키와 설정 표시만 읽음
- **제약·주의**: GUIDELINES 2.1-5에 따라 popup은 sdrhdr.diag를 읽는 것만 허용되고 메시징은 금지입니다. 그래서 이 줄은 '마지막으로 진단을 쓴 YouTube 탭' 기준이며, 문구에 그 사실을 밝힙니다(UX-09와 함께). 현재 탭의 정확한 상태를 보여 주려면 tabs/activeTab 권한과 메시징 또는 background가 필요하고, 이는 가이드 개정이 필요한 L 규모 작업입니다. diag에 url 필드가 있지만 URL·제목은 상태 줄에 넣지 않고(2.6-1), 모드 이름도 노출하지 않습니다(2.6-3). popup은 ns.js와 params.js만 로드합니다. 새 UI 요소이므로 GUIDELINES 1-2에 따라 Opus 승인이 필요합니다. install.md 7장 표와 문구 대응표를 어디서 관리할지는 Opus가 정합니다.

### UX-03

**유효 피크가 밝기 g를 곡선 뒤에서 곱해 실제보다 낮게 나오고, 잘림 경고가 필요할 때 뜨지 않음**  
P1 · high · 노력 M · 공통 · 상태 피드백

- **문제**: 셰이더는 g를 곡선 앞에서 곱합니다. 그래서 g>1이면 흰색이 곡선의 연장 구간으로 들어가 실제 피크가 curve(g)가 되고, 이는 P·g보다 큽니다(sim 테스트도 이 현상을 확인합니다). 그런데 effectivePeak는 1 + t(P·g − 1)로 계산합니다. 현재 기본값에서는 표시가 ×1.62이지만 실제는 약 ×1.90입니다. M5 회신 설정(P2.6·g1.11·t0.53)에서는 표시가 ×2.00이라 경고(>2.0)가 뜨지 않지만, 실제는 약 ×2.25로 화면 밝기 최대일 때의 헤드룸(약 2)을 넘습니다. 사용자는 '잘림 없음'으로 판단하고 하이라이트 계조를 잃습니다. popup, HUD 3행, 진단 render.effectivePeak가 모두 같은 함수를 쓰므로 세 곳 모두 낮은 값을 보여 줍니다.
- **권고**: params.effectivePeak를 셰이더 경로와 같은 `1 + t·(curve(g; P,k,n) − 1)`로 바꿉니다. curve는 Y≤k이면 항등이고, 그 위에서는 k + (1−k)(u + (P'−1)uⁿ)입니다. 이 함수 하나만 고치면 popup.js 36행, hud.js 414행, renderer.js 878행이 모두 따라옵니다. 함께 고칠 곳은 install.md 71행의 공식 문구, PLAN M5-1(372·377행) 문구, g≠1인 단위 테스트 기대값(extension-pure.test.js 955·960행 등)입니다.
- **근거**:
  - [extension/content/params.js:94](../extension/content/params.js#L94) — 1 + t*(P*g - 1)로 계산
  - [extension/content/itm.wgsl.js:85](../extension/content/itm.wgsl.js#L85) — g를 곡선 앞 선형값에 곱함
  - [extension/content/itm.wgsl.js:81](../extension/content/itm.wgsl.js#L81) — 곡선 연장 구간 식
  - [sim/test_headroom.py:23](../sim/test_headroom.py#L23) — 게인 후 Y>1이면 P를 넘는다는 기록
  - [STATUS.md:112](../STATUS.md#L112) — M5 회신 유효 피크 2.0(실제 약 2.25)
  - [extension/popup/popup.js:38](../extension/popup/popup.js#L38) — 2.0 초과일 때만 경고
  - [tests/unit/extension-pure.test.js:955](../tests/unit/extension-pure.test.js#L955) — 현행 공식에 맞춘 기대값
- **제약·주의**: PLAN M5-1의 설계 문구를 바꾸는 일이므로 Opus가 결정합니다. popup은 tonecurve.js를 로드하지 않으므로 params.js가 곡선 함수를 직접 가져야 합니다. 이때 WGSL·JS·numpy 세 곳의 수식 일치 원칙(GUIDELINES 3-1)을 지킵니다. 진단 render.effectivePeak의 의미가 바뀌므로 과거 results JSON과 직접 비교하지 말라는 주석을 스키마나 parse-result에 남깁니다(schemaVersion 10 → 증가 여부는 Opus가 판단). extension-renderer.test.js의 g=1 케이스는 기대값이 그대로입니다.

### UX-04

**이름 있는 프리셋에서 상세 슬라이더를 건드리면 저장된 사용자 지정 곡선(현재 기본값)이 경고·되돌리기 없이 덮어써짐**  
P1 · high · 노력 M · popup · 오류 회복

- **문제**: 비교하려고 '정확'이나 '균형'을 고른 상태에서 상세 슬라이더를 하나라도 움직이거나 트랙을 클릭하면 문제가 생깁니다. custom 전체가 '그 프리셋 값 + 방금 바꾼 1개'로 바뀌어 즉시 저장됩니다. 사용자가 직접 맞춰 기본값으로까지 삼은 곡선(P2.0·k0.40·g1.22·s1.03·hs1.03)이 사라집니다. select도 '사용자 지정'으로 바뀌어 겉보기에는 '내 설정으로 돌아온' 것처럼 보이므로 손실을 알아채기 어렵습니다. 되살리려면 install.md의 숫자를 보며 슬라이더 6개를 0.01 단위로 손수 맞춰야 합니다.
- **권고**: popup.js bindDetail의 input 처리를 바꿉니다. cur.preset !== 'custom'인 상태의 첫 input이고, 기존 custom이 복사할 프리셋 값과 다르면 덮어쓰기 직전 값을 새 키 sdrhdr.customPrev(params.KEYS에 추가)에 저장합니다. 그리고 프리셋 select 아래에 '이전 사용자 지정 곡선을 「정확」 기준으로 대체했습니다 [되돌리기]'를 보여 줍니다. 되돌리기를 누르면 customPrev를 custom으로 되쓰고 preset을 'custom'으로 저장한 뒤 슬라이더를 다시 그립니다. 대안도 있습니다. 프리셋 상태에서는 상세 슬라이더 위에 '이 프리셋을 복사해 사용자 지정 시작(기존 대체)' 버튼을 두고, 그 버튼을 누른 뒤에만 편집을 허용하는 방식입니다.
- **근거**:
  - [extension/popup/popup.js:107](../extension/popup/popup.js#L107) — 현재 프리셋 곡선을 기준값으로 가져옴
  - [extension/popup/popup.js:109](../extension/popup/popup.js#L109) — custom 전체를 기준값 + 변경 1개로 덮어씀
  - [extension/popup/popup.js:102](../extension/popup/popup.js#L102) — custom을 즉시 storage에 저장
  - [extension/popup/popup.js:151](../extension/popup/popup.js#L151) — 프리셋 변경 시 preset만 저장(custom 보존)
  - [extension/content/params.js:12](../extension/content/params.js#L12) — 기본 사용자 지정 곡선
  - [PLAN.md:375](../PLAN.md#L375) — 처음 사용자 지정에 들어갈 때 직전 프리셋 값 복사
- **제약·주의**: 프리셋 값을 복사해 시작하는 동작은 PLAN M5-1(375행)의 설계입니다. 편집 전에 버튼을 거치게 하는 대안은 설계 변경이므로 Opus가 결정합니다. 백업 키 방식은 그 동작을 유지하지만, 새 키는 params.KEYS·SETTING_KEYS 정의를 거쳐야 합니다(GUIDELINES 3-5). 새 UI는 GUIDELINES 1-2에 따라 승인이 필요합니다. 사용자 지정 슬롯을 여러 개 두는 해법은 이전 계획에서 범위 밖으로 둔 항목입니다(PLAN M5-7 '프리셋 이름 변경·추가 저장').

### UX-05

**'선명 (밝기 중간 이상 권장)' 문구가 헤드룸 근거와 반대로 읽혀 화면 밝기 최대에서의 잘림을 유도함**  
P1 · medium · 노력 S · popup · 문구·용어

- **문제**: 헤드룸은 화면 밝기가 낮을수록 큽니다(최대 약 2, 중간 약 3, 낮음 약 4). 이 문구를 붙인 근거는 '선명은 피크 약 2.35라 밝기 최대에서 잘린다'인데, '중간 이상 권장'은 중간~최대를 권하는 뜻으로 읽힙니다. 기본 강도 43%에서 선명을 고르면 같은 popup에서 옵션 라벨은 밝기를 높이라 하고, 유효 피크 줄은 '밝기 최대에서 잘릴 수 있음'이라고 해 서로 반대되는 안내가 나옵니다. 라벨대로 하면 바로 잘립니다.
- **권고**: popup.html 34행 옵션을 '선명 (화면 밝기 중간 이하 권장)' 또는 '선명 (화면 밝기 최대에서는 하이라이트 잘림)'으로 바꿉니다. install.md 67행과 PLAN 419·439행 문구도 같은 의미로 맞춥니다. '밝기'가 macOS 화면 밝기라는 점을 명시해 상세 설정의 g와 구분합니다(UX-12와 같은 줄을 고침).
- **근거**:
  - [extension/popup/popup.html:34](../extension/popup/popup.html#L34) — 선명 옵션 문구
  - [PLAN.md:439](../PLAN.md#L439) — 문구 근거: 밝기 최대 헤드룸(약 2) 초과
  - [PLAN.md:163](../PLAN.md#L163) — 헤드룸 최대 약 2, 중간 약 3, 낮음 약 4
  - [docs/install.md:67](../docs/install.md#L67) — 같은 문구 반복
  - [extension/popup/popup.js:38](../extension/popup/popup.js#L38) — 같은 popup의 반대 방향 경고
  - [STATUS.md:99](../STATUS.md#L99) — 선명 문구 Opus 확인 요청으로 남음
- **제약·주의**: PLAN 문구는 Opus 문서 영역이므로, Opus가 의도(헤드룸 기준)를 확인한 뒤 개정합니다. 헤드룸은 JS에서 조회할 수 없어 고정 문구만 가능합니다. 저장 id 'vivid'와 프리셋 수치는 바꾸지 않습니다. 선명 프리셋 이름 자체의 변경은 UX-17에서 다룹니다.

### UX-06

**설정을 기본값으로 되돌리는 수단이 없고, install.md도 초기화 방법을 [확인 필요]로 남김**  
P1 · medium · 노력 S · popup · 오류 회복

- **문제**: 모든 슬라이더는 즉시 저장되고 취소·되돌리기가 없습니다. 기본값은 저장값이 없는 키에만 적용됩니다. 그래서 실험하다 결과가 이상해지면, 사용자가 고른 기본값(사용자 지정 곡선, 강도 43%, 채도 105%)으로 돌아가기 위해 슬라이더 9개를 손으로 다시 맞춰야 합니다. 기본값이 여러 번 바뀌어서, 체크리스트가 전제하는 '기본 설정' 상태를 만들 수도 없습니다(PLAN 396행의 기본값 확인 항목도 미검증). 결국 '처음 상태'로 돌아갈 길이 막혀 있습니다.
- **권고**: popup 일반 영역 끝('페이지 HUD 표시' 아래, '진단' 위)에 '기본값으로 되돌리기' 버튼을 둡니다. 누르면 버튼 글자가 '한 번 더 눌러 확인'으로 바뀌는 2단계 확인을 거칩니다. 확인 뒤 browser.storage.local.remove([preset, custom, strength, sharpness, saturation])를 호출하고, params.normalizeSettings로 cur와 화면을 init과 같은 경로로 다시 그립니다. enabled·mode·diag는 지우지 않습니다. 선택안은 두 가지입니다. 하나는 '상세 설정' 안에 '사용자 지정 곡선만 기본값으로'(params.DEFAULT_CUSTOM) 버튼을 두는 것이고, 다른 하나는 popup을 열 때 읽은 값으로 되돌리는 '열었을 때 값으로' 버튼입니다. install.md 103행은 이 버튼 안내로 바꿉니다.
- **근거**:
  - [docs/install.md:103](../docs/install.md#L103) — 설정 초기화 방법 [확인 필요]
  - [extension/content/params.js:45](../extension/content/params.js#L45) — DEFAULTS 정의(popup에서 쓰는 버튼 없음)
  - [extension/content/params.js:135](../extension/content/params.js#L135) — SETTING_KEYS(export되지 않음)
  - [extension/popup/popup.js:74](../extension/popup/popup.js#L74) — 슬라이더 값 즉시 저장
  - [PLAN.md:396](../PLAN.md#L396) — 기본값 확인 방법 [미확인]
- **제약·주의**: content script는 subscribe에서 설정 키가 바뀌면 다시 읽어 normalizeSettings로 정규화합니다. 그래서 키를 지워도 기본값이 반영될 것으로 보이며, 단위 테스트로 확인합니다. popup의 storage 쓰기·삭제는 GUIDELINES 2.1-5 안입니다. SETTING_KEYS export 또는 KEYS 기반 목록이 필요합니다(params 수정). 복원 범위(hud·mode 포함 여부)와 버튼 위치(일반·진단)는 Opus가 정합니다. mode를 포함하면 일반 영역 버튼이 진단 설정을 바꾸게 되어 2.6-3 해석이 필요합니다. 새 조작이므로 GUIDELINES 1-2에 따라 승인이 필요합니다. 값은 params.DEFAULTS만 참조하고 하드코딩하지 않습니다(3-5).

### UX-07

**'켜기'가 눈에 띄지 않는 작은 체크박스이고, 꺼진 상태에서도 나머지 조작이 정상처럼 보이며, 라벨이 무엇을 켜는지 말하지 않음**  
P1 · medium · 노력 S · popup · 상태 피드백 · 화면 확인 필요

- **문제**: 전체 켜기·끄기가 '페이지 HUD 표시'와 같은 크기의 체크박스로 맨 위에 놓여 있습니다. 끄면 storage에만 쓰고 UI는 바뀌지 않습니다. 프리셋·슬라이더·유효 피크·HUD 체크박스가 평소처럼 활성으로 보이고 움직여도 화면은 변하지 않습니다. 그래서 '반영이 안 된다'고 느끼거나 꺼 둔 사실을 잊기 쉽습니다. 꺼진 상태에서는 HUD도 붙지 않습니다. 진단 모드는 컨트롤을 잠그는데 꺼짐은 잠그지 않아, 두 '꺼짐' 상태의 표현도 다릅니다. 동사형 라벨 '켜기'는 상태보다 동작처럼 읽히고, 대상(HDR 변환)이 드러나지 않습니다.
- **권고**: (1) popup.html 맨 위를 헤더 행으로 바꾸고, 켜기를 오른쪽 정렬 스위치(`<input type="checkbox" switch>`)로 둡니다. 라벨은 'HDR 변환'으로 하고 상태 텍스트 '켜짐/꺼짐'을 붙입니다. (2) popup.js의 enabled change 핸들러와 init에서 `document.body.classList.toggle('off', !checked)`를 호출합니다. `.off .tuning{opacity:.5}`로 조정 영역을 흐리게 하고, '꺼짐: 값은 저장되지만 모든 YouTube 탭에서 원본 표시' 한 줄을 보여 줍니다. 미리 조정할 수 있도록 disabled로 잠그지는 않습니다. (3) install.md 66·146행과 체크리스트의 '켜기' 명칭을 같은 이름으로 맞춥니다.
- **근거**:
  - [extension/popup/popup.html:28](../extension/popup/popup.html#L28) — 켜기 체크박스
  - [extension/popup/popup.html:78](../extension/popup/popup.html#L78) — HUD 체크박스(같은 형식, 명사형 라벨)
  - [extension/popup/popup.js:141](../extension/popup/popup.js#L141) — 켜기 변경 시 저장만 함
  - [extension/popup/popup.js:120](../extension/popup/popup.js#L120) — 비활성은 mode에만 연결
  - [extension/content/main.js:431](../extension/content/main.js#L431) — 꺼지면 detach
  - [extension/content/main.js:306](../extension/content/main.js#L306) — HUD는 attach된 경우에만 생성
  - [docs/install.md:66](../docs/install.md#L66) — 켜기 설명
- **제약·주의**: 저장 키 sdrhdr.enabled와 content script 동작은 바꾸지 않습니다. 조정 영역 래퍼를 추가해도 install.md 51행·checklist 185행의 구성 순서 문구는 그대로입니다. 스위치 렌더링과 흐림 효과는 사용자가 Safari popup에서 확인합니다. 실제 탭의 반영 여부는 UX-02 상태 줄에 의존합니다.

### UX-08

**유효 피크 줄이 뜻과 안전 한계를 알려 주지 않고, 경고는 강조 없이 같은 줄에 붙어 줄바꿈되며 VoiceOver에도 알려지지 않음**  
P1 · medium · 노력 S · popup · 상태 피드백 · 화면 확인 필요 · 선행: UX-03, UX-12

- **문제**: '유효 피크 ×1.62'만으로는 무엇의 배율인지, 어디까지 안전한지(화면 밝기 최대 ×2, 중간 ×3, 낮음 ×4) 알 수 없습니다. 2.0 이하에서는 아무 안내가 없어서 사용자는 '경고 없음 = 어디서든 안전' 또는 '×2.3 = 늘 잘림'으로 이분법적으로 이해합니다. 2.0을 넘으면 경고가 같은 div 평문 뒤에 대시로 붙는데, 색이나 기호가 없어 숫자와 구분되지 않습니다. 이 문장이 320px을 넘어 두 줄이 되면 하이라이트 밝기를 드래그하는 동안 아래 상세 슬라이더가 위아래로 밀립니다. 이 줄은 피크를 결정하는 HDR 강도와도 떨어져 있습니다. aria-live가 없어 경고가 나타나거나 사라져도 VoiceOver는 알리지 않습니다.
- **권고**: (1) 유효 피크 줄을 HDR 강도 슬라이더 바로 아래로 옮깁니다. (2) `<span id="peak-value">`와 `<div id="peak-warn" class="warn" role="status">`로 나누고, 경고 줄에 min-height를 줍니다. (3) 표시를 '유효 피크 ×1.62 (SDR 흰색 대비)' 형식으로 하고, params.js의 고정 단계표 {최대≈2, 중간≈3, 낮음≈4}로 '화면 밝기 최대: 잘림 / 중간·낮음: 여유'를 보여 줍니다. 2 이하이면 '모든 화면 밝기에서 여유'를 표시합니다. (4) 경고는 라이트·다크 두 값을 가진 색 토큰과 '!' 기호로 강조하고, 2.0 경계를 넘거나 내려갈 때만 내용을 바꿉니다.
- **근거**:
  - [extension/popup/popup.html:50](../extension/popup/popup.html#L50) — 유효 피크 div 하나
  - [extension/popup/popup.js:37](../extension/popup/popup.js#L37) — '유효 피크 ×' 숫자만
  - [extension/popup/popup.js:38](../extension/popup/popup.js#L38) — 경고를 같은 문자열에 이어 붙임
  - [extension/popup/popup.js:7](../extension/popup/popup.js#L7) — 경고 기준 2.0(화면 밝기 최대 헤드룸)
  - [PLAN.md:377](../PLAN.md#L377) — 경고를 같은 줄에 표시하도록 정함
  - [PLAN.md:163](../PLAN.md#L163) — 헤드룸 단계별 수치
- **제약·주의**: PLAN M5-1(377행)은 '같은 줄'로 정했으므로 Opus 개정이 필요합니다. 헤드룸은 JS에서 조회할 수 없으므로(A17) 고정 단계표만 쓰고, '약'과 '화면 밝기 기준'임을 밝힙니다. 헤드룸 자동 추정은 이전 계획에서 범위 밖으로 둔 항목입니다(M5-7). tests/unit/extension-popup.test.js 82·99·144·150행 기대값을 갱신합니다. 순서를 바꾸면 install.md 51행과 checklist 185행도 고칩니다. 표시값이 정확하려면 UX-03이 먼저 필요하고, 경고 문구는 UX-12 용어와 함께 고칩니다.

### UX-09

**진단이 탭 구분 없는 단일 키라 popup이 어느 탭·어느 시점의 진단인지 알 수 없고, 다른 탭이 덮어씀**  
P1 · medium · 노력 S · 공통 · 상태 피드백

- **문제**: 모든 YouTube 탭이 가시성 조건 없이 2초 주기로 같은 키 sdrhdr.diag에 씁니다. 그래서 백그라운드 탭(예: 재생목록이 넘어가는 탭)의 진단이 측정 탭의 진단을 덮어씁니다. 측정 탭이 일시정지 상태라 내용이 변하지 않으면 다시 쓰지 않으므로, 다른 탭 값이 그대로 남습니다. 진단은 지워지지 않아 다른 사이트나 며칠 뒤에 popup을 열어도 예전 진단이 보입니다. 시각은 JSON 안 createdAt(UTC)에만 있고, '마지막 내용 변경' 시각이라 살아 있는 일시정지 탭도 오래된 것처럼 보입니다. 사용자는 다른 영상의 상태를 보고 판단하거나, 다른 영상의 JSON을 측정 결과로 저장합니다.
- **권고**: (1) main.js writeDiagIfChanged() 맨 앞에서 document.visibilityState !== 'visible'이면 return합니다. start()에는 visibilitychange 리스너를 두어, 탭이 다시 보이면 lastDiagKey를 비우고 즉시 1회 기록합니다. (2) popup.js showDiag에서 상태 줄(UX-02)과 진단 영역 위에 출처 줄 '마지막 변경 14:03:41(12초 전) · /watch?v=… · active'를 표시하고, 경과 시간을 1초마다 갱신합니다. state가 active이고 재생 중인데 10초 넘게 변경이 없으면 '오래된 진단일 수 있음: 해당 탭에서 재생 중인지 확인'을 흐리게 표시합니다. (3) 2단계로 popup이 tabs.query + tabs.sendMessage로 활성 탭에 직접 묻는 방식을 둡니다(가이드 개정 필요).
- **근거**:
  - [extension/content/params.js:165](../extension/content/params.js#L165) — 단일 키에 최신값 덮어쓰기
  - [extension/content/main.js:547](../extension/content/main.js#L547) — writeDiagIfChanged(가시성 조건 없음)
  - [extension/content/main.js:550](../extension/content/main.js#L550) — createdAt을 빼고 내용 비교
  - [extension/content/main.js:568](../extension/content/main.js#L568) — 주기 기록 setInterval
  - [extension/popup/popup.js:162](../extension/popup/popup.js#L162) — 변경 즉시 popup 갱신
  - [GUIDELINES.md:58](../GUIDELINES.md#L58) — 진단은 최신 1개만 유지
  - [extension/content/hud.js:297](../extension/content/hud.js#L297) — page.url은 정제된 값
- **제약·주의**: GUIDELINES 2.6-2(최신 1개 유지)를 지키려면 탭별 키 대신 가시성 조건 방식을 씁니다. 창 두 개에 YouTube가 동시에 보이면 막지 못합니다. page.url은 경로와 v만 담으므로 표시가 허용됩니다(2.6-1). 2단계는 GUIDELINES 2.1-5 개정과 tabs/activeTab 권한이 필요하며, Safari에서의 동작은 [확인 필요]입니다. 수명주기는 건드리지 않습니다.

### UX-10

**noGpu·blackFrame에서 회복하는 방법(다른 영상 이동, 켜기 껐다 켜기, 새로고침)이 문서와 화면 어디에도 없고, 모든 렌더 오류가 'WebGPU 없음'으로 안내됨**  
P1 · medium · 노력 S · 공통 · 오류 회복

- **문제**: device.lost(잠자기 복귀 등), 셰이더 오류, 렌더 예외, init 실패가 모두 skipped('noGpu')가 됩니다. install.md는 이를 'WebGPU를 쓸 수 없음 → Safari·OS·WebGPU 설정 확인'으로 안내해 엉뚱한 조치로 이끕니다. 코드에는 이미 회복 경로가 있습니다. 켜기를 껐다 켜면 failVideos가 초기화되고, blackFrame은 srcChange로 풀립니다. 그런데 blackFrame 조치는 '[확인 필요: 재시도 방법]'으로 남아 있습니다. 재생 중 오류로 캔버스가 사라지면 사용자는 새로고침이나 Safari 재시작 같은 더 큰 조치를 하거나 포기합니다.
- **권고**: (1) install.md 144행 blackFrame 조치를 '다른 영상으로 이동하거나, popup에서 켜기를 껐다 켜거나, 새로고침하면 다시 판정(코드 기준, 기기 미확인)'으로 고칩니다. 145행 noGpu는 '렌더러 오류(WebGPU 없음·device lost·셰이더 오류 등): 진단 errors의 name 확인 → 켜기 껐다 켜기 또는 새로고침, 반복되면 Safari 재시작'으로 고칩니다. (2) 같은 재시도 문구를 popup 상태 줄(UX-02)과 HUD(UX-13)에서도 씁니다. (3) 선택안: 전용 키 sdrhdr.retry(타임스탬프)로 '다시 시도' 버튼을 둡니다. enabled를 false로 썼다가 바로 true로 쓰는 방식은 subscribe가 다시 읽을 때 두 번 모두 true를 읽어 토글이 누락될 수 있으므로 쓰지 않습니다. skipReason을 'renderError'로 바꾸는 것과 device.lost에서 1회 자동 재attach하는 것은 Opus 선택지로 둡니다.
- **근거**:
  - [docs/install.md:144](../docs/install.md#L144) — blackFrame 조치 [확인 필요: 재시도 방법]
  - [docs/install.md:145](../docs/install.md#L145) — noGpu를 'WebGPU를 쓸 수 없음'으로만 설명
  - [extension/content/detect.js:226](../extension/content/detect.js#L226) — 렌더 오류는 모두 skipped(noGpu)
  - [extension/content/main.js:14](../extension/content/main.js#L14) — failVideos는 설정 토글 전까지 재attach 안 함
  - [extension/content/main.js:440](../extension/content/main.js#L440) — 켜기 토글 시 failVideos 초기화
  - [extension/content/detect.js:208](../extension/content/detect.js#L208) — blackFrame은 srcChange로 풀림
  - [STATUS.md:50](../STATUS.md#L50) — 렌더 오류는 noGpu로 처리하고 원인은 errors[]에 기록
  - [extension/content/params.js:157](../extension/content/params.js#L157) — subscribe가 변경마다 설정을 다시 읽음
- **제약·주의**: DRM은 요소 단위 영구 no-op이므로 재시도 대상과 문구에서 뺍니다(GUIDELINES 2.4-2, CLAUDE.md). 재시도 키를 추가하면 params.KEYS·SETTING_KEYS·테스트를 바꿔야 하고 Opus 계획이 필요합니다(GUIDELINES 1-2). skipReason 개명은 진단 스키마·parse-result 변경입니다. 자동 재시도에는 횟수 상한이 필요합니다(2.5-4). 실제로 회복되는지는 사용자 Mac에서 확인합니다. 문서 수정만으로도 효과의 상당 부분을 얻습니다.

### UX-11

**체크리스트 M3·M4a·M4 전제가 make-xcode.sh 재실행을 지시해 스크립트가 오류로 멈추고, 문서끼리 서로 어긋남**  
P1 · medium · 노력 S · 문서 · 오류 회복

- **문제**: STATUS 다음 단계는 사용자에게 M3 절 재수집을 요청합니다. 그런데 그 절의 전제는 `git pull → scripts/make-xcode.sh → Xcode Run`입니다. xcode/는 이미 커밋돼 있어 make-xcode.sh가 '직접 삭제한 뒤 다시 실행하세요' 오류로 멈춥니다. install.md 42행은 다시 실행하지 말라고 하므로 사용자는 어느 문서가 맞는지 스스로 판단해야 합니다. 오류 문구대로 xcode/를 지우면 프로젝트가 재생성되고 서명 팀도 다시 지정해야 합니다. M4 절 167행은 옛 기본값(균형·45%·100%)을 '새 기본값'으로 적고 있습니다.
- **권고**: manual-checklist.md 127·151·167행의 전제를 install.md 4장과 같게 바꿉니다: 'git pull → Xcode Run → Safari 완전 종료(⌘Q) 후 재시작 → 서명되지 않은 확장 허용 확인'. 문서 맨 위에 '공통 전제: docs/install.md 4장'을 한 번만 두고 각 절에서는 참조만 합니다. 167행 기본값은 '(M4 당시 기본값)'으로 표시합니다. M3 DOM 스냅샷 하위 절에는 'Xcode 작업 불필요'를 적습니다. make-xcode.sh 14행 오류 뒤에는 '코드 업데이트에는 재생성이 필요 없습니다(docs/install.md 4장)' 한 줄을 더 출력합니다.
- **근거**:
  - [docs/manual-checklist.md:127](../docs/manual-checklist.md#L127) — M3 전제에 make-xcode.sh
  - [docs/manual-checklist.md:151](../docs/manual-checklist.md#L151) — M4a 전제 동일
  - [docs/manual-checklist.md:167](../docs/manual-checklist.md#L167) — 옛 기본값을 '새 기본값'으로 표기
  - [scripts/make-xcode.sh:14](../scripts/make-xcode.sh#L14) — xcode/가 있으면 오류로 중단
  - [docs/install.md:42](../docs/install.md#L42) — make-xcode.sh를 다시 실행하지 않는다
  - [STATUS.md:135](../STATUS.md#L135) — M3 절 재수집이 다음 단계
- **제약·주의**: 바꾸는 것은 문서와 스크립트 출력 문구뿐이고, 덮어쓰지 않는 스크립트 동작은 유지합니다. 과거 회신 기록(results/, STATUS.md)은 수정하지 않습니다. pbxproj는 건드리지 않습니다(GUIDELINES 7-5).

### UX-12

**'밝기'가 상세 슬라이더 g와 macOS 화면 밝기를 동시에 가리켜 경고를 잘못 읽게 됨**  
P2 · medium · 노력 M · 공통 · 문구·용어

- **문제**: 유효 피크는 g('밝기' 슬라이더)에 비례하므로, '밝기'를 올려 피크가 2.0을 넘으면 '밝기 최대에서 하이라이트가 잘릴 수 있음'이 뜹니다. 사용자는 이를 방금 올린 '밝기' 슬라이더의 최대로 읽기 쉽지만, 실제 뜻은 macOS 화면 밝기입니다. 그래서 '화면 밝기를 낮춰 헤드룸 확보'라는 올바른 대처를 놓칩니다. install.md와 체크리스트도 한 문서 안에서 두 의미를 섞어 씁니다.
- **권고**: popup.html 66행 g 라벨을 '전체 밝기(게인, g)'로 바꾸고, 다른 상세 라벨에도 진단 render.custom과 같은 키를 괄호로 붙입니다(하이라이트 밝기(P) 등). 시스템 밝기는 모든 표면에서 '화면 밝기'로 씁니다. popup.js 38행 경고는 '화면 밝기 최대에서 하이라이트가 잘릴 수 있음(화면 밝기를 낮추거나 강도를 줄이세요)'로 바꿉니다. install.md 13·67·75·86·149행과 체크리스트 M4·M5 절도 같은 용어로 맞춥니다.
- **근거**:
  - [extension/popup/popup.html:66](../extension/popup/popup.html#L66) — 상세 슬라이더 이름 '밝기'(g)
  - [extension/popup/popup.js:38](../extension/popup/popup.js#L38) — '밝기 최대' 경고(화면 밝기 의미)
  - [PLAN.md:142](../PLAN.md#L142) — g는 밝기 게인
  - [docs/install.md:71](../docs/install.md#L71) — 공식에서 '밝기'=g
  - [docs/install.md:149](../docs/install.md#L149) — 같은 문서에서 '밝기'=화면 밝기
  - [docs/manual-checklist.md:183](../docs/manual-checklist.md#L183) — '밝기 1.22'(g)
- **제약·주의**: PLAN M5-1(373·377행)의 명칭이 근거이므로 Opus 개정이 함께 필요합니다. tests/unit/extension-popup.test.js 99·144·150행의 경고 문자열 기대값을 수정합니다. 저장 키와 진단 스키마는 바꾸지 않습니다. UX-05와 UX-08 문구를 함께 고칩니다.

### UX-13

**HUD가 attach에 묶여 있어 DRM·렌더 오류·셀렉터 실패·꺼짐일 때 사라지고, 가이드라인의 'HUD에 사유 기록' 요구와 어긋남**  
P2 · medium · 노력 M · HUD · 상태 피드백

- **문제**: HUD는 attach할 때 만들어지고 detach의 cleanup에서 함께 지워지며, tickHud는 cur가 없으면 아무것도 하지 않습니다. hdrSource·pip·blackFrame은 suspend라 HUD에 'skipped(...)'로 남습니다. 반면 설명이 가장 필요한 DRM(markDrm→detach, attach 전 판정이면 생성조차 안 됨), 렌더 오류(onRenderError→detach), 메인 video 탐색 실패, 꺼짐에서는 HUD를 켜 둔 사용자도 페이지에서 아무것도 보지 못합니다. 그래서 '미주입'·'HUD 토글 고장'·'의도된 no-op'을 구분하려면 진단 JSON을 열어야 합니다. 체크리스트 10·11행은 HUD에 없는 'drm:true'를 확인하라고 합니다.
- **권고**: main.js에서 HUD 수명을 attach와 분리합니다. HUD 객체를 a.hud가 아닌 모듈 변수로 옮기고, settings.hud가 켜져 있으며 detect.findMainVideo가 container를 돌려주면 cur가 없어도 그 container 옆에 유지합니다. video나 container가 바뀔 때만 다시 만듭니다. tickHud는 !cur일 때 lc와 마지막 errors 항목으로 한 줄을 만듭니다. 예: 'DRM 영상: 변환하지 않음(새로고침 전까지)', '렌더 오류(name)로 중단 · popup에서 끄고 켜면 재시도', '플레이어 video를 찾지 못함', '꺼짐'. #movie_player 자체를 찾지 못하는 경우는 popup 상태 줄(UX-02)이 대신 알립니다.
- **근거**:
  - [extension/content/main.js:306](../extension/content/main.js#L306) — HUD는 attach 시에만 생성
  - [extension/content/main.js:116](../extension/content/main.js#L116) — cleanup에 HUD 제거 등록
  - [extension/content/main.js:117](../extension/content/main.js#L117) — detach 시 HUD 제거
  - [extension/content/main.js:163](../extension/content/main.js#L163) — DRM 판정 시 detach
  - [extension/content/main.js:179](../extension/content/main.js#L179) — 렌더 오류 시 detach
  - [extension/content/main.js:156](../extension/content/main.js#L156) — cur 없으면 tickHud 종료
  - [GUIDELINES.md:38](../GUIDELINES.md#L38) — 셀렉터 실패 사유를 HUD에 남김
  - [GUIDELINES.md:52](../GUIDELINES.md#L52) — GPU 오류는 HUD에 기록
  - [docs/manual-checklist.md:11](../docs/manual-checklist.md#L11) — HUD 'drm:true' 확인 지시
- **제약·주의**: 요소 조회는 detect.findPlayer/findMainVideo로만 합니다(GUIDELINES 2.3-1). pointer-events:none과 DOM 순서를 유지하고 z-index는 지정하지 않습니다(2.3-3). DRM 페이지에 텍스트 DOM을 추가하는 것이 '감지 즉시 no-op'(CLAUDE.md, GUIDELINES 1-1)에 어긋나는지는 Opus가 확인합니다. video 픽셀이나 GPU에는 접근하지 않습니다. HUD 문구에 URL·제목을 넣지 않습니다(2.6-1). background와 메시징은 필요 없습니다.

### UX-14

**DRM 영상을 한 번 보면 같은 탭의 이후 일반 영상도 표시 없이 원본으로 재생되고, 회복 방법(새로고침)이 보이지 않음**  
P2 · medium · 노력 M · 공통 · 오류 회복 · 선행: UX-02, UX-13

- **문제**: YouTube는 SPA 이동 때 같은 video 요소를 다시 쓰므로, DRM 판정을 받은 요소에서는 이후 일반 SDR 영상도 attachTo와 ensureTarget에서 바로 return합니다. 오버레이도 HUD도 생기지 않습니다. '켜기'를 껐다 켜도 disable 전이가 drm을 유지하므로 풀리지 않습니다. 회복 방법은 install.md 표에만 있고, 그 조치 칸도 '조치 없음'처럼 읽힙니다. 사용자는 이 영상만 HDR이 안 되는 이유를 모른 채 설정을 만지거나 버그로 오해합니다.
- **권고**: (1) 바로 할 수 있는 것: install.md 141행 drm 행의 조치를 '정상 동작. 이후 일반 영상을 변환하려면 탭 새로고침(⌘R)'으로 바꿉니다. (2) popup 상태 줄(UX-02)과 플레이어 기준 HUD(UX-13)에서 skipReason이 drm이면 문구를 표시합니다. 읽기 전용 checkDrm(video, false)로 현재 소스의 DRM 신호를 다시 읽어 둘로 나눕니다. 신호가 있으면 'DRM 영상: 변환하지 않음', 없으면 '이전 DRM 영상 때문에 이 탭에서는 변환 중지 · 새로고침하면 다시 동작'입니다. 자동 새로고침이나 판정 해제는 하지 않습니다.
- **근거**:
  - [extension/content/main.js:13](../extension/content/main.js#L13) — DRM 판정 video는 요소 단위 영구 no-op
  - [extension/content/main.js:322](../extension/content/main.js#L322) — attachTo에서 drmVideos면 return
  - [extension/content/main.js:382](../extension/content/main.js#L382) — ensureTarget에서도 drm 유지
  - [extension/content/detect.js:236](../extension/content/detect.js#L236) — disable 전이에서 drm 유지
  - [docs/install.md:141](../docs/install.md#L141) — 같은 탭 이후 영상에도 유지, 새로고침하면 해제
  - [GUIDELINES.md:44](../GUIDELINES.md#L44) — 판정 해제 로직 금지
- **제약·주의**: 판정 해제나 재attach 로직은 만들지 않습니다(GUIDELINES 2.4-2/2.4-4, CLAUDE.md). 표시는 텍스트뿐이고 video 픽셀과 GPU는 건드리지 않습니다. mediaKeys 확인은 감지일 뿐 회피가 아닙니다. YouTube가 다음 영상에서 mediaKeys를 null로 되돌리는지는 [미확인]이라, 문구 분기는 사용자 Mac에서 확인해야 합니다. HUD가 꺼져 있을 때 표시할지는 Opus가 정합니다(GUIDELINES 1-2).

### UX-15

**진단 모드(baseline·identity·stripes)나 일시정지 중에도 HUD가 'active'와 프리셋·강도를 그대로 보여 정상 동작처럼 알림**  
P2 · medium · 노력 S · HUD · 상태 피드백 · 화면 확인 필요

- **문제**: baseline·stripes는 attach 직후 'decided'로 active가 되고, hudInfo에는 mode가 없습니다. 그래서 baseline에서 HUD 1줄은 'active 경로 -', 2줄은 적용되지도 않는 프리셋·강도·유효 피크입니다. identity도 강도·채도 유니폼을 쓰지 않는데 그 값이 나옵니다. 일시정지하면 렌더 루프는 멈추지만 링 버퍼가 남아 fps·누락%가 정지 직전 값으로 계속 보입니다. M6처럼 HUD 수치를 받아 적는 단계에서 사용자는 어느 모드·상태의 수치인지 알 수 없고, 진단 모드를 켠 채 잊었을 때 HUD는 오히려 '정상'이라고 알립니다.
- **권고**: main.js hudInfo()에 mode(settings.mode)와 paused(a.video.paused)를 추가합니다. hud.js hudLines의 1줄은 mode가 itm이 아니면 앞에 '[진단 모드 baseline: 변환 안 함]'을 붙입니다(identity는 '색 변환만', stripes는 '테스트 패턴'). 2·3줄에는 '(미적용)'을 붙입니다. paused이면 4줄 앞에 '일시정지: 정지 직전 값'을 붙입니다. 5줄 구성은 유지하고, install.md 107~113행과 체크리스트 M5 6번 설명도 고칩니다.
- **근거**:
  - [extension/content/main.js:11](../extension/content/main.js#L11) — NO_PROBE_MODES stripes·baseline
  - [extension/content/main.js:308](../extension/content/main.js#L308) — 진단 모드는 곧바로 decided
  - [extension/content/main.js:139](../extension/content/main.js#L139) — hudInfo는 state만 전달(mode 없음)
  - [extension/content/renderer.js:111](../extension/content/renderer.js#L111) — baseline은 캔버스를 표시하지 않음
  - [extension/content/hud.js:405](../extension/content/hud.js#L405) — HUD 1줄은 상태와 경로뿐
  - [extension/content/renderer.js:396](../extension/content/renderer.js#L396) — 일시정지 중에는 렌더하지 않음
  - [docs/manual-checklist.md:206](../docs/manual-checklist.md#L206) — HUD fps를 itm·baseline에서 각각 기록
- **제약·주의**: GUIDELINES 2.6-3은 페이지 HUD를 규칙 대상에서 제외하므로 HUD에 모드 이름을 표시하는 것은 허용됩니다. 표시할지는 Opus가 확인합니다. URL·제목은 넣지 않습니다. hudLines 단위·DOM 테스트 기대값을 갱신합니다. 우선순위 조정 근거: medium·S이지만 HUD가 기본 꺼짐이고, popup 쪽(UX-01)이 주 경로라 P2로 둡니다.

### UX-16

**HDR 강도 0%가 '끄기'가 아니라는 점과, 강도·하이라이트 밝기·밝기 세 손잡이의 역할 차이가 popup에 없음**  
P2 · medium · 노력 M · popup · 문구·용어 · 선행: UX-12

- **문제**: 강도 0%에서도 오버레이는 709→P3 색 변환, 채도(기본 105%), 선명도를 계속 적용합니다. 그래서 강도를 0%로 내려 '원본'과 비교하는 사용자는 채도가 높아진 화면을 원본으로 착각합니다. 강도 0%에서는 상세 슬라이더를 움직여도 화면과 유효 피크(×1.00)가 변하지 않아 고장처럼 보입니다. 또 강도(혼합 비율), 하이라이트 밝기 P(흰색 배율), 밝기 g(곡선 전 게인으로 중간톤까지 밝힘)가 모두 밝기를 바꾸는데 설명이 없습니다. 그래서 '하이라이트만 밝게' 하려다 g를 올려 피부톤까지 밝아집니다.
- **권고**: popup.html 라벨 아래에 회색 한 줄 설명(small, aria-describedby)을 붙입니다. HDR 강도: '0% = 밝기 변환 없음(색 변환·채도·선명도는 적용). 완전히 끄려면 켜기 해제'. 하이라이트 밝기: '가장 밝은 흰색의 배율(강도 100%일 때)'. 밝기(g): '변환 전 전체 밝기. 중간톤과 하이라이트가 함께 오름'. popup.js showPeak에서 강도가 0이면 상세 설정 summary 옆과 유효 피크 줄에 '강도 0%: 곡선 값 미반영'을 표시합니다.
- **근거**:
  - [extension/content/params.js:39](../extension/content/params.js#L39) — 강도 0 = 색 변환만
  - [extension/content/itm.wgsl.js:150](../extension/content/itm.wgsl.js#L150) — 강도와 무관하게 itm_mix 출력
  - [extension/content/itm.wgsl.js:105](../extension/content/itm.wgsl.js#L105) — 강도는 원본과 ITM의 혼합 비율
  - [extension/popup/popup.html:39](../extension/popup/popup.html#L39) — HDR 강도 라벨
  - [extension/popup/popup.html:54](../extension/popup/popup.html#L54) — 하이라이트 밝기 라벨
  - [PLAN.md:372](../PLAN.md#L372) — 겹침을 유효 피크 표시로 해결하기로 함
  - [docs/install.md:68](../docs/install.md#L68) — 0% 의미는 문서에만 있음
- **제약·주의**: 셰이더 동작(PLAN M4a-5 해석 승인 ①)은 바꾸지 않고 표시 문구만 바꿉니다. 명칭 변경은 PLAN M5-1 사항이라 Opus 확인이 필요합니다(g 이름은 UX-12와 함께). 설명은 셰이더와 일치해야 합니다(g는 idLin에 적용하지 않음). 하이라이트 밝기의 배율 설명은 g=1일 때만 정확합니다(UX-03). popup 폭 320px에서 줄 수가 늘어나는 것은 사용자가 확인합니다.

### UX-17

**프리셋 '선명', 슬라이더 '선명도', HUD의 '선명'이 서로 다른 기능을 같은 말로 부름**  
P2 · medium · 노력 M · 공통 · 문구·용어

- **문제**: 선명 프리셋(vivid)은 피크 ×4와 곡선 채도 1.2로 '밝고 진하게' 만드는 프리셋이고, 언샤프 마스크인 선명도와는 무관합니다. 그런데 이름이 거의 같아 서로 연동된다고 오해하기 쉽습니다. HUD는 선명도를 '선명'으로 줄여 쓰므로 vivid일 때 2줄이 '선명 강도 43% 선명 0% 채도 105%'가 되어 같은 단어가 두 번 다른 뜻으로 나옵니다. 기본 프리셋 custom에서는 '사용자 지정 강도 43%'로 시작해 '사용자가 지정한 강도'로 읽힙니다.
- **권고**: vivid 표시명을 선명도와 겹치지 않는 단어('강조'·'화사'·'생생' 중 사용자 선택)로 바꿉니다. 바꿀 곳은 popup.html 34행 option, hud.js PRESET_LABELS 386행, install.md 6장 표, 체크리스트 M4·M5 절입니다. HUD 409행 라벨은 popup과 같은 '선명도'로 바꾸고, 2줄을 '프리셋 사용자 지정 · 강도 43% · 선명도 0% · 채도 105%'처럼 프리셋 라벨과 구분자를 넣어 나눕니다. 최소 변경안은 HUD 라벨만 '선명도'로 바꾸는 것입니다.
- **근거**:
  - [extension/popup/popup.html:34](../extension/popup/popup.html#L34) — 프리셋 '선명'
  - [extension/popup/popup.html:43](../extension/popup/popup.html#L43) — 슬라이더 '선명도'
  - [extension/content/hud.js:386](../extension/content/hud.js#L386) — PRESET_LABELS vivid '선명'
  - [extension/content/hud.js:409](../extension/content/hud.js#L409) — HUD에서 선명도를 '선명'으로 표기
  - [extension/content/params.js:7](../extension/content/params.js#L7) — vivid는 P4·s1.2(선명화와 무관)
  - [tests/unit/extension-hud-page.test.js:40](../tests/unit/extension-hud-page.test.js#L40) — HUD 2줄 기대 문자열
- **제약·주의**: 저장 id 'vivid'와 진단 render.preset 값은 그대로 두어 스키마·저장값 호환을 유지합니다. 표시명 변경이 PLAN M5-7의 '프리셋 이름 변경'(이전 계획에서 범위 밖으로 둔 사용자 편집 기능)에 해당하는지와 PLAN C절 명칭 개정은 Opus가 판단합니다. tests/unit/extension-hud-page.test.js 기대값을 수정합니다. UX-05와 같은 option 줄을 고칩니다.

### UX-18

**슬라이더가 라벨 뒤 기본 폭으로 붙어 짧고 시작 위치가 들쭉날쭉하며, 값 자릿수가 바뀌면 드래그 중 트랙이 밀림**  
P2 · medium · 노력 S · popup · 시각 디자인 · 화면 확인 필요

- **문제**: label은 display:block뿐이고 range 폭 지정이 없어, 각 슬라이더가 '라벨 + 값' 뒤에 브라우저 기본 폭으로 붙습니다. 라벨 길이('밝기'와 '하이라이트 채도')에 따라 트랙 시작점이 다르고 320px 중 일부만 써서 미세 조정이 어렵습니다. 강도 9↔10%, 99↔100%나 채도 99↔100%처럼 값 텍스트 자릿수가 바뀌면 트랙이 오른쪽으로 밀려 드래그 중에 값이 튈 수 있습니다.
- **권고**: popup.html 스타일에서 슬라이더 label을 2행 그리드로 바꿉니다: `label.sl{display:grid;grid-template-columns:1fr auto;row-gap:2px}`, `label.sl input[type=range]{grid-column:1/-1;width:100%}`. 값 span에는 `font-variant-numeric:tabular-nums;text-align:right`를 줍니다. 1행은 '이름 … 값', 2행은 전체 폭 트랙이 됩니다.
- **근거**:
  - [extension/popup/popup.html:15](../extension/popup/popup.html#L15) — label display:block만 지정
  - [extension/popup/popup.html:39](../extension/popup/popup.html#L39) — 라벨 텍스트와 값 span이 트랙 앞에 위치
  - [extension/popup/popup.html:40](../extension/popup/popup.html#L40) — range 폭 미지정
  - [extension/popup/popup.js:77](../extension/popup/popup.js#L77) — 값 텍스트 자릿수가 변함
- **제약·주의**: CSS와 마크업 클래스만 바꾸고 popup.js 로직과 저장값은 그대로입니다. 단위 테스트는 id로 요소를 찾으므로 영향이 없습니다. 실제 Safari popup 렌더는 사용자가 확인합니다. 우선순위 조정 근거: 상태 오해가 아니라 조작 불편이므로 P2입니다.

### UX-19

**진단 '복사' 버튼이 성공·실패를 알리지 않고 실패를 조용히 무시해, 이전 클립보드 내용을 회신할 수 있음**  
P2 · medium · 노력 S · 진단 · 상태 피드백

- **문제**: 체크리스트 대부분이 '복사'를 기본 회신 경로로 쓰는데, 누른 뒤 텍스트 선택 말고는 아무 표시가 없습니다. navigator.clipboard가 없거나 writeText가 거부되면 catch가 조용히 삼킵니다. 그러면 사용자는 직전 측정의 JSON을 붙여 넣어 잘못된 results 파일을 만들 수 있습니다. 같은 줄의 '복사'(버튼)와 'JSON 저장'(밑줄 링크)은 모양도 다릅니다.
- **권고**: popup.js copy 핸들러를 바꿉니다. writeText가 성공하면 버튼 옆 `<span id="copy-status" role="status">`(또는 버튼 텍스트)를 1.5~2초 동안 '복사됨 (14:03:41 진단)'으로 바꿔, createdAt 기준으로 어느 진단을 복사했는지 보여 줍니다. API가 없거나 실패하면 선택 상태에서 document.execCommand('copy')를 한 번 더 시도하고, 그래도 실패하면 '자동 복사 실패: 텍스트가 선택되어 있으니 ⌘C를 누르세요'를 표시합니다.
- **근거**:
  - [extension/popup/popup.html:94](../extension/popup/popup.html#L94) — 복사 버튼
  - [extension/popup/popup.js:158](../extension/popup/popup.js#L158) — textarea 선택
  - [extension/popup/popup.js:159](../extension/popup/popup.js#L159) — writeText 실패를 catch로 무시
  - [docs/manual-checklist.md:62](../docs/manual-checklist.md#L62) — 복사를 기본 회신 경로로 안내
  - [docs/install.md:121](../docs/install.md#L121) — 복사 버튼 안내
- **제약·주의**: 상태 문구는 진단 영역 안에만 둡니다(GUIDELINES 2.6-3). Safari popup에서 clipboard API와 execCommand가 실제로 동작하는지는 사용자 Mac에서 확인하고, Claude가 검증했다고 쓰지 않습니다. 우선순위 조정 근거: M2~M5 회신 JSON이 실제로 복사 경로로 제출되어 평소에는 동작하므로 P2입니다.

### UX-20

**입력 경로 판정을 포기(60회 보류)해도 상태가 계속 'probing·경로 pending'으로 보여 사용자가 계속 기다림**  
P2 · medium · 노력 M · 공통 · 상태 피드백

- **문제**: 기준 경로(c2d) 밝기가 계속 낮으면 choosePath가 'pending'을 냅니다. 이것이 60회(약 1분 이상) 쌓이면 렌더러는 그 소스에서 판정을 멈추고 캔버스를 숨긴 채 원본만 보여 줍니다. main.js는 errors에 PathUndecided만 남기고 lifecycle을 바꾸지 않으므로, HUD와 진단은 계속 'probing 경로 pending'입니다. 사용자는 곧 변환이 시작될 거라 믿고 기다립니다. 다른 영상으로 이동하거나 켜기를 껐다 켜면 다시 시도된다는 것도 알 수 없습니다. 어두운 장면으로 길게 시작하는 영상은 끝까지 원본으로 나옵니다.
- **권고**: 방안 B(스키마 변경 없음): renderer getStats에 undecided를 노출하고 main.js hudInfo에 넘깁니다. HUD와 popup 상태 줄에 '입력 경로를 찾지 못해 원본 표시 중: 다른 영상으로 이동하거나 켜기를 껐다 켜서 재시도'를 표시합니다. 방안 A(정식): detect.nextLifecycle에 'undecided' 이벤트를 추가해 skipped('undecided')로 바꾸고, srcChange로 풀리게 합니다(blackFrame과 같은 소스 단위). install.md 문제 해결 표에도 한 줄을 추가합니다.
- **근거**:
  - [extension/content/renderer.js:16](../extension/content/renderer.js#L16) — PENDING_MAX 60
  - [extension/content/renderer.js:632](../extension/content/renderer.js#L632) — 상한 도달 시 undecided
  - [extension/content/renderer.js:669](../extension/content/renderer.js#L669) — undecided면 더 측정하지 않음
  - [extension/content/main.js:300](../extension/content/main.js#L300) — PathUndecided 오류만 기록
  - [extension/content/detect.js:76](../extension/content/detect.js#L76) — c2d가 어두우면 pending
  - [extension/content/hud.js:405](../extension/content/hud.js#L405) — HUD 1줄 상태·경로
- **제약·주의**: 방안 A는 PLAN D-M3 M3-1 상태표, 진단 스키마(skipReason 값), result-schema, parse-result, 테스트를 바꾸므로 Opus 결정과 schemaVersion 증가가 필요합니다. 방안 B는 상태표를 바꾸지 않습니다. GUIDELINES 2.4-3(스킵은 detach 방향으로만)을 유지합니다.

### UX-21

**일시정지 상태에서 전체화면·극장·창 크기를 바꾸면 캔버스를 다시 그리지 않아 검은 화면이 멈춘 프레임을 가릴 수 있음**  
P2 · medium · 노력 M · 페이지 · 오류 회복 · 화면 확인 필요

- **문제**: 캔버스 백킹 크기는 표시 크기에 따라 바뀌고, overlay.update()는 width/height만 다시 대입할 뿐 렌더러에 알리지 않습니다. 렌더러가 1회 렌더(kick)하는 계기는 play·seeked·visibilitychange·setMode·setParams·경로 결정뿐입니다. WebGPU 캔버스는 크기를 대입하면 drawing buffer가 새로 만들어지고, alphaMode 기본값이 opaque라 빈 버퍼가 검게 보일 가능성이 높습니다. 그래서 '일시정지 → f 키 전체화면' 같은 흔한 조작 뒤에 재생을 다시 시작할 때까지 검은 캔버스가 보일 수 있습니다. STATUS M3 회신은 일시정지 상태를 따로 확인하지 않았습니다.
- **권고**: renderer에 kick()을 감싼 redraw()를 공개합니다. createOverlay(container, video, { onResize })로 백킹 크기가 바뀌었을 때 콜백을 부르게 하고, main.js attach에서 renderer.redraw()에 연결합니다. 경로 미결정이나 suspend 상태에서는 redraw가 아무것도 하지 않게 합니다. 체크리스트 M3 절에 '일시정지 상태에서 전체화면·극장 전환 후 프레임 유지' 항목을 추가합니다.
- **근거**:
  - [extension/content/overlay.js:38](../extension/content/overlay.js#L38) — 크기가 다르면 백킹 크기 재대입
  - [extension/content/overlay.js:39](../extension/content/overlay.js#L39) — canvas.width 대입
  - [extension/content/overlay.js:61](../extension/content/overlay.js#L61) — fullscreenchange에서 schedule
  - [extension/content/renderer.js:162](../extension/content/renderer.js#L162) — configure에 alphaMode 미지정
  - [extension/content/renderer.js:396](../extension/content/renderer.js#L396) — 일시정지 중에는 kick하지 않음
  - [extension/content/main.js:261](../extension/content/main.js#L261) — overlay.update 호출
- **제약·주의**: Safari 27.2에서 실제로 검게 보이는지는 사용자 Mac에서 확인합니다(Claude가 검증했다고 쓰지 않음). 렌더 루프 규칙(GUIDELINES 2.5-2, 일시정지 시 1회 렌더)과 맞는 변경입니다. overlay.js, renderer.js, main.js 세 파일을 수정합니다.

### UX-22

**원본과 빠르게 비교(A/B)하거나 켜고 끄는 수단이 popup뿐이라 느리고, 다른 탭까지 꺼짐**  
P2 · medium · 노력 M · 페이지 · 조작 효율 · 화면 확인 필요

- **문제**: 전후 비교를 하려면 매번 popup을 열어 켜기를 해제해야 합니다. 그러면 detach되어 GPU device까지 해제되고, 다시 켜면 초기화와 전체 frameProbe가 끝난 뒤에야 캔버스가 보여 같은 장면을 놓칩니다. 설정이 storage 공유라 다른 YouTube 탭도 꺼집니다. 강도 0%는 원본과 같지 않고(UX-16), baseline 비교는 진단 영역을 거쳐야 하며 모드가 저장되어 남습니다(UX-01).
- **권고**: main.js에 content script keydown·keyup 리스너(document, capture)를 둡니다. (1) 원본 보기: 예컨대 Option+H를 누르는 동안 overlay 캔버스를 visibility 'hidden'으로 숨기고(렌더는 유지), 떼면 renderer의 pathReady 기준으로 되돌립니다. 현재 탭에만 적용되고 즉시 전환되며, 그동안 HUD나 상태 칩에 '원본 보기'를 표시합니다. (2) 켜기 토글: 예컨대 Option+Shift+H로 params를 거쳐 sdrhdr.enabled를 뒤집습니다. 입력창·contenteditable에 포커스가 있으면 무시하고, 판정은 e.code로 합니다. 대안으로 popup에 세션 한정 '원본 보기' 체크박스를 두는 방법도 있습니다.
- **근거**:
  - [extension/content/main.js:435](../extension/content/main.js#L435) — 끄면 detach
  - [extension/content/renderer.js:717](../extension/content/renderer.js#L717) — 다시 켜면 init부터
  - [extension/content/renderer.js:604](../extension/content/renderer.js#L604) — 전체 경로 측정 순서
  - [extension/content/renderer.js:117](../extension/content/renderer.js#L117) — 표시 여부를 pathReady로 결정
  - [PLAN.md:403](../PLAN.md#L403) — 단축키는 M5-7 범위 밖
  - [docs/install.md:154](../docs/install.md#L154) — 비교 절차가 popup 끄기나 baseline
- **제약·주의**: 이전 계획에서 범위 밖으로 둔 항목입니다(PLAN M5-7 단축키). manifest commands는 background가 필요하므로(GUIDELINES 1-3, Opus 승인) content script 키 리스너로 합니다. browser.* 접근은 main.js와 params.js에만 둡니다(2.1-5). YouTube 단축키(k·j·l·f·t·i·m·c·숫자·Shift+N/P·<·> 등)와 겹치지 않아야 합니다. DRM·skipped 상태에서는 아무것도 하지 않습니다. renderer.updateVisibility가 숨김을 되돌리지 않도록 숨김 플래그를 존중하게 해야 합니다. 새 기능이므로 Opus 계획이 필요합니다.

### UX-23

**기본 설정(HUD 꺼짐)에서는 방해 없이 보면서 변환 상태를 알 방법이 없음**  
P2 · medium · 노력 M · 페이지 · 상태 피드백 · 화면 확인 필요 · 선행: UX-02

- **문제**: HDR 원본·PiP·blackFrame·probing 상태에서는 원본이 그대로 보여 단서가 '밝기가 그대로'뿐입니다. 상태를 확인하려면 5줄 HUD를 계속 켜서 영상 왼쪽 위를 가리거나, popup 진단 JSON을 읽어야 합니다. 즉 '방해 없이 보기'와 '상태 확인' 중 하나를 포기해야 합니다.
- **권고**: 상세 HUD와 별도로 작은 상태 칩을 둡니다. main.js dispatch()에서 lc.state·lc.skip이 바뀔 때(active 진입, 건너뜀 사유 변경, srcChange 후 판정 완료) 플레이어 한쪽 구석에 2~3초 동안 띄웠다가 사라지게 합니다. 문구는 'HDR 변환', '원본: HDR 영상', '원본: PiP', '원본: 출력 이상'처럼 UX-02와 같은 매핑을 씁니다. popup에는 'HUD 상세'와 별개로 '상태 알림' 체크박스(기본 켬)를 둡니다.
- **근거**:
  - [extension/content/params.js:53](../extension/content/params.js#L53) — HUD 기본 꺼짐
  - [docs/install.md:127](../docs/install.md#L127) — 상태 확인은 진단 JSON으로
  - [extension/content/hud.js:431](../extension/content/hud.js#L431) — HUD는 5줄 11px 상자
  - [PLAN.md:387](../PLAN.md#L387) — HUD는 사용자 확인용
- **제약·주의**: 새 UI 요소와 설정 키이므로 Opus 계획이 필요합니다(GUIDELINES 1-2). pointer-events:none으로 두고 z-index는 지정하지 않습니다(2.3-3). YouTube 클래스를 쓴다면 detect.js에 [미확인] 상수로 둡니다(2.3-1, 2.7). URL·제목은 넣지 않습니다. DRM 페이지에 표시할지는 UX-13과 같은 기준으로 Opus가 정합니다. 칩이 EDR 캔버스 위에서 거슬리는지는 사용자가 판단합니다.

### UX-24

**youtube.com 접근 미허용이나 대상 밖 페이지(임베드·music)에서도 popup은 '켜기' 체크, 앱은 'currently on'이라 동작 중으로 오해함**  
P2 · medium · 노력 S · 공통 · 온보딩 · 화면 확인 필요 · 선행: UX-02

- **문제**: 처음 설치했거나 7일 재서명으로 허용 설정이 초기화된 뒤 youtube.com 접근 허용을 놓치면 content script가 주입되지 않습니다. 그래도 컨테이너 앱은 'currently on', popup은 기본값으로 켜기 체크에 슬라이더 활성 상태입니다. 단서는 접힌 진단의 '(진단 없음: youtube.com 탭을 연 뒤 다시 열기)' 하나뿐인데, 권한 문제라는 것을 알려 주지 않고 '다시 열기'도 부정확합니다(자동 갱신됨). 재서명 뒤 예전 진단이 남아 있으면 이 문구조차 나오지 않습니다. 대상은 www.youtube.com 최상위 프레임뿐이라 임베드, youtube-nocookie, music.youtube.com에서는 동작하지 않는데, 이 사실도 popup에 없습니다.
- **권고**: (1) popup.js 23행 빈 진단 문구를 '아직 상태 정보가 없습니다. ① www.youtube.com 영상 페이지에서 재생 ② Safari 설정 > 확장 > SDR HDR에서 www.youtube.com 접근 허용 ③ 새로고침. 이 창은 자동 갱신됩니다'로 바꿉니다. (2) UX-02 상태 줄에서 진단이 없거나 오래됐으면 같은 권한 확인 안내를 덧붙입니다. (3) 켜기 아래에 고정 안내 '대상: www.youtube.com 영상 페이지(임베드·music.youtube.com 제외)'를 둡니다. (4) 컨테이너 앱 on 문구에 'youtube.com 접근 허용은 Safari 설정 > 확장의 웹사이트 항목에서 따로 확인'을 덧붙입니다. (5) install.md 1장에 대상이 아닌 페이지를 적습니다.
- **근거**:
  - [extension/popup/popup.js:23](../extension/popup/popup.js#L23) — 진단 없음 문구(권한 안내 없음)
  - [extension/content/params.js:46](../extension/content/params.js#L46) — enabled 기본 true
  - [extension/manifest.json:8](../extension/manifest.json#L8) — matches www.youtube.com만
  - [extension/manifest.json:10](../extension/manifest.json#L10) — all_frames false
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:37](../xcode/SDRHDR/SDRHDR/ViewController.swift#L37) — 앱은 isEnabled만 표시
  - [xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html:15](../xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html#L15) — 'currently on' 문구
  - [PLAN.md:611](../PLAN.md#L611) — 7일 만료 시 허용 설정 리셋
  - [docs/install.md:36](../docs/install.md#L36) — youtube.com 권한 허용 단계
- **제약·주의**: 현재 탭이 대상인지 판정하려면 activeTab 또는 tabs 권한이 필요합니다(effort M, background는 불필요). 탭 URL은 화면 표시에만 쓰고 진단에 넣지 않습니다(GUIDELINES 2.6-1). 사이트 권한 허용 여부를 popup이 직접 확인할 수 있는지는 [확인 필요]이며, SFSafariExtensionState는 활성 여부만 줍니다. 컨테이너 앱 수정 범위는 Opus가 정합니다. 임베드 지원 확장(all_frames 등)은 별도 계획 사항입니다. 우선순위 조정 근거: 핵심 신호가 UX-02 상태 줄에 의존하므로 P2로 둡니다.

### UX-25

**7일 서명 만료가 언제 오는지, 이미 왔는지 알 방법이 없어 '확장 고장'으로 오인하기 쉬움**  
P2 · medium · 노력 M · 공통 · 오류 회복 · 화면 확인 필요

- **문제**: install.md는 약 7일 뒤 확장이 꺼지거나 사라질 수 있다고만 하고, 증상은 [확인 필요]입니다. 앱·popup·HUD 어디에도 빌드 날짜가 없습니다. 그래서 일주일쯤 뒤 효과가 사라지면 서명 만료인지, YouTube DOM 변경인지, 설정 문제인지 구분하기 어렵습니다. 확장이 비활성화되면 popup도 열리지 않아 popup 안의 안내는 그때 볼 수 없습니다.
- **권고**: (1) install.md 5장 맨 앞에 '증상 → 확인 순서' 표를 둡니다. 증상은 툴바 버튼 없음, 확장 목록에서 꺼짐, 효과 없음입니다. 확인 순서는 ① 마지막 Xcode Run 날짜 ② Xcode Run ③ Safari ⌘Q 후 재시작 ④ 서명되지 않은 확장 허용과 youtube.com 허용 재확인입니다. (2) 선택안: ViewController에서 Bundle.main.executableURL 수정 시각을 Script.js로 넘겨, 앱 창에 '이 빌드: YYYY-MM-DD (무료 서명은 약 7일 뒤 만료 예상)'를 표시합니다. (3) 실제 만료를 겪으면 증상을 기록하고 [확인 필요]를 지웁니다.
- **근거**:
  - [docs/install.md:55](../docs/install.md#L55) — 약 7일 뒤 만료 가능
  - [docs/install.md:58](../docs/install.md#L58) — 재서명 후 설정 유지 [확인 필요]
  - [PLAN.md:611](../PLAN.md#L611) — 무료 서명 만료와 허용 리셋
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:25](../xcode/SDRHDR/SDRHDR/ViewController.swift#L25) — 앱 창 로드 지점
- **제약·주의**: 만료 기간과 증상은 [확인 필요]이므로 문구에 '예상'을 붙입니다. 실행 파일 수정 시각은 근사치입니다. 프로비저닝 프로필 만료일을 읽는 방식은 L 규모입니다. 컨테이너 앱 수정 범위와 make-xcode.sh 재생성 시 덮어쓰기 문제는 Opus가 정합니다. 기존 파일만 고치면 pbxproj 변경은 없습니다.

### UX-26

**popup에 이름·버전 표시가 없어 새 빌드 반영 여부를 popup 항목 순서로 추측함**  
P2 · medium · 노력 S · popup · 상태 피드백

- **문제**: install.md는 업데이트 후 'popup 항목 순서가 이러면 최신'이라는 간접 판별을 안내합니다. 다음 변경이 레이아웃을 바꾸지 않으면(셰이더·감지 수정 등) 이 방법으로는 알 수 없습니다. Safari 재시작 등을 빠뜨려 옛 빌드가 돌아도 모른 채 회신할 수 있습니다. 버전은 진단 extVersion에만 있고, manifest 버전은 1.0.0으로 고정되어 있습니다.
- **권고**: popup.html 맨 위 헤더 행(UX-07 스위치와 같은 행)에 `<strong>SDR HDR</strong> <small id="ver">v1.0.0</small>`를 둡니다. 코드를 바꿀 때마다 manifest 패치 버전을 올리는 규칙을 GUIDELINES에 정합니다. install.md 51행은 'popup 헤더 버전이 방금 받은 커밋의 manifest.json 버전과 같은지 확인'으로 바꿉니다.
- **근거**:
  - [docs/install.md:51](../docs/install.md#L51) — popup 구성 순서로 최신 여부 판별
  - [extension/content/main.js:472](../extension/content/main.js#L472) — 버전은 진단 extVersion에만
  - [extension/manifest.json:4](../extension/manifest.json#L4) — version 1.0.0
  - [extension/popup/popup.html:5](../extension/popup/popup.html#L5) — title만 있고 화면 표시 없음
- **제약·주의**: popup에서 browser.runtime.getManifest()를 쓰려면 GUIDELINES 2.1-5 개정이 필요합니다(Opus). 개정 없이 하려면 정적 버전 문자열을 넣고, tests/unit/extension-manifest.test.js(13행)에서 manifest.version과 같은지 검사합니다. 버전 올림 규칙과 테스트 부담(형식만 검사할지)은 Opus가 정합니다. 7일 재서명은 같은 버전이라 이 표시로 구분되지 않습니다. 우선순위 조정 근거: 버전 올림 규칙이 먼저 있어야 의미가 있어 P2입니다.

### UX-27

**측정 직후·일시정지 중에 캡처한 진단을 걸러 주는 안내가 없어 오염된 수치가 판정 자료로 들어감**  
P2 · medium · 노력 M · 진단 · 상태 피드백

- **문제**: M4 1차 회신 JSON은 켜기를 껐다 켠 직후(frames 12)에 복사되어 displayHz 60에서 loopFps 71이 나왔는데, STATUS에 그대로 결과로 기록됐습니다. M5 회신은 일시정지 중에 캡처됐습니다. 통계는 최근 최대 600샘플 링 버퍼이고, 일시정지하면 직전 값이 남습니다. popup은 몇 샘플을 잰 값인지, 지금 일시정지인지 알려 주지 않습니다. parse-result.py도 paused·frames를 16열 표의 한 칸으로만 출력해 회신을 받는 세션이 놓칩니다.
- **권고**: (1) 스키마 변경 없이: popup.js showDiag에서 textarea 위에 '측정 상태' 한 줄을 둡니다. video.paused가 true면 '일시정지 중: 수치는 정지 직전 값', lifecycle.state가 active가 아니면 '측정 중 아님(state)'을 경고색으로 표시합니다. (2) 스키마 개정 후: buildDiag render에 samples와 windowSec을 추가하고 '측정 창 최근 9.8초 · 588샘플'을 보여 줍니다. 기준 미만이면 '측정 시작 직후: 30초 재생 후 다시 복사'를 표시합니다. (3) parse-result.py summarize_m2 끝에 판정 없이 사실만 나열하는 '캡처 조건' 줄을 둡니다(paused, state≠active, mode≠itm, itm에서 frames 기준 미만). 해당 없으면 '특이 없음'을 출력합니다. (4) 체크리스트 회신 방법에 '측정 상태 경고가 없을 때 복사'를 넣습니다.
- **근거**:
  - [results/result-M4-20261001-accurate-first.json:1](../results/result-M4-20261001-accurate-first.json#L1) — frames 12에서 캡처
  - [STATUS.md:101](../STATUS.md#L101) — loopFps 71(60Hz)을 결과로 기록
  - [results/result-M5-20261001-custom-hud.json:1](../results/result-M5-20261001-custom-hud.json#L1) — paused true 캡처
  - [extension/content/renderer.js:4](../extension/content/renderer.js#L4) — 링 버퍼 600
  - [extension/content/renderer.js:678](../extension/content/renderer.js#L678) — play·seek 때만 버퍼 비움
  - [scripts/parse-result.py:332](../scripts/parse-result.py#L332) — paused·frames가 넓은 표의 한 칸
  - [scripts/parse-result.py:2](../scripts/parse-result.py#L2) — 판정 없이 값만 출력
- **제약·주의**: (1)은 기존 필드만 읽으므로 popup 파일만 바꿉니다. (2)는 schemaVersion 11, result-schema-m2.json, parse-result.py 갱신과 Opus 계획 및 기준값 결정이 필요합니다. baseline은 render.frames가 0이므로 frames 기준은 itm에만 적용합니다. parse-result의 '판정 없음' 원칙에 사실 나열이 맞는지는 Opus가 정합니다. 진단 영역 안에서만 표시합니다(2.6-3).

### UX-28

**측정 조건(화면 밝기·전원·저전력)을 기록할 칸이 진단 JSON에 없어 회신에서 반복적으로 빠짐**  
P2 · medium · 노력 M · 진단 · 안전한 기본값

- **문제**: 0a 프로브 페이지에는 전원·밝기·주사율 선택 칸이 있지만, 확장 진단에는 없습니다. 그래서 조건은 파일명이나 체크리스트 사본에 손으로 적어야 하고, 실제로 M4a·M4 회신에서 밝기가 빠졌습니다. 헤드룸은 밝기에 따라 약 4·3·2배로 달라지므로, 밝기 없는 JSON으로는 하이라이트 판정을 나중에 해석할 수 없습니다.
- **권고**: popup 진단 영역에 '측정 조건' 라디오 그룹을 둡니다: 전원(ac/battery), 화면 밝기(low/mid/max), 저전력(on/off). 주사율은 render.displayHz를 옆에 보여 확인만 하게 합니다. 값은 별도 키(예: sdrhdr.capture)에 설정 시각과 함께 저장하고, 복사·저장할 때 JSON에 capture:{power, sdrBrightness, lowPower, setAt}를 병합합니다. 조건을 고르지 않았으면 복사 버튼 옆에 '조건 미기재'를 표시합니다. 자유 입력 칸은 두지 않습니다.
- **근거**:
  - [STATUS.md:75](../STATUS.md#L75) — M4a 회신 밝기 미기재
  - [STATUS.md:101](../STATUS.md#L101) — M4 회신 밝기 미기재
  - [docs/manual-checklist.md:22](../docs/manual-checklist.md#L22) — 프로브 페이지에는 조건 선택이 있음
  - [scripts/parse-result.py:305](../scripts/parse-result.py#L305) — 확장 요약에 조건 열 없음
  - [docs/install.md:13](../docs/install.md#L13) — 헤드룸은 JS로 조회 불가, 밝기에 따라 달라짐
- **제약·주의**: 밝기·전원·저전력은 JS로 읽을 수 없어 수동 선택이 남습니다. 자유 텍스트는 제목·URL이 섞일 수 있어 넣지 않습니다(GUIDELINES 2.6-1). storage.local만 쓰고 외부 전송은 하지 않습니다(2.6-2). 새 키와 스키마 추가(result-schema-m2.json, parse-result.py)는 Opus 계획이 필요합니다.

### UX-29

**결과 파일명을 절마다 다른 규칙으로 손수 조립하고 저장·push까지 해야 해서 진단 JSON 미제출이 반복됨**  
P2 · medium · 노력 M · 진단 · 조작 효율 · 선행: UX-19, UX-27, UX-28

- **문제**: 사용자는 복사 → 에디터 → 붙여넣기 → 날짜·전원·밝기·해상도·모드·항목 번호를 절마다 다른 규칙으로 조합한 파일명으로 results/에 저장 → 체크리스트 기재 → push를 해야 합니다. 실제 파일명이 규칙과 어긋났고(strength68, custom-hud), JSON의 milestone은 항상 'M2'라 파일명이 틀리면 어느 항목 자료인지 되찾기 어렵습니다. M6 회신에는 수치 JSON이 하나도 없었고 M3 DRM 항목도 말로만 보고되어, D-M6 수치 기준이 [미확인]으로 남았습니다.
- **권고**: (1) popup 진단 영역에 진단에서 자동으로 만든 '제안 파일명'을 한 줄로 보여 줍니다. 날짜(로컬), 해상도(videoHeight→2160p), srcFpsNominal, render.mode, preset, 전체화면 여부, 영상 ID(page.url의 v), 측정 조건(UX-28)을 넣습니다. (2) [회신용 복사] 버튼은 첫 줄 제안 파일명, 다음 줄 측정 조건·측정 상태 경고, 그 뒤 JSON을 한 덩어리로 복사합니다. 이를 로컬 Claude Code 채팅에 붙여 넣으면 세션이 results/에 저장합니다. (3) 체크리스트 회신 방법을 '회신용 복사 → 채팅에 붙여넣기'로 바꾸고, 절마다 사용자가 채울 관찰 항목만 담은 한 줄 템플릿을 둡니다. 측정 태그 select는 2단계로 미룹니다.
- **근거**:
  - [docs/manual-checklist.md:62](../docs/manual-checklist.md#L62) — M2 파일명 규칙
  - [docs/manual-checklist.md:127](../docs/manual-checklist.md#L127) — M3 파일명 규칙(다름)
  - [docs/manual-checklist.md:160](../docs/manual-checklist.md#L160) — M4a 파일명 규칙(다름)
  - [extension/content/hud.js:294](../extension/content/hud.js#L294) — milestone 항상 'M2'
  - [STATUS.md:129](../STATUS.md#L129) — M6 회신에 수치 JSON 없음
  - [STATUS.md:59](../STATUS.md#L59) — DRM 항목 JSON 미첨부
  - [docs/local-session.md:54](../docs/local-session.md#L54) — popup 복사 후 results/에 저장
- **제약·주의**: PLAN M6-5에 따라 milestone 'M2'는 유지합니다. 클립보드만 쓰고 외부 전송 기능은 만들지 않습니다(GUIDELINES 2.6-2). 파일명에 영상 ID(v)는 허용되지만 제목은 넣지 않습니다(2.6-1). 측정 태그와 조건 필드는 스키마 변경이라 Opus 계획이 필요합니다. Activity Monitor 메모리 같은 값은 수동 기재로 남습니다.

### UX-30

**슬라이더 값 단위가 %·소수·×로 섞여 있고, 중립점과 기본값이 표시되지 않음**  
P3 · low · 노력 M · popup · 일관성 · 화면 확인 필요

- **문제**: 주 영역 채도는 '105%'인데 곡선 채도·하이라이트 채도는 '1.03'입니다. 배율인 P·g는 '2.0'·'1.22'로 단위가 없는데, 같은 척도의 유효 피크는 '×1.62'입니다. HUD 해상도는 ASCII 'x', 문서는 '×'와 'x'가 섞여 있습니다. 채도 100%와 g·s·hs 1.00(원본), 선명도 0%(끔)가 중립이라는 점, 현재 값이 기본값(105% 등)에서 벗어났는지가 표시되지 않아 원래 값으로 정확히 되돌리기 어렵습니다.
- **권고**: popup.js showDetailValue에 키별 형식 함수를 둡니다. P·g는 '×2.0'·'×1.22', s·hs는 '103%'로 표시하고, k·n은 소수로 둡니다(k를 %로 하면 sRGB 코드 비율로 오해할 수 있음). 라벨 설명에 중립점을 적습니다('채도 · 100% = 원본', '선명도 · 0% = 끔'). 값이 기본과 다르면 값 옆에 흐린 '(기본 105%)'를 표시합니다. HUD 해상도는 '1920×1080', 문서의 곱셈 기호는 '×'로 통일합니다. 숨은 더블클릭 되돌리기는 두지 않고 UX-06을 씁니다.
- **근거**:
  - [extension/popup/popup.js:46](../extension/popup/popup.js#L46) — 상세 값은 단위 없는 소수
  - [extension/popup/popup.js:32](../extension/popup/popup.js#L32) — 주 슬라이더는 %
  - [extension/popup/popup.js:37](../extension/popup/popup.js#L37) — 유효 피크는 ×
  - [extension/popup/popup.html:47](../extension/popup/popup.html#L47) — 채도 105%
  - [extension/popup/popup.html:70](../extension/popup/popup.html#L70) — 곡선 채도(소수)
  - [extension/content/params.js:42](../extension/content/params.js#L42) — 채도 기본 1.05
  - [docs/manual-checklist.md:188](../docs/manual-checklist.md#L188) — 공식에 ASCII x
- **제약·주의**: 표시만 바꾸고 저장 범위와 step은 params.RANGES·DETAIL_STEPS 한 곳을 유지합니다(GUIDELINES 3-5). tests/unit/extension-popup.test.js 79·81·125행 기대값을 갱신합니다. 상세 슬라이더의 '기본'이 사용자 지정에서는 DEFAULT_CUSTOM, 이름 있는 프리셋에서는 그 프리셋 값이라는 정의는 Opus가 확정합니다. 새 표시 요소이므로 GUIDELINES 1-2 승인이 필요합니다.

### UX-31

**채도 3종, 확장 시작, 곡선 지수, 선명도, 프리셋의 의미가 popup에 없어 시행착오로만 조정함**  
P3 · low · 노력 M · popup · 문구·용어 · 화면 확인 필요 · 선행: UX-12, UX-17

- **문제**: '채도'(강도와 무관한 최종 출력 전체), '곡선 채도' s(이름과 달리 ITM 쪽 전체에 강도 비율만큼 적용), '하이라이트 채도' hs(k 위만)의 차이는 PLAN에만 있습니다. 그래서 채도를 100%로 내려도 s 1.03이 남는 것을 모릅니다. '확장 시작 0.40'(실제 입력 기준으로는 k/g라 더 어두운 곳부터)과 '곡선 지수'는 수식 이름 그대로입니다. 선명도 0%가 완전히 꺼진 상태라는 점과 올렸을 때의 위험(GPU 부담·헤일로, 미측정)도 없습니다. 프리셋은 이름만 있어 차이(×2/×3/×4, 색 +20%)와 '곡선 6개만 바뀌고 강도·선명도·채도는 유지'를 알 수 없습니다.
- **권고**: popup.html 각 라벨 아래 small 설명(aria-describedby)을 둡니다. 채도: '최종 출력 전체, 100% = 원본'. s → '변환 채도(강도에 비례)'. hs → '밝은 부분 채도(확장 시작 이상)'. 확장 시작 → '밝아지기 시작 지점: 낮출수록 넓은 범위가 밝아짐'(옆에 params.js 순수 함수로 계산한 '원본 밝기 약 NN% 이상' 보조 표시). 곡선 지수 → '하이라이트 집중도: 높일수록 가장 밝은 부분만'. 선명도: '0% = 끔(기본) · 올려서 끊김이나 흰 테두리가 보이면 0%로'. 프리셋 select 아래 #preset-desc에 params.PRESETS에서 계산한 '정확: 흰색 최대 ×2' 등과 '곡선만 바뀜 · 강도/선명도/채도는 유지'를 표시합니다. install.md 상세 표에 '의미' 열을 추가합니다.
- **근거**:
  - [extension/popup/popup.html:70](../extension/popup/popup.html#L70) — 곡선 채도 라벨
  - [extension/popup/popup.html:74](../extension/popup/popup.html#L74) — 하이라이트 채도 라벨
  - [extension/content/itm.wgsl.js:95](../extension/content/itm.wgsl.js#L95) — sat = s * mix(1, hs, w)
  - [extension/content/itm.wgsl.js:107](../extension/content/itm.wgsl.js#L107) — 최종 csat 적용
  - [extension/popup/popup.html:58](../extension/popup/popup.html#L58) — 확장 시작 라벨
  - [extension/content/itm.wgsl.js:78](../extension/content/itm.wgsl.js#L78) — k 이하 항등
  - [extension/content/itm.wgsl.js:147](../extension/content/itm.wgsl.js#L147) — 선명도 0이면 언샤프 생략
  - [extension/popup/popup.html:32](../extension/popup/popup.html#L32) — 프리셋 이름만 표시
  - [PLAN.md:286](../PLAN.md#L286) — 강도는 프리셋과 독립
  - [PLAN.md:465](../PLAN.md#L465) — 채도와 s는 별개
- **제약·주의**: 라벨 명칭 변경은 PLAN M5-1 사항이라 Opus 확인이 필요합니다. s 슬라이더를 UI에서 빼는 대안은 상세 6개 구성 변경이라 Opus가 결정합니다(vivid의 s=1.2는 유지). 보조 계산은 params.js 순수 함수로 둡니다(GUIDELINES 2.2-2, popup은 tonecurve.js 미로드). 선명도 비용은 미측정이므로 수치를 넣지 않습니다. 320px 폭에서 길이는 사용자가 확인합니다. 설명 수치는 params에서 계산해 이중 정의를 피합니다(3-5).

### UX-32

**상세 설정 영역이 시각적으로 구분되지 않고, HUD 체크박스 소속이 모호하며, 펼침 상태를 기억하지 않음**  
P3 · low · 노력 S · popup · 정보 구조 · 화면 확인 필요

- **문제**: details 안 label에 들여쓰기나 경계가 없어, 펼치면 상세 슬라이더 6개가 주 슬라이더와 똑같이 이어집니다. '페이지 HUD 표시'는 상세 설정의 7번째 항목처럼 보입니다. summary는 '움직이면 사용자 지정으로 저장된다'는 부수 효과를 알리지 않습니다. popup은 영상을 클릭하면 닫히는데 열 때마다 상세 설정이 다시 접혀 있어, 곡선 조정 중에 매번 펼쳐야 합니다.
- **권고**: (1) `details>label{margin-left:10px;padding-left:8px;border-left:2px solid color-mix(in srgb,currentColor 20%,transparent)}`, `details{margin:8px 0}`로 그룹 경계를 만듭니다. (2) HUD 체크박스를 상단 헤더 행(켜기 옆)으로 옮깁니다. (3) summary를 '상세 설정 (조정하면 사용자 지정으로 저장)'으로 바꿉니다. (4) #detail의 toggle 상태를 popup localStorage(sdrhdr.ui.detailOpen, try/catch)에 저장했다가 init에서 복원합니다. 진단 영역은 기억하지 않습니다.
- **근거**:
  - [extension/popup/popup.html:51](../extension/popup/popup.html#L51) — 상세 설정 details
  - [extension/popup/popup.html:52](../extension/popup/popup.html#L52) — summary 문구
  - [extension/popup/popup.html:78](../extension/popup/popup.html#L78) — HUD 체크박스 위치
  - [PLAN.md:380](../PLAN.md#L380) — 일반 영역 순서
  - [PLAN.md:373](../PLAN.md#L373) — 상세 영역 기본 접힘
  - [extension/content/params.js:156](../extension/content/params.js#L156) — content는 SETTING_KEYS 외 변경 무시
- **제약·주의**: 항목 순서는 PLAN M5-2에서 정했으므로 HUD 이동은 Opus 개정과 install.md 51행·checklist 185행 갱신이 필요합니다. 첫 실행은 접힘을 유지합니다. 진단 영역은 기본 접힘을 유지합니다(GUIDELINES 2.6-3). localStorage는 UI 상태 전용입니다.

### UX-33

**popup에 color-scheme 선언이 없어 다크 모드에서 밝은 패널로 뜰 수 있음(컨테이너 앱과 불일치)**  
P3 · low · 노력 S · popup · 시각 디자인 · 화면 확인 필요

- **문제**: popup.html에는 color-scheme도 prefers-color-scheme도 없습니다. macOS 다크 모드에서 흰 배경에 밝은 폼 컨트롤로 그려질 수 있습니다. 어두운 방에서 HDR을 보다가 popup을 열면 눈이 부시고, 하이라이트를 눈으로 비교하는 데 방해가 됩니다. 컨테이너 앱 Style.css는 light dark를 선언하고 있어 표면끼리 일관되지도 않습니다.
- **권고**: popup.html head에 `<meta name="color-scheme" content="light dark">`를 넣고, `:root{color-scheme:light dark}`와 `body{background:Canvas;color:CanvasText}`를 둡니다. 경고색이나 구분선처럼 직접 정한 색은 `--warn` 같은 변수로 두고 `@media (prefers-color-scheme: dark)`에서 재정의합니다.
- **근거**:
  - [extension/popup/popup.html:7](../extension/popup/popup.html#L7) — body 스타일에 색 체계 선언 없음
  - [extension/popup/popup.html:9](../extension/popup/popup.html#L9) — 글꼴만 지정
  - [xcode/SDRHDR/SDRHDR/Resources/Style.css:8](../xcode/SDRHDR/SDRHDR/Resources/Style.css#L8) — 앱은 color-scheme light dark
- **제약·주의**: popup.html CSS만 바꿉니다. Safari popover에서 실제로 어떻게 합성되는지는 사용자가 두 모드에서 확인합니다.

### UX-34

**정적 HTML 초기값이 실제 기본값과 다르고, storage 읽기·쓰기 실패를 처리하지 않아 잘못된 상태가 남음**  
P3 · low · 노력 S · popup · 오류 회복 · 화면 확인 필요

- **문제**: HTML 정적 상태는 켜기 해제, 프리셋 '정확', 상세 값 빈칸입니다. 실제 기본값은 켜짐·사용자 지정이라, init의 await가 끝나기 전 '꺼짐·정확'이 잠깐 보일 수 있습니다. storage.get이 실패하면 init 거부가 처리되지 않아 잘못된 정적 상태가 남고, 리스너도 연결되지 않아 조작해도 아무 일이 없습니다. storage.set 실패도 무시되어 저장됐다고 믿게 됩니다.
- **권고**: (1) popup.html 정적 값을 DEFAULTS와 맞춥니다(enabled에 checked, custom option에 selected). (2) init().catch로 실패를 잡아 맨 위에 '설정을 읽지 못했습니다. popup을 다시 열거나 Safari를 재시작하세요'를 표시하고 컨트롤을 disabled로 둡니다. (3) storage.set에 .catch를 달아 '저장 실패'를 표시합니다. (4) 깜빡임이 실제로 확인되면 컨트롤 영역에만 로드 중 클래스(visibility:hidden 또는 흐림)를 줍니다.
- **근거**:
  - [extension/popup/popup.html:28](../extension/popup/popup.html#L28) — 켜기 정적 미체크
  - [extension/popup/popup.html:32](../extension/popup/popup.html#L32) — 첫 옵션 '정확'
  - [extension/content/params.js:13](../extension/content/params.js#L13) — 기본 프리셋 custom
  - [extension/content/params.js:46](../extension/content/params.js#L46) — enabled 기본 true
  - [extension/popup/popup.js:127](../extension/popup/popup.js#L127) — init에서 storage를 await
  - [extension/popup/popup.js:166](../extension/popup/popup.js#L166) — init() 거부 미처리
  - [extension/popup/popup.js:74](../extension/popup/popup.js#L74) — set 실패 미처리
- **제약·주의**: 정적 값은 표시 보조일 뿐이고 기준은 params.DEFAULTS입니다(STATUS 125행에 정적 강도 값만 맞춘 전례가 있음). 실패 조건은 [미확인]입니다. 깜빡임 여부는 사용자가 확인합니다.

### UX-35

**'JSON 저장' 링크가 M2 이후 동작 미확인 상태로 버튼 옆에 링크 모양으로 놓여 있고, 진단이 없어도 활성임**  
P3 · low · 노력 S · 진단 · 일관성 · 화면 확인 필요

- **문제**: 'JSON 저장'은 M2부터 지금까지 Safari popup에서 동작하는지 한 번도 확인하지 않은 채 '복사' 버튼 옆에 밑줄 링크로 놓여 있습니다. 누르면 아무 일 없음, popup이 blob 문서로 바뀜, 같은 이름(sdrhdr-diag.json)으로 쌓임 중 무엇이 일어날지 모릅니다. 진단이 없을 때는 안내 문장이 그대로 .json 파일이 됩니다. href가 설정되기 전에는 키보드 포커스도 받지 못합니다. textarea는 box-sizing이 없어 테두리만큼 삐져나올 수 있습니다.
- **권고**: (1) 체크리스트에 1회 확인 항목 'JSON 저장을 누르면 무엇이 일어나는가'를 넣습니다. (2) 확인 전까지 링크 문구를 'JSON 저장(실험)'으로 바꿉니다. (3) 동작하면 `<button id="save">`로 바꿔 클릭 때 임시 a[download]를 만들고, 파일명은 시각이 들어간 제안 이름으로 합니다(UX-29). 진단이 없으면 비활성으로 둡니다. 동작하지 않으면 링크와 blobUrl 코드를 제거하고 문서를 정리합니다. (4) textarea에 box-sizing:border-box를 줍니다.
- **근거**:
  - [extension/popup/popup.html:95](../extension/popup/popup.html#L95) — a download 링크
  - [extension/popup/popup.js:27](../extension/popup/popup.js#L27) — blob URL을 href로 설정
  - [extension/popup/popup.js:23](../extension/popup/popup.js#L23) — 진단 없음 문장도 blob이 됨
  - [docs/install.md:121](../docs/install.md#L121) — 저장 링크 동작 [확인 필요]
  - [PLAN.md:501](../PLAN.md#L501) — 저장 링크 [미확인], 복사를 기본으로
  - [STATUS.md:127](../STATUS.md#L127) — JSON 저장 동작 미확인 목록
- **제약·주의**: Safari popup의 blob download 동작은 Claude가 검증할 수 없어 사용자 확인이 필요합니다. 링크 제거나 유지는 PLAN M2 popup 표와 M5-2 문구 개정이 필요합니다(Opus). 진단 영역 밖으로 옮기지 않습니다(GUIDELINES 2.6-3).

### UX-36

**재생 중에는 진단 textarea가 약 2초마다 통째로 바뀌어 읽기·선택·스크롤이 끊기고, 특정 시점을 고정할 수 없음**  
P3 · low · 노력 S · 진단 · 상태 피드백 · 화면 확인 필요

- **문제**: 재생 중에는 통계가 계속 바뀌어 진단이 약 2초마다 다시 쓰이고, popup은 textarea 값을 통째로 바꿉니다. lifecycle을 스크롤해 읽거나 일부를 드래그로 선택하는 중에 내용과 선택이 바뀝니다. '복사'는 누른 순간의 값을 가져가므로 사용자가 확인한 내용과 복사된 내용이 다를 수 있습니다.
- **권고**: 진단 영역에 [이 시점 고정] 토글을 둡니다. 켜면 showDiag 갱신을 멈추고 '고정됨: 14:03:41'을 표시하며, 복사·저장·회신용 복사는 고정된 객체를 씁니다. 고정하지 않았더라도 textarea에 포커스나 선택이 있으면 갱신을 미루고 '새 진단 있음 — 갱신' 버튼을 보여 줍니다. 갱신할 때는 scrollTop을 저장했다가 복원합니다.
- **근거**:
  - [extension/content/main.js:6](../extension/content/main.js#L6) — 진단 수집 2초 주기
  - [extension/popup/popup.js:24](../extension/popup/popup.js#L24) — textarea 값 통째로 교체
  - [extension/popup/popup.js:162](../extension/popup/popup.js#L162) — 변경마다 갱신
  - [extension/content/main.js:553](../extension/content/main.js#L553) — 내용이 바뀌면 진단 기록
- **제약·주의**: popup 파일만 바꾸고 진단 영역 안에서만 변경합니다(GUIDELINES 2.6-3). 진단 쓰기 주기는 바꾸지 않습니다. 스크롤이나 선택이 실제로 초기화되는지는 사용자가 확인합니다.

### UX-37

**진단 모드 옵션이 itm·identity·stripes·baseline 내부 id로만 표시됨**  
P3 · low · 노력 S · 진단 · 문구·용어

- **문제**: 옵션 텍스트가 코드 id뿐이고 설명은 체크리스트와 install.md 본문에만 있습니다. popup만 본 사용자는 baseline이 '효과 꺼짐(원본)', identity가 '변환 없는 출력', stripes가 '테스트 패턴'이라는 것을 알 수 없습니다. 그래서 잘못 고르거나 고른 채 잊을 위험이 큽니다.
- **권고**: value는 그대로 두고 표시만 바꿉니다: 'itm (정상)', 'identity (변환 없이 출력, 비교용)', 'stripes (밝기 단계 줄무늬)', 'baseline (렌더 없음, 원본 비교 기준)'. select 아래에는 선택한 모드의 한 줄 설명과 '측정 후 itm으로 되돌리세요'를 표시합니다(popup.js mode change에서 갱신).
- **근거**:
  - [extension/popup/popup.html:84](../extension/popup/popup.html#L84) — itm 옵션
  - [extension/popup/popup.html:85](../extension/popup/popup.html#L85) — identity 옵션
  - [extension/popup/popup.html:87](../extension/popup/popup.html#L87) — baseline 옵션
  - [docs/install.md:120](../docs/install.md#L120) — baseline 설명은 문서에만
  - [docs/manual-checklist.md:77](../docs/manual-checklist.md#L77) — baseline 설명
- **제약·주의**: value(id)는 진단 JSON, 체크리스트, parse-result가 쓰므로 바꾸지 않습니다. 진단 영역 안에서만 바꿉니다(GUIDELINES 2.6-3).

### UX-38

**HUD 첫 줄이 skipped(hdrSource)·pending·vf 같은 영어 내부 식별자라 정상 건너뜀과 오류를 구분하기 어려움**  
P3 · low · 노력 S · HUD · 문구·용어 · 선행: UX-02

- **문제**: HUD 나머지 줄은 한국어인데 1줄만 'skipped(hdrSource) 경로 -', 'probing 경로 pending', 'active 경로 vf'이고, 5줄은 'video 1920x1080'입니다. blackFrame·noGpu처럼 조치가 필요한 상태인지 정상 건너뜀인지 HUD만으로는 알 수 없고, install.md 7장 표를 찾아봐야 합니다. 다만 사용자가 코드값을 아는 개발자 본인이라 실제 혼란은 작습니다.
- **권고**: UX-02에서 params.js에 둔 상태 매핑 함수를 hud.js hudLines에서도 씁니다. 1줄 예: '변환 중 · 경로 vf', '판정 중(원본 표시)', '원본: HDR 영상 (hdrSource)', '중단: 검은 프레임 연속 · 다른 영상 또는 끄고 켜기 (blackFrame)'. 원래 id는 괄호로 남겨 진단·install.md와 대조할 수 있게 합니다. 5줄은 '영상 1920×1080'으로 바꿉니다.
- **근거**:
  - [extension/content/hud.js:400](../extension/content/hud.js#L400) — skipReason을 괄호로 그대로 표시
  - [extension/content/hud.js:405](../extension/content/hud.js#L405) — 1줄 상태·경로
  - [extension/content/hud.js:422](../extension/content/hud.js#L422) — 'video WxH'
  - [PLAN.md:386](../PLAN.md#L386) — HUD 내용을 원시 필드로 정함
  - [tests/unit/extension-hud-page.test.js:50](../tests/unit/extension-hud-page.test.js#L50) — 'skipped(hdrSource) 경로 vf' 기대값
- **제약·주의**: PLAN M5-3에서 정한 HUD 형식을 바꾸므로 Opus 확인이 필요합니다. 진단 JSON 값과 스키마는 그대로입니다. hudLines 단위·DOM 테스트와 체크리스트 190·203·206행 문구를 함께 고칩니다. URL·제목은 넣지 않습니다(2.6-1).

### UX-39

**HUD 'fps'가 영상 fps가 아닌 렌더 루프 횟수이고, 측정 불가 누락률을 0.0%로 표시함**  
P3 · low · 노력 S · HUD · 문구·용어

- **문제**: HUD 'fps'는 rAF 렌더 루프 횟수라 30fps 영상에서도 'fps 71'로 보여 영상 프레임레이트로 오해하기 쉽습니다. displayMissRate가 null(측정 불가)이면 main.js가 null*100=0을 넘겨 '누락 0.0%'로 표시합니다. 그래서 측정 불가가 '누락 없음'으로 보입니다.
- **권고**: hud.js 4줄 라벨을 '렌더 fps'로 바꾸고, cadenceStats의 srcFpsNominal로 '원본 30fps'를 함께 표시합니다(hudInfo에 추가). main.js 137행은 결과가 null이면 null을 그대로 넘겨 '-'로 표시합니다. 일시정지 표시는 UX-15에서 다룹니다.
- **근거**:
  - [extension/content/hud.js:415](../extension/content/hud.js#L415) — 'fps' 라벨
  - [extension/content/main.js:137](../extension/content/main.js#L137) — 누락률 결과에 *100(null이면 0)
  - [extension/content/hud.js:78](../extension/content/hud.js#L78) — 측정 불가면 null 반환
  - [STATUS.md:101](../STATUS.md#L101) — 30fps 소스에서 loopFps 71
- **제약·주의**: 진단 JSON의 loopFps·displayMissRate 정의는 바꾸지 않습니다. 체크리스트 203·206행의 'HUD fps' 문구를 함께 고칩니다. hudLines 테스트 기대값을 갱신합니다.

### UX-40

**HUD가 11px 고정, 55% 반투명 배경, 왼쪽 위 상시 표시라 EDR 하이라이트 위 대비가 약하고 미니플레이어를 크게 가림**  
P3 · low · 노력 S · HUD · 접근성 · 화면 확인 필요

- **문제**: HUD는 EDR 캔버스 위에 그려지는데, 글자는 SDR 흰색이 상한이고 배경은 55% 검정입니다. 그래서 밝은 장면에서는 대비가 더 떨어질 수 있습니다. 플레이어 크기와 관계없이 11px 5줄이라 미니플레이어(폭 약 400px)에서는 영상을 크게 가리고, 4K 전체화면에서는 상대적으로 작습니다. 기본·극장·전체화면 위치는 M5에서 문제없다고 판정됐습니다.
- **권고**: HUD_STYLE 배경을 rgba(0,0,0,0.8) 이상으로 올리고 text-shadow:0 0 2px #000을 추가합니다. createHud에서 container 폭에 따라 크기를 조정합니다(600px 미만이면 1줄 축약, 1600px 이상이면 13~14px). 폭은 1초 tickHud에서 offsetWidth로 읽거나 ResizeObserver로 받습니다.
- **근거**:
  - [extension/content/hud.js:431](../extension/content/hud.js#L431) — 11px 고정 글꼴
  - [extension/content/hud.js:432](../extension/content/hud.js#L432) — 흰 글자
  - [extension/content/hud.js:433](../extension/content/hud.js#L433) — 55% 반투명 배경
  - [extension/content/hud.js:428](../extension/content/hud.js#L428) — 왼쪽 위 고정
  - [extension/content/hud.js:446](../extension/content/hud.js#L446) — container 다음 형제로 삽입
  - [STATUS.md:59](../STATUS.md#L59) — 미니플레이어 [미확인]
  - [PLAN.md:705](../PLAN.md#L705) — 기본·극장·전체화면 위치는 M5 충족
- **제약·주의**: PLAN M5-3(385행)이 '고정폭 11px, 반투명 배경'을 명시하므로 Opus 개정이 필요합니다. 사용자가 확인한 위치는 바꾸지 않습니다. 셀렉터나 YouTube 클래스는 detect.js에만 둡니다(2.3-1, 2.7). z-index는 지정하지 않습니다. 대비와 겹침은 사용자가 육안으로 판정합니다.

### UX-41

**확장을 끈 채 페이지를 열면 lifecycle이 'disabled'가 아니라 'idle'로 기록됨**  
P3 · low · 노력 S · 진단 · 상태 피드백

- **문제**: start()는 꺼져 있으면 아무 전이도 하지 않습니다. 그래서 꺼진 상태로 YouTube를 열거나 새로고침하면 진단이 state 'idle', skipReason null이 됩니다. install.md는 꺼짐을 'disabled'로 설명하므로 문서와 다르고, 진단으로 popup 상태 줄을 만들면 '대상 영상 없음'으로 잘못 표시됩니다.
- **권고**: main.js start()에서 settings.enabled가 false면 dispatch('disable', true)를 호출해 skipped(disabled)로 맞춥니다. 단위 테스트에 '꺼진 상태로 시작' 케이스를 추가합니다.
- **근거**:
  - [extension/content/main.js:567](../extension/content/main.js#L567) — 켜져 있을 때만 scheduleAttach
  - [extension/content/main.js:20](../extension/content/main.js#L20) — 초기 상태 idle
  - [docs/install.md:146](../docs/install.md#L146) — disabled 사유 설명
- **제약·주의**: 전이는 detect.nextLifecycle 한 곳에서만 일어난다는 원칙을 지킵니다. 기존 'disable' 이벤트를 재사용하므로 상태표는 바뀌지 않습니다.

### UX-42

**영상 시작·다음 영상·PiP 복귀·다시 켜기 때마다 원본에서 변환으로 밝기가 갑자기 튐**  
P3 · low · 노력 S · 페이지 · 시각 디자인 · 화면 확인 필요

- **문제**: 소스가 바뀔 때마다 경로를 다시 정하는 동안 캔버스를 숨기고, 측정이 끝나면 visibility를 즉시 ''로 바꿉니다. 그래서 재생 시작 수백 ms~1초 뒤 화면이 한 번에 밝아지고, 자동재생·PiP 복귀·끄고 켜기 때마다 반복됩니다. 체크리스트 110행에서 이 전환을 물었지만 회신 기록이 없고, 사용자가 불편을 보고한 적도 없습니다.
- **권고**: 숨김에서 표시로 바뀔 때만 짧은 페이드를 씁니다. overlay.js에서 캔버스에 'transition: opacity 200ms'를 주고, renderer.updateVisibility가 표시할 때 opacity 0을 두었다가 다음 프레임에 1로 바꿉니다. 숨길 때는 지금처럼 즉시 숨깁니다.
- **근거**:
  - [extension/content/renderer.js:117](../extension/content/renderer.js#L117) — pathReady로 즉시 표시·숨김
  - [extension/content/renderer.js:787](../extension/content/renderer.js#L787) — 소스 변경 시 경로 초기화
  - [extension/content/renderer.js:627](../extension/content/renderer.js#L627) — 판정 후 updateVisibility
  - [docs/manual-checklist.md:110](../docs/manual-checklist.md#L110) — 전환 관찰 항목
- **제약·주의**: Safari에서 opacity가 1 미만인 EDR(rgba16float, extended) 캔버스는 합성 경로가 달라져 헤드룸이 유지되지 않을 수 있습니다. 사용자 Mac에서 확인하고, 문제가 되면 이 권고는 철회합니다. 거슬리는지는 사용자 체감으로 판단합니다.

### UX-43

**경로가 정해진 뒤 출력이 검게 바뀌면 최대 약 60초 동안 검은 캔버스가 영상을 가릴 수 있음**  
P3 · low · 노력 S · 페이지 · 오류 회복

- **문제**: 경로가 정해진 뒤 frameProbe는 30초마다 돌고, blackFrame 판정에는 연속 2회가 필요합니다. 선택 경로가 검고 다음 단계 경로도 밝지 않으면, 두 번째 측정까지 최대 약 60초 동안 불투명한 검은 캔버스가 영상을 가립니다. 사용자는 고장으로 보고 새로고침 말고는 방법을 모릅니다. 실제로 발생했다는 보고는 없습니다.
- **권고**: 결정 후 측정에서 blackStreak가 1이 되면 다음 확인 측정을 30초 뒤가 아니라 PROBE_PENDING_MS(1초) 뒤로 당깁니다(runProbe 끝의 probeDue 갱신). 또는 첫 검정 감지 즉시 캔버스를 숨겨 원본을 보이게 하고, 두 번째 측정에서 skip을 확정합니다.
- **근거**:
  - [extension/content/renderer.js:13](../extension/content/renderer.js#L13) — 결정 후 측정 주기 30초
  - [extension/content/renderer.js:674](../extension/content/renderer.js#L674) — 다음 측정 시각 갱신
  - [extension/content/detect.js:57](../extension/content/detect.js#L57) — 연속 2회 판정
  - [extension/content/main.js:240](../extension/content/main.js#L240) — streak 미달이면 대기
- **제약·주의**: 숨김은 detach 방향이라 GUIDELINES 2.4-3과 맞습니다. 측정 주기를 당기면 frameProbe 비용(M6-1)이 늘 수 있으므로 검정이 의심될 때만 당깁니다. 발생 빈도는 [미확인]입니다.

### UX-44

**확장 툴바 아이콘과 앱 아이콘이 없어 Dock과 Safari 툴바에서 알아보기 어려움**  
P3 · low · 노력 M · 공통 · 시각 디자인 · 화면 확인 필요

- **문제**: manifest에 icons와 action.default_icon이 없고, 단위 테스트는 icons 키가 없어야 통과합니다. AppIcon.appiconset에는 이미지가 없고, 앱 창의 Icon.png는 템플릿 그림입니다. 그래서 Dock에는 기본 아이콘이 보이고, install.md가 가리키는 '툴바의 확장 아이콘'에도 고유한 표식이 없을 가능성이 높습니다(실제 모양은 눈으로 확인 필요).
- **권고**: 단색 아이콘 하나(예: 'HDR' 글자나 밝기 곡선)를 정합니다. (1) manifest에 icons(48·96·128)와 action.default_icon(16·32)을 추가하고, 파일은 이미 참조된 폴더(예: extension/popup/icons/)에 둡니다. (2) AppIcon.appiconset에 PNG를 넣고 Contents.json filename을 채웁니다. (3) Main.html 13행 img를 같은 그림으로 바꾸고 alt를 'SDR HDR 아이콘'으로 합니다. 툴바용은 투명 배경으로 만듭니다.
- **근거**:
  - [extension/manifest.json:25](../extension/manifest.json#L25) — action에 아이콘 없음
  - [PLAN.md:492](../PLAN.md#L492) — icons 없음으로 결정
  - [tests/unit/extension-manifest.test.js:45](../tests/unit/extension-manifest.test.js#L45) — icons 키 금지 검사
  - [xcode/SDRHDR/SDRHDR/Assets.xcassets/AppIcon.appiconset/Contents.json:2](../xcode/SDRHDR/SDRHDR/Assets.xcassets/AppIcon.appiconset/Contents.json#L2) — 이미지 파일명 없음
  - [xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj:65](../xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj#L65) — extension/popup 폴더만 참조
  - [docs/install.md:38](../docs/install.md#L38) — 툴바 확장 아이콘을 안내
- **제약·주의**: PLAN 492행에서 의도적으로 뺀 항목이고 테스트가 금지하므로 Opus가 함께 바꿔야 합니다. Xcode 프로젝트는 extension/popup·content와 manifest만 참조합니다. 그래서 새 폴더(extension/icons/)는 번들에 들어가지 않으며, 쓰려면 make-xcode.sh로 재생성해야 합니다(pbxproj 수기 편집 금지, GUIDELINES 7-5). Assets.xcassets는 통째로 참조되므로 이미지만 추가하면 됩니다. 디자인과 밝은·어두운 툴바 가독성은 사용자가 정하고 확인합니다.

### UX-45

**켜짐·꺼짐과 탭별 변환·건너뜀·오류 상태를 툴바 배지나 아이콘으로 보여 줄 수단이 없음**  
P3 · low · 노력 L · 공통 · 상태 피드백 · 화면 확인 필요 · 선행: UX-44

- **문제**: popup을 열지 않으면 꺼 둔 사실이나 현재 탭이 건너뜀 중인지 알 수 없습니다. 그래서 '왜 HDR이 안 되지' 하는 상황이 생깁니다. 배지나 탭별 아이콘 변경에는 background 스크립트가 필요한데 현재 없습니다.
- **권고**: background(service worker)를 둡니다. content script가 상태를 보내면 action.setBadgeText({tabId})로 변환 중·건너뜀·오류를 표시하고, 꺼짐이면 action.setIcon으로 회색 아이콘을 씁니다. 같은 경로로 popup이 현재 탭의 정확한 상태를 받게 하면 UX-02와 UX-09의 '마지막 탭 기준' 한계도 풀립니다.
- **근거**:
  - [extension/manifest.json:24](../extension/manifest.json#L24) — 권한은 storage뿐
  - [extension/manifest.json:25](../extension/manifest.json#L25) — action은 popup만
  - [PLAN.md:137](../PLAN.md#L137) — background는 두지 않음(필요 시 Opus 승인)
  - [PLAN.md:492](../PLAN.md#L492) — background 없음
- **제약·주의**: background 도입은 PLAN C절과 GUIDELINES 1-3에 따라 Opus 승인 사항입니다. content→background 메시징은 GUIDELINES 2.1-5 개정이 필요합니다. 배지 문구에 URL·제목을 넣지 않습니다. Safari에서 action 배지와 setIcon 동작은 [확인 필요]입니다.

### UX-46

**컨테이너 앱이 영어 Xcode 템플릿 그대로라 설치 다음 단계를 안내하지 않고, 이름·버전·설명이 표면마다 다름**  
P3 · low · 노력 M · 컨테이너 앱 · 온보딩 · 화면 확인 필요

- **문제**: 최초 설치와 7일 재서명 때마다 처음 보는 창이 영어 템플릿 문장과 버튼 하나뿐입니다. lang 속성도 없고, popup·문서는 한국어라 언어가 섞입니다. 서명되지 않은 확장 허용, youtube.com 허용, Safari 재시작 같은 다음 단계가 창에 없습니다. macOS 13 이상에서는 Script.js 영어 문장이 Main.html을 덮어써 HTML만 고치면 반영되지 않습니다. Style.css 때문에 문구를 복사할 수도 없습니다. 이름도 앱·메뉴는 'SDRHDR', 확장 타깃은 'SDRHDR Extension', manifest·문서는 'SDR HDR'이고, 버전은 앱 1.0, manifest 1.0.0입니다. manifest 설명에는 YouTube 전용이라는 말이 없습니다.
- **권고**: Main.html에 lang='ko'를 넣고 문장을 한국어로 바꿉니다. Script.js의 macOS 13+ 대체 문장 3개와 버튼 문구도 함께 바꿉니다(useSettingsInsteadOfPreferences 분기는 'Settings'로 통일). 표시 이름은 'SDR HDR'로 통일합니다. 상태 문구 아래에 번호 체크리스트(① Safari ⌘Q 후 재시작 ② 서명되지 않은 확장 허용 ③ 확장 켜기 ④ www.youtube.com 접근 허용 ⑤ 새로고침 후 popup 확인, 각 install.md 절 번호)를 둡니다. user-select 제한은 버튼에만 남깁니다. 창이 425×325 고정이므로 위쪽 정렬과 스크롤로 바꿉니다. manifest 설명은 'YouTube의 DRM 없는 SDR 영상을 EDR로 확장 표시'로 바꿉니다. 사용자는 Safari 목록에 실제로 보이는 이름을 확인해 install.md 36행에 반영합니다.
- **근거**:
  - [xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html:2](../xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html#L2) — lang 없음
  - [xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html:14](../xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html#L14) — 영어 템플릿 문장
  - [xcode/SDRHDR/SDRHDR/Resources/Script.js:3](../xcode/SDRHDR/SDRHDR/Resources/Script.js#L3) — macOS 13+ 영어 대체 문장
  - [xcode/SDRHDR/SDRHDR/Resources/Style.css:2](../xcode/SDRHDR/SDRHDR/Resources/Style.css#L2) — user-select none
  - [xcode/SDRHDR/SDRHDR/Base.lproj/Main.storyboard:81](../xcode/SDRHDR/SDRHDR/Base.lproj/Main.storyboard#L81) — 고정 크기 창
  - [extension/manifest.json:3](../extension/manifest.json#L3) — 이름 'SDR HDR'
  - [xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj:113](../xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj#L113) — 앱 표시 이름 'SDRHDR'
  - [xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj:122](../xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj#L122) — MARKETING_VERSION 1.0
  - [extension/manifest.json:5](../extension/manifest.json#L5) — 설명에 YouTube 없음
  - [PLAN.md:138](../PLAN.md#L138) — 네이티브 래퍼는 설정 안내만
- **제약·주의**: xcode/ 아래 리소스 문구 수정이 GUIDELINES 7-5·CLAUDE.md 규칙 범위에 드는지는 Opus 판단과 사용자 지시가 필요합니다. make-xcode.sh로 재생성하면 템플릿으로 돌아가므로 수정 내용을 재생성 절차(문서 또는 스크립트 후처리)에 남겨야 합니다. CFBundleDisplayName·MARKETING_VERSION·storyboard 메뉴 이름은 pbxproj 설정이므로 수기 편집하지 않습니다(Xcode UI나 재생성으로 처리). 번들 ID는 바꾸지 않습니다. DEVELOPMENT_TEAM 변경은 커밋하지 않습니다. manifest를 바꾸면 manifest 테스트를 확인합니다.

### UX-47

**컨테이너 앱이 상태 조회 실패를 알리지 않고, 'Quit and Open…' 버튼은 설정 열기에 실패해도 앱을 종료함**  
P3 · low · 노력 M · 컨테이너 앱 · 오류 회복 · 화면 확인 필요

- **문제**: getStateOfSafariExtension이 실패하면 템플릿 주석만 있는 분기에서 return하여 옛 'Preferences' 정적 문구가 그대로 남습니다. 사용자는 실패 사실도 원인(미등록·서명 문제 등)의 단서도 얻지 못합니다. showPreferencesForExtension 콜백은 error를 확인하지 않고 항상 종료하므로, 설정이 열리지 않은 채 창만 사라질 수 있습니다. 마지막 창을 닫으면 앱이 종료되어 다시 보려면 Xcode Run이 필요합니다.
- **권고**: ViewController 실패 분기에서 DispatchQueue.main.async로 `showError(<JSON 인코딩한 error?.localizedDescription>)`를 호출합니다. Script.js에는 showError를 추가해 'Safari에서 이 확장의 상태를 확인하지 못했습니다. 설정 > 확장 목록에 SDR HDR이 보이는지, 서명되지 않은 확장 허용이 켜져 있는지 확인하세요. (오류: …)'를 표시합니다. Main.html 초기 문구는 '상태 확인 중…'으로 바꿉니다. 설정 열기 콜백에서 error != nil이면 종료하지 않고 같은 오류 문구를 띄웁니다. 종료 방식을 유지한다면 버튼 문구는 'Safari 설정 열기(이 창은 닫힘)'로 합니다.
- **근거**:
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:30](../xcode/SDRHDR/SDRHDR/ViewController.swift#L30) — 실패 시 guard return
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:31](../xcode/SDRHDR/SDRHDR/ViewController.swift#L31) — 템플릿 주석만 있음
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:50](../xcode/SDRHDR/SDRHDR/ViewController.swift#L50) — 설정 열기 호출
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:52](../xcode/SDRHDR/SDRHDR/ViewController.swift#L52) — error 확인 없이 terminate
  - [xcode/SDRHDR/SDRHDR/AppDelegate.swift:18](../xcode/SDRHDR/SDRHDR/AppDelegate.swift#L18) — 마지막 창 닫으면 종료
  - [xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html:17](../xcode/SDRHDR/SDRHDR/Resources/Base.lproj/Main.html#L17) — 옛 'Preferences' 버튼 문구
- **제약·주의**: ViewController.swift, Script.js, Main.html만 수정합니다(새 파일 없음, pbxproj 변경 없음). 컨테이너 앱 수정 범위와 재생성 시 덮어쓰기 문제는 UX-46과 같이 Opus가 정합니다. 종료 방식 유지 여부는 사용자 선호입니다. 오류 경로 동작은 사용자 Mac에서 확인합니다.

### UX-48

**컨테이너 앱 창의 확장 켜짐·꺼짐 표시가 창을 연 순간 한 번만 갱신됨**  
P3 · low · 노력 S · 컨테이너 앱 · 상태 피드백

- **문제**: 상태는 웹뷰 로드 완료(didFinish) 때 한 번만 조회됩니다. 사용자가 Safari 설정에서 직접 확장을 켜고 앱으로 돌아와도 'currently off'가 그대로 남아, 켰는데 반영되지 않은 것처럼 보입니다.
- **권고**: ViewController의 조회 코드를 refreshState()로 분리하고, NSApplication.didBecomeActiveNotification을 관찰해 앱이 앞으로 올 때마다 호출합니다.
- **근거**:
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:28](../xcode/SDRHDR/SDRHDR/ViewController.swift#L28) — didFinish에서만 조회
  - [xcode/SDRHDR/SDRHDR/ViewController.swift:29](../xcode/SDRHDR/SDRHDR/ViewController.swift#L29) — 상태 조회 호출
  - [xcode/SDRHDR/SDRHDR/AppDelegate.swift:14](../xcode/SDRHDR/SDRHDR/AppDelegate.swift#L14) — 활성화 처리 없음
- **제약·주의**: 기존 Swift 파일만 고치므로 pbxproj 변경은 없습니다. 컨테이너 앱 수정 범위는 Opus가 정합니다.

### UX-49

**install.md 최초 설치 절차가 막히기 쉬운 지점을 건너뛰고, 앱 위치·다시 열기·끄기·제거 방법이 없음**  
P3 · low · 노력 S · 문서 · 온보딩 · 화면 확인 필요

- **문제**: 34행은 서명할 대상을 하나로 적었지만, 실제로는 앱과 확장 두 타깃이 있습니다. 37행은 개발자 메뉴 항목을 켜라고 하면서 개발자 메뉴를 표시하는 방법은 적지 않았습니다. '목록에 없으면'(6단계)이 켜기·권한(5단계)보다 뒤에 있고, youtube.com 권한 범위(항상/일시)도 없습니다. 또 SDRHDR.app 위치, 창을 닫은 뒤 다시 여는 법, 잠시 끄기·완전 제거 순서가 없어 정리할 때 찾아볼 곳이 없습니다.
- **권고**: 3장을 다음 순서로 다시 씁니다. ① SDRHDR와 SDRHDR Extension 두 타깃 모두 Signing Team 지정 ② Run 후 앱 창 확인 ③ Safari 설정에서 웹 개발자 기능 표시 → '서명되지 않은 확장 허용' ④ 설정 > 확장에서 SDR HDR 켜기 ⑤ www.youtube.com 접근 '항상 허용' ⑥ 새로고침 후 popup 확인. '9. 끄기·제거' 절을 추가해 popup 켜기 해제 / Safari에서 끄기 / Product > Show Build Folder의 SDRHDR.app 삭제 후 Safari 재시작 / 앱 다시 열기를 적습니다. 실제 메뉴 이름과 제거 후 저장값 처리는 [확인 필요]로 둡니다.
- **근거**:
  - [docs/install.md:34](../docs/install.md#L34) — 대상 하나의 Signing만 안내
  - [xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj:143](../xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj#L143) — 확장 타깃(app-extension) 존재
  - [docs/install.md:36](../docs/install.md#L36) — 권한 범위 미기재
  - [docs/install.md:37](../docs/install.md#L37) — 개발자 메뉴 표시 방법 없음
  - [docs/install.md:1](../docs/install.md#L1) — 설치·사용·문제 해결만 다룸
  - [xcode/SDRHDR/SDRHDR/AppDelegate.swift:18](../xcode/SDRHDR/SDRHDR/AppDelegate.swift#L18) — 창 닫으면 앱 종료
- **제약·주의**: 문서만 바꿉니다. Safari 27.2 메뉴 위치, 권한 선택지 이름, 두 타깃 서명 필요 여부, 빌드 산출물 위치, 제거 후 동작은 사용자가 확인해 확정합니다. DEVELOPMENT_TEAM을 커밋하지 않는다는 안내는 유지합니다.

### UX-50

**수동 체크리스트가 현행·보관·완료 절차를 한 파일에 섞고 있고, 상단 요약·HUD 표기·값이 낡음**  
P3 · low · 노력 M · 문서 · 정보 구조 · 선행: UX-11

- **문제**: 맨 위 체크리스트(7~14행)는 M1·0b 시절 그대로입니다. 대체된 '이전 회차' 절차가 현행 절 사이에 끼어 있고, 절마다 같은 준비 과정을 반복합니다. 회신 방법은 프로브 JSON(edr.*) 기준이라 확장 진단에 맞지 않습니다. 10·11행은 HUD에 없는 표기(hdrSource:true, drm:true)를 확인하라고 하는데, DRM에서는 HUD가 아예 사라집니다(UX-13). 175행은 채도 하한이 50%인데 '0%에 가까워지면'이라고 씁니다. 마일스톤이 모두 끝나 회귀 확인용 짧은 절차가 필요한데, 어느 절이 현행인지부터 가려야 합니다.
- **권고**: manual-checklist.md를 다음 순서로 재구성합니다. ① 공통 준비(install.md 4장 참조, 측정 조건 기록) ② 회귀 빠른 점검(오버레이·HUD·진단 복사·HDR/DRM 스킵, 5단계 이내) ③ 절별 회신 템플릿 ④ 프로브용과 확장용으로 나눈 회신 방법. 0a·0b·완료된 M2~M6 절은 docs/archive/로 옮기고 링크만 남깁니다. 10·11행은 'HUD 1줄 skipped(hdrSource)'와 '진단 lifecycle.skipReason이 drm(HUD는 표시되지 않음)'으로, 175행은 '50%에 가까우면 채도가 원본의 절반 수준'으로 고칩니다. 3행의 '클라우드' 문구도 고칩니다. install.md HUD 절에는 'DRM·WebGPU 실패·확장 끔에서는 HUD도 표시되지 않음(정상)'을 추가합니다(UX-13 적용 전까지).
- **근거**:
  - [docs/manual-checklist.md:3](../docs/manual-checklist.md#L3) — '클라우드' 낡은 문구
  - [docs/manual-checklist.md:7](../docs/manual-checklist.md#L7) — 상단 요약이 0a 기준
  - [docs/manual-checklist.md:10](../docs/manual-checklist.md#L10) — HUD 'hdrSource:true' 표기(실제 없음)
  - [docs/manual-checklist.md:11](../docs/manual-checklist.md#L11) — HUD 'drm:true' 표기(실제 HUD 사라짐)
  - [docs/manual-checklist.md:79](../docs/manual-checklist.md#L79) — 대체된 절차가 현행 사이에 위치
  - [docs/manual-checklist.md:175](../docs/manual-checklist.md#L175) — 채도 '0%' 언급(하한 50%)
  - [docs/manual-checklist.md:217](../docs/manual-checklist.md#L217) — 회신 방법이 프로브 필드 기준
  - [docs/install.md:107](../docs/install.md#L107) — HUD 설명에 사라지는 경우 없음
- **제약·주의**: PLAN·STATUS·FIX_GUIDE가 체크리스트 절 이름을 참조하므로 절 이동이나 개명은 Opus가 결정합니다(PLAN 566~567행의 같은 문구 포함). 사용자가 화면으로 판정하는 항목을 Claude가 검증했다고 쓰지 않습니다. DRM 영상에 HUD를 남기는 방안은 UX-13 결정에 따릅니다.

### UX-51

**슬라이더의 접근 가능한 이름에 값이 섞이고 aria-valuetext가 없어 VoiceOver가 %나 × 단위 없이 읽음**  
P3 · low · 노력 S · popup · 접근성 · 화면 확인 필요

- **문제**: 값 span이 label 안에 있어서 접근 가능한 이름이 'HDR 강도 43%'처럼 값을 포함하고, 값이 바뀔 때마다 이름도 바뀝니다. input에 aria-valuetext가 없어 VoiceOver는 원시 value(43, 105)만 읽어 화면 표시와 다르게 들립니다. popup에 heading이 없어 탐색 기준점도 없습니다.
- **권고**: label에는 라벨 텍스트만 두고 `<label for="strength">`로 연결합니다. 값은 label 밖 `<output for="strength" id="strength-value">`로 분리합니다. showSlider, bindSlider, showDetailValue에서 aria-valuetext에 화면과 같은 문자열을 넣습니다. 맨 위에는 작은 `<h1>SDR HDR</h1>`(UX-26 헤더와 통합)을 둡니다.
- **근거**:
  - [extension/popup/popup.html:39](../extension/popup/popup.html#L39) — 값 span이 label 안에 있음
  - [extension/popup/popup.html:40](../extension/popup/popup.html#L40) — range에 aria-valuetext 없음
  - [extension/popup/popup.html:55](../extension/popup/popup.html#L55) — 상세 range
  - [extension/popup/popup.js:32](../extension/popup/popup.js#L32) — 화면 표시 문자열(%)
  - [extension/popup/popup.js:46](../extension/popup/popup.js#L46) — 상세 값 표시 문자열
- **제약·주의**: 마크업을 바꾸면 tests/unit/extension-popup.test.js의 요소 접근을 확인해야 합니다. 저장 동작은 바뀌지 않습니다. 실제 VoiceOver 낭독은 사용자가 확인합니다. UX-18 그리드 변경과 함께 진행합니다.

### UX-52

**오버레이 캔버스와 HUD에 aria-hidden이 없어 VoiceOver 탐색에 끼어들 수 있음**  
P3 · low · 노력 S · 페이지 · 접근성 · 화면 확인 필요

- **문제**: 캔버스는 영상의 HDR 사본이라 순수 장식이고, HUD는 일반 div 텍스트입니다. 그런데 aria-hidden이 없어 VoiceOver로 플레이어를 탐색할 때 컨트롤 사이에 끼어들 수 있습니다. 단일 사용자가 VoiceOver를 쓴다는 근거는 없어 가치는 작습니다.
- **권고**: overlay.js에서 canvas를 만든 직후 `canvas.setAttribute('aria-hidden','true')`를, hud.js createHud에서 `el.setAttribute('aria-hidden','true')`를 넣습니다.
- **근거**:
  - [extension/content/overlay.js:5](../extension/content/overlay.js#L5) — 캔버스 생성
  - [extension/content/overlay.js:9](../extension/content/overlay.js#L9) — video 다음에 삽입
  - [extension/content/hud.js:444](../extension/content/hud.js#L444) — HUD div 생성
- **제약·주의**: 확장이 만든 요소에 속성만 더하므로 셀렉터와 GUIDELINES 2.3에 영향이 없습니다. DRM 영상에는 여전히 아무것도 넣지 않습니다. 실제 노출 여부는 사용자가 VoiceOver로 확인합니다.

### UX-53

**외장 SDR 모니터처럼 EDR이 없는 화면에서도 변환이 계속돼 하이라이트가 잘릴 수 있는데, 감지도 안내도 없음**  
P3 · low · 노력 M · 공통 · 상태 피드백 · 화면 확인 필요

- **문제**: (dynamic-range: high)는 진단 수집 때 한 번만 읽고 변화를 구독하지 않으며, HUD와 popup에도 나오지 않습니다. 창을 외장 SDR 모니터로 옮기면 헤드룸이 1배인데도 기본 곡선(유효 피크 약 ×1.62 이상)이 그대로 출력되어 밝은 영역이 잘릴 수 있습니다. 피크 경고는 2.0 초과에만 뜨므로 이 경우에는 안내가 없습니다. devicePixelRatio도 화면을 옮길 때 다시 읽지 않을 수 있습니다. 대상 환경은 내장 XDR뿐이라 실제 빈도는 낮습니다.
- **권고**: main.js에서 matchMedia('(dynamic-range: high)')의 change를 구독합니다. false일 때 (1) HUD 1줄에 'SDR 화면: HDR 효과 없음, 하이라이트 잘림 가능'을 표시하고 (2) 진단 이벤트에 'display:sdr'를 남깁니다. (3) 선택안으로 새 skip 사유 'sdrDisplay'로 suspend하고 true로 돌아오면 resume합니다. overlay.js에는 resolution media query change 리스너로 schedule()을 다시 호출하게 합니다. install.md 1장 한계에 '외장 SDR 모니터에서는 끈다'를 적습니다.
- **근거**:
  - [extension/content/main.js:486](../extension/content/main.js#L486) — dynamic-range를 한 번만 수집
  - [extension/content/renderer.js:8](../extension/content/renderer.js#L8) — extended 톤매핑 고정
  - [extension/content/itm.wgsl.js:85](../extension/content/itm.wgsl.js#L85) — g 게인 적용
  - [extension/popup/popup.js:7](../extension/popup/popup.js#L7) — 경고 기준 2.0
  - [extension/content/overlay.js:35](../extension/content/overlay.js#L35) — devicePixelRatio 읽기
  - [docs/install.md:12](../docs/install.md#L12) — 다른 환경 미검증
- **제약·주의**: 새 skip 사유는 detect.nextLifecycle 상태표 변경이므로 Opus가 PLAN에 D-절을 추가해야 합니다. JS로는 boolean만 얻을 수 있습니다(A17). 이전 계획의 헤드룸 자동 추정(M5-7, 이전 계획에서 범위 밖으로 둔 항목)과는 다른 단순 감지입니다. Safari 27.2가 디스플레이 이동 시 change를 보내는지는 [확인 필요]이며, 외장 모니터가 있어야 사용자가 확인할 수 있습니다.

### UX-54

**도움말 진입점이 없음: 컨테이너 앱의 'SDRHDR Help'(⌘?)는 막다른 길이고 popup에도 문서 안내가 없음**  
P3 · low · 노력 S · 공통 · 온보딩 · 화면 확인 필요

- **문제**: Help 메뉴의 템플릿 항목이 showHelp:에 연결돼 있지만 Help Book 키가 없습니다. 그래서 누르면 '도움말을 사용할 수 없음' 경고만 뜰 것으로 보입니다. popup에도 문서 안내가 없어, 재서명·건너뜀 사유·noGpu 회복 방법은 저장소 install.md에서만 찾을 수 있습니다. 사용자가 저장소를 가진 개발자 본인이라 영향은 작습니다.
- **권고**: (1) 컨테이너 앱: 가장 싸게는 Xcode Interface Builder로 Help 메뉴 항목을 지웁니다. 또는 AppDelegate에 @IBAction showHelp를 두어 install.md 주소를 NSWorkspace.shared.open으로 엽니다. (2) popup 맨 아래에 '문제 해결: docs/install.md 6~7장' 한 줄을 둡니다. 확장 안에 별도 help.html을 두는 것은 이중 관리가 되므로 하지 않습니다.
- **근거**:
  - [xcode/SDRHDR/SDRHDR/Base.lproj/Main.storyboard:56](../xcode/SDRHDR/SDRHDR/Base.lproj/Main.storyboard#L56) — 'SDRHDR Help' 메뉴
  - [xcode/SDRHDR/SDRHDR/Base.lproj/Main.storyboard:58](../xcode/SDRHDR/SDRHDR/Base.lproj/Main.storyboard#L58) — showHelp: 연결
  - [xcode/SDRHDR/SDRHDR/Info.plist:5](../xcode/SDRHDR/SDRHDR/Info.plist#L5) — Help Book 키 없음
  - [xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj:111](../xcode/SDRHDR/SDRHDR.xcodeproj/project.xcproj#L111) — 생성 Info.plist 사용
  - [docs/install.md:1](../docs/install.md#L1) — 문제 해결 문서는 저장소에만 있음
- **제약·주의**: storyboard 메뉴 삭제와 AppDelegate 코드 추가는 pbxproj를 건드리지 않습니다. 새 리소스 추가는 pbxproj 변경이 필요해 수기 편집이 금지됩니다(GUIDELINES 7-5). 컨테이너 앱 수정 범위는 Opus가 정합니다. 경고가 실제로 뜨는지는 사용자 Mac에서 확인합니다.

## 7. 병합·제외 기록

- 입력 117건을 같은 근본 문제끼리 묶어 54건으로 정리했습니다. 근거 없는 새 항목은 추가하지 않았습니다.
- 근거 'extension/popup/html:0'(빈 인용, 잘못된 경로)은 삭제했습니다(원래 '복사·JSON 저장 모양' 항목).
- 진단 모드 잠금(popup) 5건을 UX-01로 합쳤습니다: 'itm이 아니면 일반 컨트롤이 말없이 잠김'(high), '진단 모드 비활성 + HUD active'의 popup 부분, a11y 관점 1건, settings 관점 1건, '진단 모드를 켠 채 잊음'(high).
- HUD 쪽 진단 모드 표시 3건을 UX-15로 합쳤습니다: 위 항목의 HUD 부분, 'HUD가 진단 모드에서 active 표시', 'HUD에 모드·일시정지 없음'.
- popup 상태 요약 4건을 UX-02로 합쳤습니다: '첫 화면 요약 없음'(high), '상태·건너뛴 사유 요약 없음'(high), '긴 JSON 원문에서 필드 찾기', '권한 없어도 켜짐 표시'의 상태 줄 부분. '켜기 반영 확인 없음'의 낙관적 표시 부분도 여기에 넣었습니다.
- 사용자 지정 곡선 덮어쓰기 3건을 UX-04로 합쳤습니다: popup-layout 항목의 앞부분, safe-defaults 항목, settings-model 항목(high).
- 기본값 복원 5건을 UX-06으로 합쳤습니다: popup-layout 항목의 (1)부분, popup-feedback, container 관점, settings-model, diagnostics 관점. 복원 범위와 위치는 open_questions로 넘겼습니다.
- '밝기 두 뜻 + 선명 안내 반대'(medium) 항목은 둘로 나눴습니다: 선명 문구는 UX-05(같은 지적 3건과 병합), '밝기' 용어는 UX-12(a11y 항목과 병합).
- 선명/선명도 명칭 충돌 4건(popup, HUD, a11y, settings)을 UX-17로 합쳤습니다.
- 유효 피크 표시 3건(뜻·한계·경고 강조, VoiceOver 미알림, 2.0 단계형 설명)을 UX-08로 합쳤고, 계산 오류(UX-03, high)는 별도 항목으로 남겼습니다.
- '켜기' 관련 4건(시각 비중·꺼짐 표현, 반영 확인, 라벨 명칭, 꺼도 활성)을 UX-07로 합쳤습니다.
- 진단 출처·탭 혼동 3건(단일 키, 언제·어느 영상, 여러 탭 덮어쓰기)을 UX-09로 합쳤습니다.
- 회복 안내 4건(noGpu·blackFrame 회복 미안내, noGpu 뭉뚱그림, blackFrame 문서 2건)을 UX-10으로 합쳤습니다. 재시도 버튼 권고는 입력끼리 상충(한쪽은 sdrhdr.retry 버튼 권장, 다른 쪽은 버튼 비권장)해 선택안과 open_question으로 남겼습니다.
- HUD 수명 2건을 UX-13으로, DRM 같은 탭 지속 2건을 UX-14로, PathUndecided 2건을 UX-20으로, A/B 비교·단축키 2건을 UX-22로 합쳤습니다.
- 권한 미허용·지원 범위 3건('진단 없음' 문구, 권한 없어도 켜짐의 권한 문구 부분, www.youtube.com만 대상)을 UX-24로 합쳤습니다.
- 단위·중립점 4건을 UX-30으로, 설명 부족 5건(채도 3종 2건, 확장 시작·곡선 지수, 선명도 0%, 프리셋 설명)을 UX-31로 합쳤습니다. '강도 0%와 끔'과 '강도·P·g 역할'은 medium이라 UX-16으로 따로 두었습니다.
- 복사 피드백 4건을 UX-19로, JSON 저장 링크 4건(textarea box-sizing 포함)을 UX-35로, textarea 2초 갱신 3건을 UX-36으로, 진단 모드 옵션 라벨 2건을 UX-37로 합쳤습니다.
- HUD 영어 식별자 3건을 UX-38로, HUD 크기·대비 2건을 UX-40으로, color-scheme 2건을 UX-33으로, 정적 초기값·storage 실패 2건을 UX-34로 합쳤습니다.
- 측정 직후·일시정지 캡처 항목과 parse-result 캡처 조건 항목을 UX-27로 합쳤고, 파일명 조립과 회신 경로 2건을 UX-29로 합쳤습니다.
- 툴바 아이콘 항목은 1단계(아이콘, UX-44에 앱 아이콘 항목과 병합)와 2단계(background 기반 배지, UX-45, L)로 나눴습니다.
- 컨테이너 앱 영어 템플릿 2건과 이름·버전 불일치 항목을 UX-46으로, 상태 조회 실패와 Quit 버튼 종료를 UX-47로 합쳤습니다. '업데이트 반영 확인'과 'popup 이름·버전 표시 없음'은 UX-26으로 합쳤습니다.
- install.md 설치 절차와 끄기·제거 항목을 UX-49로 합쳤습니다. 체크리스트 222줄 정리 항목과 'drm:true 표기·채도 0%' 문서 항목을 UX-50으로 합쳤습니다(HUD가 사라진다는 사실은 UX-13 근거로도 씀).
- '상세 설정 구분·HUD 체크박스 위치'와 '상세 설정 펼침 기억'을 UX-32로 합쳤습니다.
- 우선순위 조정(규칙과 다른 판단): UX-15(medium·S)는 HUD가 기본 꺼짐이고 popup 경로(UX-01)가 주이므로 P2. UX-18(medium·S)은 상태 오해가 아닌 조작 불편이라 P2. UX-19(medium·S)는 M2~M5 회신이 실제로 복사 경로로 제출되어 P2. UX-24(medium)는 UX-02 의존이라 P2. UX-26(medium·S)은 버전 올림 규칙이 먼저 필요해 P2. UX-10은 핵심이 문서·문구 수정이라 effort S, P1로 보았습니다(재시도 버튼은 선택안). UX-05·UX-11은 medium·S이고 각각 잘못된 조작 유도와 막힘이라 P1입니다.
- 제외(container-app-onboarding): Help 메뉴의 'SDRHDR Help'(⌘?)에 연결된 도움말이 없음 — storyboard 56·58행과 Info.plist를 확인했다. 지적 자체는 맞다. 하지만 시스템 기본 동작이 '도움말 없음' 알림을 띄우므로 조용히 실패하지 않고, 단일 사용자가 ⌘?로 설치 안내를 찾을 가능성도 낮다. 템플릿을 다듬는 수준이라 버렸다.
