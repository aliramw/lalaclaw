const debugStorageKey = "cc-debug-events";
const maxDebugEvents = 400;
const maxSummaryMessages = 8;
const maxSummaryContentLength = 48;

type DebugEventPayload = Record<string, unknown>;

type DebugMessage = {
  content?: unknown;
  id?: unknown;
  pending?: boolean;
  role?: unknown;
  streaming?: boolean;
  timestamp?: unknown;
};

function canUseWindow() {
  return typeof window !== "undefined";
}

function readEnabledFlag() {
  if (!canUseWindow()) {
    return false;
  }

  try {
    return window.localStorage.getItem(debugStorageKey) === "1";
  } catch {
    return false;
  }
}

function getTarget() {
  if (!canUseWindow()) {
    return null;
  }

  if (!Array.isArray(window.__CC_DEBUG_EVENTS__)) {
    window.__CC_DEBUG_EVENTS__ = [];
  }

  return window.__CC_DEBUG_EVENTS__;
}

export function isCcDebugEventsEnabled() {
  return readEnabledFlag();
}

export function pushCcDebugEvent(type: string, payload: DebugEventPayload = {}) {
  if (!readEnabledFlag()) {
    return;
  }

  const target = getTarget();
  if (!target) {
    return;
  }

  target.push({
    at: Date.now(),
    type: String(type || "").trim() || "event",
    payload,
  });

  if (target.length > maxDebugEvents) {
    target.splice(0, target.length - maxDebugEvents);
  }
}

export function clearCcDebugEvents() {
  const target = getTarget();
  if (!target) {
    return;
  }

  target.length = 0;
}

export function summarizeCcMessages(messages: DebugMessage[] = [], limit = maxSummaryMessages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.slice(-limit).map((message, index, source) => ({
    i: messages.length - source.length + index,
    role: String(message?.role || ""),
    ...(message?.id ? { id: String(message.id) } : {}),
    ...(message?.pending ? { pending: true } : {}),
    ...(message?.streaming ? { streaming: true } : {}),
    ...(Number.isFinite(Number(message?.timestamp)) ? { timestamp: Number(message.timestamp) } : {}),
    content: String(message?.content || "").replace(/\s+/g, " ").trim().slice(0, maxSummaryContentLength),
  }));
}
