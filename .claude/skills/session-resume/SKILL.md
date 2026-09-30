---
name: session-resume
description: 새 세션 시작, /clear 직후, Opus/Sonnet 모델 전환 직후, 이전 진행 상황 확인이 필요할 때 STATUS.md 기준으로 작업 상태를 복구하는 절차
---

# 세션 재개 절차

- STATUS.md와 관련 계획/가이드라인 문서(PLAN.md, GUIDELINES.md, FIX_GUIDE.md)만 읽는다
- 전체 대화 기록 복원을 시도하지 않는다
- STATUS.md의 "다음 단계"부터 이어서 진행한다
- Opus가 검토 단계로 개입하는 경우에도 구현 코드 전체가 아니라 STATUS.md + 관련 가이드라인 문서만 근거로 판단한다
- 세션을 넘길 때 요약을 대화창에 다시 출력하지 않는다. 파일 갱신으로 대체한다

STATUS.md는 위 경우에만 읽는다. 대화 중 매 턴 자동으로 읽지 않는다.
