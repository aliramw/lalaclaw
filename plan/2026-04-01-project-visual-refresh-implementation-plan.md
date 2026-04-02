# Project Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a shell-first visual refresh that pairs a warm `Signal Desk` light theme with a sharper `Precision Ops` dark theme while improving app-chrome, chat, and inspector hierarchy without changing core behavior.

**Architecture:** Build the refresh from the bottom up: first extend global semantic theme tokens and shared UI primitives, then restage the top shell, chat stage, and inspector surfaces on top of those tokens. Preserve the current `useTheme` mechanism, split-layout model, and controller/data architecture so the work remains a presentational refactor rather than a behavior rewrite.

**Tech Stack:** React, TypeScript/JSX, Tailwind CSS v4 theme tokens, Radix UI primitives, Vitest, Testing Library

---

## File Map

- [`src/index.css`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/index.css)
  Defines global color tokens, shell surfaces, scrollbar treatment, motion tokens, and theme-level utility classes.
- [`src/components/ui/button.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/button.tsx)
  Shared button hierarchy for primary, outline, ghost, and secondary actions.
- [`src/components/ui/card.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/card.tsx)
  Shared panel/card primitive that should express resting vs elevated shell surfaces.
- [`src/components/ui/tabs.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/tabs.tsx)
  Shared tab rail primitive used by the inspector and other shell controls.
- [`src/components/ui/textarea.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/textarea.tsx)
  Composer and form input shell; should inherit the upgraded panel treatment.
- [`src/components/ui/badge.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/badge.tsx)
  Shared status badge primitive; must remain semantically themed across light and dark.
- [`src/App.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/App.tsx)
  Top-level shell assembly for chrome, split layout, settings dialog, and overall workspace framing.
- [`src/components/app-shell/app-split-layout.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/app-split-layout.tsx)
  Primary/secondary pane relationship and resize affordance.
- [`src/components/app-shell/settings-trigger.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/settings-trigger.tsx)
  Quiet utility button for personal settings.
- [`src/components/app-shell/use-app-session-overviews.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/app-shell/use-app-session-overviews.tsx)
  Supplies the tab-brand, controls, and status overviews that define the shell chrome.
- [`src/components/command-center/chat-panel.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel.tsx)
  Main chat stage, transcript, composer, tabs, and message container layout.
- [`src/components/command-center/chat-panel-surfaces.ts`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel-surfaces.ts)
  Shared surface exports used inside the chat panel.
- [`src/components/command-center/chat-empty-conversation.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-empty-conversation.tsx)
  Empty/loading state styling for the main chat stage.
- [`src/components/command-center/inspector-panel.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/inspector-panel.tsx)
  Inspector shell, tabs, section composition, and dense operational surfaces.
- [`src/components/command-center/inspector-panel-primitives.tsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/inspector-panel-primitives.tsx)
  Reusable inspector section and list primitives that control spacing and grouping.
- [`src/components/command-center/inspector-panel-surfaces.ts`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/inspector-panel-surfaces.ts)
  Shared surface exports used by the inspector.
- [`src/App.test.jsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/App.test.jsx)
  High-signal shell integration coverage.
- [`src/components/command-center/chat-panel.test.jsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/chat-panel.test.jsx)
  Chat stage rendering and composer regressions.
- [`src/components/command-center/inspector-panel.test.jsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/command-center/inspector-panel.test.jsx)
  Inspector layout and interaction regressions.
- [`src/components/ui/surface-primitives.test.jsx`](/Users/marila/.codex/worktrees/4e33/lalaclaw/src/components/ui/surface-primitives.test.jsx)
  New shared-primitive regression file for button/card/tabs/textarea/badge class hierarchy.

## Task 1: Establish Global Theme Tokens And Shared Surface Primitives

**Files:**
- Create: `src/components/ui/surface-primitives.test.jsx`
- Modify: `src/index.css`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: Write the failing primitive regression test**

```jsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

describe("surface primitives", () => {
  it("renders the refreshed button, card, tabs, textarea, and badge hierarchy", () => {
    render(
      <div>
        <Button>Send</Button>
        <Button variant="outline">Inspect</Button>
        <Card data-testid="card">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent>Ready</CardContent>
        </Card>
        <Tabs defaultValue="one">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="one">One</TabsTrigger>
          </TabsList>
          <TabsContent value="one">Panel</TabsContent>
        </Tabs>
        <Textarea aria-label="Composer" />
        <Badge variant="active">Live</Badge>
      </div>,
    );

    expect(screen.getByRole("button", { name: "Send" })).toHaveClass("rounded-lg");
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveClass("border-border/80");
    expect(screen.getByTestId("card")).toHaveClass("rounded-xl");
    expect(screen.getByTestId("tabs-list")).toHaveClass("rounded-xl");
    expect(screen.getByLabelText("Composer")).toHaveClass("rounded-xl");
    expect(screen.getByText("Live")).toHaveClass("rounded-full");
  });
});
```

- [ ] **Step 2: Run the primitive test to verify it fails**

Run: `npm test -- src/components/ui/surface-primitives.test.jsx`

Expected: FAIL because `surface-primitives.test.jsx` does not exist yet and the current primitives do not expose the refreshed hierarchy classes.

- [ ] **Step 3: Add the paired light/dark semantic tokens and refresh the shared primitives**

```css
/* src/index.css */
:root {
  --background: #f6f1e7;
  --background-muted: #efe7d9;
  --surface: #fffaf1;
  --surface-elevated: #fffdf8;
  --surface-strong: #f3e7d3;
  --panel: #fbf4e7;
  --panel-muted: #f1e7d7;
  --primary: #b6722f;
  --primary-foreground: #fff9f1;
  --accent: #ede1cd;
  --accent-foreground: #433220;
  --border: #e4d6bf;
  --border-strong: #d0b793;
  --text: oklch(0.238 0.014 253.1);
  --text-muted: #715f4c;
  --text-subtle: #958166;
  --focus-ring: rgba(234, 120, 32, 0.28);
}

.dark {
  --background: #0b1a28;
  --background-muted: #102233;
  --surface: #10202f;
  --surface-elevated: #13283b;
  --surface-strong: #18354d;
  --panel: #0d2233;
  --panel-muted: #0f2739;
  --primary: #0ea5e9;
  --primary-foreground: #041521;
  --accent: #153149;
  --accent-foreground: #eaf7ff;
  --border: #21465d;
  --border-strong: #2e6483;
  --text-muted: #9cb8cb;
  --text-subtle: #7392a8;
  --focus-ring: rgba(14, 165, 233, 0.34);
}
```

```tsx
/* src/components/ui/button.tsx */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,box-shadow,background-color,border-color,transform] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(0,0,0,0.08)] hover:translate-y-[-1px] hover:brightness-[0.98]",
        outline: "border border-border/80 bg-[var(--surface-elevated)] text-foreground hover:border-[var(--border-strong)] hover:bg-accent/40",
        ghost: "text-muted-foreground hover:bg-accent/28 hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        icon: "h-10 w-10 rounded-xl",
      },
    },
  },
);
```

```tsx
/* src/components/ui/card.tsx */
const cardVariants = cva(
  "rounded-xl border border-border/80 bg-[var(--surface)] text-card-foreground shadow-[0_12px_32px_rgba(15,23,42,0.06)]",
);
```

```tsx
/* src/components/ui/tabs.tsx / textarea.tsx / badge.tsx */
<TabsPrimitive.List className="inline-flex h-11 items-center rounded-xl border border-border/70 bg-[var(--panel-muted)] p-1 text-muted-foreground" />
<textarea className="flex min-h-20 w-full rounded-xl border border-border/80 bg-[var(--surface-elevated)] px-3 py-2 text-sm shadow-xs ..." />
const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors", ...)
```

- [ ] **Step 4: Run the primitive test to verify it passes**

Run: `npm test -- src/components/ui/surface-primitives.test.jsx`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit the shared-surface foundation**

