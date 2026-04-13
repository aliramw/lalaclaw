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

function resolveAgentProgressStage(...values: unknown[]): AgentProgressStage | "" {
  for (const value of values) {
    const normalized = coerceAgentProgressStage(value);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function resolveAgentProgressLabel(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function resolveAgentProgressUpdatedAt(...values: unknown[]): number {
  for (const value of values) {
    const normalized = Number(value || 0) || 0;
    if (normalized > 0) {
      return normalized;
    }
  }

  return Date.now();
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
  const progressStage = resolveAgentProgressStage(value.progressStage, value.stage);
  const progressLabel = resolveAgentProgressLabel(value.progressLabel, value.label);
  const progressUpdatedAt = resolveAgentProgressUpdatedAt(value.progressUpdatedAt, value.updatedAt);

  if (!progressStage && !progressLabel) {
    return {};
  }

  return {
    ...(progressStage ? { progressStage } : {}),
    ...(progressLabel ? { progressLabel } : {}),
    progressUpdatedAt,
  };
}
