export const AGENT_PROGRESS_STAGES = [
  "thinking",
  "inspecting",
  "executing",
  "synthesizing",
  "finishing",
] as const;

export type AgentProgressStage = (typeof AGENT_PROGRESS_STAGES)[number];

export type AgentProgressState = {
  progressStage?: AgentProgressStage;
  progressLabel?: string;
  progressUpdatedAt?: number;
};

type AgentProgressInput = Partial<{
  stage: unknown;
  label: unknown;
  updatedAt: unknown;
  progressStage: unknown;
  progressLabel: unknown;
  progressUpdatedAt: unknown;
}>;

function isAgentProgressStage(value: unknown): value is AgentProgressStage {
  return AGENT_PROGRESS_STAGES.includes(String(value || "").trim().toLowerCase() as AgentProgressStage);
}

export function coerceAgentProgressStage(
  value: unknown,
  fallback: AgentProgressStage | "" = "",
): AgentProgressStage | "" {
  const normalized = String(value || "").trim().toLowerCase();
  if (isAgentProgressStage(normalized)) {
    return normalized;
  }

  return isAgentProgressStage(fallback) ? fallback : "";
}

export function createAgentProgressState(
  value: AgentProgressInput = {},
): AgentProgressState | Record<string, never> {
  const progressStage = coerceAgentProgressStage(value.progressStage ?? value.stage);
  const progressLabel = String(value.progressLabel ?? value.label ?? "").trim();
  const progressUpdatedAt = Number((value.progressUpdatedAt ?? value.updatedAt) || 0) || Date.now();

  if (!progressStage && !progressLabel) {
    return {};
  }

  return {
    ...(progressStage ? { progressStage } : {}),
    ...(progressLabel ? { progressLabel } : {}),
    progressUpdatedAt,
  };
}
