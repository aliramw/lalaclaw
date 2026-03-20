[English](../en/documentation.md) | [中文](../zh/documentation.md) | [繁體中文（香港）](../zh-hk/documentation.md) | [日本語](../ja/documentation.md) | [한국어](../ko/documentation.md) | [Français](../fr/documentation.md) | [Español](../es/documentation.md) | [Português](../pt/documentation.md) | [Deutsch](../de/documentation.md) | [Bahasa Melayu](../ms/documentation.md) | [தமிழ்](../ta/documentation.md)

# LalaClaw Documentation

This guide is built from the current frontend, backend, tests, and configuration in the repository. Its goal is to turn the real behavior of LalaClaw into a browsable Markdown documentation tree.

Author: Marila Wang

## Documentation Tree

- [Quick Start](./documentation-quick-start.md)
- [Interface Overview](./documentation-interface.md)
- [Chat, Attachments, and Commands](./documentation-chat.md)
- [Inspector, File Preview, and Tracing](./documentation-inspector.md)
- [Sessions, Agents, and Runtime Modes](./documentation-sessions.md)
- [Keyboard Shortcuts](./documentation-shortcuts.md)
- [Local Persistence and Recovery](./documentation-persistence.md)
- [API and Troubleshooting](./documentation-api-troubleshooting.md)
- [Easter Egg](./documentation-easter-egg.md)

## Suggested Reading Order

1. Start with [Quick Start](./documentation-quick-start.md) to boot both the frontend and backend.
2. Then read [Interface Overview](./documentation-interface.md) and [Chat, Attachments, and Commands](./documentation-chat.md) to understand the main workflow.
3. If you want the small brand interaction detail, read [Easter Egg](./documentation-easter-egg.md).
4. For the right-side trace panel, read [Inspector, File Preview, and Tracing](./documentation-inspector.md).
5. For agent switching, model selection, and `mock` vs `openclaw`, read [Sessions, Agents, and Runtime Modes](./documentation-sessions.md).
6. For shortcuts, refresh recovery, or backend debugging, read [Keyboard Shortcuts](./documentation-shortcuts.md), [Local Persistence and Recovery](./documentation-persistence.md), and [API and Troubleshooting](./documentation-api-troubleshooting.md).

## What You Can Do With It

- Chat with the current agent in the browser and send images, text files, or regular file attachments with your prompt.
- Open separate session tabs for different agents, each with its own model, fast mode, and thinking mode.
- Inspect run logs, file activity, reply summaries, environment data, collaboration state, and previews in the right-side inspector.
- Use the full UI in `mock` mode, or connect it to a local OpenClaw gateway for live runs.

## Related Reading

- [Architecture Overview](./architecture.md)
- [Product Showcase](./showcase.md)
- [Refactor Roadmap](./refactor-roadmap.md)
- [Browser E2E Testing](./testing-e2e.md)

## Quick Links

- Setup instructions: [Quick Start](./documentation-quick-start.md)
- Main page structure: [Interface Overview](./documentation-interface.md)
- Slash commands: [Chat, Attachments, and Commands](./documentation-chat.md#slash-commands)
- Refresh recovery: [Local Persistence and Recovery](./documentation-persistence.md)
- API reference: [API and Troubleshooting](./documentation-api-troubleshooting.md#api-overview)
