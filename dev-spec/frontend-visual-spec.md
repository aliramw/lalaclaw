# Frontend Visual Spec

Last updated: 2026-04-03

## Purpose

This document records the baseline visual rules for the LalaClaw frontend so UI polish decisions do not live only in chat history or individual PR context.

## Core Principles

- Prefer clear information hierarchy over decorative density.
- Use consistent spacing and container rhythm before adding more visual treatment.
- Avoid duplicate labels or sections that describe the same concept at different levels with the same name.
- Summary areas and detail areas should feel related, but not visually repetitive.

## Global Shell And Themes

- The global shell should preserve a tool-first command-center feel while presenting a more polished product surface. Do not drift into marketing-page composition or decorative hero patterns.
- The default light theme should use a warm, paper-like `Signal Desk` direction: soft cream backgrounds, warmer neutral surfaces, and amber-brown primary actions.
- The dark theme should use a cooler `Precision Ops` direction: deep navy backgrounds, blue-steel surfaces, and cyan-blue primary emphasis with sharper contrast.
- Light and dark mode must behave as one paired visual system. Keep layout, hierarchy, and semantic token meanings aligned across themes instead of treating dark mode as a separate visual product.
- Overall density for the main shell should stay balanced: denser than a showcase UI, looser and more legible than a raw internal tool. Preserve inspector scanability while giving shell-level grouping more breathing room.
- The chat workspace is the primary stage of the app and should read as the most important surface in the layout. The inspector is secondary and should remain quieter even when information-dense.
- The top app chrome should form one stable shell band that clearly separates current context on the left from utility actions on the right. It should not read like a floating generic card detached from the rest of the workspace.
- The top app chrome should not add a full-width divider line when the workspace shell below already establishes the next structural boundary. Keep the chrome flatter and let spacing, not an extra rule, separate it from the main stage.
- Shell utility controls in the top-right chrome must feel like one family. Language, theme, shortcuts, logout, and personal-settings controls should share one height, one border treatment, and one surface token even when some are pills and others are circular icon buttons.
- Primary filled actions across the shell should share the same visual language as the composer send action. Do not introduce unrelated filled-button treatments for top-level update, confirm, or send-style actions.
- Shared shell surfaces should be expressed through semantic tokens such as background, surface, elevated surface, panel, primary, accent, and strong border instead of one-off per-component color mixes.
- Empty states and loading states in the main shell must inherit the active theme language and feel intentional, not like neutral placeholders.
- Assistant reply bubbles must stay inside the active shell palette. In light mode, avoid cool gray or blue-gray fills that break the `Signal Desk` warmth; use a warm surface mix instead. In dark mode, keep assistant bubbles on the cooler control-plane palette, but derive them from the same semantic surface tokens rather than hardcoded one-off fills.
- Assistant reply bubbles must remain readable as independent cards against the chat stage. If a warmer theme fill reduces separation too much, restore the boundary with a subtle semantic border before reintroducing colder background color.

## Spacing And Rhythm

