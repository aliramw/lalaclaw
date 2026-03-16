[Back to Home](./documentation.md) | [Interface Overview](./documentation-interface.md) | [Chat, Attachments, and Commands](./documentation-chat.md) | [API and Troubleshooting](./documentation-api-troubleshooting.md)

# Inspector, File Preview, and Tracing

The right-side inspector is one of LalaClaw's defining surfaces. It projects the run trail, file activity, summaries, and environment data for the current session into one place.

## Run Log

The `Run Log` tab groups information by execution round:

- Run title and time
- Prompt summary
- Tool call list
- Input, output, and status for each tool
- File changes associated with the run
- Snapshot entries related to that run

It is the best place to answer:

- What tools did the agent just call?
- In which run did a particular result happen?

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

## Summaries

The `Summaries` tab lists assistant reply summaries for the current session.

You can:

- Click a summary to jump back to the matching chat message
- Use it to navigate long conversations without scanning the full transcript

## Environment

The `Environment` tab aggregates runtime details such as:

- Whether the current session is in `mock` or `openclaw`
- The selected agent, model, session key, and workspace root
- Gateway URL, ports, API path, and API style
- Context, queue, runtime, and auth status text

This is usually the most useful place to inspect when something behaves differently from what you expected.

## Collab

The `Collab` tab shows collaboration relationships and dispatched work:

- `dispatching`
- `running`
- `established`
- `completed`
- `failed`

If a collaboration branch fails, the UI keeps that state visible briefly so it is easier to see what happened.

## Preview

The `Preview` tab exposes four read-only peek surfaces:

- Workspace preview
- Terminal preview
- Browser preview
- Environment preview

Notable behavior:

- In `mock` mode, browser preview shows a disconnected state
- In `openclaw` mode, it tries to read local Control UI, health status, and browser-control service details

## File Preview Capabilities

When you open preview from the file list, markdown links, or image thumbnails, the app supports:

- Syntax-highlighted text, JSON, and Markdown
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
