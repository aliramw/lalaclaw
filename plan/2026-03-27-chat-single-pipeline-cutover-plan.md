# Chat Single Pipeline Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard-style chat session state the only authoritative pipeline for active chat rendering, hydration, runtime reconciliation, and persistence so the recurring flicker/duplicate/reorder bugs stop recurring through side-channel builders.

**Architecture:** Replace the current hybrid model with a single `chat-dashboard-session` pipeline that owns visible messages, settled messages, pending overlays, and run state derivation. Remove downstream patch-up stabilizers and old settled/hydrated builders from hot paths, then delete the dead compatibility code once the new pipeline is green.

**Tech Stack:** React, Vitest, Playwright, TypeScript, existing command-center controllers, runtime snapshot hook, app storage persistence.

---

## File Map

**Primary implementation files**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-dashboard-session.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center-hydration.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/session/runtime/use-runtime-snapshot.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/storage/use-app-persistence.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/storage/app-ui-state-storage.ts`

**Secondary cleanup files**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-session-view.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-pending-conversation.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-settled-conversation.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-runtime-pending.ts`

**Tests**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-dashboard-session.test.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center.test.js`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center-hydration.test.js`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/session/runtime/use-runtime-snapshot.test.jsx`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/App.test.jsx`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/tests/e2e/chat-session-stability.spec.js`

**Docs**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/plan/chat-state-refactor-against-openclaw-dashboard.md`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/dev-spec/frontend-visual-spec.md`

---

### Task 1: Lock failing hot-path regressions before refactor

**Files:**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center.test.js`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/session/runtime/use-runtime-snapshot.test.jsx`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/App.test.jsx`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/tests/e2e/chat-session-stability.spec.js`

- [ ] **Step 1: Add failing controller regression for double-authority rendering**

```js
it("does not need a previous-frame user reinsertion when dashboard state already contains the active user turn", () => {
  const previousMessages = [{ role: "user", content: "2", timestamp: 2 }];
  const dashboardMessages = [
    { role: "user", content: "2", timestamp: 2 },
    { role: "assistant", content: "正在思考...", timestamp: 3, pending: true },
  ];

  const stabilized = stabilizeDashboardVisibleMessages({
    messages: dashboardMessages,
    previousMessages,
    run: { status: "starting" },
  });

  expect(stabilized).toBe(dashboardMessages);
});
```

- [ ] **Step 2: Add failing runtime regression for settled/hydrated split**

```jsx
it("produces one dashboard conversation output for the same pending turn across snapshot and local state", () => {
  const pendingEntry = createPendingEntry({
    userMessage: { role: "user", content: "hello", timestamp: 10 },
    assistantMessageId: "assistant-1",
  });
  const localMessages = [{ role: "user", content: "hello", timestamp: 10 }];
  const snapshotConversation = [{ role: "assistant", content: "done", timestamp: 11, id: "assistant-1" }];

  const result = buildRuntimeConversationOutputsFromDashboard({
    snapshotConversation,
    localMessages,
    pendingEntry,
    busy: true,
  });

  expect(result.visibleConversation).toEqual([
    { role: "user", content: "hello", timestamp: 10 },
    { role: "assistant", content: "done", timestamp: 11, id: "assistant-1" },
  ]);
});
```

- [ ] **Step 3: Add failing App-level regression for text-turn stability**

```jsx
it("keeps the active plain-text user turn visible without previous-frame reinsertion during assistant handoff", async () => {
  renderApp();

  await sendPrompt("2");
  await expectLatestUserBubble("2");
  await expectAssistantPlaceholder();
  await expectLatestUserBubble("2");
});
```

- [ ] **Step 4: Add failing browser regression for outline-heavy replies**

```js
test("keeps the active outline-generating assistant turn stable while the outline appears only after settle", async ({ page }) => {
  await openCommandCenter(page);
  await sendPrompt(page, "请用大纲回复我");
  await expectActiveAssistantBubbleVisible(page);
  await expectActiveAssistantBubbleStable(page);
});
```

- [ ] **Step 5: Run targeted tests and confirm failures**

Run:
```bash
npm test -- src/features/app/controllers/use-command-center.test.js src/features/session/runtime/use-runtime-snapshot.test.jsx src/App.test.jsx -t "does not need a previous-frame user reinsertion|produces one dashboard conversation output|keeps the active plain-text user turn visible"
npm run test:e2e -- tests/e2e/chat-session-stability.spec.js
```

Expected:
- Vitest fails on the new assertions
- Playwright reproduces the currently unstable path or fails on the new guard

- [ ] **Step 6: Commit the failing-test baseline**

```bash
git add src/features/app/controllers/use-command-center.test.js \
  src/features/session/runtime/use-runtime-snapshot.test.jsx \
  src/App.test.jsx \
  tests/e2e/chat-session-stability.spec.js