```bash
git add src/index.css src/components/ui/button.tsx src/components/ui/card.tsx src/components/ui/tabs.tsx src/components/ui/textarea.tsx src/components/ui/badge.tsx src/components/ui/surface-primitives.test.jsx
git commit -m "feat: establish paired visual shell tokens"
```

## Task 2: Restage The App Chrome And Overall Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/app-shell/app-split-layout.tsx`
- Modify: `src/components/app-shell/settings-trigger.tsx`
- Modify: `src/components/app-shell/use-app-session-overviews.tsx`
- Test: `src/App.test.jsx`

- [ ] **Step 1: Add a failing shell-integration regression**

```jsx
it("renders the refreshed shell chrome and workspace stages", async () => {
  stubFetchWithAccessState(async (input) => {
    if (String(input).startsWith("/api/runtime")) {
      return mockJsonResponse(createSnapshot());
    }
    return mockJsonResponse({ ok: true });
  });

  const { container } = render(
    <I18nProvider>
      <App />
    </I18nProvider>,
  );

  await findComposer();

  expect(container.querySelector(".cc-shell-chrome")).toBeInTheDocument();
  expect(container.querySelector(".cc-workspace-stage")).toBeInTheDocument();
  expect(container.querySelector(".cc-inspector-stage")).toBeInTheDocument();
  expect(container.querySelector(".cc-settings-trigger")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the App integration test to verify it fails**

Run: `npm test -- src/App.test.jsx`

Expected: FAIL because the shell stage classes and refreshed shell chrome wrappers do not exist yet.

- [ ] **Step 3: Implement the shell chrome and split-layout restaging**

```tsx
/* src/App.tsx */
<div className="h-dvh overflow-hidden bg-background text-foreground">
  <div className="mx-auto flex h-full min-h-0 w-full max-w-[1760px] flex-col gap-3 px-4 py-3">
    <div className="cc-shell-chrome flex shrink-0 items-center justify-between gap-3 rounded-[28px] border border-border/70 bg-[var(--surface-elevated)] px-3 py-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="min-w-0 flex-1">
        <ChatTabsStrip ... className="min-w-0" />
      </div>
      <div className="shrink-0">{controlsOverview}</div>
    </div>

    <AppSplitLayout ... />
  </div>
</div>
```

```tsx
/* src/components/app-shell/app-split-layout.tsx */
<main ref={splitLayoutRef} className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden" style={splitLayoutStyle}>
  <div className="cc-workspace-stage min-h-0 min-w-0 rounded-[30px] border border-border/60 bg-[var(--surface-elevated)] p-2 shadow-[0_22px_48px_rgba(15,23,42,0.08)]">
    {chatPanel}
  </div>
  <div className="xl:flex xl:min-h-0 xl:items-stretch xl:justify-center">
    <button className="cc-split-resize-handle group relative h-full w-full cursor-col-resize ..." />
  </div>
  <div className="cc-inspector-stage flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-[28px] border border-border/55 bg-[var(--panel)] p-2">
    {taskRelationshipsPanel}
    <div className="min-h-0 min-w-0 flex-1">{inspectorPanel}</div>
  </div>
</main>
```

```tsx
/* src/components/app-shell/settings-trigger.tsx */
<button
  type="button"
  aria-label={label}
  className="cc-settings-trigger inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-[var(--surface)] text-muted-foreground transition hover:border-[var(--border-strong)] hover:bg-accent/28 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
  onClick={onOpen}
