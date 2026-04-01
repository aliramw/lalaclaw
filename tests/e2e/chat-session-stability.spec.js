/* global Buffer, require */
const { test, expect } = require("@playwright/test");
const {
  createDeferred,
  createSnapshot,
  createUpdateStatePayload,
  jsonRoute,
} = require("./helpers/command-center-fixtures");

const CURRENT_SESSION_TITLE = /main - (当前会话|Current session)/;
const SEND_BUTTON_NAME = /^(发送|Send)$/;

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sZ8pK4AAAAASUVORK5CYII=";

function composerLocator(page) {
  return page.locator("textarea");
}

function conversationLocator(page) {
  return page.locator("[data-message-bottom-sentinel]").locator("..");
}

async function installBaseRoutes(page, runtimeSnapshot = createSnapshot()) {
  await page.route("**/api/auth/state", (route) =>
    jsonRoute(route, {
      ok: true,
      accessMode: "off",
      authenticated: true,
    }),
  );

  await page.route("**/api/lalaclaw/update", (route) =>
    jsonRoute(route, createUpdateStatePayload()),
  );

  await page.route("**/api/runtime**", (route) =>
    jsonRoute(route, runtimeSnapshot),
  );

  await page.routeWebSocket(/\/api\/runtime\/ws(\?.*)?$/, (ws) => {
    ws.onMessage((message) => {
      let payload = null;
      try {
        payload = JSON.parse(String(message || ""));
      } catch {
        return;
      }

      if (payload?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: payload.ts }));
      }
    });
  });
}

