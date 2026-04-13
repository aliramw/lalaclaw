# Hermes Agent Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the command-center add-tab menu offer a `hermes` conversation tab only when runtime explicitly reports `hermes` as installed, while reusing the existing agent-tab flow.

**Architecture:** Keep `SessionOverview` and the existing `openOrActivateAgentTab` path unchanged. Normalize the effective visible agent list once near runtime snapshot state by combining `availableAgents` with explicitly installed runtime `agents` entries, then pass the normalized `string[]` through the existing `availableAgents` prop chain.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing command-center runtime/session controllers.

---

## File Structure

### Files to create

- `src/features/session/runtime/runtime-agent-availability.ts`
  - owns the conservative normalization of visible agent ids from runtime `availableAgents` plus installed runtime `agents` records
- `src/features/session/runtime/runtime-agent-availability.test.ts`
  - covers the helper’s positive, negative, dedupe, and malformed-entry behavior

### Files to modify

- `src/features/session/runtime/use-runtime-snapshot.ts`
  - routes both snapshot and websocket agent data through the normalization helper and exposes the normalized `availableAgents`
- `src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - adds hook-level regression coverage proving `hermes` becomes visible only when runtime explicitly marks it installed
- `src/components/command-center/session-overview.test.jsx`
  - verifies the add-tab menu renders `hermes` once it appears in `availableAgents` and still hides already-open agent tabs
- `src/App.test.jsx`
  - optional light integration regression if the hook test plus menu test do not fully cover the end-to-end add-tab path
- `plan/ai-assisted-code-quality.md`
  - records the implementation workstream once code changes begin

### Files intentionally not changed

- `src/components/command-center/session-overview.tsx`
  - should remain a simple consumer of `availableAgents`
- `src/features/app/controllers/use-command-center-session-selection.ts`
  - should keep the current generic `openOrActivateAgentTab(nextAgent)` path without `hermes` special-casing
- locale files
  - no new user-facing copy is expected in this workstream

## Task 1: Add a Runtime Agent Availability Helper

**Files:**
- Create: `src/features/session/runtime/runtime-agent-availability.ts`
- Test: `src/features/session/runtime/runtime-agent-availability.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/features/session/runtime/runtime-agent-availability.test.ts` with these cases:

```ts
import { describe, expect, it } from "vitest";
import { collectAvailableRuntimeAgentIds } from "@/features/session/runtime/runtime-agent-availability";

describe("collectAvailableRuntimeAgentIds", () => {
  it("keeps availableAgents first and supplements explicitly installed agents", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main"],
        agents: [
          { agentId: "hermes", installed: true },
        ],
      }),
    ).toEqual(["main", "hermes"]);
  });

  it("does not surface agents without explicit installed state", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main"],
        agents: [
          { agentId: "hermes" },
          { agentId: "writer", installed: false },
        ],
      }),
    ).toEqual(["main"]);
  });

  it("drops malformed and duplicate ids while preserving order", () => {
    expect(
      collectAvailableRuntimeAgentIds({
        availableAgents: ["main", "hermes", "main", ""],
        agents: [
          null,
          { id: "hermes", installed: true },
          { agentId: "worker", installed: true },
          { agentId: "worker", installed: true },
        ],
      }),
    ).toEqual(["main", "hermes", "worker"]);
  });
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
npm test -- src/features/session/runtime/runtime-agent-availability.test.ts
```

Expected: FAIL because `collectAvailableRuntimeAgentIds` does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

Create `src/features/session/runtime/runtime-agent-availability.ts` with this initial implementation:

```ts
type RuntimeAgentRecord = Record<string, unknown> | null | undefined;

function normalizeAgentId(value: unknown) {
  return String(value || "").trim();
}

function isExplicitlyInstalledAgent(agent: RuntimeAgentRecord) {
  if (!agent || typeof agent !== "object") {
    return false;
  }

  return agent.installed === true
    || agent.available === true
    || agent.enabled === true;
}

function readAgentId(agent: RuntimeAgentRecord) {
  if (!agent || typeof agent !== "object") {
    return "";
  }

  return normalizeAgentId(agent.agentId || agent.id || agent.name);
}

