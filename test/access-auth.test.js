import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccessController } from "../server/auth/access-control.ts";
import { parseRequestBody, sendJson } from "../server/http/http-utils.ts";

const require = createRequire(import.meta.url);
const { createAppServer } = require("../server");

describe("token access mode", () => {
  let server;
  let baseUrl;

  beforeEach(() => {
    server = null;
    baseUrl = "";
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });

  it("requires login before protected api routes can be used", async () => {
    const accessController = createAccessController({
      config: {
        accessMode: "token",
        accessTokensRaw: "demo-token",
        accessConfigFile: "/Users/example/.config/lalaclaw/.env.local",
        accessTokensFile: "/Users/example/.config/lalaclaw/access-tokens.txt",
      },
      parseRequestBody,
      sendJson,
    });

    server = createAppServer({
      accessController,
      config: { mode: "mock" },
      getStaticDir: () => "/tmp",
      handleAccessLogout: accessController.handleLogout,
      handleAccessState: accessController.handleState,
      handleAccessToken: accessController.handleToken,
      handleRuntime: async (req, res) => {
        sendJson(res, 200, {
          ok: true,
          session: {
            agentId: "main",
            sessionUser: "command-center",
          },
          conversation: [],
        });
      },
      helpers: {
        isWebAppBuilt: () => true,
        requireAccess: accessController.requireAccess,
      },
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const unauthorizedResponse = await fetch(`${baseUrl}/api/runtime`);
    expect(unauthorizedResponse.status).toBe(401);
    await expect(unauthorizedResponse.json()).resolves.toMatchObject({
      ok: false,
      code: "ACCESS_TOKEN_REQUIRED",
    });

    const stateResponse = await fetch(`${baseUrl}/api/auth/state`);
    await expect(stateResponse.json()).resolves.toMatchObject({
      ok: true,
      accessMode: "token",
      authenticated: false,
      hints: {
        configFile: "/Users/example/.config/lalaclaw/.env.local",
        tokensFile: "/Users/example/.config/lalaclaw/access-tokens.txt",
      },
    });

    const loginResponse = await fetch(`${baseUrl}/api/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "demo-token" }),
    });
    expect(loginResponse.status).toBe(200);
    const cookieHeader = loginResponse.headers.get("set-cookie");
    expect(cookieHeader).toContain("lalaclaw_access=");

    const authorizedResponse = await fetch(`${baseUrl}/api/runtime`, {
      headers: {
        Cookie: cookieHeader,
      },
    });
    expect(authorizedResponse.status).toBe(200);
    await expect(authorizedResponse.json()).resolves.toMatchObject({
      ok: true,
      session: {
        agentId: "main",
      },
    });

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
      },
    });
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(logoutResponse.json()).resolves.toMatchObject({
      ok: true,
      accessMode: "token",
      authenticated: false,
    });

    const revokedResponse = await fetch(`${baseUrl}/api/runtime`, {
      headers: {
        Cookie: cookieHeader,
      },
    });
    expect(revokedResponse.status).toBe(401);
    await expect(revokedResponse.json()).resolves.toMatchObject({
      ok: false,
      code: "ACCESS_TOKEN_REQUIRED",
    });
  });
});