- Use a compact vertical rhythm built on `8px` steps for dense inspector-style panels.
- Sibling containers in the same stack should use the same top and bottom padding unless there is a deliberate hierarchy difference.
- Collapsible section headers should not inherit oversized default card paddings; they should feel compact enough to scan in a list.
- Avoid large blank space above the first row of useful content in side panels.
- Avoid large blank space above the brand-and-tabs chrome row. After removing heavy shell cards, reclaim the top inset so the first useful row starts close to the window edge instead of floating in a tall empty gutter.
- Dense inspector sections should prefer the tighter density tier once grouping is introduced; avoid tall headers or overly generous content padding for purely diagnostic lists.
- Do not wrap the chat header summary row in an extra framed card when the surrounding chat stage and the summary pills already provide grouping. Prefer a lighter divider or spacing rhythm over a second large rounded container.
- When removing a redundant chat-header container, also reclaim the horizontal padding that only existed to support that container. Do not leave card-style side gutters behind after the frame itself is gone.
- In the main command-center workspace, avoid stacking a shell card around a pane when that pane already contains its own primary working surfaces. Prefer one grouping layer per pane, not a stage card plus a content card plus a nested tool card.
- The chat composer should use the input shell itself as the primary boundary. Do not add a second large rounded composer container around the textarea unless it introduces a genuinely new grouping need.
- The inspector tab strip may use a compact rail treatment, but the active tab body should default to a flatter workspace. Do not wrap each tab body in another large rounded bordered card when the inner sections already provide structure.
- Inspector tab bodies, especially the environment view, should not introduce their own custom background fill. Let the shared shell and the section cards create the hierarchy instead of tinting the whole tab body.
- For editor-like layouts, replace removed nested cards with one shared workspace shell that gives the whole center area a finished frame. Reducing card count must not leave top bar, chat stage, and inspector column looking detached from each other.
- In the chat column, messages and composer should belong to one continuous workspace surface. Use an internal divider or spacing break between transcript and composer instead of making them look like unrelated floating blocks.
- Once the chat workspace shell already provides the main conversation boundary, do not add another rounded bordered frame around the transcript viewport itself. The transcript may keep its clipping radius, but the extra inner pane border should be removed when it only repeats the shell boundary.
- Composer-adjacent shells inside the chat stage should avoid large exterior drop shadows in light mode. If a surface needs separation, prefer border contrast or a very light inset highlight so rounded shells do not leak square shadow corners into nearby gutters.
- User-message meta such as timestamp, copy, and jump controls should stay visually attached to the user bubble. Do not float that meta block as a detached left-side column beside the bubble; place it beneath the bubble and align it to the bubble edge instead.
- Long assistant message cards should show the message-top jump control only after the upper portion of that card has scrolled out of the transcript viewport. Keep the control attached to the card corner, but do not pin it on screen while the card top is still visible.
- Long unbroken message content such as pasted file paths, hashes, IDs, digit strings, or generated token dumps must wrap inside the message bubble instead of widening the `main` conversation column or pushing nearby inspector content out of place. Prefer local wrapping plus `min-w-0` shrink constraints on the bubble chain over global layout changes.
- The chat composer input shell should read as a calm resting control. Reserve the stronger blue focus ring for the focused state only; do not keep a permanent thick ring around the composer when it is idle.
- In light mode, the composer input shell itself may use a clean white fill when it helps unify the attachment row and textarea into one editing surface. Keep that white limited to the bordered composer shell; do not let nearby workspace floors or the broader chat stage wash out toward flat white.
- In light mode, the larger workspace floors that sit beside or behind that white input surface should be slightly darker than pure white. Keep the contrast subtle, but do not let the main chat stage or inspector tab body drift so close to white that the input field loses its visual edge.
- The composer attachment strip must stay compact and visually merge into the same editing surface as the textarea. Keep the label aligned with the attachment row, use a tight thumbnail corner radius, and anchor the dismiss affordance so the circle's lower-left quadrant overlaps the thumbnail's own top-right corner rather than floating beside it. If space gets tight near the shell border, shift the whole attachment row down slightly rather than moving the dismiss control off the thumbnail. Do not leave a visible seam or divider rule between attachments and the input body unless a future layout introduces a truly separate section.
- When the composer textarea receives focus, it must not reintroduce a top seam through inherited focus borders, ring offsets, or focus shadows. Focus emphasis belongs on the outer composer shell, not as a second line across the top of the inner textarea.
- In stacked inspector sections, the gap between a section title and its own card should be tighter than the gap to the previous sibling section. Never let a title visually read as attached to the card above it.
- Form controls inside inspector cards should not rely on browser-default select arrows. Use a consistent custom arrow placement so dropdown affordances align with the input shell and right padding.
- Checkbox controls inside inspector forms should align to the vertical center of their text label. Do not use ad-hoc top margins to visually fake alignment.
- Dropdown and popover menus must keep a visible safe margin from the viewport edge. Do not let menu surfaces visually stick to the window boundary when collision handling repositions them.
- Dropdown menus triggered from summary cards or compact controls should align to the trigger edge that faces the nearest viewport side: use left-edge alignment for left-side triggers and right-edge alignment for right-side triggers.
- The top-right utility cluster must expose a dedicated personal-settings entry as a compact person icon button. User profile fields such as the display-name editor belong inside that settings surface, not inline in the chat header.
- The personal-settings surface should use a stable left-side section nav with at least `Personal settings` and `About`, so identity controls and app/update information stay grouped under one discoverable entry instead of being scattered across the main workspace.
- The `About` section inside personal settings should reuse the same LalaClaw version/update logic shown in the `Environment` panel, so operators do not see conflicting update affordances between the two surfaces.
- In the Agent/IM switcher menu, unavailable IM channels should remain visible instead of disappearing. Render them in a muted disabled state, keep their platform icon and name readable, and append a subtle gray status pill such as `未启用插件` / `Plugin disabled` so operators can immediately tell why the entry cannot be selected.
- IM platform logos in the Agent/IM switcher must render immediately when the menu opens. Do not rely on delayed network image loading or temporary letter placeholders for primary IM entries; use inline icon rendering so the first paint already shows the platform mark.
- When opening or switching into a conversation whose transcript has not finished resolving yet, the center of the chat area must show a loading-state message such as `加载会话中...` / `Loading session...` instead of the idle empty-state copy. Only show the `waiting for first prompt` empty state after the session initialization has finished and the conversation is confirmed empty.
- In compact session summary cards, abbreviated protocol labels are allowed when they materially improve scanability. The transport card should display `WS` in the card body for WebSocket, while tooltips keep the full `WebSocket` wording in every locale.
- Socket steady-state wording in compact transport summaries should read like an ongoing status instead of a one-time completion event. Prefer terms like `在线` / `Online` over `已连接` / `Connected` for the stable connected state.
- When switching to another conversation or opening a fresh session, if the session overview values have not been resolved yet, all compact summary cards in that row must render a muted gray `--` placeholder instead of showing stale values from the previous conversation. This applies consistently to model, context, fast mode, think mode, and transport until the new runtime overview is ready.
- In chat panel headers, compact utility groups such as font-size toggles must keep a low visual height. When horizontal space gets tight, prefer shrinking the control group's own height and padding before letting it collide with the summary card row below.
- Split chat-and-inspector layouts must switch to the compact inspector rail based on the actual workspace width, not only the browser viewport breakpoint. Do not keep the full inspector column mounted once the shared workspace becomes too narrow for both panes to breathe.
- In compact split layouts, keep a visible gutter between the chat workspace and the inspector rail so the two panes never visually stick together.
- In wide split chat-and-inspector layouts, do not draw a separate vertical divider line between panes. Use one neutral gutter instead, keep its left and right spacing visually balanced, and place the resize grip on the split centerline rather than offsetting it toward one pane.
- Chat transcript bubbles inside split workspaces must size against the chat column itself rather than viewport-wide `vw` caps, so narrowing the inspector or window cannot push message content under the inspector pane.
- User-authored chat bubbles must keep their right edge aligned to the active chat column. Timestamp/copy/navigation metadata may sit below the bubble or within the bubble width, but must not consume horizontal space on the bubble's right side in a way that visually shifts the bubble toward the center.
- The chat header title row should sit close to the top edge of the chat stage. Do not leave a tall blank band above the conversation title and utility controls; reclaim top padding before removing useful information.
- When a message-level navigation affordance such as `Back to message top` becomes available, keep it visibly present on the card instead of hiding it behind hover-only discovery. Scroll-state controls inside long messages should behave predictably during active scrolling.
- The message-top jump control must render inside the assistant card's top-right corner. Do not mount it as a sibling outside the card or in the gutter beside the message surface.
- Long-message scroll controls must recompute continuously while the viewport moves in either direction. Do not let their visibility depend only on sparse observer threshold changes, because reversing scroll near the card top should immediately hide or restore the control in line with the visible top border.
- Message outline sidebars must also recompute their available height while the transcript scrolls. If an outline first appears when the message sits low in the viewport, it must be able to grow again as the message scrolls upward instead of staying stuck at a tiny initial height.
- For streaming assistant replies, keep exactly one stable in-progress treatment across the chat surface. Do not show competing labels such as a separate `Generating` badge in message meta when the tab badge and top session badge already communicate the running state.
- While an assistant reply is still streaming, the chat header status and the chat-tab busy dot must stay continuously in the busy state for the whole turn instead of blinking per token or intermediate snapshot.
- The header busy badge, the chat-tab busy dot, and the assistant bubble trailing waiting dots must all derive from the same tracked in-flight turn state rather than from transient token-level `streaming` or `session.status` pulses.
- The assistant bubble trailing waiting dots should stay latched through short reconciliation gaps instead of disappearing on each intermediate card refresh or token-state pulse.
- If the page refreshes while an assistant turn is still in progress, the restored conversation must continue to show the same in-flight state immediately after hydration: header busy badge, chat-tab busy dot, and assistant trailing waiting dots all remain visible until the recovered turn actually stabilizes and finishes.
- While the latest assistant turn is still in progress, its card must stay on a stable single layout branch and must not switch between compact/full/outline variants during intermediate reconciliation.
- During busy-state reconciliation, the latest pending user bubble, the active assistant bubble, and the settled assistant replacement must stay on the same card branch. Do not drop and reinsert the user turn, and do not swap the active reply onto a different card identity between local and runtime merges.
- If a pending user turn has to be restored while the transcript is temporarily showing assistant-only cards, reinsert that user bubble immediately before the assistant card for the same turn. Never anchor the restored user ahead of earlier settled assistant cards from previous turns.
- When a pending turn is being retained until runtime catch-up, the chat transcript must keep showing a visible thinking card until either an assistant projection or an authoritative assistant reply is actually present. Do not let the busy header stay active while the transcript briefly drops the only in-flight assistant card.
- The latest assistant message at the conversation tail must stay on the plain bubble branch while the turn is still in progress or the busy badge is still latched. Once the turn has visibly stabilized, the outline sidebar may appear again; do not permanently suppress outlines for settled latest replies.
- Short in-progress assistant bubbles must stay on the compact width treatment instead of immediately expanding to the wide full-layout card. Only replies whose content already exceeds the compact threshold should promote into the long full-width layout while the turn is still in progress.
- The assistant trailing waiting dots should use a subtle small-dot treatment rather than large loading chips, while remaining continuously visible for the whole in-flight turn.
- The assistant bubble trailing waiting dots should render as plain filled dots only. Do not add outlines, borders, or glow/shadow treatment around the three-dot indicator.
- The assistant bubble trailing waiting dots should stay inline after the generated text, visually following the final text run instead of sitting in a detached card corner.
- Streaming assistant bubbles should show a trailing three-dot waiting indicator at the end of the card content until the turn settles. Use this as the inline progress affordance instead of an extra `Generating` label near the timestamp.
- Chat transcript tool activity must render as standalone cards in chronological order within the turn instead of merging multiple tool calls into one shared card above the assistant reply. In chat only, each tool card should start collapsed by default so tool IO does not suddenly push the active assistant bubble downward.
- Transcript-side control notes or delivery metadata wrappers that need to stay visible, such as aborted-run notices injected ahead of IM follow-up messages, must render as their own neutral `system` cards. Never merge those notes into the same visual bubble as the user-authored message body.
- Small muted subtitles in cards, sheets, and section headers must keep enough line-height and vertical breathing room to avoid clipping Latin descenders such as `g`, `p`, and `y`.
- Queued outgoing messages belong directly above the chat composer instead of above the scrollable transcript. The queue should use a compact strip layout with capped height, one-row items by default, and per-item pencil/trash actions for edit and delete.
- Composer `@` mention menus must anchor to the trigger character's on-screen caret position inside the textarea, not to the input shell edge. As the user types a mention in a long line, the menu should visually follow the `@` location instead of staying pinned to the composer's left corner.
- The chat composer action row should keep the primary send button as the rightmost action. Auxiliary composer actions such as mention, attachment, and voice-input controls should stay grouped immediately to its left, use the same compact `h-9` icon-button footprint, and expose stable tooltip or inline status feedback for unavailable or active states.
- Voice input should expose a platform-aware toggle shortcut in both the composer control tooltip and the keyboard-shortcuts dialog. The default shortcut is `Cmd + Shift + .` on Apple platforms and `Ctrl + Shift + .` elsewhere, and it should toggle the same start/stop behavior as the microphone button instead of introducing a separate push-to-talk mode.
- Preview toolbar actions that support keyboard shortcuts must surface those shortcuts in hover tooltips. The preview `Edit` action should show plain `E`, and it should only trigger while a file preview is open and focus is not already inside an editable control. The keyboard-shortcuts dialog should explicitly list preview edit, save, and close actions alongside the existing global/composer shortcuts. Image preview must expose `=/+` zoom-in, `-` zoom-out, `0` reset zoom, `O` reveal in Finder/Explorer, `Q` rotate left, and `W` rotate right in both hover tooltips and the keyboard-shortcuts dialog. While an image preview is open, those single-key shortcuts must be intercepted before they can type into the underlying composer or other inputs.
- The keyboard-shortcuts dialog must treat its platform shortcut as a true toggle: pressing `Cmd + /` on Apple platforms or `Ctrl + /` elsewhere opens it when closed and closes it again when already open. Keep `Esc` and the explicit close button as additional close affordances.
- File preview header controls must reuse the active shell surface language instead of falling back to generic slate/gray toolbar styling. Maximize, reveal/open, edit, font-size, and close actions should share the same warm surface token, strong-border hover behavior, and quiet muted icon color as the rest of the Signal Desk shell in light mode, with the paired semantic treatment carrying into dark mode.
- Toolbar controls that open a selection menu, such as the locale switcher, must dismiss their tooltip as soon as the menu opens or a choice is committed. The same tooltip must stay suppressed until the pointer leaves and re-enters the trigger, so a successful selection never leaves a stale tooltip floating under the updated control.
- Pointer clicks on button-like controls must not leave a persistent focus outline, ring, or emphasized frame behind after the action completes. Clear pointer-acquired focus for toolbar buttons, tabs, menu actions, and similar click targets, while preserving visible focus treatment for keyboard navigation.
- The dev workspace badge should support branch switching and service restart from the same compact surface. Branch choices must come from a verified switchable-branch list instead of free-form text, including tracked local development branches when available, and selecting a different branch should clearly turn the primary action into “switch branch and restart”.
- In the dev workspace worktree selector, option labels must stay unique within the open menu. If multiple entries would otherwise render the same `worktree · branch` or `worktree · detached` label, append a stable path-derived suffix so operators can distinguish sibling detached worktrees at a glance.
- The LalaClaw lobster easter egg may include `🐡`, `🐟`, and `🐠` aquatic companions with distinct spawn rates: `🐡` at `3%`, `🐟` at `8%`, and `🐠` at `2%`. Their routes should be near-horizontal straight lines with at most `20deg` vertical pitch, and their travel speed should stay at `50%` of the default lobster-walk speed so they visibly drift more slowly than the other companions. They should not perform extra random horizontal flips mid-route. When one approaches the left or right viewport edge in its current travel direction, it should flip horizontally immediately; when it approaches the top or bottom viewport edge, it should immediately reroute onto a new near-horizontal line that heads back away from that vertical edge. Their total on-screen lifetime should still follow the same appearance-duration rule as the other easter-egg walkers instead of extending themselves after each reroute.

