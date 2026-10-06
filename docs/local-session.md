# 로컬 Mac 세션 준비 (2026-10-01)

클라우드 세션에서 사용자 Mac의 로컬 Claude Code 세션으로 옮긴다. 규칙(CLAUDE.md, `.claude/`)은 저장소에 있으므로 그대로 적용된다.

## 1. 도구 확인 (한 번만)

```
xcode-select -p                 # /Applications/Xcode-beta.app/... (또는 안정판 Xcode)
node --version                  # v22.x (없으면 brew install node@22)
python3 --version               # 3.11 이상
python3 -m venv .venv && .venv/bin/pip install pytest numpy
git --version
claude --version                # Claude Code CLI (없으면 설치)
```

GitHub 인증: `git push`가 되는지 확인한다. PR 작업까지 Claude에 맡기려면 `brew install gh && gh auth login`.

## 2. 저장소 준비

이미 clone한 폴더(`~/Safari_Extention-HDR`)를 쓴다.

```
cd ~/Safari_Extention-HDR
git fetch origin
git checkout claude/m3-lifecycle
git pull origin claude/m3-lifecycle
npm ci
npx playwright install webkit   # test:dom 실행용
npm run lint && npm test && npm run test:dom && .venv/bin/python -m pytest sim
```

마지막 줄이 모두 통과하면 준비 완료다. Xcode에서 개인 팀을 지정한 변경은 커밋하지 않는다(`git status`에 `xcode/` 변경이 보이면 `git restore xcode` 전에 내용을 확인).

## 3. 세션 시작

```
cd ~/Safari_Extention-HDR
claude
```

첫 메시지 예:

```
session-resume 스킬로 STATUS.md 기준 상태를 복구하고, PLAN.md D-M3 M3-6 1단계부터 진행해.
```

- 모델 전환은 `/model`로 한다. 역할 분리(CLAUDE.md): 계획·판정은 Opus, 구현·테스트는 Sonnet. 지금 단계는 **Sonnet**으로 시작한다(M3 계획은 작성 완료).
- 훅(`.claude/hooks/require-plan.sh`)은 macOS에서도 동작한다. 처음 실행 시 권한 확인이 나오면 허용한다.

## 4. 클라우드 세션과의 차이

- PR CI·리뷰 알림 자동 수신 없음. CI 결과는 GitHub 웹 또는 `gh pr checks`로 확인한다.
- 로컬 세션은 `xcodebuild`, `scripts/make-xcode.sh`, `python3 -m http.server`(프로브)를 직접 실행할 수 있다. 화면 판정(EDR, 끊김, 위치)은 여전히 사용자가 한다.
- 결과 JSON은 popup에서 복사해 `results/`에 파일로 저장하면 세션이 바로 읽는다(업로드 불필요).
- 브랜치 규칙: `main` 직접 push 금지, 마일스톤 브랜치 `claude/m3-lifecycle`에서 작업, draft PR 1개(base `main`).
