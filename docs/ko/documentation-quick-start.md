[English](../en/documentation-quick-start.md) | [中文](../zh/documentation-quick-start.md) | [繁體中文（香港）](../zh-hk/documentation-quick-start.md) | [日本語](../ja/documentation-quick-start.md) | [한국어](../ko/documentation-quick-start.md) | [Français](../fr/documentation-quick-start.md) | [Español](../es/documentation-quick-start.md) | [Português](../pt/documentation-quick-start.md) | [Deutsch](../de/documentation-quick-start.md) | [Bahasa Melayu](../ms/documentation-quick-start.md) | [தமிழ்](../ta/documentation-quick-start.md)

[홈으로 돌아가기](./documentation.md) | [인터페이스 개요](./documentation-interface.md) | [세션, 에이전트, 실행 모드](./documentation-sessions.md)

# 빠른 시작

## npm 설치

~~~bash
npm install -g lalaclaw@latest
lalaclaw init
~~~

그다음 [http://127.0.0.1:3000](http://127.0.0.1:3000) 을 엽니다.

## 개발 모드

~~~bash
git clone https://github.com/aliramw/lalaclaw.git lalaclaw
cd lalaclaw
npm ci
npm run dev:all
~~~

그다음 [http://127.0.0.1:5173](http://127.0.0.1:5173) 을 엽니다.

## 중요 참고

- 로컬 UI 개발에는 `npm start` 가 아니라 `npm run dev:all` 을 사용합니다
- doc, ppt, pptx 미리보기에는 LibreOffice가 필요합니다
- COMMANDCENTER_FORCE_MOCK=1 로 mock 모드를 강제할 수 있습니다