## Section Containers

- Collapsible diagnostic or inspector sections should have:
  - consistent header height
  - aligned chevron, title, and count badge
  - matching corner radius and border treatment across siblings
- Count badges should be visually secondary to the title and should not dominate the header.
- Count badges inside segmented inspector tabs must keep a distinct pill background and outline even when the tab is not selected; the inactive badge cannot blend into the tab list surface in either light or dark theme.
- Expanded sections may add a top divider between header and content, but collapsed and expanded states should keep a stable outer shape.
- In dialogs, sheets, and cards, dividers with inset spacing must stay inside the container width. Do not combine `w-full`-style separators with horizontal margins in a way that makes the rule visually protrude past the surface edge.
- For inspector-style collapsible lists, header and content padding should stay compact enough that many sections can be scanned without excessive vertical scrolling.
- In the files inspector, the `Workspace files` group should be expanded by default on first visit so workspace inventory is immediately visible. After the user manually expands or collapses that group, remember the choice per conversation and restore the same state after refresh or when returning to that same session.
- In file-group count badges, show `--` instead of `0` while the underlying file count is still unknown or has not been loaded yet. Reserve `0` for confirmed empty results only.
- In the files inspector tree, clicking a folder must apply a persistent selected state that stays visually distinct from both hover and keyboard focus. That selection is the target for paste shortcuts, and directory context menus must expose a disabled/enabled paste action based on whether the clipboard currently contains files or images.
- Directory context menus should preserve the core file-management actions available on file rows when they still make sense for a folder. For system file-manager integration, files may use a reveal action, while folders should directly open that directory in `Finder` / `Explorer`.