git commit -m "test: lock chat single-pipeline regressions"
```

---

### Task 2: Make chat-dashboard-session the only visible/render authority

**Files:**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-dashboard-session.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-session-state.ts`

- [ ] **Step 1: Extend dashboard session output to include both settled and visible tracks**

```ts
export type DashboardChatSessionState = ChatSessionState & {
  settledMessages: ChatMessage[];
  visibleMessages: ChatMessage[];
};
```

- [ ] **Step 2: Move active-user retention into dashboard-state derivation**

```ts
function buildVisibleConversation({
  settledMessages,
  pendingEntry,
  run,
  thinkingPlaceholder,
}: BuildVisibleConversationInput): ChatMessage[] {
  const visibleMessages = [...settledMessages];

  if (pendingEntry?.userMessage && !visibleMessages.some((message) => matchesPendingUserMessage(message, pendingEntry))) {
    visibleMessages.push(cloneMessage({ ...pendingEntry.userMessage, role: "user" }));
  }

  const assistantOverlay = buildAssistantOverlayMessage({ pendingEntry, run, thinkingPlaceholder });
  if (assistantOverlay && !hasPendingAssistantProjection(visibleMessages, pendingEntry)) {
    visibleMessages.push(assistantOverlay);
  }

  return visibleMessages;
}
```

- [ ] **Step 3: Delete previous-frame reinsertion from use-command-center**

```ts
// Remove stabilizeDashboardVisibleMessages(...) usage entirely.
const nextState = buildDashboardChatSessionState({ ... });
return [tab.id, nextState];
```

- [ ] **Step 4: Recompute run state only from dashboard session derivation**

```ts
const nextState = buildDashboardChatSessionState({
  agentId,
  conversationKey,
  messages,
  pendingEntry,
  rawBusy,
  sessionStatus,
  thinkingPlaceholder,
});

const activeVisibleMessages = nextState.visibleMessages;
const activeRenderMessages = nextState.visibleMessages;
const activeRun = nextState.run;
```

- [ ] **Step 5: Run focused tests and confirm pass**

Run:
```bash
npm test -- src/features/chat/state/chat-dashboard-session.test.ts src/features/app/controllers/use-command-center.test.js src/App.test.jsx -t "dashboard|plain-text user turn visible|previous-frame user reinsertion"
```

Expected:
- PASS

- [ ] **Step 6: Commit the render-authority cutover**

```bash
git add src/features/chat/state/chat-dashboard-session.ts \
  src/features/chat/state/chat-session-state.ts \
  src/features/app/controllers/use-command-center.ts \
  src/features/chat/state/chat-dashboard-session.test.ts \
  src/features/app/controllers/use-command-center.test.js \
  src/App.test.jsx
git commit -m "refactor: move active chat rendering to dashboard session state"
```

---

### Task 3: Move hydration and persistence onto the dashboard pipeline

