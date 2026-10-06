# SDR HDR (Safari 확장)

macOS Safari에서 DRM 없는 SDR 영상(주 대상 YouTube)을 실시간으로 HDR(EDR) 밝기로 확장하는 Safari Web Extension입니다. DRM 영상은 건드리지 않고 원본 그대로 재생합니다.

## 요구 환경

macOS 26 이상, Safari 26 이상(WebGPU), EDR 디스플레이, Xcode(앱 설치 후 한 번 실행), Apple ID(무료 개인 팀으로 충분). 실측은 macOS 27.2 · Safari 27.2 · M1 Pro 내장 XDR뿐입니다.

## 설치

```bash
git clone <저장소 주소> && cd Safari_Extention-HDR
scripts/install.sh
```

서명 팀 탐색, 빌드, 이전 사본 정리, `/Applications` 설치, 앱 실행까지 자동입니다.

필요한 파일만 받고 싶다면(개발 문서·테스트 제외, 선택 사항):

```bash
git clone --filter=blob:none --sparse <저장소 주소> && cd Safari_Extention-HDR
git sparse-checkout set --no-cone /extension /xcode /scripts/install.sh /scripts/lib /scripts/make-xcode.sh /README.md /docs/install.md
scripts/install.sh
```

GitHub의 "Download ZIP"과 Release 소스 압축본에도 개발 전용 파일은 들어 있지 않습니다. ZIP으로 받은 경우 `--update`는 쓸 수 없고, 새 ZIP을 받아 `scripts/install.sh`를 다시 실행하세요.

## 업데이트

```bash
scripts/install.sh --update
```

## 직접 해야 하는 단계

1. Xcode › 설정 › 계정에 Apple ID 추가(처음 한 번)
2. Safari 설정 › 확장 프로그램에서 SDR HDR 켜기
3. 확장의 웹사이트 접근에서 www.youtube.com 허용

열린 SDR HDR 창이 점검 목록으로 남은 항목을 안내합니다. 자세한 내용과 문제 해결은 [docs/install.md](docs/install.md).
