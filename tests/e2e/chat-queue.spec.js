/* global require */
const { test, expect } = require("@playwright/test");
const {
  createDeferred,
  createSnapshot,
  createUpdateStatePayload,
  jsonRoute,
} = require("./helpers/command-center-fixtures");

const CURRENT_SESSION_TITLE = /main - (当前会话|Current session)/;
const SEND_BUTTON_NAME = /^(发送|Send)$/;
const CLEAR_QUEUED_BUTTON_NAME = /^(清空待发送|Clear queued)$/;
const QUEUED_COUNT_LABEL = (count) => new RegExp(`^(待发送|Queued) ${count}$`);

function composerLocator(page) {
  return page.locator("textarea");
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

test.describe("Command center e2e", () => {
  test("loads the app and completes one chat turn", async ({ page }) => {
    await installBaseRoutes(page);

    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const body = JSON.parse(route.request().postData() || "{}");
      const latestMessage = Array.isArray(body.messages) ? body.messages.at(-1) : null;
      await jsonRoute(route, {
        ok: true,
        outputText: `已处理：${latestMessage?.content || "空消息"}`,
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

    const textbox = composerLocator(page);
    await expect(textbox).toBeEnabled();
    await textbox.fill("浏览器冒烟测试");
    await page.getByRole("button", { name: SEND_BUTTON_NAME }).click();

    const conversation = page.locator("[data-message-bottom-sentinel]").locator("..");
    await expect(conversation.getByText(/^浏览器冒烟测试$/)).toBeVisible();
    await expect(conversation.getByText(/^已处理：浏览器冒烟测试$/)).toBeVisible();
  });

  test("keeps queued turns out of the conversation until each turn actually starts", async ({ page }) => {
    const firstTurn = createDeferred();
    const secondTurn = createDeferred();
    const thirdTurn = createDeferred();
    const gates = [firstTurn, secondTurn, thirdTurn];
    const replies = ["第一轮回复完成", "第二轮回复完成", "第三轮回复完成"];
    let chatRequestCount = 0;

    await installBaseRoutes(page);

    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }

      const turnIndex = chatRequestCount;
      chatRequestCount += 1;
      await gates[turnIndex].promise;

      await jsonRoute(route, {
        ok: true,
        outputText: replies[turnIndex],
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

    const textbox = composerLocator(page);
    await expect(textbox).toBeEnabled();
    const conversation = page.locator("[data-message-bottom-sentinel]").locator("..");

    await textbox.fill("第一条");
    await textbox.press("Enter");
    await textbox.fill("第二条");
    await textbox.press("Enter");
    await textbox.fill("第三条");
    await textbox.press("Enter");

    const queueCard = page.getByRole("button", { name: CLEAR_QUEUED_BUTTON_NAME }).locator("xpath=ancestor::div[contains(@class,'border-b')]");

    await expect(page.getByText(QUEUED_COUNT_LABEL(2))).toBeVisible();
    await expect(queueCard.getByText("第二条")).toBeVisible();
    await expect(queueCard.getByText("第三条")).toBeVisible();
    await expect(conversation.getByText("第一条")).toBeVisible();
    await expect(conversation.getByText("第二条")).toHaveCount(0);
    await expect(conversation.getByText("第三条")).toHaveCount(0);
    expect(chatRequestCount).toBe(1);

    firstTurn.resolve();
    await expect(conversation.getByText("第一轮回复完成")).toBeVisible();
    await expect(conversation.getByText("第二条")).toBeVisible();
    await expect(conversation.getByText("第三条")).toHaveCount(0);
    await expect(page.getByText(QUEUED_COUNT_LABEL(1))).toBeVisible();
    expect(chatRequestCount).toBe(2);

    secondTurn.resolve();
    await expect(conversation.getByText("第二轮回复完成")).toBeVisible();
    await expect(conversation.getByText("第三条")).toBeVisible();
    await expect(page.getByText(QUEUED_COUNT_LABEL(1))).toHaveCount(0);
    expect(chatRequestCount).toBe(3);

    thirdTurn.resolve();
    await expect(conversation.getByText("第三轮回复完成")).toBeVisible();
  });
});
