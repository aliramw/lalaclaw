import { describe, expect, it } from "vitest";
import { createSessionForTab } from "@/features/app/controllers/use-command-center-helpers";

const messages = {
  common: {
    idle: "待命",
    none: "无",
    noUpdates: "无更新",
  },
  sessionOverview: {
    fastMode: {
      off: "已关闭",
    },
  },
};

describe("createSessionForTab", () => {
  it("initializes hermes tabs with hermes mode before runtime snapshot arrives", () => {
    expect(
      createSessionForTab(
        messages,
        { id: "agent:hermes", agentId: "hermes", sessionUser: "command-center" },
        { agentId: "hermes", sessionUser: "command-center", thinkMode: "off", fastMode: false, model: "" },
      ),
    ).toMatchObject({
      mode: "hermes",
      runtime: "hermes",
      agentId: "hermes",
      selectedAgentId: "hermes",
      status: "待命",
    });
  });

  it("rehydrates a persisted hermes session id into the initial tab session", () => {
    expect(
      createSessionForTab(
        messages,
        { id: "agent:hermes", agentId: "hermes", sessionUser: "command-center-hermes" },
        {
          agentId: "hermes",
          sessionUser: "command-center-hermes",
          hermesSessionId: "hermes-session-42",
          thinkMode: "off",
          fastMode: false,
          model: "gpt-5.4",
        },
      ),
    ).toMatchObject({
      agentId: "hermes",
      sessionUser: "command-center-hermes",
      hermesSessionId: "hermes-session-42",
      selectedModel: "gpt-5.4",
    });
  });
});
