import type { AgentProgressStage, AgentProgressState } from "@/types/chat";

export const agentProgressStages = [
  "thinking",
  "inspecting",
  "executing",
  "synthesizing",
  "finishing",
] as const satisfies readonly AgentProgressStage[];

const STALE_PROGRESS_STAGE_THRESHOLD_MS = 45_000;

type AgentProgressMessageDictionary = {
  chat?: {
    agentProgress?: Partial<Record<AgentProgressStage | "staleExecuting" | "staleSynthesizing", string>>;
    thinkingPlaceholder?: string;
  };
};

type AgentProgressLikeState = Partial<AgentProgressState> & {
  progressStage?: unknown;
  timestamp?: unknown;
};

export function coerceAgentProgressStage(
  value: unknown,
  fallback: AgentProgressStage | "" = "",
): AgentProgressStage | "" {
  const normalized = String(value || "").trim().toLowerCase();
  if ((agentProgressStages as readonly string[]).includes(normalized)) {
    return normalized as AgentProgressStage;
  }

  const normalizedFallback = String(fallback || "").trim().toLowerCase();
  if ((agentProgressStages as readonly string[]).includes(normalizedFallback)) {
    return normalizedFallback as AgentProgressStage;
  }

  return "";
}

function resolveProgressStage(progress: AgentProgressLikeState | null | undefined): AgentProgressStage | "" {
  return coerceAgentProgressStage(progress?.progressStage);
}

function resolveProgressLabel(progress: AgentProgressLikeState | null | undefined): string {
  return typeof progress?.progressLabel === "string"
    ? progress.progressLabel.trim()
    : "";
}

function resolveProgressUpdatedAt(progress: AgentProgressLikeState | null | undefined): number {
  return Number(progress?.progressUpdatedAt || progress?.timestamp || 0) || 0;
}

export function getAgentProgressStaleTransitionDelay(
  progress: AgentProgressLikeState | null | undefined,
  now = Date.now(),
) {
  const label = resolveProgressLabel(progress);
  if (label) {
    return null;
  }

  const stage = resolveProgressStage(progress);
  if (stage !== "executing" && stage !== "synthesizing") {
    return null;
  }

  const updatedAt = resolveProgressUpdatedAt(progress);
  if (!updatedAt) {
    return null;
  }

  const staleAt = updatedAt + STALE_PROGRESS_STAGE_THRESHOLD_MS;
  if (Number(now || 0) >= staleAt) {
    return null;
  }

  return Math.max(0, staleAt - Number(now || 0));
}

export function buildAgentProgressMessage(
  progress: AgentProgressLikeState | null | undefined,
  messages: AgentProgressMessageDictionary = {},
  now = Date.now(),
) {
  const stage = resolveProgressStage(progress);
  const label = resolveProgressLabel(progress);
  if (label) {
    return label;
  }

  const progressMessages = messages.chat?.agentProgress || {};
  const updatedAt = resolveProgressUpdatedAt(progress);
  const isStale = updatedAt > 0 && Number(now || 0) - updatedAt >= STALE_PROGRESS_STAGE_THRESHOLD_MS;
  const localizedKey =
    isStale && stage === "executing"
      ? "staleExecuting"
      : isStale && stage === "synthesizing"
        ? "staleSynthesizing"
        : stage;

  const stageMessage = stage ? progressMessages[stage] : "";
  const localizedMessage = localizedKey ? progressMessages[localizedKey] : "";
  return String(
    localizedMessage
    || stageMessage
    || messages.chat?.thinkingPlaceholder
    || "",
  ).trim();
}
