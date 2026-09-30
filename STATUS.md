# STATUS.md

## 현재 단계

M0 (골격 + 훅) 완료. M1 착수 전.

## 완료

- M0: `.claude/hooks/require-plan.sh`, `.claude/settings.json` (PLAN.md 부록 M0-A 원문), package.json(eslint, prettier, @playwright/test), eslint/prettier/playwright 설정, `tests/unit/smoke.test.js`, `sim/test_smoke.py`, `.github/workflows/ci.yml`(ubuntu)

## 검증 (→ verify)

- 훅 절차 1~3: 빈 디렉터리+a.js → exit 2 + 차단 메시지 / 저장소 루트+a.js → 0 / *.md → 0. 통과 / (1) 클라우드
- `npm run lint`, `npm test`(1 pass), `pytest sim`(1 pass), `npm run test:dom`(테스트 0건, --pass-with-no-tests) 통과 / (1) 클라우드
- CI ubuntu: 7fc964d에서 green (push·pull_request 실행 모두 success) / (1) 클라우드 CI (45d1ce9는 STATUS.md prettier 오류로 실패, 수정 완료)

## 미해결 이슈

- 없음

## Opus 확인 필요

- 없음

## 다음 단계

- M1 착수: probe/, scripts/make-fixtures.sh, fixtures/, sim/ S1~S7
- M1 판정 전에는 M2 이후 착수 금지 (PLAN.md D절 게이트)
