[English](../en/documentation-chat.md) | [中文](../zh/documentation-chat.md) | [繁體中文（香港）](../zh-hk/documentation-chat.md) | [日本語](../ja/documentation-chat.md) | [한국어](../ko/documentation-chat.md) | [Français](../fr/documentation-chat.md) | [Español](../es/documentation-chat.md) | [Português](../pt/documentation-chat.md) | [Deutsch](../de/documentation-chat.md) | [Bahasa Melayu](../ms/documentation-chat.md) | [தமிழ்](../ta/documentation-chat.md)

[홈으로 돌아가기](./documentation.md) | [인터페이스 개요](./documentation-interface.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md) | [키보드 단축키](./documentation-shortcuts.md) | [로컬 저장과 복구](./documentation-persistence.md)

# 채팅, 첨부파일, 명령어

## 메시지 보내기

- Enter 전송 모드: Enter 는 전송, Shift + Enter 는 줄바꿈
- Enter 두 번 전송 모드: Enter 두 번은 전송, Shift + Enter 도 전송, Enter 한 번은 줄바꿈
- ArrowUp / ArrowDown 으로 프롬프트 기록을 탐색할 수 있습니다
- Stop 으로 현재 응답을 중지할 수 있습니다

## 큐

현재 탭이 바쁘면 새 메시지는 큐에 들어가고 현재 응답이 끝난 뒤 자동으로 전송됩니다.

## 첨부파일과 슬래시 명령어

- 이미지는 미리보기가 제공됩니다
- 텍스트 파일은 읽은 뒤 너무 길면 잘립니다
- /model, /think, /new, /reset 같은 슬래시 명령어를 지원합니다

## 음성 입력

- Web Speech API를 제공하는 브라우저에서는 첨부 버튼과 전송 버튼 옆에 마이크 버튼이 표시됩니다
- 한 번 누르면 받아쓰기를 시작하고 다시 누르면 멈춥니다. 인식된 텍스트는 자동 전송되지 않고 현재 초안에 삽입됩니다
- 음성 입력이 켜져 있는 동안에는 버튼이 펄스 상태로 바뀌고, 입력 영역에도 실시간 듣기 / 전사 상태가 표시됩니다
- 브라우저가 음성 인식을 지원하지 않거나 마이크 권한이 거부되면, 아무 반응 없이 실패하는 대신 사용 불가 또는 오류 상태가 표시됩니다
