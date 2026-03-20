/* global module */
function createSnapshot(overrides = {}) {
  return {
    ok: true,
    mode: "openclaw",
    model: "openclaw",
    session: {
      mode: "openclaw",
      model: "openclaw",
      selectedModel: "openclaw",
      agentId: "main",
      selectedAgentId: "main",
      sessionUser: "command-center",
      sessionKey: "agent:main:openai-user:command-center",
      workspaceRoot: "/Users/marila/.openclaw/workspace",
      status: "空闲",
      fastMode: "关闭",
      contextUsed: 0,
      contextMax: 16000,
      contextDisplay: "0 / 16000",
      runtime: "online",
      queue: "none",
      updatedLabel: "刚刚",
      tokens: "0 in / 0 out",
      auth: "",
      time: "10:00:00",
      availableModels: ["openclaw"],
      availableAgents: ["main"],
    },
    taskTimeline: [],
    taskRelationships: [],
    files: [],
    artifacts: [],
    snapshots: [],
    agents: [],
    peeks: { workspace: null, terminal: null, browser: null },
    ...overrides,
  };
}

function createUpdateStatePayload() {
  return {
    ok: true,
    currentVersion: "2026.3.20-3",
    currentRelease: { version: "2026.3.20-3", stable: true },
    targetRelease: { version: "2026.3.20-3", stable: true },
    stableTag: "stable",
    updateAvailable: false,
    capability: { installKind: "npm-package", restartMode: "manual", updateSupported: true, reason: "" },
    check: { ok: true, scope: "stable", checkedAt: 1, errorCode: "", error: "" },
    job: { active: false, status: "idle", targetVersion: "", currentVersionAtStart: "", startedAt: 0, finishedAt: 0, errorCode: "", error: "" },
  };
}

function jsonRoute(route, payload, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

module.exports = {
  createDeferred,
  createSnapshot,
  createUpdateStatePayload,
  jsonRoute,
};
