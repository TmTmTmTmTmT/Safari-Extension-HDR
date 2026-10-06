# SDR HDR

macOS Safari에서 **DRM 없는 SDR 영상(주 대상 YouTube)을 실시간으로 HDR(EDR) 밝기로 확장**하는 Safari Web Extension입니다. WebGPU로 영상 프레임에 inverse tone mapping을 적용해 HDR 디스플레이의 밝기 여유(헤드룸)까지 사용합니다.

- DRM(EME/FairPlay) 영상은 감지 즉시 아무것도 하지 않고 원본 그대로 재생합니다. DRM 회피·화면 캡처 우회는 하지 않습니다.
- 이미 HDR인 영상, PiP 중인 영상도 건드리지 않습니다.
- popup에서 프리셋(정확·균형·강조·사용자 지정), HDR 강도, 선명도, 채도, 상세 곡선을 조절할 수 있고 단축키(Option+H: 누르는 동안 원본 보기, Option+Shift+H: 켜기/끄기)를 지원합니다.
- 영상 URL·제목 등은 어디에도 전송하거나 저장하지 않습니다. 확장은 `https://www.youtube.com/*`에서만 동작하고 외부 통신이 없습니다.

## 요구 환경

| 항목       | 내용                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| macOS      | 26 이상                                                                                              |
| Safari     | 26 이상 (WebGPU 필요)                                                                                |
| 디스플레이 | EDR(HDR) 지원                                                                                        |
| Xcode      | 설치 후 한 번 실행. 저장소의 프로젝트는 Xcode 27.2 베타로 만들었고 안정판 호환은 확인하지 못했습니다 |
| 서명       | Apple ID(무료 개인 팀으로 충분)                                                                      |

실측 환경은 macOS 27.2 · Safari 27.2 · M1 Pro 내장 XDR뿐입니다. 다른 환경은 검증하지 않았습니다.

## 설치

```bash
git clone https://github.com/TmTmTmTmTmT/Safari-Extension-HDR.git && cd Safari-Extension-HDR
scripts/install.sh
```

환경 점검, 서명 팀 탐색, 서명 빌드, 이전 사본 정리(확인 후 휴지통), `/Applications` 설치, 앱 실행까지 자동입니다. 빌드된 앱은 배포하지 않고 **받는 사람의 Mac에서 그 사람의 개인 팀으로 서명**합니다.

설치 후 직접 해야 하는 단계:

1. Xcode › 설정 › 계정에 Apple ID 추가 (처음 한 번)
2. Safari 설정 › 확장 프로그램에서 SDR HDR 켜기
3. 확장의 웹사이트 접근에서 www.youtube.com 허용

열린 SDR HDR 창이 점검 목록(서명·사본·확장 켜짐·접근 허용)으로 남은 항목을 안내합니다. 개발자 메뉴의 "서명되지 않은 확장 허용"은 서명이 확인되면 꺼 두세요(켜 두면 서명되지 않은 다른 확장도 로드될 수 있습니다).

<details>
<summary>필요한 파일만 받기 / ZIP으로 받기</summary>

```bash
git clone --filter=blob:none --sparse https://github.com/TmTmTmTmTmT/Safari-Extension-HDR.git && cd Safari-Extension-HDR
git sparse-checkout set --no-cone /extension /xcode /scripts/install.sh /scripts/lib /scripts/make-xcode.sh /README.md /docs/install.md
scripts/install.sh
```

GitHub의 "Download ZIP"과 Release 소스 압축본에도 개발 전용 파일은 들어 있지 않습니다. ZIP에는 `.git`이 없어 `--update`를 쓸 수 없으므로 새 ZIP을 받아 `scripts/install.sh`를 다시 실행하세요.

</details>

## 업데이트

```bash
scripts/install.sh --update
```

끝난 뒤 Safari를 완전히 종료(⌘Q)하고 다시 열어 popup 헤더 버전을 확인합니다. 옵션: `-y`(확인 생략), `--no-open`, `--dry-run`(아무것도 바꾸지 않고 명령만 출력).

## 알려진 한계

- HDR 변환의 화면 확인(밝기·끊김)은 작성자 Mac에서 눈으로만 확인했습니다. 4K 장시간 재생 시 메모리 증가, 비60fps 영상의 끊김, 전체화면 비용은 측정 전입니다.
- 광고, PiP 복귀, 미니플레이어 동작은 미확인입니다.
- 무료 개인 팀 서명은 만료될 수 있습니다. 확장이 사라지면 `scripts/install.sh`를 다시 실행하세요.

자세한 사용법·문제 해결·제거 방법은 [docs/install.md](docs/install.md)를 보세요. 문제는 [이슈](https://github.com/TmTmTmTmTmT/Safari-Extension-HDR/issues/new/choose)로 알려 주세요(진단 JSON 첨부 안내가 템플릿에 있습니다).