**Files:**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center-hydration.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/controllers/use-command-center.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/storage/use-app-persistence.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/app/storage/app-ui-state-storage.ts`

- [ ] **Step 1: Replace hydration’s settled builder with dashboard settled output**

```ts
const dashboardState = buildDashboardChatSessionState({
  agentId: meta.agentId,
  conversationKey,
  messages: baseMessages,
  pendingEntry,
  rawBusy: Boolean(pendingEntry),
  sessionStatus: "",
  thinkingPlaceholder,
});

return [tab.id, dashboardState.settledMessages];
```

- [ ] **Step 2: Replace persistence’s settled snapshot builder the same way**

```ts
const dashboardState = buildDashboardChatSessionState({
  agentId: nextMeta.agentId,
  conversationKey,
  messages: items || [],
  pendingEntry,
  rawBusy: Boolean(pendingEntry),
  sessionStatus: sessionByTabIdRef.current[nextTabId]?.status || "",
  thinkingPlaceholder: i18n.chat.thinkingPlaceholder,
});

return [nextTabId, dashboardState.settledMessages];
```

- [ ] **Step 3: Ensure storage writes strip transient flags from settled output only**

```ts
expect(persistedMessagesByTabId[tabId]).toEqual(
  dashboardState.settledMessages.map((message) => ({
    ...message,
    pending: undefined,
    streaming: undefined,
  })),
);
```

- [ ] **Step 4: Run hydration/persistence regression suite**

Run:
```bash
npm test -- src/features/app/controllers/use-command-center-hydration.test.js src/features/app/storage/use-app-persistence.test.jsx src/App.test.jsx -t "refresh|pending turn|restores"
```

Expected:
- PASS

- [ ] **Step 5: Commit the hydration/persistence cutover**

```bash
git add src/features/app/controllers/use-command-center-hydration.ts \
  src/features/app/controllers/use-command-center.ts \
  src/features/app/storage/use-app-persistence.ts \
  src/features/app/storage/app-ui-state-storage.ts \
  src/features/app/controllers/use-command-center-hydration.test.js \
  src/features/app/storage/use-app-persistence.test.jsx \
  src/App.test.jsx
git commit -m "refactor: align chat hydration and persistence with dashboard pipeline"
```

---

### Task 4: Move runtime snapshot reconciliation onto the same dashboard pipeline

**Files:**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/session/runtime/use-runtime-snapshot.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-dashboard-session.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/session/runtime/use-runtime-snapshot.test.jsx`

- [ ] **Step 1: Introduce a dashboard-based runtime conversation output helper**

```ts
function buildRuntimeDashboardConversation({
  agentId,
  conversationKey,
  mergedConversation,
  pendingEntry,
  busy,
  sessionStatus,
  thinkingPlaceholder,
}: BuildRuntimeDashboardConversationInput) {
  const dashboardState = buildDashboardChatSessionState({
    agentId,
    conversationKey,
    messages: mergedConversation,
    pendingEntry,
    rawBusy: busy,
    sessionStatus,
    thinkingPlaceholder,
    source: "runtime",
  });

  return {
    durableConversation: dashboardState.settledMessages,
    stabilizedConversation: dashboardState.visibleMessages,
    hasActivePendingTurn: selectChatRunBusy(dashboardState.run),
  };
}
```

- [ ] **Step 2: Remove hot-path use of buildStabilizedHydratedConversationMessages/buildDurableConversationMessages**

```ts
const {
  durableConversation,
  stabilizedConversation,
  hasActivePendingTurn,
} = buildRuntimeDashboardConversation({
  agentId: currentSession.agentId,
  conversationKey,
  mergedConversation,
  pendingEntry,
  busy,
  sessionStatus: currentSession.status,
  thinkingPlaceholder: i18n.chat.thinkingPlaceholder,
});
```

- [ ] **Step 3: Keep old helpers only if still needed by non-hot-path tests**

```ts
// If a helper becomes unused after runtime cutover, delete the export and update its core-api contract test.
```

- [ ] **Step 4: Run runtime and App-level regressions**