test.describe("Command center chat stability", () => {
  test("keeps a plain-text user message continuously visible before and after the reply settles", async ({ page }) => {
    const replyGate = createDeferred();

    await installBaseRoutes(page);
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await replyGate.promise;
      await jsonRoute(route, {
        ok: true,
        outputText: "纯文字回复完成",
        session: {
          ...createSnapshot().session,
          status: "空闲",
        },
        metadata: {
          status: "已完成 / 标准",
        },
      });
    });

    await page.goto("/");
    await expect(page.getByText(CURRENT_SESSION_TITLE)).toBeVisible();

    const composer = composerLocator(page);
    const conversation = conversationLocator(page);
    const prompt = "第二条纯文字消息";

    await composer.fill(prompt);
    await page.getByRole("button", { name: SEND_BUTTON_NAME }).click();

    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toHaveCount(1);

    await page.waitForTimeout(350);
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toHaveCount(1);

    replyGate.resolve();

    await expect(conversation.getByText("纯文字回复完成", { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toHaveCount(1);
  });

  test("keeps an image turn rendered as a single attachment before and after the reply settles", async ({ page }) => {
    const replyGate = createDeferred();

    await installBaseRoutes(page);
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await replyGate.promise;
      await jsonRoute(route, {
        ok: true,
        outputText: "带图回复完成",
        session: {
          ...createSnapshot().session,
          status: "空闲",
        },
        metadata: {
          status: "已完成 / 标准",
        },
      });
    });

    await page.goto("/");
    await expect(page.getByText(CURRENT_SESSION_TITLE)).toBeVisible();

    const composer = composerLocator(page);
    const conversation = conversationLocator(page);
    const imageInput = page.locator('input[type="file"]');
    const prompt = "把这张图改成黑色背景";

    await imageInput.setInputFiles({
      name: "wukong-demo.png",
      mimeType: "image/png",
      buffer: Buffer.from(TINY_PNG_BASE64, "base64"),
    });
    await composer.fill(prompt);
    await page.getByRole("button", { name: SEND_BUTTON_NAME }).click();

    const sentImage = conversation.getByAltText("wukong-demo.png");
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(sentImage).toBeVisible();
    await expect(sentImage).toHaveCount(1);

    await page.waitForTimeout(350);
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(sentImage).toBeVisible();
    await expect(sentImage).toHaveCount(1);

    replyGate.resolve();

    await expect(conversation.getByText("带图回复完成", { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(sentImage).toBeVisible();
    await expect(sentImage).toHaveCount(1);
  });

  test("keeps the current user turn visible when a lagging runtime sync briefly contains only the latest assistant reply", async ({ page }) => {
    let runtimeWs = null;

    await page.route("**/api/auth/state", (route) =>
      jsonRoute(route, {
        ok: true,
        accessMode: "off",
        authenticated: true,
      }),
    );

    await page.route("**/api/lalaclaw/update", (route) =>
      jsonRoute(route, createUpdateStatePayload()),
    );

    await page.route("**/api/runtime**", (route) =>
      jsonRoute(route, createSnapshot()),
    );

    await page.routeWebSocket(/\/api\/runtime\/ws(\?.*)?$/, (ws) => {
      runtimeWs = ws;
      ws.onMessage((message) => {
        let payload = null;
        try {
          payload = JSON.parse(String(message || ""));
        } catch {
          return;
        }

        if (payload?.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: payload.ts }));
        }
      });
    });

    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      await jsonRoute(route, {
        ok: true,
        assistantMessageId: "msg-assistant-live-lag-1",
        outputText: "收到。",
        session: {
          ...createSnapshot().session,
          status: "空闲",
        },
        metadata: {
          status: "已完成 / 标准",
        },
      });
    });

    await page.goto("/");
    await expect(page.getByText(CURRENT_SESSION_TITLE)).toBeVisible();

    const composer = composerLocator(page);
    const conversation = conversationLocator(page);
    const prompt = "当前 turn 不能消失";

    await composer.fill(prompt);
    await page.getByRole("button", { name: SEND_BUTTON_NAME }).click();

    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(conversation.getByText("收到。", { exact: true })).toBeVisible();

    await expect.poll(() => Boolean(runtimeWs)).toBe(true);
    runtimeWs.send(JSON.stringify({
      type: "conversation.sync",
      conversation: [
        { id: "msg-assistant-live-lag-1", role: "assistant", content: "收", timestamp: 120 },
      ],
    }));

    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toHaveCount(1);
  });

  test("keeps one in-flight turn visible while a duplicate resend is blocked and an outline-heavy reply settles", async ({ page }) => {
    const replyGate = createDeferred();
    const outlineReply = [
      "一、先锁住当前 turn",
      "- 用户消息只保留一次",
      "- pending assistant 不要闪掉",
      "",
      "二、再展示稳定结果",
      "- 大纲型回复也只能出现一次",
      "- 收口后再回到空闲态",
    ].join("\n");
    let chatPostCount = 0;

    await installBaseRoutes(page);
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      chatPostCount += 1;
      await replyGate.promise;
      await jsonRoute(route, {
        ok: true,
        outputText: outlineReply,
        session: {
          ...createSnapshot().session,
          status: "空闲",
        },
        metadata: {
          status: "已完成 / 标准",
        },
      });
    });

    await page.goto("/");
    await expect(page.getByText(CURRENT_SESSION_TITLE)).toBeVisible();

    const composer = composerLocator(page);
    const conversation = conversationLocator(page);
    const prompt = "把这次切换整理成大纲";

    await page.getByRole("button", { name: /^(切换为Shift \+ Enter发送|Switch to Shift \+ Enter to send)$/ }).click();
    await composer.fill(prompt);
    await page.getByRole("button", { name: SEND_BUTTON_NAME }).click();
    await composer.fill(prompt);
    await composer.press("Shift+Enter");

    await expect.poll(() => chatPostCount).toBe(1);
    await expect(conversation.getByText(prompt, { exact: true })).toHaveCount(1);
    await expect(conversation.getByText(prompt, { exact: true })).toBeVisible();

    replyGate.resolve();

    await expect(conversation.getByText("一、先锁住当前 turn", { exact: true })).toBeVisible();
    await expect(conversation.getByText("大纲型回复也只能出现一次", { exact: true })).toBeVisible();
    await expect(conversation.getByText(prompt, { exact: true })).toHaveCount(1);
  });

  test("releases stop immediately after a locally settled reply so the next enter-send prompt can run", async ({ page }) => {
    await installBaseRoutes(page);
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const body = JSON.parse(route.request().postData() || "{}");
      await jsonRoute(route, {
        ok: true,
        outputText: `已处理：${body.messages.at(-1)?.content || ""}`,
        session: {
          ...createSnapshot().session,
          status: "空闲",
        },
        metadata: {
          status: "已完成 / 标准",
        },
      });
    });

    await page.goto("/");
    await expect(page.getByText(CURRENT_SESSION_TITLE)).toBeVisible();

    const composer = composerLocator(page);
    const conversation = conversationLocator(page);

    await composer.fill("第一条");
    await page.getByRole("button", { name: SEND_BUTTON_NAME }).click();

    await expect(conversation.getByText("已处理：第一条", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: SEND_BUTTON_NAME })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(停止|Stop)$/ })).toHaveCount(0);

    await composer.fill("第二条");
    await composer.press("Enter");

    await expect(conversation.getByText("第二条", { exact: true })).toBeVisible();
    await expect(conversation.getByText("已处理：第二条", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("");
  });
});