>
```

- [ ] **Step 4: Run the App integration test to verify it passes**

Run: `npm test -- src/App.test.jsx`

Expected: PASS with the new shell wrappers rendered and existing App behavior still green.

- [ ] **Step 5: Commit the shell restaging slice**

```bash
git add src/App.tsx src/components/app-shell/app-split-layout.tsx src/components/app-shell/settings-trigger.tsx src/components/app-shell/use-app-session-overviews.tsx src/App.test.jsx
git commit -m "feat: restage command center shell chrome"
```

## Task 3: Make The Chat Area The Clear Primary Stage

**Files:**
- Modify: `src/components/command-center/chat-panel.tsx`
- Modify: `src/components/command-center/chat-panel-surfaces.ts`
- Modify: `src/components/command-center/chat-empty-conversation.tsx`
- Test: `src/components/command-center/chat-panel.test.jsx`

- [ ] **Step 1: Add a failing chat-stage regression**

```jsx
it("renders the refreshed chat stage, empty state, and composer shell", () => {
  const { container } = render(
    <TooltipProvider>
      <ChatPanel
        busy={false}
        formatTime={() => "10:00:00"}
        messageViewportRef={null}
        messages={[]}
        onPromptChange={() => {}}
        onPromptKeyDown={() => {}}
        onReset={() => {}}
        onSend={() => {}}
        prompt=""
        promptRef={null}
        session={createSession()}
      />
    </TooltipProvider>,
  );

  expect(container.querySelector(".cc-chat-stage")).toBeInTheDocument();
  expect(container.querySelector(".cc-chat-empty-state")).toBeInTheDocument();
  expect(container.querySelector(".cc-chat-composer-shell")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the chat-panel test file to verify it fails**

Run: `npm test -- src/components/command-center/chat-panel.test.jsx`

Expected: FAIL because the chat-stage shell classes do not exist yet.

- [ ] **Step 3: Implement the chat-stage restaging**

```tsx
/* src/components/command-center/chat-panel.tsx */
return (
  <div className="cc-chat-stage flex h-full min-h-0 flex-col rounded-[24px] bg-transparent">
    <div className="cc-chat-stage-header shrink-0 px-2 pb-2">
      {sessionOverview}
    </div>

    <div className="cc-chat-stage-body min-h-0 flex-1 rounded-[24px] border border-border/55 bg-[var(--surface)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]">
      {/* transcript */}
    </div>

    <div className="cc-chat-composer-shell mt-3 shrink-0 rounded-[24px] border border-border/70 bg-[var(--surface-elevated)] p-3 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
      {/* queued messages + composer */}
    </div>
  </div>
);
```

```tsx
/* src/components/command-center/chat-empty-conversation.tsx */
return (
  <div className="cc-chat-empty-state">
    <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-border/70 bg-[var(--panel-muted)] px-6 py-12 text-center">
      <Send className="h-8 w-8 text-muted-foreground" />
      <div className="space-y-1.5">
        <div className="text-sm font-semibold">{messages.chat.waitingFirstPrompt}</div>
        <div className="text-sm text-muted-foreground">{messages.chat.conversationWillAppear}</div>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 4: Run the chat-panel tests to verify they pass**

Run: `npm test -- src/components/command-center/chat-panel.test.jsx`

Expected: PASS with the new stage classes present and existing composer/chat interactions still passing.

- [ ] **Step 5: Commit the chat-stage slice**

```bash
git add src/components/command-center/chat-panel.tsx src/components/command-center/chat-panel-surfaces.ts src/components/command-center/chat-empty-conversation.tsx src/components/command-center/chat-panel.test.jsx
git commit -m "feat: restage chat workspace surfaces"
```

## Task 4: Restage The Inspector As A Quieter Secondary Workspace

**Files:**
- Modify: `src/components/command-center/inspector-panel.tsx`
- Modify: `src/components/command-center/inspector-panel-primitives.tsx`
- Modify: `src/components/command-center/inspector-panel-surfaces.ts`
- Test: `src/components/command-center/inspector-panel.test.jsx`

- [ ] **Step 1: Add a failing inspector-stage regression**

```jsx
it("renders the refreshed inspector shell and tab rail", async () => {
  const { container } = renderWithTooltip(<TestHarness />);

  expect(container.querySelector(".cc-inspector-shell")).toBeInTheDocument();
  expect(container.querySelector(".cc-inspector-tabs")).toBeInTheDocument();
  expect(container.querySelector(".cc-inspector-section-card")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the inspector test file to verify it fails**

Run: `npm test -- src/components/command-center/inspector-panel.test.jsx`

Expected: FAIL because the refreshed inspector shell classes do not exist yet.

- [ ] **Step 3: Implement the inspector restaging**

```tsx
/* src/components/command-center/inspector-panel.tsx */
return (
  <div className="cc-inspector-shell flex h-full min-h-0 flex-col rounded-[24px] bg-transparent">
    <Tabs className="min-h-0 flex-1" ...>
      <TabsList className="cc-inspector-tabs grid w-full grid-cols-4 rounded-[18px] border border-border/70 bg-[var(--panel-muted)] p-1" />
      <TabsContent className="mt-3 min-h-0 rounded-[22px] border border-border/60 bg-[var(--surface)] px-3 py-3">
        ...
      </TabsContent>
    </Tabs>
  </div>
);
```

```tsx
/* src/components/command-center/inspector-panel-primitives.tsx */
export function EnvironmentSectionCard(props) {
  return (
    <Card className="cc-inspector-section-card rounded-[20px] border border-border/70 bg-[var(--surface-elevated)] shadow-none">
      ...
    </Card>
  );
}
```

- [ ] **Step 4: Run the inspector tests to verify they pass**

Run: `npm test -- src/components/command-center/inspector-panel.test.jsx`

Expected: PASS with the inspector shell wrappers rendered and current inspector flows still working.

- [ ] **Step 5: Commit the inspector restaging slice**

```bash
git add src/components/command-center/inspector-panel.tsx src/components/command-center/inspector-panel-primitives.tsx src/components/command-center/inspector-panel-surfaces.ts src/components/command-center/inspector-panel.test.jsx
git commit -m "feat: restage inspector visual hierarchy"
```

## Task 5: Run Cross-Shell Validation And Manual Theme Checks

**Files:**
- Modify: `plan/ai-assisted-code-quality.md`
- Verify: `dev-spec/frontend-visual-spec.md`

- [ ] **Step 1: Run the shell-wide automated validation**

```bash
npm run lint
npm test
npm run build
```

Expected:

- `npm run lint` exits `0`
- `npm test` exits `0` with no new failures
- `npm run build` exits `0` and produces a clean Vite build

- [ ] **Step 2: Start the development frontend exactly as required by the repo**

```bash
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Expected: Vite serves `http://127.0.0.1:5173` without port fallback.

- [ ] **Step 3: Start the development backend exactly as required by the repo**

```bash
PORT=3000 HOST=127.0.0.1 node server.js
```

Expected: the backend serves `http://127.0.0.1:3000` and the frontend can use the `/api/*` proxy.

- [ ] **Step 4: Perform the manual dual-theme verification**

Check all of the following at `http://127.0.0.1:5173`:

- light mode reads as warm `Signal Desk` rather than plain neutral white
- dark mode reads as cooler `Precision Ops` rather than flat charcoal
- top shell band is visually unified and stable
- chat stage feels more prominent than the inspector
- inspector remains compact and scannable
- long Chinese and English labels still wrap or truncate safely
- keyboard focus ring remains visible on primary shell controls

- [ ] **Step 5: Record the execution evidence and commit**

```markdown
### 2026-04-01 — Visual Refresh Implementation

- Prompt/workstream: implement the shell-first visual refresh plan.
- Files touched: [list exact files from Tasks 1-4]
- Quality gates rerun:
  - npm run lint
  - npm test
  - npm run build
- Manual validation:
  - verified light and dark mode at http://127.0.0.1:5173
  - checked shell chrome, chat stage, inspector stage, and focus visibility
- Reviewer/sign-off:
  - pending human review
```

```bash
git add plan/ai-assisted-code-quality.md
git commit -m "docs: log visual refresh validation evidence"
```

## Self-Review Notes

- Spec coverage: the plan covers token work, shell chrome, chat stage, inspector restaging, and both automated and manual validation.
- Placeholder scan: all tasks include concrete file paths, commands, and code snippets rather than `TODO`-style placeholders.
- Type consistency: all new shell hooks and class names use one naming family (`cc-shell-*`, `cc-chat-*`, `cc-inspector-*`) so tests and implementation stay aligned.
