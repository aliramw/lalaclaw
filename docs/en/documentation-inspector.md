[English](../en/documentation-inspector.md) | [中文](../zh/documentation-inspector.md) | [繁體中文（香港）](../zh-hk/documentation-inspector.md) | [日本語](../ja/documentation-inspector.md) | [한국어](../ko/documentation-inspector.md) | [Français](../fr/documentation-inspector.md) | [Español](../es/documentation-inspector.md) | [Português](../pt/documentation-inspector.md) | [Deutsch](../de/documentation-inspector.md) | [Bahasa Melayu](../ms/documentation-inspector.md) | [தமிழ்](../ta/documentation-inspector.md)

[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Chat, Attachments, and Commands](./documentation-chat.md) | [API and Troubleshooting](./documentation-api-troubleshooting.md)

# Inspector, File Preview, and Tracing

The right-side inspector is one of LalaClaw's defining surfaces. It now groups session information into four tabs: `Files`, `Artifacts`, `Timeline`, and `Environment`.

## Files

The `Files` tab now has two separate surfaces:

- `Session Files`: files touched in the current conversation, still grouped by `Created`, `Modified`, and `Viewed`
- `Workspace Files`: a VS Code-style tree rooted at the current workspace

Notable behavior:

- The workspace tree loads one directory level at a time instead of scanning the whole workspace up front
- Both sections keep their count badges even while collapsed
- Empty `Session Files` sections stay hidden
- Session and workspace filters support plain-text matching and simple glob patterns
- Single-directory chains are compacted into one row, similar to VS Code compact folders

Interactions:

- Click a file to open preview
- Right-click a file to copy the absolute path
- Right-click a workspace directory to refresh just that directory level

The file data is not only built from OpenClaw transcripts. It also merges locally tracked file hints from attachments, optimistic session state, and the current workspace root snapshot.

## Artifacts

The `Artifacts` tab lists assistant reply summaries for the current session.

You can:

- Click a summary to jump back to the matching chat message
- Use it to navigate long conversations without scanning the full transcript
- Open `View Context` to inspect the current session context that is being sent to the model

## Timeline

The `Timeline` tab groups execution records by run:

- Run title and time
- Prompt summary and result
- Tool inputs, outputs, and status
- File changes associated with the run
- Collaboration relationships for dispatched work

It is the best place to answer:

- What tools did the agent just call?
- In which run did a particular result happen?
- Which files changed during that run?

## Environment

The `Environment` tab is now a composite surface that combines OpenClaw diagnostics, management actions, config tools, and current-session runtime details such as:

- A top-level `OpenClaw diagnostics` summary grouped into `Overview`, `Connectivity`, `OpenClaw Doctor`, and `Logs`
- OpenClaw version, runtime profile, config path, current session agent workspace directory, gateway status, health URL, and log entry points
- A local OpenClaw install/update panel for install detection, official install guidance, update availability, and controlled update execution
- A structured OpenClaw config panel for a small safe field set, including backup, validation, before/after diffs, and optional restart
- A local OpenClaw management panel for `status`, `start`, `stop`, `restart`, and `doctor repair`
- Runtime transport and runtime socket status
- Reconnect attempts and fallback reason when runtime sync leaves WebSocket mode
- Lower-level technical groups for session context, realtime sync, gateway config, application metadata, and uncategorized fields

Notable behavior:

- Fields already promoted into the top diagnostics summary are intentionally removed from the lower-level technical groups to avoid duplicate rows
- Long values such as JSON session keys are forced to wrap inside the container instead of overflowing horizontally
- Absolute file paths in the environment panel, such as log files or config files, open the shared file preview when clicked
- Directory paths in the environment panel, such as log directories or workspace roots, do not open inline preview; they render with a separate muted folder icon and open directly in Finder, Explorer, or the system file manager
- When OpenClaw is missing, the install/update panel shows the official install docs link and official install command instead of pretending the app can self-bootstrap everything
- When OpenClaw is installed, the install/update panel shows the dry-run action list from the official `openclaw update` flow before you trigger the real update
- Config changes are guarded by a base hash, so the app asks you to reload if the underlying OpenClaw config changed elsewhere
- Config apply results show the changed fields, validation outcome, and backup file path or rollback-point label in place
- Mutating management actions require confirmation, then render structured command output, follow-up health checks, and guidance in place
- After a management action completes, the inspector refreshes the current environment snapshot so diagnostics and technical groups can catch up immediately
- When the active OpenClaw gateway target is remote instead of local loopback, local-only install, update, config, and management mutations are disabled in place and explained with a warning notice
- The `OpenClaw operation history` panel is persisted across backend restarts in `~/.config/lalaclaw/openclaw-operation-history.json`
- Rollback metadata for local and remote config changes is persisted in `~/.config/lalaclaw/openclaw-backups.json`
- Remote snapshot bodies are written to protected per-backup files under `~/.config/lalaclaw/openclaw-backup-snapshots/`, while local snapshot files still live next to `~/.openclaw/openclaw.json` as `openclaw.json.backup.<timestamp>`
- Blocked remote-only attempts are appended to that same history panel so you can audit what was prevented, when it happened, and whether a backup or rollback marker exists
- Local config writes now record restorable backup files, and remote config writes can proceed through an explicit authorization step; both flows can restore a saved snapshot from the same history panel after confirmation
- Rollback points are scoped to the OpenClaw target that created them, so the inspector refuses to restore a backup into a different local or remote target
- The same remote warning now links to a recovery guide dialog with suggested next steps plus official OpenClaw install, doctor, and gateway-troubleshooting docs
- The gray summary hint at the top of the tab is now owned by frontend i18n and intentionally describes diagnostics, management actions, and current-session environment details instead of mirroring a backend-provided summary string

This is usually the most useful place to inspect when something behaves differently from what you expected.

## File Preview Capabilities

When you open preview from the file list, markdown links, or image thumbnails, the app supports:

- Syntax-highlighted text, JSON, and Markdown
- Inline editing for Markdown, plain-text, and code-like text previews with Monaco, with save / cancel controls
- Separate rendering of Markdown front matter
- Mermaid diagram rendering in completed markdown replies, with diagram preview through the shared image-preview flow
- Spreadsheet tables for `csv`, `xls`, `xlsx`, and `xlsm`
- DOCX rendering inside the preview overlay
- DOC, PPT, and PPTX conversion to previewable PDF output when LibreOffice is available
- HEIC and HEIF image conversion on supported systems
- Image preview with zoom, rotation, and reset
- Embedded video, audio, and PDF preview
- Open in VS Code
- Reveal in Finder / Explorer / system file manager

File preview endpoints require absolute paths, so items without one usually cannot be opened beyond their display label.

## When to Open the Inspector First

- A reply looks suspicious and you want to verify the tool trail
- You want to review which files the agent created or changed
- You want to jump back to a specific important answer in a long conversation
- You want to confirm whether the current session is running in `mock` or against a live gateway
- You want to inspect whether runtime sync is currently on `ws` or has fallen back to `polling`

## Directory Paste and Folder Opening

- In `Workspace Files`, right-click a directory to paste clipboard uploads or copied local files directly into that folder
- After a directory paste succeeds, the tree refreshes that folder and the new files are tracked back into the current session file list
- Directory paths across the inspector still open Finder, Explorer, or the system file manager instead of trying inline preview
