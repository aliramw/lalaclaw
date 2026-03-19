[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[홈으로 돌아가기](./documentation.md) | [빠른 시작](./documentation-quick-start.md) | [채팅, 첨부파일, 명령어](./documentation-chat.md) | [키보드 단축키](./documentation-shortcuts.md) | [로컬 저장과 복구](./documentation-persistence.md)

# 세션, 에이전트, 실행 모드

## 세션 식별 방식

프론트엔드와 백엔드는 두 값으로 세션을 식별합니다.

- `agentId`
- `sessionUser`

실제로는:

- `agentId` 는 어떤 에이전트와 협업하는지 나타냅니다
- `sessionUser` 는 현재 컨텍스트가 어떤 대화 라인에 속하는지 나타냅니다

같은 에이전트라도 여러 `sessionUser` 를 가질 수 있어서 에이전트를 바꾸지 않고 새 컨텍스트를 만들 수 있습니다.

## 에이전트와 IM 탭

채팅 탭은 보이는 이름만이 아니라 실제 세션 정체성으로 관리됩니다.

- 기본 메인 탭은 `agent:main` 입니다
- 추가 에이전트 탭은 같은 `agentId` 를 쓰더라도 서로 다른 `sessionUser` 를 가질 수 있습니다
- DingTalk, Feishu, WeCom 같은 IM 대화도 스위처에서 직접 탭으로 열 수 있습니다
- 각 탭은 자신의 메시지, 초안, 스크롤 위치, 일부 세션 메타데이터를 유지합니다
- 탭을 닫아도 세션 기록은 지워지지 않고 UI 에서만 숨겨집니다

즉:

- 두 탭이 같은 에이전트를 가리키면서도 서로 다른 `sessionUser` 를 가질 수 있습니다
- IM 탭도 내부적으로는 `agentId + sessionUser` 조합으로 해석됩니다
- 이미 열린 에이전트 탭과 IM 채널은 스위처 메뉴에서 제외됩니다

## 세션 단위 설정

백엔드에 저장되는 세션 설정:

- 에이전트
- 모델
- Fast mode
- Think mode

전환 규칙:

- 에이전트를 바꿀 때 모델을 따로 고르지 않으면 그 에이전트의 기본 모델로 돌아갑니다
- 모델은 기본값과 다를 때만 저장됩니다
- Think mode 는 유효성 검사를 통과한 뒤 반영됩니다

## 새 세션 시작

컨텍스트를 비우는 대표적인 방법은 세 가지입니다.

- 채팅 헤더의 새 세션 동작 클릭
- `Cmd/Ctrl + N`
- `/new` 또는 `/reset` 전송

차이점:

- UI 버튼과 단축키는 단순 리셋 동작입니다
- `/new` 와 `/reset` 은 뒤에 prompt 를 붙여 새 세션을 바로 이어갈 수 있습니다

## `mock` 모드

다음 경우 앱은 `mock` 모드에 들어갑니다.

- 로컬 OpenClaw gateway 가 감지되지 않을 때
- 또는 `COMMANDCENTER_FORCE_MOCK=1` 이 설정됐을 때

이 모드에서는 라이브 gateway 가 없어도 채팅, 인스펙터, 파일, 환경 패널을 데모용 데이터와 함께 사용할 수 있습니다.

## `openclaw` 모드

다음 경우 앱은 `openclaw` 모드에 들어갑니다.

- `~/.openclaw/openclaw.json` 을 감지했을 때
- 또는 `OPENCLAW_BASE_URL` 과 관련 환경 변수를 명시했을 때

이 모드에서는 `/api/chat` 이 실제 gateway 로 요청을 보내고, `/api/runtime` 과 인스펙터가 실제 세션 상태를 읽습니다.