## Naming And Information Architecture

- Sibling groups must use distinct names. Do not create two adjacent sections both called `Gateway`.
- Summary groups should use user-facing names such as `Overview`, `Connectivity`, `Doctor`, or `Logs`.
- Technical detail groups should use names that explain scope, for example:
  - `Session context`
  - `Realtime sync`
  - `Gateway config`
  - `Application`
  - `Other`
- If two data sources belong to the same mental model, group them together. Example: `runtime.*` and `runtimeHub.*` belong under one realtime sync group, not separate sibling groups.

## Ordering Rules

- Order sections from most decision-useful to least:
  1. summary / diagnostics
  2. session context
  3. realtime sync / transport state
  4. gateway configuration
  5. application metadata
  6. other
- `Other` must always be last.
- Duplicated detail rows that are already represented in the summary layer should usually be removed from the lower-level technical groups.

## Inspector Environment Panel

- The environment tab should present a top-level diagnostic summary first, then technical detail groups.
- The environment tab hint text should describe the combined surface as OpenClaw diagnostics, management actions, and current-session environment details; do not reuse stale backend summary copy that only describes gateway/session metadata.
- The application metadata group should be labeled `LalaClaw` instead of a generic “Application” label.
- Diagnostic summary should cover:
  - OpenClaw version
  - runtime profile
  - config path and status
  - workspace root and status
  - gateway status and health URL
  - doctor summary
  - log entry points
