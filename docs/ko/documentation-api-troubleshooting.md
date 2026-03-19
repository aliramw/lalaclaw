[English](../en/documentation-api-troubleshooting.md) | [中文](../zh/documentation-api-troubleshooting.md) | [繁體中文（香港）](../zh-hk/documentation-api-troubleshooting.md) | [日本語](../ja/documentation-api-troubleshooting.md) | [한국어](../ko/documentation-api-troubleshooting.md) | [Français](../fr/documentation-api-troubleshooting.md) | [Español](../es/documentation-api-troubleshooting.md) | [Português](../pt/documentation-api-troubleshooting.md) | [Deutsch](../de/documentation-api-troubleshooting.md) | [Bahasa Melayu](../ms/documentation-api-troubleshooting.md) | [தமிழ்](../ta/documentation-api-troubleshooting.md)

[홈으로 돌아가기](./documentation.md) | [빠른 시작](./documentation-quick-start.md) | [인스펙터, 파일 미리보기, 추적](./documentation-inspector.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md)

# API 및 문제 해결

## API 개요

- `GET /api/session`
- `POST /api/session`
- `GET /api/runtime`
- `POST /api/chat`
- `POST /api/chat/stop`
- `GET /api/file-preview`
- `GET /api/file-preview/content`
- `POST /api/file-manager/reveal`

## 자주 발생하는 문제

### 페이지가 열리지 않고 백엔드가 `dist` 누락을 말할 때

- 프로덕션 모드라면 먼저 `npm run build` 를 실행한 뒤 `npm start` 를 사용합니다
- 개발 중이라면 [빠른 시작](./documentation-quick-start.md) 에 따라 Vite 와 Node 를 함께 실행합니다

### 설치된 앱이 흰 화면으로 열리고 콘솔에 `mermaid-vendor` 가 보일 때

대표 증상:

- 앱 번들은 로드되지만 화면은 비어 있습니다
- 브라우저 콘솔에 `mermaid-vendor-*.js` 오류가 나타납니다

가장 가능성이 높은 원인:

- 구버전 패키지 빌드 `2026.3.19-1` 을 사용 중입니다
- 그 빌드는 Mermaid 전용 수동 vendor 분리를 사용해서 설치 후 프로덕션 시작이 깨질 수 있습니다

해결:

- `lalaclaw@2026.3.19-2` 이상으로 업그레이드합니다
- 소스 체크아웃에서 실행 중이라면 최신 `main` 을 pull 한 다음 `npm run build` 를 다시 실행합니다

### 개발 환경에서 페이지는 열리지만 API 호출이 실패할 때

먼저 확인:

- 프론트엔드가 `127.0.0.1:5173` 에서 실행 중인지
- 백엔드가 `127.0.0.1:3000` 에서 실행 중인지
- 프로덕션 서버 진입점이 아니라 Vite 진입점을 사용 중인지

### OpenClaw 를 설치했는데도 앱이 계속 `mock` 에 머물 때

확인할 항목:

- `~/.openclaw/openclaw.json` 이 존재하는지
- `COMMANDCENTER_FORCE_MOCK=1` 이 설정되어 있는지
- `OPENCLAW_BASE_URL` 과 `OPENCLAW_API_KEY` 가 비어 있거나 잘못되지 않았는지

### 모델이나 에이전트를 바꿔도 반영되지 않는 것처럼 보일 때

가능한 원인:

- 아직 `mock` 모드라서 로컬 선호 설정만 바뀌고 있습니다
- `openclaw` 모드에서 원격 세션 patch 가 실패했습니다
- 선택한 모델이 실제로는 해당 에이전트의 기본 모델과 같습니다

확인하기 좋은 위치:

- [인스펙터, 파일 미리보기, 추적](./documentation-inspector.md) 의 `Environment`
- 백엔드 콘솔 출력

문제가 다른 탭으로 전환할 때만 보인다면:

- 스위처가 대상 세션을 완전히 열었는지 확인한 뒤 다음 메시지를 보냅니다
- `Environment` 탭에서 `runtime.transport`, `runtime.socket`, `runtime.fallbackReason` 을 확인합니다
