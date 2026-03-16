[English](../en/documentation-sessions.md) | [中文](../zh/documentation-sessions.md) | [繁體中文（香港）](../zh-hk/documentation-sessions.md) | [日本語](../ja/documentation-sessions.md) | [한국어](../ko/documentation-sessions.md) | [Français](../fr/documentation-sessions.md) | [Español](../es/documentation-sessions.md) | [Português](../pt/documentation-sessions.md) | [Deutsch](../de/documentation-sessions.md) | [Bahasa Melayu](../ms/documentation-sessions.md) | [தமிழ்](../ta/documentation-sessions.md)

[Back to Home](./documentation.md) | [Quick Start](./documentation-quick-start.md) | [Chat, Attachments, and Commands](./documentation-chat.md) | [Keyboard Shortcuts](./documentation-shortcuts.md) | [Local Persistence and Recovery](./documentation-persistence.md)

# Sessions, Agents, and Runtime Modes

## How a Session Is Identified

Both frontend and backend organize session state around two core values:

- `agentId`
- `sessionUser`

In practice:

- `agentId` answers who you are collaborating with
- `sessionUser` answers which conversation line owns the current context

The same agent can have multiple session users, which is how the app creates fresh contexts without changing the agent identity.

## Agent Session Tabs

Frontend chat tabs are organized by agent:

- The default main tab is `agent:main`
- Each opened agent tab keeps its own messages, drafts, scroll state, and some tab-level session metadata
- Closing a tab hides it from the current UI instead of deleting the underlying session history

## Session-Level Settings

These are persisted as session preferences on the backend:

- Agent
- Model
- Fast mode
- Think mode

Switching rules:

- When you switch agents without explicitly picking a model, the app falls back to that agent's default model
- When you switch models, the preference is only persisted when it differs from the default
- Think mode is validated before it is accepted

## Starting a New Session

There are three main ways to clear context:

- Click the new-session control in the chat header
- Use `Cmd/Ctrl + N`
- Send `/new` or `/reset`

The main distinction:

- The UI button and shortcut are simple reset-style actions
- `/new` and `/reset` can include a trailing prompt so the fresh session continues immediately

## `mock` Mode

The app enters `mock` mode when:

- No local OpenClaw gateway is detected
- Or `COMMANDCENTER_FORCE_MOCK=1` is explicitly set

Characteristics:

- The full UI remains usable without a live gateway
- Chat, inspector, files, and environment panels all produce demo-friendly mock data
- It is ideal for local development, UI integration, and automated tests

## `openclaw` Mode

The app enters `openclaw` mode when:

- It detects `~/.openclaw/openclaw.json`
- Or you explicitly configure `OPENCLAW_BASE_URL` and related environment variables

Characteristics:

- `/api/chat` sends real requests to the configured gateway
- `/api/runtime` and the inspector read transcripts, session status, and browser-control information
- Model and thinking mode changes can patch the remote session

## Where Mentionable Agents and Skills Come From

The `@` menu is not hardcoded. It is derived from runtime configuration:

- Mentionable agents: the current agent's `subagents.allowAgents`
- Available skills: the current agent, allowed subagents, local skill directories, and skill lock metadata

So if an agent or skill is missing from the menu, the cause is usually configuration scope or permissions rather than a frontend rendering issue.

## When You Should Start a New Session

A fresh session is usually the right move when:

- The conversation history has grown and context usage is becoming large
- The task changes direction and you do not want old context to influence the next answer
- You want to keep model and mode settings but reset the conversation itself
