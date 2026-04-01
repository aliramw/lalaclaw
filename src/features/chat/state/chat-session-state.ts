import type { ChatAttachment, ChatControllerEntry, ChatMessage, PendingChatTurn } from "@/types/chat";
import { normalizeStatusKey } from "@/features/session/status-display";

export type ChatConversationSource = "runtime" | "history" | "bootstrap";
export type ChatRunStatus = "idle" | "starting" | "streaming" | "aborting" | "failed";
export type ChatSyncTransport = "ws" | "polling" | "idle";

export type ToolStreamState = {
  active: boolean;
};

export type ChatConversationState = {
  messages: ChatMessage[];
  revision: number;
  source: ChatConversationSource;
};

export type ChatRunState = {
  status: ChatRunStatus;
  runId: string | null;
  userTurnId: string | null;
  streamText: string;
  toolStream: ToolStreamState;
  startedAt: number | null;
  lastDeltaAt: number | null;
  error: string | null;
};

export type ChatComposerState = {
  draft: string;
  attachments: ChatAttachment[];
  queue: ChatControllerEntry[];
};

export type ChatSyncState = {
  transport: ChatSyncTransport;
  recovering: boolean;
  hydrated: boolean;
  lastSnapshotAt: number | null;
  lastHistoryAt: number | null;
};

export type ChatSessionState = {
  conversation: ChatConversationState;
  run: ChatRunState;
  composer: ChatComposerState;
  sync: ChatSyncState;
};

type DeriveLegacyChatRunStateInput = {
  allowSessionStatusBusy?: boolean;
  conversationKey?: string;
  messages?: RunMessageLike[];
  pendingEntry?: PendingChatTurn | null;
  rawBusy?: boolean;
  sessionStatus?: string;
  tabId?: string;
  trustBusySignal?: boolean;
};

type RunMessageLike = {
  content?: unknown;
  pending?: boolean;
  role?: string;
  streaming?: boolean;
  timestamp?: number | string;
};

const emptyToolStreamState: ToolStreamState = {
  active: false,
};

function toPositiveNumber(value: unknown): number | null {
  const next = Number(value || 0);
  return Number.isFinite(next) && next > 0 ? next : null;
}

function getLatestUserTimestamp(messages: RunMessageLike[] = [], pendingEntry: PendingChatTurn | null = null) {
  const pendingUserTimestamp = toPositiveNumber(pendingEntry?.userMessage?.timestamp);
  let latestUserTimestamp = pendingUserTimestamp;

  messages.forEach((message) => {
    if (message?.role !== "user") {
      return;
    }

    const messageTimestamp = toPositiveNumber(message?.timestamp);
    if (!messageTimestamp) {
      return;
    }

    latestUserTimestamp = latestUserTimestamp ? Math.max(latestUserTimestamp, messageTimestamp) : messageTimestamp;
  });

  return latestUserTimestamp;
}

function findLatestAssistantProgressMessage(messages: RunMessageLike[] = [], pendingEntry: PendingChatTurn | null = null) {
  const latestUserTimestamp = getLatestUserTimestamp(messages, pendingEntry) || 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate?.role !== "assistant" || candidate?.pending) {
      continue;
    }

    const candidateTimestamp = toPositiveNumber(candidate?.timestamp) || 0;
    if (candidate?.streaming || candidateTimestamp >= latestUserTimestamp) {
      return candidate;
    }
  }

  return null;
}

function hasLocallySettledPendingAssistantProgress(
  assistantProgressMessage: RunMessageLike | null = null,
  pendingEntry: PendingChatTurn | null = null,
  rawBusy = false,
) {
  return Boolean(
    pendingEntry?.suppressPendingPlaceholder
    && !pendingEntry?.stopped
    && !rawBusy
    && assistantProgressMessage
    && !assistantProgressMessage?.pending
    && !assistantProgressMessage?.streaming
    && String(assistantProgressMessage?.content || "").trim()
  );
}

export function createEmptyChatConversationState(): ChatConversationState {
  return {
    messages: [],
    revision: 0,
    source: "bootstrap",
  };
}

export function createEmptyChatRunState(): ChatRunState {
  return {
    status: "idle",
    runId: null,
    userTurnId: null,
    streamText: "",
    toolStream: { ...emptyToolStreamState },
    startedAt: null,
    lastDeltaAt: null,
    error: null,
  };
}

