# Markdown Annotation Update Design

## Summary

This feature adds an annotation-driven update workflow to Markdown file previews. Users can enter an "annotation update" mode from the Markdown preview toolbar, select text in the preview, create replacement annotations, review generated instructions in a side panel, and submit those instructions directly to the current agent.

The initial scope supports two annotation actions:

- `replace`: replace one selected occurrence
- `replaceAll`: replace all matching occurrences in the current previewed Markdown file

The design keeps the interaction specific to Markdown file previews and intentionally avoids changing normal chat-message Markdown rendering.

## Goals

- Add a toolbar button to Markdown file previews for entering annotation update mode.
- Let users create structured annotations from text selections in the rendered Markdown preview.
- Highlight annotated content in the preview and show generated instruction lines in a right-side multi-line editor.
- Allow direct submission to the current agent without routing through the composer.
- Return to the chat session view after successful submission.
- Keep the implementation extensible so future annotation actions like `delete` and `deleteAll` can be added without reworking the overall architecture.

## Non-goals

- Do not add annotation controls to regular chat message Markdown blocks.
- Do not support non-Markdown file previews in this phase.
- Do not convert the rendered preview into a full rich-text editor.
- Do not implement reordering, per-item cards, or complex diff previews in the first version.
- Do not broaden batch actions beyond the current previewed file.

## Current Code Context

The existing Markdown file preview flow already has a natural integration point:

- `src/components/command-center/file-preview-overlay.tsx` renders the preview dialog, toolbar, and Markdown preview body.
- `src/components/command-center/markdown-content.tsx` renders Markdown content and is already reused across chat bubbles and preview surfaces.
- `src/components/command-center/use-file-preview.ts` owns file preview open/close state.
- `src/components/command-center/chat-panel.tsx` and `src/components/command-center/inspector-panel.tsx` mount the shared preview overlay.
- `src/features/app/controllers/use-command-center.ts` already exposes the current send handler for dispatching a prompt to the active agent.

This means the feature should primarily live inside the file preview overlay and pass only the minimum new props needed for agent submission and closing behavior.

## User-approved Product Decisions

The following product decisions were confirmed during brainstorming:

- The "annotation update" button appears only in Markdown file preview toolbars.
- `replaceAll` applies only to the currently previewed Markdown file.
- Submitting annotations sends the generated message directly to the current agent.
- After successful submission, the flow must:
  - clear annotation state
  - exit annotation update mode
  - close the file preview and return to the chat session view
- The architecture must support future annotation types such as `delete` and `deleteAll`.

## Interaction Design

### Entry and Exit

When the current preview kind is `markdown`, the toolbar shows a new button labeled via i18n as "批注更新" with tooltip text meaning "Annotate the content and turn it into instructions so the AI can update it."

Clicking the button toggles annotation update mode on.

When annotation update mode is active:

- the toolbar button switches to an active visual state
- the preview layout changes from a single-column reading view to a two-column layout
- the Markdown preview remains on the left
- the annotation instruction panel appears on the right

Clicking the button again while mode is active behaves as follows:

- if there are no annotations, exit immediately
- if there are pending annotations, show a confirmation dialog asking whether to discard the current annotation changes
- confirming clears the current annotation session and exits the mode
- canceling leaves the session untouched

### Creating Annotations From a Selection

Annotation creation is enabled only while annotation update mode is active.

The user selects text inside the rendered Markdown preview. After a valid non-empty selection is made, a lightweight contextual action menu appears near the selection with two actions:

- `替换`
- `批量替换`

Choosing an action immediately creates an annotation entry:

- `替换` creates a single-range annotation and generates a line in the side panel:
  - `第 x 行：原文 → `
- `批量替换` creates a multi-range annotation covering all exact matches in the current file and generates:
  - `所有 原文 → `

The replacement target is intentionally left blank for the user to complete in the side panel.

### Highlighting

As soon as an annotation is created, the rendered Markdown content shows highlight overlays:

- `replace` highlights only the selected occurrence
- `replaceAll` highlights every exact textual match in the current file

The highlight color should be a readable fluorescent yellow treatment with enough transparency to preserve Markdown legibility.

If later needed, hover/focus linkage between instruction lines and highlight groups can be layered on top of the same model without changing the data shape.

### Side Panel

The right-side annotation panel contains:

- a short title describing the panel as annotation instructions
- a multi-line editor surface containing one instruction per line
- a submit button

The panel is generated from structured annotations but remains user-editable. The text area content is the final source of truth for submission, which lets users refine the instructions freely.

The submit button is enabled only when:

- at least one annotation exists
- every generated instruction has a non-empty replacement target before the text is serialized into the editable panel
- the final editor content is not empty

## Submission Format

Submitting sends a message directly to the current agent using the current preview file path and the editor text.

The outgoing message format is:

```text
修改 <current preview file path> 文件：
第 x 行：有限公司 → 科技有限公司
所有 陈航 → 无招
```

The side-panel text is inserted as-is below the first line, so if users adjust wording manually, their edited text is what gets submitted.

After a successful send:

- clear the annotation session state
- exit annotation update mode
- close the file preview overlay
- return the user to the chat session view behind the overlay

If sending fails:

