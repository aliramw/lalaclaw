[다른 언어로 README 보기: English](./README.md) | [中文](./README.zh.md) | [繁體中文（香港）](./README.zh-hk.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Français](./README.fr.md) | [Español](./README.es.md) | [Português](./README.pt.md) | [Deutsch](./README.de.md) | [Bahasa Melayu](./README.ms.md) | [தமிழ்](./README.ta.md)

# LalaClaw

[![CI](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/aliramw/lalaclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

에이전트와 함께 더 잘 협업하고 공동 창작할 수 있는 방법입니다.

저자: Marila Wang

## 핵심 내용

- React + Vite 기반 command center UI, chat, timeline, inspector, theme, locale, attachment 흐름 포함
- VS Code 스타일의 세션/워크스페이스 파일 트리와 preview 동작 지원
- UI는 中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ் 를 지원합니다
- 로컬 또는 원격 OpenClaw gateway에 연결할 수 있는 Node.js 백엔드

## 문서

- 언어 색인: [docs/README.md](./docs/README.md)
- 한국어 문서: [docs/ko/documentation.md](./docs/ko/documentation.md)
- 빠른 시작: [docs/ko/documentation-quick-start.md](./docs/ko/documentation-quick-start.md)
- 인터페이스 개요: [docs/ko/documentation-interface.md](./docs/ko/documentation-interface.md)
- 세션과 런타임: [docs/ko/documentation-sessions.md](./docs/ko/documentation-sessions.md)

## 빠른 시작

~~~bash
npm install -g lalaclaw
lalaclaw init
~~~

그다음 [http://127.0.0.1:3000](http://127.0.0.1:3000) 을 엽니다.

참고:

- doc, ppt, pptx 미리보기에는 LibreOffice가 필요합니다
- macOS에서는 lalaclaw doctor --fix 또는 brew install --cask libreoffice 를 실행할 수 있습니다

로컬 개발용:

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

개발 모드에서는 [http://127.0.0.1:5173](http://127.0.0.1:5173) 을 사용합니다.

## 업데이트

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

특정 버전 설치:

~~~bash
npm install -g lalaclaw@2026.3.17-5
lalaclaw init
~~~

## 개발 메모

- 개발 시에는 npm start 대신 npm run dev:all 을 사용하세요
- dist 빌드를 확인할 때만 npm run lalaclaw:start 또는 npm start 를 사용하세요
- 앱은 로컬 OpenClaw 를 자동으로 감지합니다
- mock 모드를 강제로 사용하려면 COMMANDCENTER_FORCE_MOCK=1 을 사용하세요

## 버전 정책

- 버전이 바뀔 때마다 CHANGELOG.md 를 함께 업데이트합니다
- 같은 날 여러 번 릴리스하면 YYYY.M.D-N 형식을 사용합니다. 예: 2026.3.17-5