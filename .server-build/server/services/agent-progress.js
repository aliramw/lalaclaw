"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_PROGRESS_STAGES = void 0;
exports.coerceAgentProgressStage = coerceAgentProgressStage;
exports.createAgentProgressState = createAgentProgressState;
exports.mapHermesProgressLine = mapHermesProgressLine;
exports.inferHermesProgressState = inferHermesProgressState;
exports.inferOpenClawDispatchProgressState = inferOpenClawDispatchProgressState;
exports.inferOpenClawStreamProgressState = inferOpenClawStreamProgressState;
exports.AGENT_PROGRESS_STAGES = [
    "thinking",
    "inspecting",
    "executing",
    "synthesizing",
    "finishing",
];
function isAgentProgressStage(value) {
    return exports.AGENT_PROGRESS_STAGES.includes(String(value || "").trim().toLowerCase());
}
function resolveAgentProgressStage(...values) {
    for (const value of values) {
        const normalized = coerceAgentProgressStage(value);
        if (normalized) {
            return normalized;
        }
    }
    return "";
}
function resolveAgentProgressLabel(...values) {
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
function resolveAgentProgressUpdatedAt(...values) {
    for (const value of values) {
        const normalized = Number(value || 0) || 0;
        if (normalized > 0) {
            return normalized;
        }
    }
    return Date.now();
}
function coerceAgentProgressStage(value, fallback = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (isAgentProgressStage(normalized)) {
        return normalized;
    }
    return isAgentProgressStage(fallback) ? fallback : "";
}
function createAgentProgressState(value = {}) {
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
const HERMES_PROGRESS_STAGE_PATTERNS = [
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
    return Boolean(normalized) && (/^session_id:\s*/i.test(normalized)
        || /^╭.*Hermes.*╮$/u.test(normalized)
        || /^↻\s+Resumed session\b/i.test(normalized)
        || /^[╭╮╰╯┌┐└┘│─\s]+$/u.test(normalized));
}
function resolveHermesProgressStage(text = "") {
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
function mapHermesProgressLine(line) {
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
function inferHermesProgressState({ stdout = "", progressUpdatedAt, } = {}) {
    const lines = String(stdout || "")
        .replace(/\r\n/g, "\n")
        .split("\n");
    let latestProgress = {};
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
        progressUpdatedAt: progressUpdatedAt ?? latestProgress.progressUpdatedAt,
    });
}
function inferOpenClawDispatchProgressState({ hasOutput = false, progressUpdatedAt, } = {}) {
    if (!hasOutput) {
        return {};
    }
    return createAgentProgressState({
        progressStage: "synthesizing",
        progressUpdatedAt,
    });
}
function inferOpenClawStreamProgressState({ hasStarted = false, hasToolActivity = false, hasVisibleDelta = false, progressUpdatedAt, } = {}) {
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
