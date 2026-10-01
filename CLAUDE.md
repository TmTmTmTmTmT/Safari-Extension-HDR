# CLAUDE.md — Safari SDR→HDR(EDR) 확장

## 개발 역할 분담 — Opus / Sonnet

원칙: 계획 수립과 실행을 모델별로 분리. 한 모델이 계획+실행 동시 금지.

| 구분 | 담당 모델 | 범위 |
|---|---|---|
| 계획·가이드라인 | Opus 전용 | 개발 계획, 코딩 가이드라인, 오류 수정 가이드라인 |
| 실행 | Sonnet 전용 | 계획·가이드라인에 따른 개발, 테스트, 시뮬레이션, 디버깅, 오류 실제 수정 |

### Opus (계획 단계)
- 요구사항 분석, 아키텍처 설계, 작업 분해, 코딩 가이드라인/컨벤션 작성
- 오류 발생 시: 원인 분석 후 수정 방향을 가이드라인 문서로만 작성 (코드 직접 수정 금지)
- 결과물은 반드시 파일로 남김: PLAN.md, GUIDELINES.md, FIX_GUIDE.md 등
- 코드 실행, 파일 수정, 테스트 실행 금지

### Sonnet (실행 단계)
- Opus 작성 계획·가이드라인 문서에 따라 실제 코드 작성
- 테스트 코드 작성·실행, 시뮬레이션 실행
- 디버깅 (원인 추적, 로그/스택트레이스 확인)
- 가이드라인에 명시된 방향에 따른 오류 실제 수정
- 계획 문서에 없는 설계 변경 임의로 하지 않음
- 작업 완료할 때마다 STATUS.md에 진행 상황 기록

### 전환 규칙
1. 새 기능/모듈 착수 → Opus가 계획 작성 후 문서화
2. 계획 문서 완성 → Sonnet 전환해 구현·테스트
3. 오류 발생 → Opus 전환해 원인 분석 + 수정 가이드라인 문서화 → Sonnet 전환해 가이드라인대로 실제 수정
4. Sonnet 작업 중 계획에 없는 설계 이슈 발견 시: 직접 변경 금지 → 이슈 기록 후 Opus 단계로 반환
5. 계획·가이드라인 문서 없는 상태에서 Sonnet이 구현 시작 금지 (훅으로 강제)
6. 모델 전환 필요 시 응답 가장 마지막에 전환 요청

### 서브에이전트 위임 (기본값: 위임)

조건에 해당하면 직접 수행하지 않고 서브에이전트에 위임한다. 직접 수행이 예외다.

| 작업 | 에이전트 | 모델 | 호출 주체 |
|---|---|---|---|
| 코드베이스 탐색, 파일/문서 조사 | Explore (내장) | Haiku | Opus, Sonnet |
| 시뮬레이션, 테스트, 배치 실행, 로그 집계 (출력이 길거나 반복·병렬 실행) | sim-runner | Haiku | Sonnet |
| 서로 독립적인 구현 작업 단위 (PLAN.md에 분리되어 있는 것) | impl-worker | Sonnet | Sonnet |

- Opus는 코드 실행·수정이 금지이므로 sim-runner, impl-worker를 호출하지 않는다. 조사는 Explore에 맡기고 요약만 받아 계획을 작성한다
- 서로 독립적인 작업이 2개 이상이면 한 번에 여러 서브에이전트를 병렬 호출한다. impl-worker 병렬 시 수정 대상 파일이 겹치지 않게 나눈다
- 위임 프롬프트에 대상 문서(PLAN.md 항목 등), 실행할 명령, 반환 형식을 명시한다. 서브에이전트는 대화 내용을 볼 수 없다
- 직접 수행: 원인 분석, 설계 판단, 계획 이탈 판단, STATUS.md 갱신. 서브에이전트는 STATUS.md를 수정하지 않고, 결과 요약을 받아 본 세션이 기록한다

### 세부 규칙 위치
- 핸드오프·FIX_GUIDE.md 필수 항목 → `.claude/rules/handoff.md`
- STATUS.md 기록 규칙 → `.claude/rules/status-md.md`
- 새 세션 / 모델 전환 / /clear 직후 → `session-resume` 스킬 (`.claude/skills/session-resume/SKILL.md`)
- STATUS.md는 매 턴 자동으로 읽지 않음. 새 세션/모델 전환 직후, 진행 상황 확인 필요 시, Opus 검토 개입 시에만 읽음
- 훅(`.claude/hooks/require-plan.sh`)은 "PLAN.md 없는 상태의 비문서 파일 작성"만 차단한다. 모델 역할 분리 자체는 위 규칙으로 지킨다

---

## 프로젝트 범위 (엄수)
- 목표: macOS Safari Web Extension으로 DRM 없는 SDR 영상(주 대상 YouTube)을 실시간 inverse tone mapping 후 EDR로 출력한다.
- DRM(EME/FairPlay) 영상은 감지 즉시 no-op한다. DRM 회피, 화면 캡처 우회 코드는 금지한다.
- 네이티브 헬퍼(ScreenCaptureKit + Metal, PLAN.md F-A)는 Opus가 게이트 판정 기록에 착수를 지시한 뒤에만 구현한다.

## 환경 한계
- 2026-10-01부터 작업은 **사용자 Mac의 로컬 Claude Code 세션**에서 한다(설정: `docs/local-session.md`). 이전 클라우드 세션 기록은 git 이력과 STATUS.md에 있다.
- 로컬 세션에서 가능: 단위 테스트, numpy 시뮬레이션, Playwright WebKit DOM 테스트(Safari 확장 환경 아님), `xcodebuild`(무서명 빌드), `scripts/*.sh` 실행, git push.
- 로컬 세션에서도 하지 않는 것: WebGPU 출력·EDR 밝기·끊김·Safari 확장 동작을 Claude가 "검증했다"고 쓰지 않는다. 화면을 보는 판정은 사용자가 `docs/manual-checklist.md`로 하고 결과 JSON·관찰을 회신한다. Safari 설정 변경, 확장 허용, Xcode 서명 팀 지정은 사용자가 한다.
- Xcode 프로젝트(`xcode/`) 재생성·pbxproj 편집은 사용자 지시가 있을 때 `scripts/make-xcode.sh`로만 한다(수기 편집 금지, GUIDELINES 7-5). `DEVELOPMENT_TEAM` 변경은 커밋하지 않는다.
- 대상 환경: M1 Pro, 내장 XDR, macOS 27.2, Safari 27.2.

## 명령 (M0 이후 유효)
- `npm run lint` / `npm test` / `npm run test:dom` / `python3 -m pytest sim`

## 문서 세트 (저장소 루트)
- `PLAN.md` 계획 · `GUIDELINES.md` 코딩 규칙 · `FIX_GUIDE.md` 오류 수정 지침(오류 시) · `STATUS.md` 진행 기록
