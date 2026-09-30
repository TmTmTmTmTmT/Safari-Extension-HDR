# STATUS.md

## 현재 단계

M2 구현 완료(PR #4, `claude/m2-extension`, PLAN.md D-M2). 다음: 사용자 Mac에서 `scripts/make-xcode.sh` 실행 후 `xcode/` push → CI macOS 빌드 → 설치·0b 측정 → Opus G4 판정. G4 전 M3 착수·PR 머지 금지.

## 완료

- M0 (PR #1 머지): 훅·settings.json(PLAN.md 부록 M0-A 원문), lint/test 골격, ci.yml(ubuntu)
- M1 (PR #2): 0a 프로브(`probe/`), 결과 스키마와 요약(`docs/`, `scripts/parse-result.py`), 픽스처 4개(`fixtures/`, 12초, bt709), sim S1~S7·S10(`sim/`), 결과 JSON(`results/` 13건)
- M2 (PR #4): `extension/` 최소판(3 렌더 모드 itm/identity/stripes, DRM 가드, rAF 루프, 진단 popup), `scripts/make-xcode.sh`, ci.yml macos job, `docs/result-schema-m2.json`, 체크리스트 0b 절, parse-result M2 지원
- 0a 수정 회차 요약: F1~F5(측정 창·픽스처·전체화면 측정), H1~H5(GPU 타임아웃·정리·진단 매트릭스·스키마 v3·S10), J1~J4(rAF 구동, R0/R2/R3/V3 매트릭스, 스키마 v4). 세부는 git 이력
- 판정 결과: G1 통과, G2 통과(안정 후 헤드룸 밝기 낮음 4 / 중간 3 / 최대 2), G3 통과(rAF 구동, 디스플레이 갱신 누락 0, JS p95 ≤ 1.05 ms, 2160p ITM GPU 60Hz 5.3 ms / ProMotion 2.4 ms, 끊김 없음). 렌더 루프는 rAF로 확정(rVFC는 A20에 따라 구동 불가)

## 검증 (→ verify)

- 기준: lint, `npm test`, `pytest sim`, 픽스처 검사, 결과 JSON 처리 / 실제: lint 통과, npm test 40/40, pytest 85/85, check-fixtures 4/4 PASS, parse-result rc=0(v1~v4 11건 + 4차 2건) / (1) 클라우드
- CI(ubuntu): 4593f46까지 green / (1) 클라우드 CI
- `pytest sim`은 이 VM의 `pytest` 실행 파일(uv 격리, numpy 없음) 때문에 `python3 -m pytest sim`으로 실행. CI는 무관
- 사용자 Mac 실측(0a): G1~G3와 H1(새로고침 3회 후 P0-1 유지) 확인 / (3). 픽스처 기준이며 실제 YouTube는 0b(G4)에서 확인

## M2 검증 (→ verify)

- 기준: D-M2 M2-7 1단계 / 실제: lint 통과, npm test 56/56, pytest sim 89/89, buildDiag 출력이 parse-result M2 검증 통과 / (1) 클라우드
- `npm run test:dom`: 이 VM에 WebKit 바이너리가 없고 설치 다운로드 실패로 **미실행**. 같은 spec을 Chromium으로 3/3 통과(참고용, WebKit 검증 아님). ci.yml ubuntu job은 test:dom을 실행하지 않음 / 미검증
- WebGPU·EDR·Safari 확장 로딩·popup·오버레이·DRM 흐름, make-xcode.sh, macOS xcodebuild는 미검증 / (2)(3)

## sim 핵심 수치 (프리셋 정확 / 균형 / 선명)

- S4 음수 채널(RGB 9³ 격자): 0% / 1.33% / 11.34%
- S4 색 패치 ΔE ITP 평균, 채도 효과만: 0 / 4.05 / 19.3
- S5 amp_enc 최대: 8.51 / 7.99 / 6.67
- S10 헤드룸 2에서 잘리는 입력 코드: 0 / 9개(247~255) / 25개(231~255). 헤드룸 4에서도 선명은 6개(g=1.05 때문)

## 미해결 이슈

- FIX_GUIDE.md K1 미구현: 프로브 `missRate`를 디스플레이 갱신 누락률(`displayMissRate`, displayHz 자동 추정, 선택값 불일치 경고)로 교체. M2를 막지 않음. 회귀 도구용
- S2 C¹ 위반 1488점은 `sweep.check`의 한쪽 차분·고정 허용오차 때문(곡선 결함 아님). 검사법 수정은 Opus 결정
- run_all 산출 md 표가 prettier 정렬 형식이 아님(stdout 전용이라 커밋 대상 아님)
- eslint.config.js에 probe용 브라우저 globals 없음(no-undef 꺼져 있어 lint 통과)
- 픽스처 재생성이 느림(`geq` 방식, 4개 약 28분). 픽스처는 커밋되어 있어 재생성 불필요
- 우하단 움직이는 박스가 램프 마지막 100% 계단 패치 모서리를 일부 덮음
- 3차에서 관측된 rVFC 초당 30회는 4차에 재현되지 않음(60Hz 53~56회/s). 원인 미확인, 누락은 여전히 11~32%라 결론 유지

## M2 CI 진행 (7edf085 이후)

- 러너 converter 임시 프로젝트 생성·컴파일까지 성공, `ValidateEmbeddedBinary`에서 실패: 앱 ID `io.github.tmtmtmtmtmt.SDRHDR`, 확장 ID `io.github.tmtmtmtmtmt.sdrhdr.Extension`(대소문자 불일치로 접두 검증 실패). 원인 추정: converter가 앱 ID 마지막 요소를 앱 이름으로 만듦. 조치: 기본 `--bundle-identifier`를 `io.github.tmtmtmtmtmt.SDRHDR`로 변경(make-xcode.sh, ci.yml). PLAN.md M2-3의 기본값 표기(`…sdrhdr`)와 달라짐, Opus 확인 필요
- 사용자 Mac의 커밋된 `xcode/`는 소문자 ID로 생성돼 같은 검증에 실패할 가능성이 큼. 재생성 필요(`rm -rf xcode` 후 `bash scripts/make-xcode.sh`).
- → verify: c6fc106에서 CI ubuntu(test:dom 포함)·macos(러너 converter 임시 프로젝트 무서명 빌드) 모두 success / (2). 다음: 사용자 Mac에서 `rm -rf xcode` 후 재생성·push

## Opus 판정 반영 (FIX_GUIDE L1~L6, 구현 완료 · 검증 대기)

- Xcode 형식 불일치(사용자 Xcode-beta `project.xcproj` vs 러너 26.x)는 (d)로 결정됨(FIX_GUIDE 판정 요약)
- L1 macos job: 러너 converter로 임시 프로젝트 생성 후 무서명 빌드, 커밋된 `project.xcproj`는 A16 검사만 · L2 make-xcode.sh 안내 · L6 ubuntu에 test:dom · L4 loadeddata 1회 렌더 · L5 진단 타입 확정 · L3 보류 항목 승인(코드 변경은 `main.start` 예외를 errors에 기록)
- → verify: lint 통과, npm test 62/62, pytest sim 91/91 / (1). macOS 임시 프로젝트 빌드, WebKit DOM 3건은 PR CI 결과로 확인 / (2) 미확인. 일시정지 attach 첫 프레임·`getConfiguration().toneMapping` 실제 형태는 (3) 미검증

## Opus 확인 필요

- M4 프리셋 결정 자료(S10): 균형(P=3)은 밝기 최대(헤드룸 2)에서 하이라이트가 잘림. 결정 조건은 PLAN.md C절 '0a 헤드룸 제약'. 선명은 g>1이라 P=H에서도 잘림
- S4/S5 기준 확정(균형·선명의 음수 채널·ΔE 목표, S5 스텝 증폭 기준, "정확"의 끝 기울기 f'(1)≈13)
- S6 BT.2446 Method C 열은 원문 재현이 아닌 근사(계수 '미확인'), S4 ΔE ITP의 LMS 행렬은 기억 기반 계수
- P0-2 참조 HDR 이미지가 저장소에 없음
- 프리셋 기본 피크 배율 P와 밝기 대응 방식(M4)

## 다음 단계

- 사용자 Mac: `bash scripts/make-xcode.sh` → `xcode/` 커밋·push → CI macos 빌드 확인 → Xcode 서명 실행·Safari 확장 켜기 → docs/manual-checklist.md 0b 실행, 진단 JSON을 results/에 push(PLAN.md D-M2 M2-7)
- K1은 별도 소규모 PR로 처리
- M2 판정(0b, G4) 전에는 M3 이후 착수 금지 (PLAN.md D절 게이트)
