[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[홈으로 돌아가기](./documentation.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md) | [로컬 저장과 복구](./documentation-persistence.md)

# API 및 문제 해결

## 개발 환경

- 프론트엔드: `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`
- 백엔드: `PORT=3000 HOST=127.0.0.1 node server.js`
- Vite 는 /api/* 를 http://127.0.0.1:3000 으로 프록시합니다

## 자주 확인할 항목

- OpenClaw 또는 mock 모드가 예상대로 동작하는지 확인합니다
- 환경 탭에서 gateway, auth, runtime 정보를 확인합니다
- `npm run doctor` 로 포트, 설정, 의존성을 점검합니다
- Office 미리보기 문제는 LibreOffice 설치 여부를 확인합니다
