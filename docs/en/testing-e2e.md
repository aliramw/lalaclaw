[English](../en/testing-e2e.md)

# Browser E2E Testing

This guide defines the browser-level end-to-end testing expectations for LalaClaw.

Use this document together with [CONTRIBUTING.md](../../CONTRIBUTING.md). `CONTRIBUTING.md` explains the overall contribution workflow; this file explains when to add Playwright coverage, how to keep it stable, and what the current repository setup expects.

## Current Stack

- Framework: Playwright
- Test directory: `tests/e2e/`
- Main config: [`playwright.config.js`](../../playwright.config.js)
- Test server bootstrap: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

The current setup starts:

- frontend dev server on `http://127.0.0.1:5173`
- backend dev server on `http://127.0.0.1:3000`

The Playwright bootstrap script runs the backend in `COMMANDCENTER_FORCE_MOCK=1` mode so browser tests do not depend on a real OpenClaw environment by default.

## When Browser E2E Is Required

Add or update browser e2e coverage when the change affects one or more of these areas:

- message send / stop / retry behavior
- queued turns and delayed conversation entry
- session bootstrap, session switching, or tab routing
- hydration and recovery behavior that only becomes visible after a real render
- browser-visible regressions that are hard to trust through hook or controller tests alone

Prefer controller-level or `App`-level Vitest tests for pure state transitions. Add browser e2e when the risk depends on real DOM timing, focus behavior, routing, request ordering, or multi-step UI flow.

## What To Cover First

The repository does not need broad browser coverage before it has stable coverage for the highest-risk user paths.

Prioritize these flows:

1. app boot and first render
2. one normal send / reply cycle
3. queued sends staying out of the conversation until their turn begins
4. stop / abort during an in-flight reply
5. session bootstrap paths such as IM tabs or agent switching

If a bug fix changes queueing, streaming, stop, hydration, or session/runtime sync, one browser regression should usually target the exact user-visible failure mode.

## Stability Rules

Browser e2e must be written for stability, not for visual trivia.

- Prefer user-visible assertions over internal implementation details
- Assert on text, roles, labels, and stable controls
- Do not make the test depend on animation timing unless the bug is about animation timing
- Avoid asserting fragile Tailwind class names unless the class itself is the behavior under test
- Keep network behavior deterministic by routing the relevant `/api/*` calls in the test
- Use real browser interaction for typing, clicking, tab focus, and request ordering

For queueing or streaming flows, prefer asserting:

- whether a message is visible in the conversation region
- whether it remains only in the queued region
- whether it appears only after the previous turn completes
- whether the visible order matches the actual turn order

## Mocking Strategy

Do not send browser e2e through a live OpenClaw deployment by default.

Use this order of preference:

1. route the relevant `/api/*` calls inside the Playwright test
2. use repository mock mode for the backend
3. only use a real external dependency when the task explicitly requires equivalent live validation

The current examples in [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) follow this pattern:

- `/api/auth/state` is stubbed
- `/api/lalaclaw/update` is stubbed
- `/api/runtime` is stubbed
- `/api/chat` is controlled per test so queue order and completion timing stay deterministic

## Authoring Guidelines

Keep each browser e2e narrowly scoped.

- One spec file should usually focus on one product area
- One test should usually verify one user flow
- Prefer a small helper fixture file over copying large JSON payloads into each test
- Reuse snapshot builders where possible so browser tests stay aligned with `App.test.jsx`

Good examples:

- "queued turns stay out of the conversation until each turn actually starts"
- "stop returns the send button after aborting a running reply"
- "bootstrap Feishu tab resolves to the native session user before first send"

Less useful examples:

- "button has exactly this set of utility classes"
- "three unrelated flows in one test"
- "uses a real remote service even though route mocking would cover the behavior"

## Running Locally

Install the Playwright browser once:

```bash
npm run test:e2e:install
```

Run browser e2e:

```bash
npm run test:e2e
```

Run with a visible browser:

```bash
npm run test:e2e:headed
```

Run with the Playwright UI:

```bash
npm run test:e2e:ui
```

## CI Expectations

CI now has a dedicated browser e2e job in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

That job should remain focused and stable:

- keep the browser suite small enough to run reliably on every PR
- add high-value regressions before broad exploratory scenarios
- avoid introducing flaky waits or long sleeps

If a new browser test is too slow or too environment-sensitive for default CI, it should not go into the default `test:e2e` path without first being simplified or stabilized.

## Recommended Review Checklist

Before merging a browser e2e change, check:

- does this need browser e2e, or would `App` / controller coverage be enough?
- does the test assert user-visible behavior rather than implementation trivia?
- does the test control the required network state deterministically?
- would this test still make sense six months from now if the UI styling changes?
- does the test fail for the user regression we actually care about?

## Related Files

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
