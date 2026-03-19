/* global describe, expect, it */
const { createOpenClawManagementHandler } = require("./openclaw-management");

describe("createOpenClawManagementHandler", () => {
  it("returns a structured action result payload", async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawManagement = createOpenClawManagementHandler({
      parseRequestBody: async () => ({ action: "status" }),
      runOpenClawAction: async (action) => ({
        ok: true,
        action,
        command: { display: "openclaw gateway status" },
        commandResult: { ok: true, stdout: "running", stderr: "" },
        healthCheck: { status: "healthy", url: "http://127.0.0.1:18792/healthz" },
        guidance: ["Looks good."],
      }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawManagement({}, {});

    expect(responseStatus).toBe(200);
    expect(responseBody).toMatchObject({
      ok: true,
      action: "status",
      command: { display: "openclaw gateway status" },
      healthCheck: { status: "healthy" },
    });
  });

  it("rejects requests without an action", async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawManagement = createOpenClawManagementHandler({
      parseRequestBody: async () => ({}),
      runOpenClawAction: async () => ({ ok: true }),
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawManagement({}, {});

    expect(responseStatus).toBe(400);
    expect(responseBody).toEqual({
      ok: false,
      error: "OpenClaw action is required",
    });
  });

  it("preserves structured error codes from blocked actions", async () => {
    let responseStatus = null;
    let responseBody = null;
    const handleOpenClawManagement = createOpenClawManagementHandler({
      parseRequestBody: async () => ({ action: "restart" }),
      runOpenClawAction: async () => {
        const error = new Error("Remote OpenClaw restart is currently blocked.");
        error.statusCode = 403;
        error.errorCode = "remote_openclaw_mutation_blocked";
        throw error;
      },
      sendJson: (_res, status, body) => {
        responseStatus = status;
        responseBody = body;
      },
    });

    await handleOpenClawManagement({}, {});

    expect(responseStatus).toBe(403);
    expect(responseBody).toEqual({
      ok: false,
      error: "Remote OpenClaw restart is currently blocked.",
      errorCode: "remote_openclaw_mutation_blocked",
    });
  });
});
