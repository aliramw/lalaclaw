#!/usr/bin/env node

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { chromium } = require("@playwright/test");

const DEFAULT_HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 120_000;
const PAGE_TIMEOUT_MS = 45_000;
const PLAYWRIGHT_INSTALL_TIMEOUT_MS = 10 * 60_000;

function logStep(message, json = false) {
  if (!json) {
    process.stdout.write(`[release-install-smoke] ${message}\n`);
  }
}

function parseArgs(argv = []) {
  const options = {
    tarball: "",
    host: DEFAULT_HOST,
    port: null,
    keepTmp: false,
    json: false,
    noChat: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "");

    if (token === "--keep-tmp") {
      options.keepTmp = true;
      continue;
    }

    if (token === "--json") {
      options.json = true;
      continue;
    }

    if (token === "--no-chat") {
      options.noChat = true;
      continue;
    }

    if (token === "--chat") {
      options.noChat = false;
      continue;
    }

    if (token === "--tarball" || token === "--host" || token === "--port") {
      const value = String(argv[index + 1] || "").trim();
      if (!value) {
        throw new Error(`${token} requires a value`);
      }

      if (token === "--tarball") {
        options.tarball = value;
      } else if (token === "--host") {
        options.host = value;
      } else if (token === "--port") {
        const parsedPort = Number(value);
        if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
          throw new Error(`--port must be an integer between 1 and 65535. Received: ${value}`);
        }
        options.port = parsedPort;
      }

      index += 1;
      continue;
    }

    if (!token.startsWith("--") && !options.tarball) {
      options.tarball = token;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function resolveTarballPath({
  tarball = "",
  cwd = process.cwd(),
  fsImpl = fs,
} = {}) {
  const explicitTarball = String(tarball || "").trim();
  if (explicitTarball) {
    const resolved = path.resolve(cwd, explicitTarball);
    if (!fsImpl.existsSync(resolved)) {
      throw new Error(`Release tarball not found: ${resolved}`);
    }
    return resolved;
  }

  const artifactsDir = path.join(cwd, "artifacts");
  if (!fsImpl.existsSync(artifactsDir)) {
    throw new Error(`artifacts/ does not exist at ${artifactsDir}. Run \`npm run pack:release\` first.`);
  }

  const candidates = fsImpl.readdirSync(artifactsDir)
    .filter((entry) => /^lalaclaw-.*\.tgz$/i.test(entry))
    .map((entry) => ({
      path: path.join(artifactsDir, entry),
      stats: fsImpl.statSync(path.join(artifactsDir, entry)),
    }))
    .sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);

  if (!candidates.length) {
    throw new Error(`No lalaclaw release tarball was found in ${artifactsDir}. Run \`npm run pack:release\` first.`);
  }

  return candidates[0].path;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function buildIsolatedAppEnv({
  tempRoot,
  configDir,
  baseEnv = process.env,
  platform = process.platform,
} = {}) {
  const resolvedTempRoot = path.resolve(String(tempRoot || os.tmpdir()));
  const resolvedConfigDir = path.resolve(String(configDir || path.join(resolvedTempRoot, "config")));
  const isolatedEnv = {
    ...baseEnv,
    HOME: resolvedTempRoot,
    USERPROFILE: resolvedTempRoot,
    XDG_CONFIG_HOME: path.join(resolvedTempRoot, ".config"),
    LALACLAW_CONFIG_DIR: resolvedConfigDir,
  };

  if (platform === "win32") {
    isolatedEnv.APPDATA = path.join(resolvedTempRoot, "AppData", "Roaming");
    isolatedEnv.LOCALAPPDATA = path.join(resolvedTempRoot, "AppData", "Local");
    isolatedEnv.HOMEDRIVE = path.parse(resolvedTempRoot).root.replace(/[\\/]+$/, "") || "C:";
    isolatedEnv.HOMEPATH = resolvedTempRoot.slice((isolatedEnv.HOMEDRIVE || "").length) || "\\";
  }

  return isolatedEnv;
}

function waitForChildExit(child) {
  if (!child || child.exitCode !== null) {
    return Promise.resolve();
  }
  return once(child, "exit").then(() => undefined);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    await waitForChildExit(killer);
    return;
  }

  child.kill("SIGINT");
  await Promise.race([
    waitForChildExit(child),
    delay(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

function runCommand(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk || "");
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk || "");
  });

  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timeoutMs = Number(options.timeoutMs);
    const timeoutId = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
        timedOut = true;
        if (process.platform === "win32") {
          spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
          return;
        }
        child.kill("SIGKILL");
      }, timeoutMs)
      : null;

    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      clearTimer();
      if (timedOut) {
        reject(new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms\n${stdout}${stderr}`.trim()));
        return;
      }
      if (code === 0) {
        resolve({ code, signal, stdout, stderr });
        return;
      }

      reject(new Error(
        `${command} ${args.join(" ")} failed with ${signal ? `signal ${signal}` : `code ${code}`}\n` +
        `${stdout}${stderr}`.trim(),
      ));
    });
  });
}

async function waitForHttp(url, timeoutMs = STARTUP_TIMEOUT_MS) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the installed app becomes ready.
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function findAvailablePort(host = DEFAULT_HOST) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function ensurePlaywrightChromiumInstalled({
  cwd = process.cwd(),
  env = process.env,
  executablePath = "",
} = {}) {
  const resolvedExecutablePath = String(executablePath || "").trim()
    || String(typeof chromium.executablePath === "function" ? chromium.executablePath() : "").trim();

  if (resolvedExecutablePath && fs.existsSync(resolvedExecutablePath)) {
    return {
      installed: true,
      executablePath: resolvedExecutablePath,
      installedNow: false,
    };
  }

  await runCommand(npmCommand(), ["run", "test:e2e:install"], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeoutMs: PLAYWRIGHT_INSTALL_TIMEOUT_MS,
  });

  const postInstallExecutablePath = String(typeof chromium.executablePath === "function" ? chromium.executablePath() : "").trim();
  if (!postInstallExecutablePath || !fs.existsSync(postInstallExecutablePath)) {
    throw new Error("Playwright Chromium is still unavailable after `npm run test:e2e:install`.");
  }

  return {
    installed: true,
    executablePath: postInstallExecutablePath,
    installedNow: true,
  };
}

function createReportSkeleton({ startedAt, tarballPath, tempRoot, installDir, configDir, baseUrl, options }) {
  return {
    ok: false,
    startedAt,
    finishedAt: "",
    durationMs: 0,
    tarballPath,
    tempRoot,
    installDir,
    configDir,
    baseUrl,
    keepTmp: options.keepTmp,
    install: null,
    startup: null,
    browser: null,
    browserInstall: null,
    error: "",
  };
}

async function runBrowserSmoke(baseUrl, { noChat = false } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error?.stack || error?.message || error));
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
    await page.locator("#root").waitFor({ state: "attached", timeout: PAGE_TIMEOUT_MS });
    await page.locator("textarea").waitFor({ state: "visible", timeout: PAGE_TIMEOUT_MS });
    await page.waitForFunction(() => globalThis.document?.title?.includes("LalaClaw"), undefined, { timeout: PAGE_TIMEOUT_MS });
    await page.waitForFunction(() => (globalThis.document?.body?.innerText || "").trim().length > 20, undefined, { timeout: PAGE_TIMEOUT_MS });

    let chatReplySeen = false;
    if (!noChat) {
      const composer = page.locator("textarea");
      const prompt = "release smoke ping";
      await composer.fill(prompt);
      await page.getByRole("button", { name: /^(Send|发送)$/ }).click();
      await page.getByText(/OpenClaw command channel is online in mock mode\./).waitFor({
        state: "visible",
        timeout: PAGE_TIMEOUT_MS,
      });
      chatReplySeen = true;
    }

    return {
      consoleErrors,
      pageErrors,
      chatReplySeen,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const options = parseArgs(process.argv.slice(2));
  if (!options.port) {
    options.port = await findAvailablePort(options.host);
  }
  const tarballPath = resolveTarballPath({ tarball: options.tarball });
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "lalaclaw-release-smoke-"));
  const installDir = path.join(tempRoot, "install");
  const configDir = path.join(tempRoot, "config");
  const baseUrl = `http://${options.host}:${options.port}`;
  const report = createReportSkeleton({ startedAt, tarballPath, tempRoot, installDir, configDir, baseUrl, options });
  let appChild = null;

  try {
    await fsp.mkdir(installDir, { recursive: true });
    await fsp.mkdir(configDir, { recursive: true });

    logStep(`installing ${tarballPath}`, options.json);
    const installResult = await runCommand(npmCommand(), ["install", tarballPath], {
      cwd: installDir,
      env: {
        npm_config_fund: "false",
        npm_config_audit: "false",
      },
    });
    report.install = {
      command: `${npmCommand()} install ${tarballPath}`,
      stdout: installResult.stdout.trim(),
      stderr: installResult.stderr.trim(),
    };

    const cliEntry = path.join(installDir, "node_modules", "lalaclaw", "bin", "lalaclaw.js");
    if (!fs.existsSync(cliEntry)) {
      throw new Error(`Installed CLI entry is missing: ${cliEntry}`);
    }

    logStep(`starting packaged app on ${baseUrl}`, options.json);
    const childEnv = buildIsolatedAppEnv({
      tempRoot,
      configDir,
    });
    appChild = spawn(process.execPath, [
      cliEntry,
      "start",
      "--profile",
      "mock",
      "--host",
      options.host,
      "--port",
      String(options.port),
    ], {
      cwd: installDir,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    appChild.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    appChild.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    appChild.once("exit", (code, signal) => {
      if (!report.startup || report.startup.ready !== true) {
        report.startup = {
          ready: false,
          command: `node ${cliEntry} start --profile mock --host ${options.host} --port ${options.port}`,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exit: signal ? `signal ${signal}` : `code ${code}`,
        };
      }
    });

    logStep(`waiting for ${baseUrl}/api/runtime`, options.json);
    await waitForHttp(`${baseUrl}/api/runtime`);
    report.startup = {
      ready: true,
      command: `node ${cliEntry} start --profile mock --host ${options.host} --port ${options.port}`,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exit: "",
    };

    logStep("ensuring Playwright Chromium is installed", options.json);
    report.browserInstall = await ensurePlaywrightChromiumInstalled({
      cwd: process.cwd(),
      env: process.env,
    });

    logStep("opening Chromium smoke page", options.json);
    const browserResult = await runBrowserSmoke(baseUrl, { noChat: options.noChat });
    report.browser = browserResult;
    if (browserResult.consoleErrors.length || browserResult.pageErrors.length) {
      throw new Error(
        `Browser runtime errors detected. consoleErrors=${browserResult.consoleErrors.length}, pageErrors=${browserResult.pageErrors.length}`,
      );
    }

    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    logStep("stopping packaged app", options.json);
    await stopChild(appChild);

    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.parse(report.finishedAt) - Date.parse(startedAt);

    if (!options.keepTmp) {
      await fsp.rm(tempRoot, { recursive: true, force: true });
    }

    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const status = report.ok ? "passed" : "failed";
      const lines = [
        `[release-install-smoke] ${status}`,
        `- tarball: ${report.tarballPath}`,
        `- baseUrl: ${report.baseUrl}`,
        `- tempRoot: ${report.tempRoot}`,
        `- keptTempRoot: ${report.keepTmp}`,
      ];

      if (report.browser) {
        lines.push(
          `- chatReplySeen: ${report.browser.chatReplySeen}`,
          `- consoleErrors: ${report.browser.consoleErrors.length}`,
          `- pageErrors: ${report.browser.pageErrors.length}`,
        );
      }

      if (report.error) {
        lines.push(`- error: ${report.error}`);
      }

      process.stdout.write(`${lines.join("\n")}\n`);
    }
  }
}

if (require.main === module) {
  main().catch(() => {
    process.exitCode = 1;
  });
}

module.exports = {
  buildIsolatedAppEnv,
  ensurePlaywrightChromiumInstalled,
  parseArgs,
  resolveTarballPath,
};
