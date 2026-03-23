import { describe, expect, it } from "vitest";
import { createOpenClawManagementService } from "./openclaw-management.ts";

describe("createOpenClawManagementService", () => {
  it("runs a restart action and reports a healthy follow-up check", async () => {
    const service = createOpenClawManagementService({
      config: {
        openclawBin: "openclaw",
        healthPort: 18792,
      },
      execFileAsync: async (command, args) => {
        expect(command).toBe("openclaw");
        expect(args).toEqual(["gateway", "restart"]);
        return { stdout: "restarted", stderr: "" };
      },
      fetchImpl: async (url) => {
        expect(url).toBe("http://127.0.0.1:18792/healthz");
        return {
          ok: true,
          status: 200,
          text: async () => "ok",
        };
      },
    });

    const result = await service.runOpenClawAction("restart");

    expect(result.ok).toBe(true);
    expect(result.command.display).toBe("openclaw gateway restart");
    expect(result.commandResult.stdout).toBe("restarted");
    expect(result.healthCheck.status).toBe("healthy");
  });

  it("falls back from a failing health port probe to the gateway base URL health endpoint", async () => {
    const fetchCalls = [];
    const fetchMock = async (url, init) => {
      fetchCalls.push({ url, init });
      if (url === "http://127.0.0.1:18789/healthz") {
        return {
          ok: true,
          status: 200,
          text: async () => '{"ok":true,"status":"live"}',
        };
      }

      return {
        ok: false,
        status: 404,
        text: async () => "not found",
      };
    };
    const service = createOpenClawManagementService({
      config: {
        openclawBin: "openclaw",
        baseUrl: "http://127.0.0.1:18789",
        healthPort: 18792,
      },
      execFileAsync: async () => ({ stdout: "running", stderr: "" }),
      fetchImpl: fetchMock,
    });

    const result = await service.runOpenClawAction("status");

    expect(result.ok).toBe(true);
    expect(result.healthCheck).toMatchObject({
      status: "healthy",
      url: "http://127.0.0.1:18789/healthz",
      httpStatus: 200,
    });
    expect(fetchCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: "http://127.0.0.1:18789/healthz",
        init: expect.objectContaining({ method: "GET" }),
      }),
    ]));
  });

  it("marks timed out doctor repair runs as failed and keeps stderr output", async () => {
    const service = createOpenClawManagementService({
      config: {
        openclawBin: "openclaw",
        healthPort: 18792,
      },
      execFileAsync: async () => {
        const error = new Error("Command failed: timed out after 30000ms");
        error.killed = true;
        error.signal = "SIGTERM";
        error.stdout = "repair started";
        error.stderr = "still running";
        throw error;
      },
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });

    const result = await service.runOpenClawAction("doctorRepair");

    expect(result.ok).toBe(false);
    expect(result.commandResult.timedOut).toBe(true);
    expect(result.commandResult.stdout).toContain("repair started");
    expect(result.healthCheck.status).toBe("unreachable");
    expect(result.guidance.join(" ")).toContain("timed out");
  });

  it("keeps using the official doctor --repair action and flags unhealthy follow-up checks", async () => {
    const service = createOpenClawManagementService({
      config: {
        openclawBin: "openclaw",
        healthPort: 18792,
      },
      execFileAsync: async (command, args) => {
        expect(command).toBe("openclaw");
        expect(args).toEqual(["doctor", "--repair"]);
        return { stdout: "repair complete", stderr: "config warnings present" };
      },
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        text: async () => "gateway unhealthy",
      }),
    });

    const result = await service.runOpenClawAction("doctorRepair");

    expect(result.ok).toBe(false);
    expect(result.command.display).toBe("openclaw doctor --repair");
    expect(result.commandResult.stdout).toBe("repair complete");
    expect(result.healthCheck).toMatchObject({
      status: "unhealthy",
      httpStatus: 503,
    });
    expect(result.guidance.join(" ")).toContain("unhealthy state");
  });

  it("treats noisy gateway status stdout as harmless when the health probe is healthy", async () => {
    const service = createOpenClawManagementService({
      config: {
        openclawBin: "openclaw",
        baseUrl: "http://127.0.0.1:18789",
      },
      execFileAsync: async () => ({
        stdout: [
          "Config warnings:",
          "- plugins.entries.brave: plugin not found: brave",
          "Service: LaunchAgent (loaded)",
          "Runtime: running (pid 335, state active)",
          "RPC probe: ok",
        ].join("\n"),
        stderr: "",
      }),
      fetchImpl: async (url) => {
        expect(url).toBe("http://127.0.0.1:18789/healthz");
        return {
          ok: true,
          status: 200,
          text: async () => "ok",
        };
      },
    });

    const result = await service.runOpenClawAction("status");

    expect(result.ok).toBe(true);
    expect(result.command.display).toBe("openclaw gateway status");
    expect(result.commandResult.stdout).toContain("Config warnings:");
    expect(result.commandResult.stdout).toContain("RPC probe: ok");
    expect(result.healthCheck.status).toBe("healthy");
    expect(result.guidance.join(" ")).toContain("completed successfully");
  });

  it("flags stop actions when the gateway still looks healthy afterward", async () => {
    const service = createOpenClawManagementService({
      config: {
        openclawBin: "openclaw",
        healthPort: 18792,
      },
      execFileAsync: async () => ({ stdout: "stopped", stderr: "" }),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "still healthy",
      }),
    });

    const result = await service.runOpenClawAction("stop");

    expect(result.ok).toBe(false);
    expect(result.command.display).toBe("openclaw gateway stop");
    expect(result.healthCheck.status).toBe("healthy");
    expect(result.guidance.join(" ")).toContain("still responds");
  });
});