Run:
```bash
npm test -- src/features/session/runtime/use-runtime-snapshot.test.jsx src/App.test.jsx -t "pending turn|authoritative assistant reply|lagging runtime|busy"
```

Expected:
- PASS

- [ ] **Step 5: Commit the runtime cutover**

```bash
git add src/features/session/runtime/use-runtime-snapshot.ts \
  src/features/chat/state/chat-dashboard-session.ts \
  src/features/session/runtime/use-runtime-snapshot.test.jsx \
  src/App.test.jsx
git commit -m "refactor: route runtime reconciliation through dashboard chat pipeline"
```

---

### Task 5: Delete dead hot-path compatibility helpers and contracts

**Files:**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-session-view.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-pending-conversation.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-settled-conversation.ts`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-session-view-core-api.test.js`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-pending-conversation-core-api.test.js`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/src/features/chat/state/chat-settled-conversation-core-api.test.js`

- [ ] **Step 1: Remove no-longer-used exports from hot-path builder modules**

```ts
// Delete exports that are no longer imported anywhere:
// buildSettledConversationMessages
// buildSettledPendingConversationMessages
// buildStabilizedHydratedConversationMessages
// buildDurableConversationMessages
```

- [ ] **Step 2: Update contract tests to the smaller public surface**

```js
expect(Object.keys(module).sort()).toEqual([
  "only",
  "the",
  "remaining",
  "non-hot-path",
  "exports",
]);
```

- [ ] **Step 3: Confirm dead-code scan is empty**

Run:
```bash
rg -n "buildSettledConversationMessages|buildStabilizedHydratedConversationMessages|buildDurableConversationMessages" src test tests
```

Expected:
- No production-path references remain

- [ ] **Step 4: Run architecture contracts and focused chat-state suite**

Run:
```bash
npm run check:architecture:contracts
npm test -- src/features/chat/state/chat-dashboard-session.test.ts src/features/chat/state/chat-session-view-core-api.test.js src/features/chat/state/chat-pending-conversation-core-api.test.js src/features/chat/state/chat-settled-conversation-core-api.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit dead-code cleanup**

```bash
git add src/features/chat/state/chat-session-view.ts \
  src/features/chat/state/chat-pending-conversation.ts \
  src/features/chat/state/chat-settled-conversation.ts \
  src/features/chat/state/chat-session-view-core-api.test.js \
  src/features/chat/state/chat-pending-conversation-core-api.test.js \
  src/features/chat/state/chat-settled-conversation-core-api.test.js
git commit -m "refactor: remove chat compatibility builders from hot paths"
```

---

### Task 6: Final verification and documentation close-out

**Files:**
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/plan/chat-state-refactor-against-openclaw-dashboard.md`
- Modify: `/Users/marila/.codex/worktrees/b414/lalaclaw/dev-spec/frontend-visual-spec.md`

- [ ] **Step 1: Update the refactor plan with the final single-pipeline state**

```md
- active rendering now derives only from chat-dashboard-session
- hydration/persistence/runtime now consume the same settled/visible outputs
- old chat-session-view hot-path builders removed
```

- [ ] **Step 2: Update visual spec if any card stability rule changed during cutover**

```md
- active latest assistant bubble, pending user bubble, and settled assistant replacement must all stay on a stable card branch through busy-state reconciliation
```

- [ ] **Step 3: Run the full validation matrix**

Run:
```bash
npm run typecheck
npx eslint src/features/chat/state/chat-dashboard-session.ts src/features/app/controllers/use-command-center.ts src/features/app/controllers/use-command-center-hydration.ts src/features/session/runtime/use-runtime-snapshot.ts
npm test
npm run test:e2e -- tests/e2e/chat-session-stability.spec.js
npm run check:architecture:contracts
```

Expected:
- All commands exit successfully

- [ ] **Step 4: Commit the close-out**

```bash
git add plan/chat-state-refactor-against-openclaw-dashboard.md \
  dev-spec/frontend-visual-spec.md
git commit -m "docs: close out chat single-pipeline cutover"
```

