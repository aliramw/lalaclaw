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

type HermesProgressInput = {
  progressUpdatedAt?: unknown;
  stdout?: unknown;
};

type OpenClawDispatchProgressInput = {
  hasOutput?: boolean;
  progressUpdatedAt?: unknown;
};

type OpenClawStreamProgressInput = {
  hasStarted?: boolean;
  hasToolActivity?: boolean;
  hasVisibleDelta?: boolean;
  progressUpdatedAt?: unknown;
};

const HERMES_PROGRESS_STAGE_PATTERNS: Array<{
  stage: AgentProgressStage;
  patterns: RegExp[];
}> = [
  {
    stage: "thinking",
    patterns: [
      /^(?:思考中|正在思考|分析请求|准备中|等待中|处理中)[…。．.、\s]*$/i,
      /(?:思考中|正在思考|分析请求|准备中|等待中|处理中)/i,
    ],
  },
  {
    stage: "inspecting",
    patterns: [
      /检查.*(工作区|上下文|文件|目录|项目|环境|仓库)/i,
      /(?:查看|读取|浏览|扫描|分析).*(?:工作区|上下文|文件|目录|项目|环境|仓库)/i,
      /(?:查看|读取|浏览|扫描|分析)/i,
    ],
  },
  {
    stage: "executing",
    patterns: [
      /(?:执行|修改|写入|编辑|修复|应用|提交|测试|安装)/i,
      /运行(?:命令|脚本|任务|测试|安装|操作)/i,
    ],
  },
  {
    stage: "synthesizing",
    patterns: [
      /(?:整理|总结|汇总|归纳|收尾|生成|回复|输出|完成)/i,
    ],
  },
];

function isHermesNoiseLine(text = "") {
  const normalized = String(text || "").trim();
  return Boolean(normalized) && (
    /^session_id:\s*/i.test(normalized)
    || /^╭.*Hermes.*╮$/u.test(normalized)
    || /^↻\s+Resumed session\b/i.test(normalized)
    || /^[╭╮╰╯┌┐└┘│─\s]+$/u.test(normalized)
  );
}

function resolveHermesProgressStage(text = ""): AgentProgressStage | "" {
  const normalizedText = String(text || "").trim();
  if (!normalizedText || isHermesNoiseLine(normalizedText)) {
    return "";
  }

  for (const { stage, patterns } of HERMES_PROGRESS_STAGE_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalizedText))) {
      return stage;
    }
  }

  return "";
}

export function mapHermesProgressLine(line: unknown): AgentProgressState | Record<string, never> {
  const text = String(line || "").trim();
  if (!text || isHermesNoiseLine(text)) {
    return {};
  }

  const progressStage = resolveHermesProgressStage(text);
  if (!progressStage) {
    return {};
  }

  return createAgentProgressState({
    progressStage,
    progressLabel: text,
  });
}

export function inferHermesProgressState({
  stdout = "",
  progressUpdatedAt,
}: HermesProgressInput = {}): AgentProgressState | Record<string, never> {
  const lines = String(stdout || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  let latestProgress: AgentProgressState | Record<string, never> = {};

  for (const line of lines) {
    const nextProgress = mapHermesProgressLine(line);
    if (nextProgress.progressStage || nextProgress.progressLabel) {
      latestProgress = nextProgress;
    }
  }

  if (!latestProgress.progressStage && !latestProgress.progressLabel) {
    return {};
  }

  return createAgentProgressState({
    ...latestProgress,
    progressUpdatedAt: progressUpdatedAt ?? (latestProgress as AgentProgressState).progressUpdatedAt,
  });
}

export function inferOpenClawDispatchProgressState({
  hasOutput = false,
  progressUpdatedAt,
}: OpenClawDispatchProgressInput = {}): AgentProgressState | Record<string, never> {
  if (!hasOutput) {
    return {};
  }

  return createAgentProgressState({
    progressStage: "synthesizing",
    progressUpdatedAt,
  });
}

export function inferOpenClawStreamProgressState({
  hasStarted = false,
  hasToolActivity = false,
  hasVisibleDelta = false,
  progressUpdatedAt,
}: OpenClawStreamProgressInput = {}): AgentProgressState | Record<string, never> {
  if (hasToolActivity || hasVisibleDelta) {
    return createAgentProgressState({
      progressStage: "executing",
      progressUpdatedAt,
    });
  }

  if (hasStarted) {
    return createAgentProgressState({
      progressStage: "thinking",
      progressUpdatedAt,
    });
  }

  return {};
}
