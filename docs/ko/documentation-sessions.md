[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[홈으로 돌아가기](./documentation.md) | [채팅, 첨부파일, 명령어](./documentation-chat.md) | [로컬 저장과 복구](./documentation-persistence.md)

# 세션, 에이전트, 실행 모드

## 세션

- 탭은 에이전트 기준으로 정리됩니다
- 실제 세션 식별자는 `agentId + sessionUser` 입니다
- 탭을 닫아도 보기만 숨겨질 뿐 세션은 삭제되지 않습니다

## 에이전트와 모델

- 에이전트는 허용된 런타임 설정에서 가져옵니다
- 모델과 사고 모드는 백엔드가 보고한 옵션을 사용합니다
- 고속 모드와 사고 모드는 세션별로 동기화됩니다

## 실행 모드

- 앱은 기본적으로 mock 모드로도 동작할 수 있습니다
- gateway 가 연결되면 실제 OpenClaw endpoint 를 사용합니다
- 런타임, 인증, 대기열 상태는 헤더에 표시됩니다
