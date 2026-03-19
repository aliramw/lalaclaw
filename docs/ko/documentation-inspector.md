[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[홈으로 돌아가기](./documentation.md) | [인터페이스 개요](./documentation-interface.md) | [채팅, 첨부파일, 명령어](./documentation-chat.md) | [API 및 문제 해결](./documentation-api-troubleshooting.md)

# 인스펙터, 파일 미리보기, 추적

오른쪽 인스펙터는 LalaClaw 의 핵심 화면 중 하나입니다. 현재 세션 정보를 `Files`, `Artifacts`, `Timeline`, `Environment` 네 탭으로 정리합니다.

## Files

`Files` 탭은 두 영역으로 나뉩니다.

- `Session Files`: 현재 대화에서 다뤄진 파일을 `Created`, `Modified`, `Viewed` 로 그룹화
- `Workspace Files`: 현재 workspace 루트를 기준으로 한 트리

주요 동작:

- workspace 트리는 한 번에 한 디렉터리 레벨씩 로드됩니다
- 접혀 있어도 각 섹션의 개수 badge 는 유지됩니다
- 비어 있는 `Session Files` 섹션은 숨겨집니다
- session 과 workspace 필터는 일반 텍스트와 간단한 glob 패턴을 지원합니다

상호작용:

- 파일을 클릭하면 미리보기를 엽니다
- 파일을 우클릭하면 절대 경로를 복사합니다
- workspace 폴더를 우클릭하면 해당 레벨만 새로고침할 수 있습니다

## Artifacts

`Artifacts` 탭은 현재 세션의 어시스턴트 답변 요약을 보여줍니다.

- 요약을 클릭하면 해당 채팅 메시지로 돌아갑니다
- 긴 대화에서 중요한 답변을 빠르게 찾을 수 있습니다
- `View Context` 로 현재 모델에 전달되는 세션 컨텍스트를 확인할 수 있습니다

## Timeline

`Timeline` 탭은 실행 기록을 런 단위로 묶어 보여줍니다.

- 실행 제목과 시간
- 프롬프트 요약과 결과
- 도구 입력, 출력, 상태
- 해당 실행과 연결된 파일 변경
- 파견 작업과 협업 관계

## Environment

`Environment` 탭에는 다음 같은 런타임 정보가 모입니다.

- 상단의 `OpenClaw 진단` 요약. `개요`, `연결 상태`, `Doctor`, `로그` 로 묶여 표시됩니다
- OpenClaw 버전, runtime profile, config 경로, workspace 루트, gateway 상태, health URL, 로그 진입점
- runtime transport, runtime socket 상태, reconnect 횟수와 fallback reason
- 하위 기술 그룹으로 session context, realtime sync, gateway config, application, other

주요 동작:

- 상단 진단 요약으로 올린 필드는 아래 기술 그룹에서 중복 표시하지 않습니다
- JSON session key 같은 긴 값은 가로로 넘치지 않고 컨테이너 안에서 줄바꿈됩니다
- 로그나 설정 파일처럼 확인된 절대 경로는 클릭하면 공용 파일 미리보기로 열립니다
- 로그 디렉터리나 현재 세션 Agent 작업 디렉터리 같은 폴더 경로는 인라인 미리보기를 열지 않고 시스템 파일 관리자에서 바로 엽니다
- Environment 탭은 이제 OpenClaw 진단, 관리 작업, 설정 도구, 런타임 세부 정보를 한 화면에 모아 보여줍니다

예상과 다른 동작이 있을 때 가장 먼저 보기 좋은 곳입니다.