- keep annotation state intact
- keep the preview open
- show a stable user-facing error
- preserve enough information for debugging

## Architecture

The feature should be modeled as a small annotation system rather than two hard-coded actions. The initial implementation should separate four responsibilities.

### 1. Annotation Session State

This layer owns:

- whether annotation update mode is active
- the current list of annotations
- derived editor text
- discard-confirmation state
- submission pending/error state

This state should live in the preview overlay because the lifecycle is tied to a specific open preview session.

### 2. Selection-to-Annotation Conversion

This layer converts a DOM text selection into a structured annotation entry against the current Markdown source.

It is responsible for:

- validating that the selection is usable
- mapping the selected text to source offsets
- computing the line number for single replacement
- computing all exact match ranges for batch replacement within the current file

This logic should be isolated in a helper or hook so future actions like `delete` and `deleteAll` can reuse the same mapping pipeline.

### 3. Annotation Rendering

This layer projects annotation state into UI:

- which text ranges are highlighted
- what default instruction lines are shown
- whether the submit button is enabled

The rendering contract should not care whether an annotation came from `replace`, `delete`, or another future action. It should operate on a normalized annotation shape.

### 4. Prompt Builder and Submission

This layer builds the final agent message from:

- the current file path
- the editable panel content

It then calls the active send handler and, on success, triggers overlay close.

Keeping prompt building separate makes it easy to add new annotation kinds by only extending line-generation rules.

## Data Model

The first version should use a normalized annotation model that can grow later:

```ts
type MarkdownAnnotationKind = "replace" | "replaceAll";

type MarkdownAnnotationRange = {
  start: number;
  end: number;
};

type MarkdownAnnotation = {
  id: string;
  kind: MarkdownAnnotationKind;
  selectedText: string;
  replacementText: string;
  lineNumber?: number;
  anchorRange: MarkdownAnnotationRange;
  matchRanges: MarkdownAnnotationRange[];
};
```

Notes:

- `anchorRange` stores the original user selection range.
- `matchRanges` is one range for `replace` and all matched ranges for `replaceAll`.
- `replacementText` starts empty and feeds default instruction serialization.
- Future kinds like `delete` and `deleteAll` can reuse the same structural fields while changing only serialization rules and UI labels.

## Rendering Strategy

The existing `MarkdownContent` component is shared between preview and chat, so annotation-specific behavior should not leak into general chat rendering.

The preview overlay should pass annotation-specific props only in the Markdown file-preview path. There are two acceptable implementation shapes:

- extend `MarkdownContent` with optional preview-only annotation props
- or wrap `MarkdownContent` in a preview-only annotation shell that manages selection, overlays, and the side panel

The preferred direction is a preview-only shell or adjacent helper components so the core Markdown renderer remains reusable and unaffected for chat bubbles.

For highlights, the implementation should avoid mutating raw Markdown strings. A safer approach is to derive overlay decorations from resolved text ranges and render them in a preview-only layer, or use controlled markup injection only inside the preview-specific pipeline.

## i18n and UX Requirements

All user-facing strings must go through existing locale files and be added at least to:

- `src/locales/en.js`
- `src/locales/zh.js`

Strings required in this feature include at minimum:

- toolbar button label
- toolbar tooltip
- side-panel title
- selection action labels
- discard confirmation title/body/buttons
- submission button label
- submission error text

The UI should remain keyboard-usable:

- the toolbar button must have a clear accessible name
- the contextual action menu must expose accessible menu actions
- the side-panel text area and submit button must be reachable and understandable

## Error Handling

The first version should explicitly handle:

- empty or invalid selections
- selections that cannot be mapped back to a stable source range
- send failures
- closing or toggling mode with unsaved annotation state

Failures should not silently discard user work.

## Testing Strategy

The minimum test matrix for this feature should focus on the shared preview overlay layer and the annotation helpers.

### Preview overlay regression coverage

- renders the annotation update button only for Markdown previews
- shows the tooltip text for the toolbar button
- enters annotation update mode and shows the side panel
- exits immediately when no annotations exist
- asks for confirmation when toggling off with pending annotations
- clears state and closes the preview after successful submission

### Annotation behavior coverage

- creating a `replace` annotation highlights only the selected occurrence
- creating a `replaceAll` annotation highlights all exact matches in the current file
- generated instruction lines use the correct default format
- submit remains disabled until required replacement content is filled
- submission sends the expected prompt body including the current file path
- send failure keeps the session state intact

### Scope guard coverage

- annotation controls do not appear for non-Markdown previews
- regular chat-message Markdown rendering remains unchanged

## Open Questions Deferred Out of Scope

The following are intentionally deferred to later iterations:

- adding `delete` and `deleteAll` UI entries
- linking side-panel hover state to stronger highlight emphasis
- per-annotation delete/edit cards
- richer structured editing than a single instruction text area
- multi-file annotation operations

## Recommended Implementation Direction

Implement the first version as a preview-overlay-local feature with a small, reusable annotation model and helper utilities. Keep Markdown preview annotation behavior isolated from general Markdown rendering, route submission through the active agent send handler, and treat the side-panel text as the final editable output while preserving structured annotation metadata for highlights and validation.