export function collectAvailableRuntimeAgentIds({
  availableAgents = [],
  agents = [],
}: {
  availableAgents?: unknown[];
  agents?: RuntimeAgentRecord[];
}) {
  const ordered = new Set<string>();

  for (const value of availableAgents) {
    const agentId = normalizeAgentId(value);
    if (agentId) {
      ordered.add(agentId);
    }
  }

  for (const agent of agents) {
    if (!isExplicitlyInstalledAgent(agent)) {
      continue;
    }

    const agentId = readAgentId(agent);
    if (agentId) {
      ordered.add(agentId);
    }
  }

  return [...ordered];
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run:

```bash
npm test -- src/features/session/runtime/runtime-agent-availability.test.ts
```

Expected: PASS for all new helper cases.

- [ ] **Step 5: Commit the helper slice**

```bash
git add src/features/session/runtime/runtime-agent-availability.ts src/features/session/runtime/runtime-agent-availability.test.ts
git commit -m "feat: normalize runtime agent availability"
```

## Task 2: Wire the Helper into Runtime Snapshot State

**Files:**
- Modify: `src/features/session/runtime/use-runtime-snapshot.ts`
- Test: `src/features/session/runtime/use-runtime-snapshot.test.jsx`

- [ ] **Step 1: Write the failing hook regression for installed `hermes`**

Add this test near the existing runtime snapshot regressions in `src/features/session/runtime/use-runtime-snapshot.test.jsx`:

```jsx
it("supplements availableAgents from explicitly installed runtime agents", async () => {
  const setBusy = vi.fn();
  const setFastMode = vi.fn();
  const setMessagesSynced = vi.fn();
  const setModel = vi.fn();
  const setPendingChatTurns = vi.fn();
  const setPromptHistoryByConversation = vi.fn();
  const setSession = vi.fn();
  const fetchMock = vi.fn(() =>
    mockJsonResponse({
      ok: true,
      session: {
        sessionUser: "command-center",
        agentId: "main",
        selectedModel: "gpt-5",
        availableModels: ["gpt-5"],
        availableAgents: ["main"],
        status: "就绪",
      },
      agents: [
        { agentId: "hermes", installed: true },
      ],
      conversation: [],
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useRuntimeSnapshot({
      activePendingChat: null,
      busy: false,
      i18n: createI18n(),
      messagesRef: { current: [] },
      pendingChatTurns: {},
      session: createSession(),
      setBusy,
      setFastMode,
      setMessagesSynced,
      setModel,
      setPendingChatTurns,
      setPromptHistoryByConversation,
      setSession,
    }),
  );

  await waitFor(() => {
    expect(result.current.availableAgents).toEqual(["main", "hermes"]);
  });
});
```

- [ ] **Step 2: Run the hook regression to verify it fails**

Run:

```bash
npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx --runInBand
```

Expected: FAIL because `availableAgents` still equals `["main"]`.

- [ ] **Step 3: Update snapshot and websocket agent handling to use the helper**

Modify `src/features/session/runtime/use-runtime-snapshot.ts` so every place that currently sets `availableAgents` goes through the helper. Use this shape:

```ts
import { collectAvailableRuntimeAgentIds } from "@/features/session/runtime/runtime-agent-availability";

const nextAvailableAgents = collectAvailableRuntimeAgentIds({
  availableAgents: snapshot.session?.availableAgents || snapshot.availableAgents || [],
  agents: snapshot.agents || [],
});
setIfChanged(setAvailableAgents, nextAvailableAgents);
setIfChanged(setAgents, snapshot.agents || []);
```

For websocket updates, keep the same rule:

```ts
if (payload.type === "agents.sync") {
  const nextAgents = payload.agents || [];
  setIfChanged(setAgents, nextAgents);
  setIfChanged(setAvailableAgents, collectAvailableRuntimeAgentIds({
    availableAgents: sessionRef.current.availableAgents || [],
    agents: nextAgents,
  }));
  return;
}
```

For `session.sync`, preserve the current session-driven list but supplement it with the latest known `agents` state instead of replacing it blindly:

```ts
if (payload.session.availableAgents) {
  setIfChanged(setAvailableAgents, collectAvailableRuntimeAgentIds({
    availableAgents: payload.session.availableAgents,
    agents,
  }));
}
```

If a closure-safe reference is needed for `agents`, add an `agentsRef` that mirrors the current `agents` state in the same pattern already used for `sessionRef`.

- [ ] **Step 4: Add the negative hook regression if the helper needs integration proof**

If the helper is conservative enough that a hook-level negative case adds signal, add:

```jsx
it("does not supplement availableAgents from agents without explicit installed state", async () => {
  const fetchMock = vi.fn(() =>
    mockJsonResponse({
      ok: true,
      session: {
        sessionUser: "command-center",
        agentId: "main",
        selectedModel: "gpt-5",
        availableModels: ["gpt-5"],
        availableAgents: ["main"],
        status: "就绪",
      },
      agents: [
        { agentId: "hermes" },
      ],
      conversation: [],
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() =>
    useRuntimeSnapshot({
      activePendingChat: null,
      busy: false,
      i18n: createI18n(),
      messagesRef: { current: [] },
      pendingChatTurns: {},
      session: createSession(),
      setBusy: vi.fn(),
      setFastMode: vi.fn(),
      setMessagesSynced: vi.fn(),
      setModel: vi.fn(),
      setPendingChatTurns: vi.fn(),
      setPromptHistoryByConversation: vi.fn(),
      setSession: vi.fn(),
    }),
  );

  await waitFor(() => {
    expect(result.current.availableAgents).toEqual(["main"]);
  });
});
```

- [ ] **Step 5: Run the targeted runtime tests and verify they pass**

Run:

```bash
npm test -- src/features/session/runtime/runtime-agent-availability.test.ts src/features/session/runtime/use-runtime-snapshot.test.jsx --runInBand
```

Expected: PASS with the new helper and hook regressions green.

- [ ] **Step 6: Commit the runtime wiring**

```bash
git add src/features/session/runtime/runtime-agent-availability.ts src/features/session/runtime/runtime-agent-availability.test.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx
git commit -m "feat: surface installed runtime agents in session list"
```

## Task 3: Prove the Add-Tab Menu Surfaces `hermes`

**Files:**
- Modify: `src/components/command-center/session-overview.test.jsx`

- [ ] **Step 1: Write the failing session menu regression**

Add this test near the existing “hides agents that already have an open session” case:

```jsx
it("shows hermes in the add-tab menu when it is available and not already open", async () => {
  window.localStorage.setItem(localeStorageKey, "zh");

  render(
    <I18nProvider>
      <TooltipProvider>
        <SessionOverview
          availableAgents={["main", "hermes"]}
          availableModels={["openclaw"]}
          fastMode={false}
          formatCompactK={(value) => `${value}`}
          layout="agent-tab"
          model="openclaw"
          onAgentChange={() => {}}
          onFastModeChange={() => {}}
          onModelChange={() => {}}
          onThinkModeChange={() => {}}
          openAgentIds={["main"]}
          session={createSession()}
        />
      </TooltipProvider>
    </I18nProvider>,
  );

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "切换 Agent" }));

  expect(screen.queryByRole("menuitem", { name: "main" })).not.toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "hermes" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the menu regression**

Run:

```bash
npm test -- src/components/command-center/session-overview.test.jsx --runInBand
```

Expected: PASS immediately if the menu already behaves correctly once `availableAgents` is normalized. If it fails, fix only the minimal menu assumption that blocks the case.

- [ ] **Step 3: Keep UI code unchanged unless the regression reveals a real bug**

If the test passes, do not modify `src/components/command-center/session-overview.tsx`.

If it fails because of an actual filtering bug, make only the smallest fix required, for example preserving:

```ts
const selectableAgents = (availableAgents || []).filter(
  (agentId) => !normalizedOpenAgentIds.has(String(agentId || "").trim()),
);
```

and avoiding any new `hermes` branching.

- [ ] **Step 4: Re-run the menu test and confirm it passes**

Run:

```bash
npm test -- src/components/command-center/session-overview.test.jsx --runInBand
```

Expected: PASS with `hermes` visible and `main` hidden.

- [ ] **Step 5: Commit the menu regression**

```bash
git add src/components/command-center/session-overview.test.jsx src/components/command-center/session-overview.tsx
git commit -m "test: cover hermes add-tab visibility"
```

## Task 4: Add a Light App Integration Regression If Needed

**Files:**
- Modify: `src/App.test.jsx`

- [ ] **Step 1: Decide whether the existing coverage is sufficient**

Use this rule:

- if Task 2 proves runtime normalization and Task 3 proves menu visibility, skip this task
- if the worker wants one app-level proof that selecting the surfaced agent opens a tab, continue with the next steps

- [ ] **Step 2: Write the failing app regression**

Add a narrow test in `src/App.test.jsx` following the existing agent switcher patterns:

```jsx
it("opens a hermes tab when runtime exposes hermes as an installed agent", async () => {
  const harness = createInteractiveFetchMock({
    availableAgents: ["main"],
    availableModels: ["openai-codex/gpt-5.4"],
    model: "openai-codex/gpt-5.4",
  });

  harness.fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/runtime")) {
      return mockJsonResponse(
        createSnapshot({
          session: {
            ...createSnapshot().session,
            availableAgents: ["main"],
          },
          agents: [
            { agentId: "hermes", installed: true },
          ],
        }),
      );
    }

    return createInteractiveFetchMock({
      availableAgents: ["main"],
      availableModels: ["openai-codex/gpt-5.4"],
      model: "openai-codex/gpt-5.4",
    }).fetchMock(input, init);
  });

  stubFetchWithAccessState(harness.fetchMock);

  render(<App />);

  const user = userEvent.setup();
  await waitForAgentSwitcherReady();

  await user.click(screen.getByLabelText("切换 Agent"));
  await user.click(screen.getByRole("menuitem", { name: "hermes" }));

  await screen.findByText("hermes - 当前会话");
});
```

- [ ] **Step 3: Run the app regression to verify it fails or reproduces the missing behavior**

Run:

```bash
npm test -- src/App.test.jsx --runInBand
```

Expected: either FAIL before the runtime normalization is in place or PASS afterward, proving the full path.

- [ ] **Step 4: Keep only the minimal integration assertion**

If this task is used, keep the test narrowly focused on:

- runtime exposes installed `hermes`
- the menu shows `hermes`
- selecting it opens the `hermes` tab

Avoid asserting unrelated transport, model, or IM behavior.

- [ ] **Step 5: Commit the optional app regression**

```bash
git add src/App.test.jsx
git commit -m "test: cover hermes runtime tab integration"
```

## Task 5: Final Validation and Documentation

**Files:**
- Modify: `plan/ai-assisted-code-quality.md`

- [ ] **Step 1: Record the implementation workstream in the AI governance log**

Append a new entry to `plan/ai-assisted-code-quality.md` with:

```md
### 2026-04-13 — Hermes Agent Tab Implementation

