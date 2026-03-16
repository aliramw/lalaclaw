[English](../en/documentation-persistence.md) | [中文](../zh/documentation-persistence.md) | [日本語](../ja/documentation-persistence.md) | [Français](../fr/documentation-persistence.md) | [Español](../es/documentation-persistence.md) | [Português](../pt/documentation-persistence.md)

[Back to Home](./documentation.md) | [Keyboard Shortcuts](./documentation-shortcuts.md) | [Chat, Attachments, and Commands](./documentation-chat.md) | [Sessions, Agents, and Runtime Modes](./documentation-sessions.md)

# Local Persistence and Recovery

## What Is Stored Locally

The frontend persists the following in the browser:

- The active chat tab and active inspector tab
- Message history per tab
- Prompt drafts per conversation
- Prompt history
- Theme and locale
- Inspector panel width
- Chat font size
- Chat scroll state
- Pending chat turns

## How Attachments Are Stored

Attachments are persisted in two layers:

- Lightweight references and session structure are stored in `localStorage`
- Larger payloads such as image `data URL`s and text attachment content are stored in `IndexedDB` when available

That gives the app two important recovery behaviors:

- Sent attachments usually survive a refresh
- In-progress turns can recover attachment references along with the pending turn itself

## Refresh Recovery Boundaries

The recovery logic is mainly built for these cases:

- The page reloads during an active reply
- Local chat state is restored before the runtime snapshot catches up
- The backend already finished, but the frontend still only has a local pending placeholder

If the browser blocks `localStorage` or `IndexedDB`, recovery quality drops.

## Practical Notes

- You usually do not need to manually save a prompt before refreshing during a long run
- If attachments disappear after refresh, first check whether the browser allows IndexedDB
- If you briefly see a thinking placeholder and then the final answer replaces it, that is usually normal synchronization behavior
