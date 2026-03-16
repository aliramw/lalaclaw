[English](../en/architecture.md) | [中文](../zh/architecture.md) | [繁體中文（香港）](../zh-hk/architecture.md) | [日本語](../ja/architecture.md) | [한국어](../ko/architecture.md) | [Français](../fr/architecture.md) | [Español](../es/architecture.md) | [Português](../pt/architecture.md) | [Deutsch](../de/architecture.md) | [Bahasa Melayu](../ms/architecture.md) | [தமிழ்](../ta/architecture.md)

# 아키텍처 개요

> Navigation: [문서 홈](./documentation.md) | [빠른 시작](./documentation-quick-start.md) | [인터페이스 개요](./documentation-interface.md) | [제품 쇼케이스](./showcase.md) | [리팩터링 로드맵](./refactor-roadmap.md)

LalaClaw 는 가벼운 UI 진입점, 가벼운 서버 진입점, 그리고 테스트하기 쉬운 중간 모듈로 구성됩니다.

- src 는 React UI 와 feature controller 를 포함합니다
- server 는 route, service, runtime integration 을 포함합니다
- docs 는 실제 동작을 여러 언어로 정리합니다