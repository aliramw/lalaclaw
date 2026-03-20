/* global console, process, setTimeout */
const http = require("node:http");
const { spawn } = require("node:child_process");

let shuttingDown = false;
const children = [];

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 1000).unref();
}

function spawnManaged(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const detail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[playwright-dev-server] ${label} exited unexpectedly with ${detail}`);
    shutdown(code || 1);
  });

  children.push(child);
}

function waitForHttp(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryRequest = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(tryRequest, 250);
      });
    };

    tryRequest();
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  spawnManaged("backend", "node", ["server.js"], {
    COMMANDCENTER_FORCE_MOCK: "1",
    HOST: "127.0.0.1",
    PORT: "3000",
  });
  spawnManaged("frontend", "npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"]);

  await Promise.all([
    waitForHttp("http://127.0.0.1:3000/api/runtime"),
    waitForHttp("http://127.0.0.1:5173"),
  ]);

  console.log("[playwright-dev-server] frontend and backend are ready");
}

main().catch((error) => {
  console.error("[playwright-dev-server] failed to start services");
  console.error(error);
  shutdown(1);
});
