# Hermes Agent Tab Design

## Summary

This design adds a runtime-driven fallback so the command-center can offer a `hermes` conversation tab when, and only when, the runtime explicitly reports that `hermes` is installed.

The existing UI pattern already supports opening new agent tabs from the `+` menu in the session chrome. The gap is that the menu currently depends on `availableAgents` alone. If runtime payloads already describe installed agents in `agents` but omit `hermes` from `availableAgents`, the UI has no way to surface it.

The change keeps the current interaction model intact and adds one normalization step near runtime snapshot handling:

- prefer `availableAgents` as the primary source
- supplement missing entries from runtime `agents` records that clearly indicate an installed agent
- continue hiding agents that already have an open tab

## Goals

- Allow the `+` session menu to show `hermes` when runtime explicitly reports that `hermes` is installed.
- Keep the current `agent:<id>` tab creation flow unchanged.
- Avoid hard-coding `hermes` or any other agent id in the UI.
- Keep the visible agent list deterministic, deduplicated, and stable across polling and WebSocket updates.
- Preserve the current behavior where already-open agent tabs are not shown again in the add-tab menu.

## Non-goals

- Do not add a permanent built-in `hermes` tab.
- Do not show `hermes` based on package presence, frontend heuristics, or string matching outside runtime payloads.
- Do not redesign the session switcher UI or the tab model.
- Do not change IM session creation behavior.
- Do not introduce new user-facing copy unless an uncovered empty/error state requires it.

## Current Code Context

The relevant flow is already split cleanly:

- [src/features/session/runtime/use-runtime-snapshot.ts](/Users/marila/projects/lalaclaw/src/features/session/runtime/use-runtime-snapshot.ts) stores runtime snapshot state such as `availableAgents` and `agents`.
- [src/features/app/controllers/use-command-center.ts](/Users/marila/projects/lalaclaw/src/features/app/controllers/use-command-center.ts) passes `availableAgents` into the app shell and session overview.
- [src/components/command-center/session-overview.tsx](/Users/marila/projects/lalaclaw/src/components/command-center/session-overview.tsx) renders the `+` add-tab menu and filters out agents that already have an open tab.
- [src/features/app/controllers/use-command-center-session-selection.ts](/Users/marila/projects/lalaclaw/src/features/app/controllers/use-command-center-session-selection.ts) already knows how to open or activate an `agent:<id>` tab once an agent id is selected.

This means the least risky implementation is to normalize the runtime agent candidate list before it reaches the UI, rather than teaching UI components how to interpret runtime `agents` objects directly.

## User-approved Product Decisions

The user confirmed the core requirement:

- `hermes` must appear only when runtime or backend data explicitly reports it as installed.

That implies the UI must not:

- hard-code `hermes`
- infer installation from unrelated local packages or tool availability
- expose `hermes` as a speculative menu option

## Proposed Approach

### 1. Normalize agent candidates near runtime snapshot state

Add a small helper close to runtime snapshot handling that derives the effective visible agent id list from:

- `availableAgents`
- runtime `agents` records

The helper should:

- keep the existing `availableAgents` order first
- extract additional agent ids from `agents` records only when those records explicitly represent an installed/available agent
- drop empty, malformed, or duplicate ids
- return a plain `string[]`

The rest of the app should continue consuming `availableAgents` as a flat list, without understanding runtime `agents` object shapes.

### 2. Treat runtime `agents` as a fallback supplement, not a replacement

`availableAgents` remains the primary source because existing logic already relies on it, and it is the narrowest stable contract for the session menu.

Runtime `agents` should only fill gaps when:

- `availableAgents` is empty
- or `availableAgents` is present but missing an installed agent that is clearly reported in `agents`

This keeps backward compatibility with current payloads while improving resilience against partial runtime responses.

### 3. Keep the current add-tab flow intact

Once `hermes` is present in the effective agent id list, the app should reuse the existing behavior:

- the `+` menu shows `hermes` if it does not already have an open tab
- selecting it calls the existing agent-tab creation path
- the resulting tab id remains `agent:hermes`
- session bootstrap and optimistic tab/session state continue using the current helper flow

No `hermes`-specific branching should be added to session selection or tab identity code.

## Runtime Record Interpretation

The runtime `agents` payload shape is not treated as a wide-open schema. The new normalization helper should be intentionally conservative:

