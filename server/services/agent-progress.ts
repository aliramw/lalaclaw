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
  labels: string[];
}> = [
  {
    stage: "thinking",
    labels: ["思考中", "正在思考", "分析请求", "准备中", "等待中", "处理中"],
  },
  {
    stage: "inspecting",
    labels: [
      "检查工作区",
      "检查上下文",
      "检查文件",
      "检查目录",
      "检查项目",
      "检查环境",
      "检查仓库",
      "查看相关文件",
      "查看工作区",
      "读取文件",
      "浏览文件",
      "扫描文件",
      "分析上下文",
      "分析工作区",
    ],
  },
  {
    stage: "executing",
    labels: [
      "执行命令",
      "执行操作",
      "运行命令",
      "运行脚本",
      "运行任务",
      "修改文件",
      "写入文件",
      "编辑文件",
      "修复问题",
      "应用修改",
      "提交更改",
      "测试中",
      "安装中",
    ],
  },
  {
    stage: "synthesizing",
    labels: [
      "整理结果",
      "总结结果",
      "汇总结果",
      "归纳结果",
      "收尾中",
      "生成回复",
      "组织回复",
    ],
  },
  {
    stage: "finishing",
    labels: [
      "写入回复",
      "正在收尾",
      "完成回复",
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

  const normalizedStem = normalizedText.replace(/(?:\s*(?:…|\.{3})\s*)$/u, "").trim();
  for (const { stage, labels } of HERMES_PROGRESS_STAGE_PATTERNS) {
    if (labels.some((label) => normalizedStem === label)) {
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

export function stripHermesProgressLines(stdout = "") {
  const lines = String(stdout || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const normalizedLines = lines.map((line) => ({
    line,
    trimmed: String(line || "").trim(),
    progress: mapHermesProgressLine(line),
  }));
  const contentIndexes = normalizedLines
    .map((entry, index) => (
      entry.trimmed && !isHermesNoiseLine(entry.trimmed)
        ? index
        : -1
    ))
    .filter((index) => index >= 0);

  if (!contentIndexes.length) {
    return lines.join("\n");
  }

  const leadingProgressIndexes: number[] = [];
  let replyStartIndex = -1;

  for (const index of contentIndexes) {
    const entry = normalizedLines[index];
    if (entry.progress.progressStage || entry.progress.progressLabel) {
      if (replyStartIndex >= 0) {
        break;
      }
      leadingProgressIndexes.push(index);
      continue;
    }

    replyStartIndex = index;
    break;
  }

  if (replyStartIndex < 0 || leadingProgressIndexes.length < 2) {
    return lines.join("\n");
  }

  return normalizedLines
    .filter((_entry, index) => !leadingProgressIndexes.includes(index))
    .map((entry) => entry.line)
    .join("\n");
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
