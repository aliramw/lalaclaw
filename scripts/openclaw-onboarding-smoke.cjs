#!/usr/bin/env node
/* global console, fetch, process */

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");

const PROJECT_ROOT = process.cwd();
const argv = new Set(process.argv.slice(2));
const HOST = process.env.LALACLAW_ONBOARDING_SMOKE_HOST || "127.0.0.1";
const PORT = Number(process.env.LALACLAW_ONBOARDING_SMOKE_PORT || (3100 + Math.floor(Math.random() * 200)));
const OPENCLAW_BASE_URL = process.env.LALACLAW_ONBOARDING_SMOKE_BASE_URL || "http://127.0.0.1:18789";
const KEEP_TMP = ["1", "true", "yes", "on"].includes(String(process.env.LALACLAW_ONBOARDING_SMOKE_KEEP_TMP || "").trim().toLowerCase());
const OUTPUT_FILE = String(process.env.LALACLAW_ONBOARDING_SMOKE_OUTPUT_FILE || "").trim();
const GITHUB_STEP_SUMMARY = String(process.env.GITHUB_STEP_SUMMARY || "").trim();
const JSON_ONLY = argv.has("--json");
const SERVER_READY_TIMEOUT_MS = 30_000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, received: ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}\n${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

async function waitForServerReady(baseUrl) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < SERVER_READY_TIMEOUT_MS) {
    try {
      const payload = await readJson(`${baseUrl}/api/openclaw/onboarding`);
      if (payload?.ok) {
        return payload;
      }
    } catch {
      // Keep polling until the backend responds with a valid onboarding payload.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${baseUrl} to become ready`);
}

function spawnBackend(tempHome) {
  const child = spawn("node", ["server.js"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOME: tempHome,
      HOST,
      PORT: String(PORT),
      OPENCLAW_BASE_URL,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk || "");
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk || "");
  });

  return {
    child,
    getLogs() {
      return { stdout, stderr };
    },
  };
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGINT");
  await Promise.race([
    once(child, "exit"),
    delay(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

async function writeJsonFile(targetPath, payload) {
  if (!targetPath) {
    return;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function appendGitHubSummary(report) {
  if (!GITHUB_STEP_SUMMARY) {
    return;
  }
  const lines = [
    "## OpenClaw onboarding smoke",
    "",
    `- status: ${report.ok ? "passed" : "failed"}`,
    `- server: \`${report.server}\``,
    `- tempHome: \`${report.tempHome}\``,
    `- keptTempHome: \`${report.keptTempHome}\``,
    `- durationMs: \`${report.durationMs}\``,
  ];

  if (report.ok) {
    lines.push(
      `- initial: installed=\`${report.initial.installed}\`, ready=\`${report.initial.ready}\`, needsOnboarding=\`${report.initial.needsOnboarding}\``,
      `- onboarding: ok=\`${report.onboarding.ok}\`, detectedSource=\`${report.onboarding.detectedSource}\`, healthStatus=\`${report.onboarding.healthStatus}\``,
      `- final: ready=\`${report.final.ready}\`, needsOnboarding=\`${report.final.needsOnboarding}\`, detectedSource=\`${report.final.detectedSource}\``,
    );
  } else {
    lines.push(`- error: ${report.error}`);
  }

  lines.push("");
  await fs.appendFile(GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`, "utf8");
}

function buildSmokeReport({
  startedAt,
  tempHome,
  baseUrl,
  initialState,
  onboardingResult,
  readyState,
  refreshedState,
}) {
  const finishedAt = new Date().toISOString();
  return {
    ok: true,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    tempHome,
    keptTempHome: KEEP_TMP,
    server: baseUrl,
    initial: {
      installed: initialState.installed,
      ready: initialState.ready,
      needsOnboarding: initialState.needsOnboarding,
    },
    onboarding: {
      ok: onboardingResult?.ok ?? true,
      detectedSource: onboardingResult?.capabilityDetection?.source || "",
      healthStatus: onboardingResult?.healthCheck?.status || "",
    },
    final: {
      ready: readyState.ready,
      needsOnboarding: readyState.needsOnboarding,
      detectedSource: refreshedState.capabilityDetection?.source || "",
    },
  };
}

function buildFailureReport({
  startedAt,
  tempHome,
  baseUrl,
  error,
  logs,
}) {
  const finishedAt = new Date().toISOString();
  return {
    ok: false,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    tempHome,
    keptTempHome: KEEP_TMP,
    server: baseUrl,
    error: error?.message || String(error),
    stack: error?.stack || "",
    backendLogs: {
      stdout: logs.stdout.trim(),
      stderr: logs.stderr.trim(),
    },
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "lalaclaw-openclaw-smoke-"));
  const tempWorkspace = path.join(tempHome, ".openclaw", "workspace");
  const baseUrl = `http://${HOST}:${PORT}`;
  const { child, getLogs } = spawnBackend(tempHome);

  try {
    const initialState = await waitForServerReady(baseUrl);
    assert(initialState.installed === true, "Expected OpenClaw to be installed for smoke validation");
    assert(
      typeof initialState.ready === "boolean" && typeof initialState.needsOnboarding === "boolean",
      "Expected onboarding state to include ready and needsOnboarding flags",
    );

    let onboardingResult = null;
    let readyState = initialState;

    if (!initialState.ready || initialState.needsOnboarding) {
      const onboardingPayload = {
        authChoice: "skip",
        flow: "manual",
        gatewayBind: "loopback",
        gatewayAuth: "off",
        installDaemon: false,
        skipHealthCheck: true,
        secretInputMode: "plaintext",
        workspace: tempWorkspace,
      };

      onboardingResult = await readJson(`${baseUrl}/api/openclaw/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(onboardingPayload),
      });

      assert(onboardingResult.ok === true, "Expected onboarding POST to succeed");

      readyState = await readJson(`${baseUrl}/api/openclaw/onboarding`);
      assert(readyState.ready === true, "Expected follow-up onboarding state to stay ready");
      assert(readyState.needsOnboarding === false, "Expected follow-up onboarding state to clear needsOnboarding");
    } else {
      readyState = initialState;
      onboardingResult = {
        ok: true,
        capabilityDetection: initialState.capabilityDetection || null,
        healthCheck: { status: "already-ready" },
      };
      assert(readyState.needsOnboarding === false, "Expected an already-ready state to keep needsOnboarding cleared");
    }

    const refreshedState = await readJson(`${baseUrl}/api/openclaw/onboarding?refreshCapabilities=1`);
    assert(
      Boolean(refreshedState.capabilityDetection?.source),
      "Expected capability detection metadata after explicit refresh",
    );

    const report = buildSmokeReport({
      startedAt,
      tempHome,
      baseUrl,
      initialState,
      onboardingResult,
      readyState,
      refreshedState,
    });

    await writeJsonFile(OUTPUT_FILE, report);
    await appendGitHubSummary(report);

    if (!JSON_ONLY) {
      console.error(
        `[openclaw-onboarding-smoke] passed in ${report.durationMs}ms ` +
        `(initial ready=${report.initial.ready}, final ready=${report.final.ready}, detect=${report.final.detectedSource})`,
      );
      if (OUTPUT_FILE) {
        console.error(`[openclaw-onboarding-smoke] wrote report to ${OUTPUT_FILE}`);
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const logs = getLogs();
    const report = buildFailureReport({
      startedAt,
      tempHome,
      baseUrl,
      error,
      logs,
    });

    await writeJsonFile(OUTPUT_FILE, report);
    await appendGitHubSummary(report);

    console.error("[openclaw-onboarding-smoke] failed");
    console.error(error?.stack || error?.message || String(error));
    if (logs.stdout.trim()) {
      console.error("\n[backend stdout]\n" + logs.stdout.trim());
    }
    if (logs.stderr.trim()) {
      console.error("\n[backend stderr]\n" + logs.stderr.trim());
    }
    console.log(JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await stopBackend(child);
    if (!KEEP_TMP) {
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  }
}

main().catch(() => {
  process.exitCode = 1;
});
