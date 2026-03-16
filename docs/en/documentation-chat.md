[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Sessions, Agents, and Runtime Modes](./documentation-sessions.md) | [Keyboard Shortcuts](./documentation-shortcuts.md) | [Local Persistence and Recovery](./documentation-persistence.md)

# Chat, Attachments, and Commands

## Sending Messages

The composer is designed around a write-first flow with fast-send shortcuts:

- `Enter`: insert a newline
- `Shift + Enter`: send immediately
- Double-tap `Enter`: send immediately
- `ArrowUp / ArrowDown`: browse prompt history for the current conversation

What happens after send:

- The frontend inserts an optimistic user message first
- If the input is not a slash command, it inserts a temporary assistant thinking placeholder
- The backend streams the reply back as NDJSON by default
- You can press `Stop` while the reply is in progress

## Queueing Behavior

If the current tab is already busy:

- New messages are not dropped; they are queued for that tab
- Queued user messages appear in the chat immediately, but without starting a second thinking placeholder
- The queue resumes automatically, in order, after the active reply completes

## `@` Mentions

There are two ways to open the mention flow:

- Type `@` directly in the composer
- Click the `@` button near the lower-right side of the composer

Mention candidates come from:

- Mentionable agents: the current agent's allowed `subagents.allowAgents`
- Mentionable skills: the current agent, allowed subagents, and locally discoverable skills

Supported interactions:

- Live filtering while you type
- `ArrowUp / ArrowDown` to move through options
- `Enter / Tab` to insert the highlighted option
- `Escape` to close the mention menu

## Attachments

Attachment entrypoints:

- Click the paperclip button
- Paste files directly into the page from the clipboard

Attachments are processed differently by type:

- Images: read as `data URL` and shown as inline previews
- Text attachments: read as text, truncated to `120000` characters, and included in the model-facing payload
- Other files: sent as metadata-only file attachments

If the browser or desktop environment exposes a usable local path, the attachment also carries `path/fullPath`, which later helps inspector and preview features.

## Refresh Recovery

If a reply is still in progress when the page reloads:

- The frontend saves the pending user turn and assistant placeholder separately
- On reload, it tries to restore the in-flight turn
- If the backend already finished, the restored placeholder is replaced with the authoritative final reply

## Slash Commands

In `openclaw` mode, command text is forwarded to the OpenClaw gateway natively.
That includes:

- standalone slash commands such as `/status` or `/model`
- inline shortcuts and inline directives inside a normal prompt
- host-style bang commands such as `! <command>`, `!poll`, and `!stop`

In `mock` mode, LalaClaw keeps a small local fallback for the built-in session controls below.

### `/fast`

Supported forms:

- `/fast`
- `/fast status`
- `/fast on`
- `/fast off`

Behavior:

- In `openclaw` mode, this uses the native OpenClaw command flow
- In `mock` mode, `status` reports the current fast-mode state and `on/off` persists the local session preference

### `/think <mode>`

Supported modes:

- `off`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`
- `adaptive`

Behavior:

- In `openclaw` mode, this uses the native OpenClaw command flow
- In `mock` mode, it updates the current session's thinking depth locally

### `/model [id]` and `/models`

Supported forms:

- `/model`
- `/model status`
- `/model <id>`
- `/model list`
- `/models`

Behavior:

- In `openclaw` mode, this uses the native OpenClaw command flow
- In `mock` mode, `status` reports the current model, `list` shows the available model list, and `/model <id>` switches the local session model

### `/new ...` and `/reset ...`

Behavior:

- In `openclaw` mode, these use the native OpenClaw session-management flow
- In `mock` mode, they create a fresh local `sessionUser` and carry over the current model, agent, fast mode, and thinking mode preferences

Good use cases:

- The current context is getting too large
- You want to keep session controls but clear conversation history

## Usage Tips

- Before a long task, confirm the current agent, model, and thinking mode
- Send large textual material as text attachments and images as image attachments
- Prefer a new session or `/new` when you want to split context cleanly
- Queue follow-up requests directly instead of waiting for the active turn to fully finish