- accept only records that expose a non-empty agent id
- accept only records that explicitly indicate install/availability state
- ignore records whose status is missing, ambiguous, or clearly unavailable

The exact field names should follow the payload shapes already present in the local runtime contract or tests once implementation begins. If multiple equivalent installed-state fields already exist, they should be normalized in one helper rather than copied across components.

This conservative rule matters because the product requirement is “show `hermes` only when explicitly reported as installed,” not “show any agent-like object that happens to have an id.”

## Data Flow

The intended data flow after the change is:

1. Runtime polling or WebSocket sync updates snapshot state.
2. Runtime snapshot logic derives an effective visible agent id list from `availableAgents` plus installed entries from `agents`.
3. The app controller passes that normalized list through the existing `availableAgents` prop path.
4. `SessionOverview` filters out already-open agent tabs and renders the remaining choices in the `+` menu.
5. Selecting `hermes` reuses the existing `openOrActivateAgentTab("hermes")` path.

## Error Handling

- If runtime sends malformed `agents` entries, ignore those entries instead of throwing.
- If runtime does not explicitly report `hermes` as installed, do not show `hermes`.
- If both `availableAgents` and `agents` omit `hermes`, preserve current behavior with no extra UI noise.
- If `hermes` is already open, keep hiding it from the add-tab menu via the existing open-tab filter.

## Testing Strategy

This behavior change crosses runtime state normalization and session-menu rendering, so validation should cover both layers.

### Runtime snapshot regression

Add a focused regression in [src/features/session/runtime/use-runtime-snapshot.test.jsx](/Users/marila/projects/lalaclaw/src/features/session/runtime/use-runtime-snapshot.test.jsx) that proves:

- `availableAgents` does not contain `hermes`
- runtime `agents` includes an explicitly installed `hermes` record
- the effective available agent list includes `hermes`

Also add a negative case if the helper shape is non-trivial:

- runtime `agents` includes `hermes`
- installation state is absent or false
- `hermes` is not added

### Session overview regression

Add a UI-level regression in [src/components/command-center/session-overview.test.jsx](/Users/marila/projects/lalaclaw/src/components/command-center/session-overview.test.jsx) that proves:

- `availableAgents` includes `main` and `hermes`
- `openAgentIds` already includes `main`
- the `+` menu shows `hermes` and still hides `main`

This verifies that no extra UI work is required once the normalized list is correct.

### Optional light integration regression

If the runtime-layer test and menu-layer test do not fully cover the tab-open path, add one lightweight integration regression in [src/App.test.jsx](/Users/marila/projects/lalaclaw/src/App.test.jsx) to prove:

- runtime makes `hermes` visible
- the add-tab menu exposes it
- selecting it opens an `agent:hermes` tab through the existing flow

This should stay narrowly scoped and avoid broad new mocks.

## Risks and Mitigations

- Risk: runtime `agents` records have more than one shape.
  - Mitigation: isolate interpretation in a single helper and keep the acceptance rule conservative.
- Risk: the UI could accidentally surface unavailable agents.
  - Mitigation: only supplement from `agents` when the record explicitly reports installed/available state.
- Risk: a broad refactor could spread this logic into multiple layers.
  - Mitigation: normalize once near runtime snapshot state and keep downstream consumers on `string[]`.

## Implementation Boundaries

- Prefer the smallest possible change centered on runtime agent-list normalization.
- Do not refactor session tab identity, persistence, or IM flows as part of this work.
- Do not add new locale keys unless a concrete new empty/error state appears during implementation.

## Validation Expectations

Because this is a design/spec workstream only, no code validation commands are required yet.

When implementation begins, the minimum expected validation should be:

- targeted runtime snapshot regression(s)
- targeted session overview regression(s)
- `npm test` if the touched code spans runtime state and app/controller wiring

## Open Questions Resolved

- Should `hermes` be shown speculatively if it might be installed locally?
  - No. It appears only when runtime explicitly reports it as installed.
- Should the app add `hermes` through a special-case tab path?
  - No. It should reuse the existing agent tab creation flow.

## Recommendation

Proceed with a minimal implementation that supplements `availableAgents` from explicitly installed runtime `agents` records, then verify the behavior with one runtime-state regression and one session-menu regression before considering any broader runtime contract cleanup.