- Lower-level groups should avoid repeating obvious summary rows like `gateway.baseUrl` or `session.mode` if those are already promoted into the diagnostic summary.
- The `LalaClaw` metadata group should include at least the app version, current server URL, host, port, and active access/auth mode so operators can confirm the local control-plane endpoint at a glance.
- When a newer stable LalaClaw release is available, the `Environment` tab must show a small red-dot attention marker before the user opens the tab.
- Opening the `Environment` tab while a newer stable LalaClaw release is available must auto-expand the top-level `LalaClaw` section so the version row, target stable version, and immediate update action are visible without extra clicks.
- The `LalaClaw` section should show stable-status badges inline with version values instead of burying the stable signal in secondary copy.
- In the `LalaClaw` update panel, the target/latest version should be shown as a normal info row, not inside an extra nested framed card. Avoid adding a second decorative box when the surrounding panel already provides enough grouping.
- When a newer stable LalaClaw release is available, show the `Update available` state as plain inline text without badge chrome or accent coloring, and place the immediate update action directly after that status text.
- The adjacent LalaClaw immediate update action must reuse the same filled blue treatment as the chat composer send button instead of inheriting the generic primary button theme, so the two primary send/update actions stay visually consistent across light and dark themes.
- Do not repeat extra helper copy such as `A newer stable version is available` when the green inline status and adjacent action already communicate the update affordance.
- Long values such as JSON session keys, file paths, and runtime identifiers must wrap inside the container boundary; do not allow value text to visually spill past the right edge.
- If an environment value is an absolute file path that points to a file-like value, render it as a clickable preview link instead of inert monospace text.
- If an environment value represents a directory such as `*.dir` or `*.root`, render it as a folder entry with a folder icon and make the click action open that directory in the system file manager instead of opening inline preview.
- Environment path interactions must use verified metadata from the data source. Do not guess purely from a slash-prefixed string, because API routes like `/v1/chat/completions` are not files.
- Missing files should stay plain text instead of rendering as broken preview links. Only render preview actions for confirmed existing files.
- Directory icons in environment path rows should sit outside the colored link text, use a muted gray tone, and be vertically centered against the path label.
- Environment diagnostics labels should use the newer user-facing names now exposed in the UI, including `OpenClaw Doctor` and `Current session agent workspace directory`, instead of older generic names such as `Doctor` or `Workspace root`.
- In environment and diagnostics lists, hovering a config-item label row should reveal a compact copy action aligned to that row. The icon should stay visually quiet by default, match the label-row height instead of inflating it, and copy the item's value rather than its label.
- In install/update panels, hide the primary update action when the system is already up to date. Keep the status badge and refresh action, but do not show a no-op primary button.
- Install/update failure states must expose the underlying command diagnostics clearly, including `stderr`, timeout state, and exit code when available.
- Install/update failure cards should map known failure shapes to actionable guidance. Prefer linking to the relevant official OpenClaw docs and keep the inline summary short.
- When the recommended fix is longer than a short inline note, open it in a dedicated preview-style dialog instead of expanding the main card into a long wall of text.
- Large environment subpanels such as install/update, config, and management should use a slightly larger gap between sibling sections than between each section title and its card body.
- Top-level environment tools such as `OpenClaw config`, `OpenClaw management`, `OpenClaw install/update`, and `OpenClaw operation history` should use the same collapsible section pattern as lower-level diagnostic groups instead of staying permanently expanded.
- If OpenClaw is installed but its first-run onboarding is still incomplete, the environment tab must surface an `OpenClaw onboarding` / `OpenClaw 初始化` section before structured config editing. Do not imply that the install step alone made the local runtime usable.
- While onboarding is incomplete, prefer the onboarding section over the structured config section. The environment IA should guide operators through `install -> onboarding -> config/manage`, not expose advanced config first.
- OpenClaw install-document links must follow the current UI locale instead of always pointing to English: `zh` and `zh-hk` go to the Chinese install docs, `ja` goes to the Japanese install docs, and all other locales fall back to the English install docs.

