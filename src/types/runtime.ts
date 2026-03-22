import type { ChatMessage, ConversationPendingMap, PendingChatTurn, SessionFile } from "@/types/chat";

export type RuntimeSession = {
  mode?: string;
  model?: string;
  selectedModel?: string;
  agentId?: string;
  sessionUser?: string;
  status?: string;
  fastMode?: boolean | string;
  availableModels?: string[];
  availableAgents?: string[];
  [key: string]: unknown;
};

export type RuntimeTaskRelationship = {
  id?: string;
  status?: string;
  completedAt?: number;
  timestamp?: number;
  [key: string]: unknown;
};

export type RuntimeFile = SessionFile;

export type RuntimePeeks = {
  workspace: unknown | null;
  terminal: unknown | null;
  browser: unknown | null;
  environment: unknown | null;
};

export type RuntimeSnapshot = {
  ok?: boolean;
  error?: string;
  model?: string;
  fastMode?: boolean;
  session?: RuntimeSession;
  conversation?: ChatMessage[];
  files?: RuntimeFile[];
  taskRelationships?: RuntimeTaskRelationship[];
  taskTimeline?: unknown[];
  artifacts?: unknown[];
  snapshots?: unknown[];
  agents?: unknown[];
  availableModels?: string[];
  availableAgents?: string[];
  peeks?: RuntimePeeks;
  [key: string]: unknown;
};

export type RuntimeSnapshotApplyOptions = {
  syncConversation?: boolean;
};

export type RuntimeRecoveredPendingProgress = {
  initialContent: string;
  lastContent: string;
  sawAdvance: boolean;
  stableCount: number;
};

export type RuntimeRecoveredPendingProgressMap = Record<string, RuntimeRecoveredPendingProgress>;

export type RuntimePollIntervalInput = {
  recoveringPendingReply?: boolean;
  busy?: boolean;
  activePendingChat?: PendingChatTurn | null;
  sessionUser?: string;
};

export type RuntimeSnapshotRequestOverrides = {
  agentId?: string;
};

export type RuntimeSnapshotHookI18n = {
  common: {
    idle: string;
    offline: string;
    running: string;
  };
  chat: {
    thinkingPlaceholder: string;
  };
  sessionOverview: {
    fastMode: {
      on: string;
    };
  };
};

export type RuntimeSnapshotHookSession = RuntimeSession & {
  agentId: string;
  sessionUser: string;
  model?: string;
  mode?: string;
  status?: string;
};

export type AppSession = RuntimeSnapshotHookSession & {
  selectedModel: string;
  agentLabel: string;
  selectedAgentId: string;
  sessionKey: string;
  fastMode: boolean | string;
  thinkMode: string;
  contextUsed: number;
  contextMax: number;
  contextDisplay: string;
  runtime: string;
  queue: string;
  updatedLabel: string;
  updatedAt: string | number | null;
  tokens: string;
  auth: string;
  version: string;
  time: string;
  availableModels: string[];
  availableAgents: string[];
  availableMentionAgents: string[];
  availableSkills: string[];
};

export type RuntimeSnapshotHookInput = {
  activePendingChat?: PendingChatTurn | null;
  busy: boolean;
  recoveringPendingReply?: boolean;
  i18n: RuntimeSnapshotHookI18n;
  messagesRef: { current: ChatMessage[] };
  pendingChatTurns: ConversationPendingMap;
  runtimeSessionUser?: string;
  session: RuntimeSnapshotHookSession;
  setBusy: (value: boolean) => void;
  setFastMode: (value: boolean) => void;
  setMessagesSynced: (messages: ChatMessage[]) => void;
  setModel: (value: string) => void;
  setPendingChatTurns: (value: ConversationPendingMap | ((current: ConversationPendingMap) => ConversationPendingMap)) => void;
  setPromptHistoryByConversation: (value: Record<string, string[]> | ((current: Record<string, string[]>) => Record<string, string[]>)) => void;
  setSession: (value: RuntimeSnapshotHookSession | ((current: RuntimeSnapshotHookSession) => RuntimeSnapshotHookSession)) => void;
  enableWebSocket?: boolean;
};

export type RuntimeSocketPayload =
  | (RuntimeSnapshot & { type: "runtime.snapshot" })
  | { type: "session.sync"; session?: RuntimeSession }
  | { type: "taskRelationships.sync"; taskRelationships?: RuntimeTaskRelationship[] }
  | { type: "taskTimeline.sync"; taskTimeline?: unknown[] }
  | { type: "artifacts.sync"; artifacts?: unknown[] }
  | { type: "files.sync"; files?: RuntimeFile[] }
  | { type: "snapshots.sync"; snapshots?: unknown[] }
  | { type: "agents.sync"; agents?: unknown[] }
  | { type: "peeks.sync"; peeks?: RuntimePeeks }
  | { type: "conversation.sync"; conversation?: ChatMessage[] }
  | {
      type: string;
      session?: RuntimeSession;
      taskRelationships?: RuntimeTaskRelationship[];
      taskTimeline?: unknown[];
      artifacts?: unknown[];
      files?: RuntimeFile[];
      snapshots?: unknown[];
      agents?: unknown[];
      peeks?: RuntimePeeks;
      conversation?: ChatMessage[];
      [key: string]: unknown;
    };
