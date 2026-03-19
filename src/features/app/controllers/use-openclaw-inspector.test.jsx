import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import zh from "@/locales/zh";
import { useOpenClawInspector } from "./use-openclaw-inspector";

function createJsonResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload,
  };
}

function countFetchCalls(fetchMock, prefix) {
  return fetchMock.mock.calls.filter(([input]) => String(input).startsWith(prefix)).length;
}

function renderOpenClawInspectorHook(overrides = {}) {
  return renderHook(() =>
    useOpenClawInspector({
      activeTab: "environment",
      currentAgentId: "main",
      environmentItems: [],
      hasOpenClawDiagnostics: true,
      messages: zh,
      onRefreshEnvironment: vi.fn(),
      onSyncCurrentSessionModel: vi.fn(),
      ...overrides,
    }),
  );
}

describe("useOpenClawInspector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not keep retrying OpenClaw bootstrap requests after the first failure", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/openclaw/config")) {
        return createJsonResponse({ ok: false, errorCode: "requestFailed" }, false);
      }
      if (url === "/api/openclaw/update") {
        return createJsonResponse({ ok: false, errorCode: "requestFailed" }, false);
      }
      if (url === "/api/openclaw/history") {
        return createJsonResponse({ ok: false }, false);
      }
      return createJsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderOpenClawInspectorHook();

    await waitFor(() => {
      expect(result.current.openClawConfigError).toBe(zh.inspector.openClawConfig.errors.requestFailed);
      expect(result.current.openClawUpdateError).toBe(zh.inspector.openClawUpdate.errors.requestFailed);
      expect(result.current.openClawHistoryError).toBe(zh.inspector.remoteOperations.historyRequestFailed);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(countFetchCalls(fetchMock, "/api/openclaw/config")).toBe(1);
    expect(countFetchCalls(fetchMock, "/api/openclaw/update")).toBe(1);
    expect(countFetchCalls(fetchMock, "/api/openclaw/history")).toBe(1);
  });

  it("loads OpenClaw operation history only once after a successful bootstrap", async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/openclaw/config")) {
        return createJsonResponse({
          ok: true,
          baseHash: "hash",
          fields: [],
          validation: { ok: true, valid: true },
        });
      }
      if (url === "/api/openclaw/update") {
        return createJsonResponse({
          ok: true,
          installed: true,
          availability: { available: false },
        });
      }
      if (url === "/api/openclaw/history") {
        return createJsonResponse({
          ok: true,
          entries: [{ id: "entry-1", action: "update", status: "ok" }],
        });
      }
      return createJsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderOpenClawInspectorHook();

    await waitFor(() => {
      expect(result.current.openClawHistoryEntries).toEqual([{ id: "entry-1", action: "update", status: "ok" }]);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(countFetchCalls(fetchMock, "/api/openclaw/config")).toBe(1);
    expect(countFetchCalls(fetchMock, "/api/openclaw/update")).toBe(1);
    expect(countFetchCalls(fetchMock, "/api/openclaw/history")).toBe(1);
  });
});
