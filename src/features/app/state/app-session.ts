import { defaultSessionUser } from "@/features/app/storage";
import type { AppSession } from "@/types/runtime";

type SessionMessages = {
  common: {
    idle: string;
    none: string;
    noUpdates: string;
  };
  sessionOverview: {
    fastMode: {
      off: string;
    };
  };
};

export function createBaseSession(messages: SessionMessages, overrides: Partial<AppSession> = {}): AppSession {
  return {
    mode: "mock",
    model: "",
    selectedModel: "",
    agentId: "main",
    agentLabel: "main",
    selectedAgentId: "main",
    sessionUser: defaultSessionUser,
    sessionKey: "",
    status: messages.common.idle,
    fastMode: messages.sessionOverview.fastMode.off,
    thinkMode: "off",
    contextUsed: 0,
    contextMax: 16000,
    contextDisplay: "0 / 16000",
    runtime: "mock",
    queue: messages.common.none,
    updatedLabel: messages.common.noUpdates,
    updatedAt: null,
    tokens: "0 in / 0 out",
    auth: "",
    version: "",
    time: "",
    availableModels: [],
    availableAgents: [],
    availableMentionAgents: [],
    availableSkills: [],
    ...overrides,
  };
}
