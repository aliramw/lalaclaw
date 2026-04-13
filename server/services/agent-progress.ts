export const AGENT_PROGRESS_STAGES = [
  "thinking",
  "inspecting",
  "executing",
  "synthesizing",
  "finishing",
] as const;

export type AgentProgressStage = (typeof AGENT_PROGRESS_STAGES)[number];

export type AgentProgressState = {
  stage: AgentProgressStage;
  label?: string;
  updatedAt: number;
};

const DEFAULT_AGENT_PROGRESS_STAGE: AgentProgressStage = "thinking";

function isAgentProgressStage(value: unknown): value is AgentProgressStage {
  return AGENT_PROGRESS_STAGES.includes(String(value || "").trim().toLowerCase() as AgentProgressStage);
}

export function coerceAgentProgressStage(
  value: unknown,
  fallback: AgentProgressStage = DEFAULT_AGENT_PROGRESS_STAGE,
): AgentProgressStage {
  const normalized = String(value || "").trim().toLowerCase();
  if (isAgentProgressStage(normalized)) {
    return normalized;
  }

  return isAgentProgressStage(fallback) ? fallback : DEFAULT_AGENT_PROGRESS_STAGE;
}

export function createAgentProgressState(
  value: Partial<Pick<AgentProgressState, "stage" | "label" | "updatedAt">> = {},
): AgentProgressState {
  const stage = coerceAgentProgressStage(value.stage);
  const label = String(value.label || "").trim();
  const updatedAt = Number(value.updatedAt || 0) || Date.now();

  return {
    stage,
    ...(label ? { label } : {}),
    updatedAt,
  };
}
