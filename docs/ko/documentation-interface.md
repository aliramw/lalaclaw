[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[홈으로 돌아가기](./documentation.md) | [빠른 시작](./documentation-quick-start.md) | [이스터에그](./documentation-easter-egg.md) | [채팅, 첨부파일, 명령어](./documentation-chat.md) | [인스펙터, 파일 미리보기, 추적](./documentation-inspector.md)

# 인터페이스 개요

LalaClaw 메인 화면은 세 부분으로 이해할 수 있습니다. 상단 세션 제어 헤더, 중앙 채팅 작업공간, 오른쪽 인스펙터입니다.

## 헤더와 세션 제어

상단 영역에는 다음이 포함됩니다.

- 현재 사용 가능한 목록에서 모델 전환
- 현재 컨텍스트 사용량과 최대치 표시
- 빠른 모드 토글
- `off / minimal / low / medium / high / xhigh / adaptive` 사고 모드 선택
- `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்` 언어 전환
- `system / light / dark` 테마 전환
- 오른쪽 위 단축키 도움말
- 왼쪽 위 클릭 가능한 랍스터 브랜드 이스터에그. 자세한 내용은 [이스터에그](./documentation-easter-egg.md)

## 채팅 작업공간

메인 채팅 패널에는 다음이 포함됩니다.

- 에이전트 세션과 IM 대화를 함께 보여주는 탭 스트립, 그리고 다른 에이전트나 IM 스레드를 여는 스위처 진입점
- 현재 에이전트, 활동 상태, 글꼴 크기, 새 세션 동작을 보여주는 패널 헤더
- 사용자 메시지, 어시스턴트 메시지, 스트리밍 답변, 첨부 미리보기를 표시하는 대화 영역
- 텍스트, `@` 멘션, 첨부파일, 진행 중 답변 중지를 지원하는 composer

눈에 보이는 동작:

- 사용자 메시지는 오른쪽 정렬, 어시스턴트 메시지는 왼쪽 정렬입니다
- 답변이 진행 중이면 임시 thinking placeholder 가 먼저 표시됩니다
- 긴 Markdown 답변에는 빠른 제목 이동용 outline 이 생길 수 있습니다
- 맨 아래에서 벗어나면 최신 답변으로 점프하는 버튼이 나타납니다

## 오른쪽 인스펙터

인스펙터는 이제 네 개의 탭으로 정리됩니다.

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

이 패널은 현재 채팅 세션과 강하게 연결되어 있어서 같은 세션의 파일 활동, 요약, 실행 기록, 런타임 정보를 함께 보여줍니다.

## 레이아웃과 크기

- 채팅과 인스펙터 사이의 구분선은 드래그할 수 있습니다
- 인스펙터 너비는 로컬에 저장되며 다음 로드 때 복원됩니다
- 채팅 글꼴 크기는 `small / medium / large` 전역 설정입니다

## 다중 세션 탭

탭 동작은 다음 규칙을 따릅니다.

- 탭은 보이는 라벨이 아니라 실제 세션 정체성인 `agentId + sessionUser` 로 구분됩니다
- 스위처는 에이전트 세션뿐 아니라 DingTalk, Feishu, WeCom 같은 IM 대화도 열 수 있습니다
- 탭을 닫아도 실제 세션 상태는 삭제되지 않고 현재 보기에서만 숨겨집니다
- 이미 열려 있는 에이전트 탭과 이미 열려 있는 IM 채널은 스위처 메뉴에서 제외됩니다
