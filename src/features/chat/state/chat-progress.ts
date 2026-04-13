import type { AgentProgressStage, AgentProgressState } from "@/types/chat";

export const agentProgressStages = [
  "thinking",
  "inspecting",
  "executing",
  "synthesizing",
  "finishing",
] as const satisfies readonly AgentProgressStage[];

const DEFAULT_AGENT_PROGRESS_STAGE: AgentProgressStage = "thinking";
const STALE_PROGRESS_STAGE_THRESHOLD_MS = 45_000;

type AgentProgressMessageDictionary = {
  chat?: {
    agentProgress?: Partial<Record<AgentProgressStage | "staleExecuting" | "staleSynthesizing", string>>;
    thinkingPlaceholder?: string;
  };
};

type AgentProgressLikeState = Partial<AgentProgressState> & {
  progressLabel?: string;
  progressStage?: unknown;
  progressUpdatedAt?: number;
};

export function coerceAgentProgressStage(
  value: unknown,
  fallback: AgentProgressStage = DEFAULT_AGENT_PROGRESS_STAGE,
): AgentProgressStage {
  const normalized = String(value || "").trim().toLowerCase();
  if ((agentProgressStages as readonly string[]).includes(normalized)) {
    return normalized as AgentProgressStage;
  }

  const normalizedFallback = String(fallback || "").trim().toLowerCase();
  if ((agentProgressStages as readonly string[]).includes(normalizedFallback)) {
    return normalizedFallback as AgentProgressStage;
  }

  return DEFAULT_AGENT_PROGRESS_STAGE;
}

function resolveProgressStage(progress: AgentProgressLikeState | null | undefined): AgentProgressStage {
  return coerceAgentProgressStage(progress?.progressStage ?? progress?.stage);
}

function resolveProgressLabel(progress: AgentProgressLikeState | null | undefined): string {
  return String(progress?.progressLabel ?? progress?.label ?? "").trim();
}

function resolveProgressUpdatedAt(progress: AgentProgressLikeState | null | undefined): number {
  return Number(progress?.progressUpdatedAt ?? progress?.updatedAt ?? 0) || 0;
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

  return String(
    progressMessages[localizedKey]
    || progressMessages[stage]
    || messages.chat?.thinkingPlaceholder
    || "",
  ).trim();
}
