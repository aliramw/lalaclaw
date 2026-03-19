[English](../en/documentation-interface.md) | [中文](../zh/documentation-interface.md) | [繁體中文（香港）](../zh-hk/documentation-interface.md) | [日本語](../ja/documentation-interface.md) | [한국어](../ko/documentation-interface.md) | [Français](../fr/documentation-interface.md) | [Español](../es/documentation-interface.md) | [Português](../pt/documentation-interface.md) | [Deutsch](../de/documentation-interface.md) | [Bahasa Melayu](../ms/documentation-interface.md) | [தமிழ்](../ta/documentation-interface.md)

[Back to Home](./documentation.md) | [Quick Start](./documentation-quick-start.md) | [Easter Egg](./documentation-easter-egg.md) | [Chat, Attachments, and Commands](./documentation-chat.md) | [Inspector, File Preview, and Tracing](./documentation-inspector.md)

# Interface Overview

The main LalaClaw screen is best understood as a three-part workspace: a session control header, a chat workspace, and a right-side inspector.

## Header and Session Controls

The top area is driven by `SessionOverview` and includes:

- Model switching from the currently available model list
- Context usage display for current vs maximum context
- A one-click fast mode toggle
- Thinking mode selection across `off / minimal / low / medium / high / xhigh / adaptive`
- Language switching for `中文 / 繁體中文（香港） / English / 日本語 / 한국어 / Français / Español / Português / Deutsch / Bahasa Melayu / தமிழ்`
- Theme switching for `system / light / dark`
- A keyboard shortcut help dialog in the upper-right
- A clickable lobster brand easter egg in the upper-left, documented in [Easter Egg](./documentation-easter-egg.md)

## Chat Workspace

The main chat panel includes:

- A session tab strip for agent sessions and IM conversations, plus a switcher entry for opening another agent or IM thread
- A panel header showing the current agent, activity state, font size controls, and new-session action
- A conversation area for user messages, assistant messages, streamed replies, and attachment previews
- A composer that supports text, `@` mentions, attachments, and stopping an active reply

Visible chat behaviors include:

- User messages are right-aligned and assistant messages are left-aligned
- In-progress replies first show a temporary thinking placeholder
- Longer assistant markdown replies can generate an outline for quick heading jumps
- If you scroll away from the bottom, a jump-to-latest button appears

## Right-Side Inspector

The inspector exposes four main surfaces:

- `Files`
- `Artifacts`
- `Timeline`
- `Environment`

It is tightly coupled to the chat session: file activity, reply summaries, execution records, and runtime metadata from the same session all appear here.

## Layout and Sizing

- The divider between chat and inspector is draggable
- Inspector width is persisted locally and restored on the next load
- Chat font size is a global preference with `small / medium / large`

## Multi-Session Tabs

Tab behavior follows a few simple rules:

- Tabs are keyed by the real session identity underneath, which is `agentId + sessionUser`
- The switcher can open both agent sessions and IM conversations such as DingTalk, Feishu, and WeCom
- Closing a tab hides it from the current view but does not delete the actual session state
- Already-open agent tabs and already-open IM channels are excluded from the switcher menu

## Where to Go Next

- For sending messages, attachments, queueing, and slash commands, read [Chat, Attachments, and Commands](./documentation-chat.md)
- For a detailed explanation of the right-side panel, read [Inspector, File Preview, and Tracing](./documentation-inspector.md)