## Preview Overlays

- File preview overlays with a secondary sidebar must keep the main preview column shrinkable with `min-w-0`-style constraints so long single-line content scrolls inside the preview surface instead of pushing the sidebar out of view.
- In split preview overlays, the main preview column should also use a `basis-0`-style flex basis and full-width content wrappers so wide markdown tables, code blocks, or front matter sections cannot force the overall layout past the right edge.
- When a preview includes the files sidebar, prefer an explicit two-column grid such as `minmax(0, 1fr) + fixed sidebar width` over loose flex sizing. The sidebar may never be visually overlapped or pushed out by markdown, code, front matter, or table content.
- Code-like previews in light mode should use a true light syntax surface and token palette; avoid embedding a dark code block inside an otherwise light preview shell unless the user explicitly asks for it.
- Long diagnostic or transcript-style content inside dialogs must scroll within the dialog body instead of forcing the surface to grow past its height budget. Keep an internal scroll container with a visible scrollbar affordance so operators can tell the content is scrollable.
- Markdown preview annotation mode must keep a visible safe gutter from the overlay edge. Do not let the preview surface, annotation chips, textarea, submit action, or generated prompt sit flush against the dialog boundary.
- In markdown preview annotation mode, the right-hand tool column should read as one grouped workbench surface with distinct spacing tiers: tighter spacing inside the annotation list itself, and wider separation between the list, the generated prompt preview, and the primary submit action.
- In markdown preview annotation mode, keep the short "how to use this" sentence visible at the top of the right-hand workbench as plain instructional copy. If that helper no longer needs an empty-state frame, remove the frame but retain the text.
- In markdown preview annotation mode, selection actions should open as a temporary context menu adjacent to the currently selected text rather than as a detached toolbar in a fixed corner. If the user dismisses the selection without choosing an action, both the temporary menu and the temporary highlight must disappear together.
- The temporary selection actions in markdown preview annotation mode must reuse the same visual language as the app's existing context menus. Do not render them as pill buttons, segmented controls, or mini toolbars when the intended mental model is a contextual right-click-style menu.
- The temporary selection menu in markdown preview annotation mode must also reuse the same icon slot, item spacing, hover treatment, and menu chrome as the existing file/folder context menus. It should read as the same menu family, not merely a similar floating panel.
- The temporary selection menu in markdown preview annotation mode should stay compact. Do not leave oversized empty width around a short action list; size it like the existing file/folder context menu family.
- The temporary selection menu in markdown preview annotation mode must expose the supported action set directly in-menu, including `Replace`, `Replace all`, and `Delete` when those capabilities are available for the current scope.
- The temporary selection menu in markdown preview annotation mode should avoid covering the currently highlighted text. Prefer placing it below the selection; if there is not enough room below, move it above instead of centering it over the selection block.
- In markdown preview annotation menus, list non-destructive actions before destructive ones. Keep `Delete` after `Replace` and `Replace all` instead of interleaving it ahead of bulk-edit actions.
- Temporary selection highlight and committed annotation highlight must use different visual states. Use blue to indicate a pending selection that has not been converted into an annotation yet, and switch to yellow only after the user chooses a concrete annotation action.
- Markdown preview annotation highlights may use subtle vertical breathing room, but they must not add horizontal padding that shifts text position during selection. Highlighting should feel stable in place instead of making words jump sideways.
- In markdown preview annotation mode, do not add a redundant dashed empty-state frame, duplicate workbench title, or a second large aggregate editor when each annotation row already supports direct editing. Keep the right column structurally quiet and let the inline rows plus generated-prompt label carry the explanatory copy.
- In markdown preview annotation mode, replacement-style annotations should be edited directly inside their own draft rows as one inline instruction row. Keep the left instruction prefix and the right replacement target tightly coupled in the same row shell instead of dropping the target editor to a second row.
- When a markdown annotation instruction prefix grows long, let the prefix wrap within the row rather than truncating it with ellipsis. Long prefixes must stay readable while the replacement input and dismiss control remain visible.
- Long replacement rows in markdown preview annotation mode should read like one wrapped sentence block, not a two-column layout. Do not park the replacement target input in a visually separate right column that wastes horizontal space while the prefix text wraps on the left.
- The inline replacement target input in markdown preview annotation rows should sit close to the surrounding text baseline and use a compact height. Do not style it as a tall pill that makes the `→` segment and the typed replacement read on different vertical tracks.
- In markdown preview annotation mode, each editable annotation row should use one visible shell only. If the outer draft row already provides the boundary, the inline text input must merge into that shell instead of drawing a second nested input frame inside it.
- In markdown preview annotation mode, the replacement target area to the right of the arrow must show an explicit empty-state prompt such as `替换为` / `Replace with` until the user types. Do not leave the target area visually blank after choosing `Replace` or `Replace all`.
- In markdown preview annotation mode, the `替换为` / `Replace with` hint should behave like inline placeholder copy inside the instruction sentence, not like a separate boxed field label. Once the user types, the replacement text should continue in the same wrapped text flow so long replacements remain readable as part of the full instruction.
- Do not give markdown annotation replacement targets a fixed-width editor box. The editable target must expand with the sentence flow and wrap naturally with the surrounding instruction text instead of hiding longer replacements inside a narrow control.
- In markdown preview annotation mode, the remove-annotation affordance should stay visually secondary. Use a compact dismiss button size so it reads as an auxiliary action rather than competing with the editable instruction row.
- The markdown preview toolbar toggle for annotation mode must have a clearly differentiated active state from the adjacent `Edit` action. When annotation mode is active, switch the control into an explicit cancel affordance with stronger emphasis so operators can tell at a glance that clicking it again exits annotation mode.
- While the user is actively dragging to extend or adjust a text selection in markdown preview annotation mode, do not show the temporary action menu yet. Wait until pointer release so the menu never steals selection focus or gets included in the next drag path.
- Completing a text selection in markdown preview annotation mode must not depend on the pointer-up event landing on the original preview element. If the user starts the drag inside the preview and releases slightly outside, the temporary action menu should still appear for the resolved selection.
- Draft annotation rows in markdown preview annotation mode should default to a compact single-line-friendly height. Do not give one-line replacement rules a tall card shell with large empty vertical padding.
- After the user chooses `Replace` or `Replace all`, the workbench must explicitly tell them where to type the replacement text. Use helper copy and textarea placeholder language to make it obvious that only the text to the right of the arrow should be filled in.
- The annotation-mode toolbar action must advertise its keyboard shortcut in the same tooltip pattern as other top-bar actions. Keep the shortcut discoverable in both the tooltip copy and the actual keybinding.
- When the preview is in edit mode or annotation mode, pressing `Esc` must not immediately close the overlay. Route that exit through a confirmation dialog first, even if the current mode is otherwise clean, so operators do not lose context through an accidental key press.
- Annotation workbench textareas that do not actually support drag resizing must suppress the browser resize affordance. Do not show a bottom-right resize handle when the component is visually and behaviorally fixed-size.

## Feedback Loop

- When a user gives specific visual feedback, update this spec in the same workstream as the code change.
- New visual rules should be written here as explicit guidance, not left implied in a component implementation.
- If a requested visual change conflicts with an older rule, update this file to reflect the new decision instead of silently diverging from the spec.
- AI-generated visual suggestions must be logged in `plan/ai-assisted-code-quality.md`, validated against this spec, and any new rule captured here before the PR merges. Feedback tracking should note how the AI output complied with the spec.
- 文件与文件夹的右键菜单都要提供“重命名”入口；重命名弹窗默认聚焦名称输入框，提交后列表应立即反映新名称，不等待整页刷新。
- 文件重命名如果会修改后缀，必须先弹出二次确认；文件夹重命名不需要后缀确认。
- “本次会话文件”不仅要显示 AI 在当前对话中查看/创建/修改过的文件，也要立即显示用户在当前对话里主动完成的本地文件操作结果，例如粘贴到目录或重命名后的文件；不要要求用户等到 runtime 回写后才看到这些文件。
