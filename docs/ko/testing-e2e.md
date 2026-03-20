[English](../en/testing-e2e.md) | [한국어](../ko/testing-e2e.md)

# 브라우저 E2E 테스트

이 가이드는 LalaClaw의 브라우저 수준 엔드투엔드 테스트 기준을 정의합니다.

[CONTRIBUTING.md](../../CONTRIBUTING.md)와 함께 읽어 주세요. `CONTRIBUTING.md`는 전체 기여 흐름을 설명하고, 이 문서는 언제 Playwright 커버리지를 추가해야 하는지, 어떻게 안정성을 유지할지, 그리고 현재 저장소가 브라우저 테스트에 무엇을 기대하는지 설명합니다.

## 현재 스택

- 프레임워크: Playwright
- 테스트 디렉터리: `tests/e2e/`
- 메인 설정: [`playwright.config.js`](../../playwright.config.js)
- 테스트 서버 부트스트랩: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

현재 설정은 다음을 시작합니다.

- 프론트엔드 개발 서버: `http://127.0.0.1:5173`
- 백엔드 개발 서버: `http://127.0.0.1:3000`

Playwright 부트스트랩 스크립트는 백엔드를 `COMMANDCENTER_FORCE_MOCK=1` 모드로 실행하므로, 브라우저 테스트는 기본적으로 실제 OpenClaw 환경에 의존하지 않습니다.

## 언제 브라우저 E2E가 필요한가

변경이 다음 영역 중 하나 이상에 영향을 준다면 브라우저 e2e를 추가하거나 업데이트해야 합니다.

- 메시지 전송 / 중지 / 재시도 동작
- 대기열 턴과 대화 영역으로의 지연 진입
- 세션 bootstrap, 세션 전환, 탭 라우팅
- 실제 렌더 이후에만 드러나는 hydration 및 복구 동작
- hook 또는 controller 테스트만으로는 신뢰하기 어려운 브라우저 가시 회귀

순수 상태 전이는 controller 수준 또는 `App` 수준 Vitest를 우선하세요. 위험이 실제 DOM 타이밍, 포커스 동작, 라우팅, 요청 순서, 다단계 UI 흐름에 달려 있을 때 브라우저 e2e를 추가합니다.

## 우선 무엇을 커버할까

저장소가 처음부터 넓은 브라우저 커버리지를 가질 필요는 없습니다. 먼저 가장 위험한 사용자 경로를 안정화하세요.

우선순위 흐름:

1. 앱 부팅과 첫 렌더
2. 일반적인 전송 / 응답 1회 사이클
3. 대기열 전송이 자신의 차례 전에는 대화에 들어가지 않는지
4. 진행 중인 응답에 대한 stop / abort
5. IM 탭이나 agent 전환 같은 세션 bootstrap 경로

버그 수정이 큐잉, 스트리밍, stop, hydration, session/runtime 동기화에 영향을 준다면, 보통 그 사용자 가시 실패 모드를 정확히 겨냥한 브라우저 회귀를 하나 추가해야 합니다.

## 안정성 규칙

브라우저 e2e는 시각적 사소함이 아니라 안정적인 동작 검증을 위해 작성해야 합니다.

- 내부 구현 세부정보보다 사용자에게 보이는 동작을 우선 검증한다
- 텍스트, role, label, 안정적인 컨트롤을 기준으로 검증한다
- 버그 자체가 애니메이션 타이밍과 관련 있지 않다면 애니메이션 시간에 의존하지 않는다
- class 자체가 동작의 일부가 아니라면 취약한 Tailwind 클래스명 검증을 피한다
- 관련 `/api/*` 호출은 테스트에서 route mock 하여 네트워크를 결정적으로 유지한다
- 입력, 클릭, 탭 포커스, 요청 순서는 실제 브라우저 상호작용으로 다룬다

큐잉 또는 스트리밍 흐름에서는 다음을 우선 검증하세요.

- 메시지가 대화 영역에 보이는지
- 아직 대기열 영역에만 남아 있는지
- 이전 턴이 끝난 뒤에만 나타나는지
- 보이는 순서가 실제 턴 순서와 일치하는지

## Mock 전략

기본적으로 브라우저 e2e를 실제 OpenClaw 배포에 직접 연결하지 마세요.

권장 순서:

1. Playwright 테스트 안에서 관련 `/api/*` 요청을 route 한다
2. 저장소의 mock 모드를 사용한다
3. 작업이 동등한 실제 검증을 명시적으로 요구할 때만 실제 외부 의존성을 사용한다

현재 [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js)는 이 패턴을 따릅니다.

- `/api/auth/state` 는 stub 처리됨
- `/api/lalaclaw/update` 는 stub 처리됨
- `/api/runtime` 는 stub 처리됨
- `/api/chat` 은 각 테스트가 제어하여 큐 순서와 완료 타이밍을 결정적으로 유지함

## 작성 가이드

각 브라우저 e2e는 좁은 범위로 유지하세요.

- 하나의 spec 파일은 보통 하나의 제품 영역에 집중한다
- 하나의 테스트는 보통 하나의 사용자 흐름만 검증한다
- 큰 JSON을 각 테스트에 복사하기보다 작은 helper / fixture 파일을 선호한다
- 가능하면 snapshot builder를 재사용하여 `App.test.jsx` 와 정렬을 유지한다

좋은 예:

- "대기열 턴은 실제로 시작되기 전까지 대화에 들어가지 않는다"
- "stop 후 전송 버튼이 돌아온다"
- "Feishu bootstrap 탭이 첫 전송 전에 네이티브 session user 로 해석된다"

덜 유용한 예:

- "버튼이 정확히 이 utility class 집합을 가진다"
- "관련 없는 세 가지 흐름을 한 테스트에 넣는다"
- "route mock 으로 충분한데도 실제 원격 서비스를 사용한다"

## 로컬 실행

먼저 Playwright 브라우저를 한 번 설치하세요.

```bash
npm run test:e2e:install
```

브라우저 e2e 실행:

```bash
npm run test:e2e
```

브라우저를 보이게 실행:

```bash
npm run test:e2e:headed
```

Playwright UI 실행:

```bash
npm run test:e2e:ui
```

## CI 기대사항

CI에는 전용 브라우저 e2e job 이 있으며 [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)에 정의되어 있습니다.

이 job 은 작고 안정적으로 유지되어야 합니다.

- 브라우저 스위트는 모든 PR에서 안정적으로 돌 수 있을 만큼 작게 유지한다
- 넓은 탐색 시나리오보다 고가치 회귀를 먼저 추가한다
- flaky wait 나 긴 sleep 을 도입하지 않는다

새 브라우저 테스트가 너무 느리거나 환경 의존성이 높다면, 단순화하거나 안정화하기 전까지 기본 `test:e2e` 경로에 넣지 않아야 합니다.

## 권장 리뷰 체크리스트

브라우저 e2e 변경을 머지하기 전에 확인하세요.

- 정말 브라우저 e2e가 필요한가, 아니면 `App` / controller 커버리지로 충분한가
- 구현 세부사항이 아니라 사용자 가시 동작을 검증하는가
- 필요한 네트워크 상태를 결정적으로 제어하는가
- 6개월 뒤 UI 스타일이 바뀌어도 여전히 의미 있는 테스트인가
- 우리가 실제로 신경 쓰는 사용자 회귀에서 이 테스트가 실패하는가

## 관련 파일

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