- Prompt/workstream: implement runtime-driven `hermes` tab availability so the add-tab menu only shows `hermes` when runtime explicitly reports it as installed.
- AI model/version: GPT-5 Codex (Codex desktop agent).
- Generation time: 2026-04-13 Asia/Shanghai.
- Files touched:
  - `src/features/session/runtime/runtime-agent-availability.ts`
  - `src/features/session/runtime/runtime-agent-availability.test.ts`
  - `src/features/session/runtime/use-runtime-snapshot.ts`
  - `src/features/session/runtime/use-runtime-snapshot.test.jsx`
  - `src/components/command-center/session-overview.test.jsx`
  - `src/App.test.jsx` (only if Task 4 is used)
  - `plan/ai-assisted-code-quality.md`
```

- [ ] **Step 2: Run the final required validation**

Run:

```bash
npm test -- src/features/session/runtime/runtime-agent-availability.test.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/components/command-center/session-overview.test.jsx --runInBand
```

If Task 4 was used, run:

```bash
npm test -- src/App.test.jsx --runInBand
```

Then run:

```bash
npm test
```

Expected: PASS with no new failures. If `npm test` reveals an unrelated pre-existing failure, document the exact failing test and why it is unrelated before stopping.

- [ ] **Step 3: Review the diff for scope control**

Run:

```bash
git diff --stat HEAD~1..HEAD
git diff -- src/features/session/runtime/runtime-agent-availability.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/components/command-center/session-overview.test.jsx src/App.test.jsx plan/ai-assisted-code-quality.md
```

Expected: the diff is limited to runtime agent-list normalization, targeted regressions, and the AI governance log.

- [ ] **Step 4: Create the final implementation commit**

```bash
git add src/features/session/runtime/runtime-agent-availability.ts src/features/session/runtime/runtime-agent-availability.test.ts src/features/session/runtime/use-runtime-snapshot.ts src/features/session/runtime/use-runtime-snapshot.test.jsx src/components/command-center/session-overview.test.jsx src/App.test.jsx plan/ai-assisted-code-quality.md
git commit -m "feat: expose installed hermes agent tab"
```

- [ ] **Step 5: Prepare the final handoff summary**

The final summary must include:

- the new normalization rule for `availableAgents`
- whether Task 4 was needed
- every test command actually run
- pass/fail status for each command
- any remaining payload-shape assumptions for runtime `agents`

## Self-Review

### Spec coverage

- runtime-only visibility rule is implemented in Task 1 and Task 2
- reuse of the existing add-tab flow is preserved in Task 3 and optional Task 4
- no `hermes` hard-coding beyond test fixtures is enforced throughout the plan
- regression coverage is present at helper, hook, and menu layers, with optional app coverage if needed

### Placeholder scan

- no `TODO`, `TBD`, or “implement later” placeholders remain
- each test step includes an actual test body or exact commands
- each implementation step includes exact file paths and starter code

### Type consistency

- the shared helper name is `collectAvailableRuntimeAgentIds`
- the helper returns `string[]`
- runtime wiring continues to expose `availableAgents`
- `SessionOverview` continues to consume `availableAgents` without a new prop shape
