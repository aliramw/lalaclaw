[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [繁體中文（香港）](../zh-hk/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [한국어](../ko/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md) | [Deutsch](../de/documentation-persistence.md) | [Bahasa Melayu](../ms/documentation-persistence.md) | [தமிழ்](../ta/documentation-persistence.md)

[홈으로 돌아가기](./documentation.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md) | [API 및 문제 해결](./documentation-api-troubleshooting.md)

# 로컬 저장과 복구

LalaClaw 는 새로고침 뒤에도 UI 를 빠르게 복구할 수 있도록 일부 상태를 로컬에 저장합니다.

- 열려 있는 탭과 현재 세션
- inspector 너비
- 채팅 글꼴 크기
- 선택한 언어와 테마

복구 시에는 대화를 조용히 버리지 않고 runtime 데이터와 저장된 상태를 다시 동기화하려고 시도합니다.