export function createEmptyChatComposerState(): ChatComposerState {
  return {
    draft: "",
    attachments: [],
    queue: [],
  };
}

export function createEmptyChatSyncState(): ChatSyncState {
  return {
    transport: "idle",
    recovering: false,
    hydrated: false,
    lastSnapshotAt: null,
    lastHistoryAt: null,
  };
}

export function createEmptyChatSessionState(): ChatSessionState {
  return {
    conversation: createEmptyChatConversationState(),
    run: createEmptyChatRunState(),
    composer: createEmptyChatComposerState(),
    sync: createEmptyChatSyncState(),
  };
}

export function selectChatRunBusy(run: Partial<ChatRunState> | null | undefined) {
  const status = String(run?.status || "idle");
  return status === "starting" || status === "streaming" || status === "aborting";
}

export function getConversationRevision(messages: ChatMessage[] = []) {
  const latestTimestamp = messages.reduce((maxTimestamp, message) => {
    const nextTimestamp = toPositiveNumber(message?.timestamp) || 0;
    return Math.max(maxTimestamp, nextTimestamp);
  }, 0);

  return latestTimestamp || messages.length;
}

export function normalizeChatSyncTransport(value: unknown): ChatSyncTransport {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "ws") {
    return "ws";
  }
  if (normalized === "polling") {
    return "polling";
  }
  return "idle";
}

export function deriveLegacyChatRunState({
  allowSessionStatusBusy = false,
  conversationKey = "",
  messages = [],
  pendingEntry = null,
  rawBusy = false,
  sessionStatus = "",
  tabId = "",
  trustBusySignal = false,
}: DeriveLegacyChatRunStateInput = {}): ChatRunState {
  const normalizedStatus = normalizeStatusKey(sessionStatus);
  const assistantProgressMessage = findLatestAssistantProgressMessage(messages, pendingEntry);
  const startedAt =
    toPositiveNumber(pendingEntry?.startedAt)
    || getLatestUserTimestamp(messages, pendingEntry);
  const streamText = String(pendingEntry?.streamText || assistantProgressMessage?.content || "").trim();
  const lastDeltaAt =
    toPositiveNumber(pendingEntry?.lastDeltaAt)
    || toPositiveNumber(assistantProgressMessage?.timestamp)
    || toPositiveNumber(pendingEntry?.pendingTimestamp)
    || null;
  const hasTrackedPendingTurn = Boolean(pendingEntry && !pendingEntry?.stopped);
  const hasBusyRuntimeStatus = allowSessionStatusBusy && (normalizedStatus === "running" || normalizedStatus === "dispatching");
  const hasLocallySettledPendingAssistant = hasLocallySettledPendingAssistantProgress(
    assistantProgressMessage,
    pendingEntry,
    rawBusy,
  );

  let status: ChatRunStatus = "idle";

  if (normalizedStatus === "failed") {
    status = "failed";
  } else if (pendingEntry?.stopped && (rawBusy || hasBusyRuntimeStatus || trustBusySignal)) {
    status = "aborting";
  } else if (hasLocallySettledPendingAssistant) {
    status = "idle";
  } else if (hasTrackedPendingTurn) {
    status = streamText ? "streaming" : "starting";
  } else if (hasBusyRuntimeStatus) {
    status = streamText ? "streaming" : "starting";
  } else if (trustBusySignal && assistantProgressMessage?.streaming) {
    status = "streaming";
  } else if (trustBusySignal && rawBusy) {
    status = streamText ? "streaming" : "starting";
  }

  const runIsBusy = selectChatRunBusy({ status });
  const runId = runIsBusy
    ? String(conversationKey || pendingEntry?.assistantMessageId || pendingEntry?.key || tabId || "").trim() || null
    : null;

  return {
    status,
    runId,
    userTurnId: String(pendingEntry?.userMessage?.id || "").trim() || null,
    streamText: runIsBusy ? streamText : "",
    toolStream: { ...emptyToolStreamState },
    startedAt: runIsBusy ? startedAt : null,
    lastDeltaAt: runIsBusy ? lastDeltaAt : null,
    error: status === "failed" ? String(sessionStatus || "").trim() || null : null,
  };
}
