import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, Eye, FileText, FolderOpen, Hammer, Monitor, Pencil, RotateCcw, ScrollText, SquareArrowOutUpRight, X } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyTextToClipboard } from "@/components/command-center/clipboard-utils";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { getLocalizedStatusLabel, getRelationshipStatusBadgeProps, localizeStatusSummary, normalizeStatusKey } from "@/features/session/status-display";
import { buildOpenClawConfigFormValues, buildOpenClawRemoteGuard, useOpenClawInspector } from "@/features/app/controllers/use-openclaw-inspector";
import { apiFetch } from "@/lib/api-client";
import { Prism, usePrismLanguage } from "@/lib/prism-languages";
import { cn, isApplePlatform, stripMarkdownForDisplay } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const LazyFilePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.FilePreviewOverlay })),
);
const LazyImagePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.ImagePreviewOverlay })),
);
const LazyContextPreviewDialog = lazy(() =>
  import("@/components/command-center/context-preview-dialog").then((module) => ({ default: module.ContextPreviewDialog })),
);

const homePrefix = "/Users/marila";
const darkToolIoTheme = themes.dracula;
const lightToolIoTheme = themes.vsLight;
const inspectorTabKeys = ["files", "artifacts", "timeline", "environment"];
const WORKSPACE_FILTER_DEBOUNCE_MS = 150;
const contextMenuViewportPadding = 8;
const OPENCLAW_DIAGNOSTIC_PREFIX = "openclaw.";
const openClawDiagnosticFieldsBySection = {
  overview: [
    "openclaw.version",
    "openclaw.runtime.profile",
    "openclaw.config.path",
    "openclaw.config.status",
    "openclaw.workspace.root",
    "openclaw.workspace.status",
  ],
  connectivity: [
    "openclaw.gateway.status",
    "openclaw.gateway.baseUrl",
    "openclaw.gateway.healthUrl",
  ],
  doctor: [
    "openclaw.doctor.summary",
    "openclaw.doctor.config",
    "openclaw.doctor.workspace",
    "openclaw.doctor.gateway",
    "openclaw.doctor.logs",
  ],
  logs: [
    "openclaw.logs.dir",
    "openclaw.logs.gatewayPath",
    "openclaw.logs.supervisorPath",
  ],
  remote: [
    "openclaw.remote.target",
    "openclaw.remote.writeAccess",
    "openclaw.remote.auditCount",
    "openclaw.remote.lastAction",
    "openclaw.remote.lastOutcome",
    "openclaw.remote.lastRollback",
  ],
};
const environmentItemGroups = [
  { key: "session", prefixes: ["session."] },
  { key: "sync", prefixes: ["runtime.", "runtimeHub."] },
  { key: "gatewayConfig", prefixes: ["gateway.", "gateway.config."] },
  { key: "application", prefixes: ["LALACLAW."] },
];
const redundantEnvironmentLabels = new Set([
  "OPENCLAW.VERSION",
  "session.mode",
  "session.workspaceRoot",
  "gateway.baseUrl",
]);
const previewableExtensions = new Set([
  "txt", "text", "log", "md", "markdown", "json", "csv", "xls", "xlsx", "xlsm", "pdf", "doc", "docx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "heif",
  "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts",
  "lua", "m", "mm", "scala", "dart", "ex", "exs", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "html", "xml", "yml", "yaml", "toml", "ini", "conf", "env",
]);
const editableExtensions = new Set([
  "txt", "text", "log", "md", "markdown", "json",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts",
  "lua", "m", "mm", "scala", "dart", "ex", "exs", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "html", "xml", "yml", "yaml", "toml", "ini", "conf", "env",
]);
const OFFICIAL_OPENCLAW_DOC_URLS = {
  install: "https://docs.openclaw.ai/install",
  update: "https://docs.openclaw.ai/updating",
  doctor: "https://docs.openclaw.ai/doctor",
  troubleshooting: "https://openclawlab.com/en/docs/gateway/troubleshooting/",
};

function getItemKey(item, index) {
  if (item?.id) {
    return String(item.id);
  }

  if (item?.path) {
    return String(item.path);
  }

  const keyParts = [
    item?.type,
    item?.title,
    item?.label,
    item?.messageTimestamp,
    item?.timestamp,
    item?.detail,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return keyParts.length ? keyParts.join("::") : `${item?.label || "item"}-${index}`;
}

function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }
  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

function isAbsoluteFileSystemPath(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized);
}

function formatDisplayPath(item, currentWorkspaceRoot = "") {
  const sourcePath = String(item.fullPath || item.path || "");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\/+$/, "");
  if (!sourcePath) {
    return "";
  }
  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return relativePath || sourcePath.split("/").pop() || "";
  }
  return compactHomePath(sourcePath);
}

function compareFileItemsByPath(left, right, currentWorkspaceRoot = "") {
  return formatDisplayPath(left, currentWorkspaceRoot).localeCompare(
    formatDisplayPath(right, currentWorkspaceRoot),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

function resolveItemPath(item) {
  return String(item?.fullPath || item?.path || "").trim();
}

function canPreviewFileItem(item) {
  if (!item || item.kind === "目录") {
    return false;
  }

  const targetPath = resolveItemPath(item).toLowerCase();
  if (!targetPath) {
    return false;
  }

  const fileName = targetPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && previewableExtensions.has(extension);
}

function canEditFileItem(item) {
  if (!item || item.kind === "目录") {
    return false;
  }

  const targetPath = resolveItemPath(item).toLowerCase();
  if (!targetPath) {
    return false;
  }

  const fileName = targetPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && editableExtensions.has(extension);
}

function getVsCodeHref(filePath = "") {
  if (!filePath) {
    return "";
  }
  return `vscode://file/${encodeURIComponent(filePath)}`;
}

function resolveFileManagerLocaleLabel(messages) {
  return isApplePlatform()
    ? messages.inspector.previewActions.fileManagers.finder
    : messages.inspector.previewActions.fileManagers.explorer;
}

function countWorkspaceFiles(nodes = []) {
  return nodes.reduce((total, node) => {
    if (node.kind === "目录") {
      return total + countWorkspaceFiles(node.children || []);
    }
    return total + 1;
  }, 0);
}

function escapeRegexCharacters(value = "") {
  return String(value || "").replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function buildFileFilterMatcher(rawFilter = "") {
  const filters = String(rawFilter || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!filters.length) {
    return null;
  }

  const compiledFilters = filters.map((filter) => {
    if (filter.includes("*") || filter.includes("?")) {
      const expression = `^${escapeRegexCharacters(filter).replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`;
      return { type: "glob", regex: new RegExp(expression, "i") };
    }

    return { type: "text", value: filter.toLocaleLowerCase() };
  });

  return (item, currentWorkspaceRoot = "") => {
    const resolvedPath = resolveItemPath(item).replace(/\\/g, "/");
    const displayPath = String(formatDisplayPath(item, currentWorkspaceRoot) || item?.path || "").replace(/\\/g, "/").replace(/^~\//, "");
    const fileName = displayPath.split("/").filter(Boolean).pop() || resolvedPath.split("/").filter(Boolean).pop() || "";
    const candidates = [fileName, displayPath].filter(Boolean);

    return compiledFilters.some((filter) => {
      if (filter.type === "glob") {
        return candidates.some((candidate) => filter.regex.test(candidate));
      }
      return candidates.some((candidate) => candidate.toLocaleLowerCase().includes(filter.value));
    });
  };
}

async function requestWorkspaceTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  filter = "",
  targetPath = "",
}) {
  const params = new URLSearchParams();
  if (currentSessionUser) {
    params.set("sessionUser", currentSessionUser);
  }
  if (currentAgentId) {
    params.set("agentId", currentAgentId);
  }
  if (targetPath) {
    params.set("path", targetPath);
  }
  if (filter && !targetPath) {
    params.set("filter", filter);
  }

  const response = await apiFetch(`/api/workspace-tree?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Workspace tree failed");
  }
  return normalizeWorkspaceNodes(payload.items || [], currentWorkspaceRoot);
}

function localizeArtifactTitle(title = "", messages) {
  const value = String(title || "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/^(回复|reply)\s*/i, `${messages.inspector.artifactReplyPrefix} `).trim();
}

function isOpenClawDiagnosticItem(item) {
  return String(item?.label || "").startsWith(OPENCLAW_DIAGNOSTIC_PREFIX);
}

function localizeOpenClawDiagnosticLabel(label = "", messages) {
  return messages.inspector.openClawDiagnostics.fields?.[label] || label;
}

function localizeOpenClawDiagnosticValue(value = "", messages) {
  return messages.inspector.openClawDiagnostics.values?.[value] || String(value || "");
}

function localizeEnvironmentItemLabel(label = "", messages) {
  return messages.inspector.environmentFields?.[label] || label;
}

function localizeEnvironmentItemValue(value = "", messages) {
  return messages.inspector.environmentValues?.[value] || String(value || "");
}

function getOpenClawDiagnosticBadgeProps(value = "") {
  switch (String(value || "").trim()) {
    case "ok":
    case "healthy":
      return { variant: "success", className: "" };
    case "openclaw":
      return { variant: "active", className: "" };
    case "mock":
      return { variant: "secondary", className: "" };
    case "missing":
    case "unreachable":
    case "attention":
      return { variant: "default", className: "" };
    default:
      return { variant: "outline", className: "" };
  }
}

function shouldRenderOpenClawDiagnosticBadge(label = "") {
  return label === "openclaw.runtime.profile"
    || label.endsWith(".status")
    || label.startsWith("openclaw.doctor.");
}

function collectOpenClawDiagnostics(items = []) {
  const diagnosticEntries = new Map(
    items
      .filter((item) => isOpenClawDiagnosticItem(item))
      .map((item) => [String(item.label), item]),
  );

  const sections = Object.entries(openClawDiagnosticFieldsBySection)
    .map(([sectionKey, labels]) => ({
      key: sectionKey,
      items: labels
        .map((label) => diagnosticEntries.get(label))
        .filter((item) => item?.value),
    }))
    .filter((section) => section.items.length);

  return {
    sections,
    remainingItems: items.filter((item) => !isOpenClawDiagnosticItem(item) && !redundantEnvironmentLabels.has(String(item?.label || ""))),
  };
}

function getEnvironmentGroupKey(label = "") {
  const normalizedLabel = String(label || "");
  for (const group of environmentItemGroups) {
    if (group.prefixes.some((prefix) => normalizedLabel.startsWith(prefix))) {
      return group.key;
    }
  }
  return "other";
}

function collectEnvironmentGroups(items = [], messages) {
  const groupedItems = new Map();
  items.forEach((item) => {
    const groupKey = getEnvironmentGroupKey(item?.label);
    if (!groupedItems.has(groupKey)) {
      groupedItems.set(groupKey, []);
    }
    groupedItems.get(groupKey).push(item);
  });

  const orderedGroupKeys = [
    ...environmentItemGroups.map((group) => group.key),
    "other",
  ];

  return orderedGroupKeys
    .filter((key) => groupedItems.has(key))
    .map((key) => ({
      key,
      label: messages.inspector.environmentGroups?.[key] || key,
      items: groupedItems.get(key) || [],
    }));
}

function isLalaClawEnvironmentItem(item) {
  return String(item?.label || "").startsWith("LALACLAW.");
}

function shouldRenderEnvironmentPathLink(item) {
  return Boolean(item?.previewable || item?.revealable);
}

function buildEnvironmentPathItem(item) {
  const normalizedValue = String(item?.value || "").trim();
  const isDirectory = Boolean(item?.revealable);
  return {
    path: normalizedValue,
    fullPath: normalizedValue,
    kind: isDirectory ? "目录" : "文件",
  };
}

function getOpenClawManagementActions(messages) {
  return [
    {
      key: "status",
      label: messages.inspector.openClawManagement.actions.status,
      confirm: false,
    },
    {
      key: "start",
      label: messages.inspector.openClawManagement.actions.start,
      confirm: true,
    },
    {
      key: "stop",
      label: messages.inspector.openClawManagement.actions.stop,
      confirm: true,
    },
    {
      key: "restart",
      label: messages.inspector.openClawManagement.actions.restart,
      confirm: true,
    },
    {
      key: "doctorRepair",
      label: messages.inspector.openClawManagement.actions.doctorRepair,
      confirm: true,
    },
  ];
}

function getOpenClawManagementOutcome(result = {}) {
  const healthStatus = String(result?.healthCheck?.status || "").trim();
  if (result?.commandResult?.ok && healthStatus && healthStatus !== "healthy") {
    return "warning";
  }
  if (result?.ok) {
    return "success";
  }
  if (result?.commandResult?.ok) {
    return "warning";
  }
  return "error";
}

function getOpenClawManagementOutcomeBadgeProps(outcome = "") {
  switch (outcome) {
    case "success":
      return { variant: "success", className: "" };
    case "warning":
      return { variant: "secondary", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}

function getOpenClawConfigFieldMeta(messages, state = null) {
  const currentAgentId = String(state?.currentAgentId || "").trim();

  return [
    {
      key: "modelPrimary",
      type: "string",
      restartRequired: false,
      label: messages.inspector.openClawConfig.fields.modelPrimary.label,
      description: messages.inspector.openClawConfig.fields.modelPrimary.description,
    },
    ...(currentAgentId
      ? [{
          key: "agentModel",
          type: "string",
          restartRequired: false,
          label: messages.inspector.openClawConfig.fields.agentModel.label(currentAgentId),
          description: messages.inspector.openClawConfig.fields.agentModel.description(currentAgentId),
        }]
      : []),
    {
      key: "gatewayBind",
      type: "enum",
      restartRequired: true,
      options: ["loopback", "tailnet", "lan", "auto", "custom"].map((value) => ({
        value,
        label: messages.inspector.openClawConfig.fields.gatewayBind.options?.[value] || value,
      })),
      label: messages.inspector.openClawConfig.fields.gatewayBind.label,
      description: messages.inspector.openClawConfig.fields.gatewayBind.description,
    },
    {
      key: "chatCompletionsEnabled",
      type: "boolean",
      restartRequired: true,
      label: messages.inspector.openClawConfig.fields.chatCompletionsEnabled.label,
      description: messages.inspector.openClawConfig.fields.chatCompletionsEnabled.description,
    },
  ];
}

function getOpenClawConfigFieldValueLabel(fieldKey = "", value, messages) {
  if (typeof value === "boolean") {
    return value ? messages.inspector.openClawConfig.boolean.on : messages.inspector.openClawConfig.boolean.off;
  }

  if (value === null || typeof value === "undefined" || String(value).trim() === "") {
    return messages.inspector.openClawConfig.emptyValue;
  }

  if (fieldKey === "gatewayBind") {
    return messages.inspector.openClawConfig.fields.gatewayBind.options?.[value] || String(value);
  }

  return String(value);
}

function getOpenClawConfigOutcome(result = {}) {
  if (result?.ok) {
    return "success";
  }
  if (result?.rolledBack || result?.validation?.ok === false) {
    return "error";
  }
  return "warning";
}

function getOpenClawConfigOutcomeBadgeProps(outcome = "") {
  switch (outcome) {
    case "success":
      return { variant: "success", className: "" };
    case "warning":
      return { variant: "secondary", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}

function getOpenClawUpdateOutcome(result = {}) {
  const healthStatus = String(result?.healthCheck?.status || "").trim();
  if (result?.ok) {
    return "success";
  }
  if (result?.commandResult?.ok && healthStatus && healthStatus !== "healthy") {
    return "warning";
  }
  if (result?.commandResult?.ok) {
    return "warning";
  }
  return "error";
}

function getOpenClawUpdateOutcomeBadgeProps(outcome = "") {
  switch (outcome) {
    case "success":
      return { variant: "success", className: "" };
    case "warning":
      return { variant: "secondary", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}

function getOpenClawOnboardingAuthOptions(messages, state = null) {
  const supportedChoices = Array.isArray(state?.supportedAuthChoices) && state.supportedAuthChoices.length
    ? state.supportedAuthChoices
    : Object.keys(messages.inspector.openClawOnboarding.fields.authChoice.options || {});
  return supportedChoices.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.authChoice.options?.[value] || value,
  }));
}

function getOpenClawOnboardingSecretModeOptions(messages, state = null) {
  const supportedModes = Array.isArray(state?.supportedSecretInputModes) && state.supportedSecretInputModes.length
    ? state.supportedSecretInputModes
    : ["plaintext", "ref"];
  return supportedModes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.secretInputMode.options?.[value] || value,
  }));
}

function getOpenClawOnboardingFlowOptions(messages, state = null) {
  const supportedFlows = Array.isArray(state?.supportedFlows) && state.supportedFlows.length
    ? state.supportedFlows
    : ["quickstart", "advanced", "manual"];
  return supportedFlows.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.flow.options?.[value] || value,
  }));
}

function getOpenClawOnboardingDaemonRuntimeOptions(messages, state = null) {
  const supportedRuntimes = Array.isArray(state?.supportedDaemonRuntimes) && state.supportedDaemonRuntimes.length
    ? state.supportedDaemonRuntimes
    : ["node", "bun"];
  return supportedRuntimes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.daemonRuntime.options?.[value] || value,
  }));
}

function getOpenClawOnboardingGatewayAuthOptions(messages, state = null) {
  const supportedModes = Array.isArray(state?.supportedGatewayAuthModes) && state.supportedGatewayAuthModes.length
    ? state.supportedGatewayAuthModes
    : ["off", "token", "password"];
  return supportedModes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.gatewayAuth.options?.[value] || value,
  }));
}

function getOpenClawOnboardingGatewayTokenModeOptions(messages, state = null) {
  const supportedModes = Array.isArray(state?.supportedGatewayTokenInputModes) && state.supportedGatewayTokenInputModes.length
    ? state.supportedGatewayTokenInputModes
    : ["plaintext", "ref"];
  return supportedModes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.options?.[value] || value,
  }));
}

function getOpenClawOnboardingOptionLabels(values = [], options = []) {
  const labelMap = new Map(options.map((option) => [option.value, option.label]));
  return values
    .map((value) => labelMap.get(value) || value)
    .filter(Boolean);
}

function getOpenClawCapabilityDetectionText(messages, detection = null) {
  const source = String(detection?.source || '').trim();
  const reason = String(detection?.reason || '').trim();
  const detectedAt = String(detection?.detectedAt || '').trim();
  const signature = String(detection?.signature || '').trim();
  const sourceLabel = messages.inspector.openClawOnboarding.capabilities.sources?.[source]
    || messages.inspector.openClawOnboarding.capabilities.sources?.["static-fallback"]
    || source;
  const reasonLabel = messages.inspector.openClawOnboarding.capabilities.reasons?.[reason] || "";
  return {
    detectedAt,
    signature,
    sourceLabel,
    reasonLabel,
  };
}

function OpenClawOnboardingSelectField({
  ariaLabel = "",
  busy = false,
  description = "",
  disabled = false,
  fixedHint = "",
  label = "",
  onChange,
  options = [],
  value = "",
}) {
  const normalizedOptions = Array.isArray(options) ? options.filter((option) => option && option.value) : [];
  const isFixed = normalizedOptions.length <= 1;
  const resolvedLabel = normalizedOptions.find((option) => option.value === value)?.label || normalizedOptions[0]?.label || value || "";

  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="text-[12px] leading-5 text-muted-foreground">{description}</div>
      {isFixed ? (
        <div className="mt-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
          <div className="text-sm text-foreground">{resolvedLabel}</div>
          {fixedHint ? (
            <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{fixedHint}</div>
          ) : null}
        </div>
      ) : (
        <div className="relative mt-3">
          <select
            aria-label={ariaLabel || label}
            className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
            disabled={disabled || busy}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
          >
            {normalizedOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      )}
    </div>
  );
}

const OPENCLAW_MANAGED_AUTH_CHOICES = new Set([
  "github-copilot",
  "google-gemini-cli",
]);

function normalizeOpenClawUpdateIssueKey(value = "") {
  return String(value || "").trim();
}

function buildOpenClawUpdateTroubleshootingEntries(result = null, messages) {
  const issueKeys = [];
  const errorCode = normalizeOpenClawUpdateIssueKey(result?.errorCode);
  const commandResult = result?.commandResult || {};
  const diagnosticText = [
    commandResult?.stderr,
    commandResult?.stdout,
    commandResult?.error,
    result?.error,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join("\n");

  if (errorCode === "install_platform_unsupported") {
    issueKeys.push("platformUnsupported");
  }
  if (errorCode === "openclaw_already_installed") {
    issueKeys.push("alreadyInstalled");
  }
  if (errorCode === "update_status_failed") {
    issueKeys.push("inspectStateFailed");
  }
  if (errorCode === "openclaw_not_installed") {
    issueKeys.push("manualInstall");
  }

  if (commandResult?.timedOut) {
    issueKeys.push("commandTimedOut");
  }
  if (/permission denied|operation not permitted|eacces|eperm/.test(diagnosticText)) {
    issueKeys.push("permissionFailure");
  }
  if (/could not resolve host|temporary failure|network is unreachable|connection reset|tls|certificate|proxy|econnreset|enetunreach|socket hang up/.test(diagnosticText)) {
    issueKeys.push("networkFailure");
  }
  if (
    commandResult?.systemErrorCode === "ENOENT"
    || /curl: command not found|bash: command not found|env: bash: no such file|env: curl: no such file|command not found/.test(diagnosticText)
  ) {
    issueKeys.push("missingShellTools");
  }
  if (/npm err!|pnpm|yarn|corepack/.test(diagnosticText)) {
    issueKeys.push("packageManagerFailure");
  }
  if (result?.healthCheck?.status === "unhealthy" || result?.healthCheck?.status === "unreachable") {
    issueKeys.push("gatewayRecovery");
  }
  if (!result?.ok && result?.action === "install") {
    issueKeys.push("installFailed");
  }
  if (!result?.ok && result?.action === "update") {
    issueKeys.push("updateFailed");
  }
  if (!issueKeys.length && result && !result.ok) {
    issueKeys.push("genericFailure");
  }

  const uniqueIssueKeys = [...new Set(issueKeys.map(normalizeOpenClawUpdateIssueKey).filter(Boolean))];
  return uniqueIssueKeys.map((issueKey) => {
    const issue = messages.inspector.openClawUpdate.guidance?.issues?.[issueKey];
    if (!issue) {
      return null;
    }

    const docs = (issue.docs || []).map((docKey) => ({
      key: docKey,
      href: OFFICIAL_OPENCLAW_DOC_URLS[docKey] || OFFICIAL_OPENCLAW_DOC_URLS.install,
      label: messages.inspector.openClawUpdate.guidance?.docs?.[docKey] || docKey,
    }));

    return {
      key: issueKey,
      title: issue.title,
      summary: issue.summary,
      steps: Array.isArray(issue.steps) ? issue.steps : [],
      commands: Array.isArray(issue.commands) ? issue.commands : [],
      docs,
      canPreview: Boolean((issue.steps || []).length || (issue.commands || []).length),
    };
  }).filter(Boolean);
}

function OpenClawRemoteNotice({ messages, onOpenGuide, remoteGuard = null }) {
  if (!remoteGuard?.blocked) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/6 px-3 py-2.5">
      <div className="text-[12px] font-medium text-foreground">{messages.inspector.remoteOperations.blockedTitle}</div>
      <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{messages.inspector.remoteOperations.blockedDescription}</div>
      <div className="mt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-2.5 text-[11px]"
          onClick={() => onOpenGuide?.()}
        >
          <ScrollText className="mr-1 h-3.5 w-3.5" />
          {messages.inspector.remoteOperations.openGuide}
        </Button>
      </div>
    </div>
  );
}

function getLalaClawUpdateBadgeVariant(state = null) {
  const status = String(state?.job?.status || "").trim();
  if (status === "failed") {
    return "default";
  }
  if (status === "completed" || (!state?.updateAvailable && state?.check?.ok)) {
    return "success";
  }
  return "secondary";
}

function LalaClawPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  metadataItems = [],
  onReload,
  onRunUpdate,
  showTitle = true,
  state = null,
}) {
  const metadata = metadataItems.filter((item) => item?.value);
  const badgeVariant = getLalaClawUpdateBadgeVariant(state);
  const currentVersion = state?.currentRelease?.version || state?.currentVersion || messages.inspector.lalaclawUpdate.emptyValue;
  const targetVersion = state?.targetRelease?.version || "";
  const currentStable = Boolean(state?.currentRelease?.stable);
  const targetStable = Boolean(state?.targetRelease?.stable);
  const updateAvailable = Boolean(state?.updateAvailable);
  const jobActive = Boolean(state?.job?.active);
  const capabilitySupported = state?.capability?.updateSupported !== false;
  const panelError = error || (state?.job?.status === "failed" ? state?.job?.error : "") || (!state?.check?.ok ? state?.check?.error : "");
  const shouldShowRunAction = Boolean(updateAvailable) && capabilitySupported && !jobActive;
  const statusLabel = jobActive
    ? messages.inspector.lalaclawUpdate.statuses.updating
    : updateAvailable
      ? messages.inspector.lalaclawUpdate.statuses.updateAvailable
      : messages.inspector.lalaclawUpdate.statuses.upToDate;

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.lalaclawUpdate.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.lalaclawUpdate.description}
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.lalaclawUpdate.labels.currentVersion}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                  <span>{currentVersion}</span>
                  {currentStable ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[10px] leading-5">
                      {messages.inspector.lalaclawUpdate.stableBadge}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {updateAvailable ? (
                <div className="flex flex-wrap items-center justify-end gap-2 text-[12px] leading-5">
                  <span className="font-medium text-foreground">
                    {statusLabel}
                  </span>
                  {shouldShowRunAction ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={loading || busy}
                      className="cc-send-button h-7 rounded-full px-2.5 text-[12px] shadow-none"
                      onClick={() => onRunUpdate?.()}
                    >
                      {busy ? messages.inspector.lalaclawUpdate.running : messages.inspector.lalaclawUpdate.runUpdate}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Badge variant={badgeVariant} className="px-2 py-0.5 text-[11px] leading-5">
                  {statusLabel}
                </Badge>
              )}
            </div>
            {targetVersion ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.lalaclawUpdate.labels.targetVersion}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-medium text-foreground">
                  <span>{targetVersion}</span>
                  {targetStable ? (
                    <Badge variant="secondary" className="px-2 py-0.5 text-[10px] leading-5">
                      {messages.inspector.lalaclawUpdate.stableBadge}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
            {metadata.length ? (
              <div className="mt-3 grid gap-2 text-[12px] leading-5 text-foreground">
                {metadata.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="grid gap-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {localizeEnvironmentItemLabel(item.label, messages)}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {localizeEnvironmentItemValue(item.value, messages)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {state?.capability?.reason ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.lalaclawUpdate.errors[state.capability.reason] || messages.inspector.lalaclawUpdate.errors.requestFailed}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading || busy}
              aria-label={messages.inspector.lalaclawUpdate.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.lalaclawUpdate.reloading : messages.inspector.lalaclawUpdate.reload}
            </Button>
          </div>
          {panelError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {panelError}
            </div>
          ) : null}
          {state?.job?.status === "failed" && state?.job?.commandResult?.stderr ? (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {messages.inspector.lalaclawUpdate.labels.stderr}
              </div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{state.job.commandResult.stderr}</pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawManagementPanel({
  actionIntent,
  busyActionKey = "",
  messages,
  onOpenRemoteGuide,
  onRefresh,
  onRequestAction,
  refreshing = false,
  remoteGuard = null,
  result = null,
  showTitle = true,
}) {
  const actions = getOpenClawManagementActions(messages);
  const outcome = getOpenClawManagementOutcome(result);
  const outcomeBadge = getOpenClawManagementOutcomeBadgeProps(outcome);
  const activeActionLabel = actions.find((action) => action.key === busyActionKey)?.label || "";

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawManagement.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawManagement.description}
          </div>
          <OpenClawRemoteNotice messages={messages} onOpenGuide={onOpenRemoteGuide} remoteGuard={remoteGuard} />
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const pending = busyActionKey === action.key;
              return (
                <Button
                  key={action.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(busyActionKey) || remoteGuard?.blocked}
                  aria-label={action.label}
                  className="h-8 rounded-full px-3"
                  onClick={() => onRequestAction(action)}
                >
                  {pending ? messages.inspector.openClawManagement.running(activeActionLabel || action.label) : action.label}
                </Button>
              );
            })}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={Boolean(busyActionKey) || refreshing}
              aria-label={messages.inspector.openClawManagement.refresh}
              className="h-8 rounded-full px-3"
              onClick={() => onRefresh?.()}
            >
              {refreshing ? messages.inspector.openClawManagement.refreshing : messages.inspector.openClawManagement.refresh}
            </Button>
          </div>
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawManagement.resultTitle}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {messages.inspector.openClawManagement.actions?.[result.action] || result.action}
                  </div>
                </div>
                <Badge variant={outcomeBadge.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${outcomeBadge.className}`}>
                  {messages.inspector.openClawManagement.outcomes[outcome]}
                </Badge>
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-foreground">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawManagement.labels.command}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.command?.display || ""}</div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawManagement.labels.health}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">
                    {messages.inspector.openClawManagement.healthStatuses?.[result.healthCheck?.status] || result.healthCheck?.status || messages.inspector.openClawManagement.healthStatuses.unknown}
                    {result.healthCheck?.url ? ` · ${result.healthCheck.url}` : ""}
                  </div>
                </div>
                {Array.isArray(result.guidance) && result.guidance.length ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawManagement.labels.guidance}
                    </div>
                    <div className="space-y-1 text-[12px] leading-5 text-foreground">
                      {result.guidance.map((item, index) => (
                        <div key={`${item}-${index}`}>• {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {result.commandResult?.stdout ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawManagement.labels.stdout}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                  </div>
                ) : null}
                {result.commandResult?.stderr ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawManagement.labels.stderr}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                  </div>
                ) : null}
                {!result.ok && result.error ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
                    {result.error}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {actionIntent ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.openClawManagement.pendingConfirmation(messages.inspector.openClawManagement.actions?.[actionIntent.key] || actionIntent.label)}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawConfigPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onChange,
  onOpenPreview,
  onChangeRemoteAuthorization,
  onOpenRemoteGuide,
  onRevealInFileManager,
  onReload,
  onSubmit,
  remoteAuthorization = null,
  remoteGuard = null,
  result = null,
  state = null,
  values = {},
  showTitle = true,
}) {
  const fieldMeta = getOpenClawConfigFieldMeta(messages, state);
  const outcome = getOpenClawConfigOutcome(result);
  const outcomeBadge = getOpenClawConfigOutcomeBadgeProps(outcome);
  const initialValues = buildOpenClawConfigFormValues(state);
  const modelOptions = Array.isArray(state?.modelOptions) ? state.modelOptions : [];
  const hasPendingChanges = fieldMeta.some((field) => {
    const nextValue = values?.[field.key];
    const initialValue = initialValues?.[field.key];
    return nextValue !== initialValue;
  });
  const remoteConfigFlow = Boolean(remoteGuard?.blocked);
  const remoteAuthorized = Boolean(remoteAuthorization?.confirmed);

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawConfig.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawConfig.description}
          </div>
          <OpenClawRemoteNotice messages={messages} onOpenGuide={onOpenRemoteGuide} remoteGuard={remoteGuard} />
          {remoteConfigFlow ? (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawConfig.remote.title}</div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawConfig.remote.description}</div>
              <label className="mt-3 flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0 rounded border border-border/70"
                  checked={remoteAuthorized}
                  aria-label={messages.inspector.openClawConfig.remote.confirm}
                  disabled={loading || busy}
                  onChange={(event) => onChangeRemoteAuthorization?.("confirmed", event.target.checked)}
                />
                <span className="min-w-0 text-[12px] leading-5 text-foreground">{messages.inspector.openClawConfig.remote.confirm}</span>
              </label>
              <div className="mt-3 grid gap-1.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.openClawConfig.remote.noteLabel}
                </div>
                <input
                  type="text"
                  aria-label={messages.inspector.openClawConfig.remote.noteLabel}
                  className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawConfig.remote.notePlaceholder}
                  value={String(remoteAuthorization?.note || "")}
                  onChange={(event) => onChangeRemoteAuthorization?.("note", event.target.value)}
                />
              </div>
              <div className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {messages.inspector.openClawConfig.remote.restartNotice}
              </div>
            </div>
          ) : null}
          {state?.validation ? (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {messages.inspector.openClawConfig.labels.validation}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant={state.validation.ok ? "success" : "default"} className="px-2 py-0.5 text-[11px] leading-5">
                  {state.validation.ok ? messages.inspector.openClawConfig.validation.valid : messages.inspector.openClawConfig.validation.invalid}
                </Badge>
                {state.configPath ? (
                  <div className="min-w-0 overflow-hidden">
                    {!state.remoteTarget && isAbsoluteFileSystemPath(state.configPath) ? (
                      <FileLink
                        item={{ path: state.configPath, fullPath: state.configPath, kind: "文件" }}
                        compact
                        currentWorkspaceRoot=""
                        label={compactHomePath(state.configPath)}
                        onOpenPreview={onOpenPreview}
                        onRevealInFileManager={(targetItem) => {
                          onRevealInFileManager?.(targetItem).catch(() => {});
                        }}
                      />
                    ) : (
                      <div className="break-all font-mono text-[12px] text-foreground">{state.configPath}</div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          <div className="grid gap-3">
            {fieldMeta.map((field) => {
              const fieldValue = values?.[field.key];
              return (
                <div key={field.key} className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{field.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{field.description}</div>
                    </div>
                    {field.restartRequired ? (
                      <Badge variant="secondary" className="whitespace-nowrap px-2 py-0.5 text-[10px] leading-5">
                        {messages.inspector.openClawConfig.restartBadge}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    {field.type === "boolean" ? (
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[12px] text-foreground">
                          {getOpenClawConfigFieldValueLabel(field.key, fieldValue, messages)}
                        </span>
                        <Switch
                          checked={Boolean(fieldValue)}
                          aria-label={field.label}
                          disabled={loading || busy}
                          onCheckedChange={(checked) => onChange?.(field.key, checked)}
                        />
                      </label>
                    ) : field.type === "enum" ? (
                      <div className="relative">
                        <select
                          aria-label={field.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={String(fieldValue || "")}
                          onChange={(event) => onChange?.(field.key, event.target.value)}
                        >
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    ) : field.key === "modelPrimary" || field.key === "agentModel" ? (
                      <div className="relative">
                        <select
                          aria-label={field.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={String(fieldValue ?? "")}
                          onChange={(event) => onChange?.(field.key, event.target.value)}
                        >
                          <option value="">{messages.inspector.openClawConfig.emptyValue}</option>
                          {modelOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        aria-label={field.label}
                        className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                        disabled={loading || busy}
                        placeholder={
                          field.key === "agentModel"
                            ? messages.inspector.openClawConfig.fields.agentModel.placeholder
                            : messages.inspector.openClawConfig.fields.modelPrimary.placeholder
                        }
                        value={String(fieldValue ?? "")}
                        onChange={(event) => onChange?.(field.key, event.target.value)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              variant="ghost"
              aria-label={messages.inspector.openClawConfig.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawConfig.reloading : messages.inspector.openClawConfig.reload}
            </Button>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {!remoteConfigFlow ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || busy || !hasPendingChanges}
                  className="h-8 rounded-full px-3"
                  onClick={() => onSubmit?.(false)}
                >
                  {busy ? messages.inspector.openClawConfig.applying : messages.inspector.openClawConfig.apply}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={loading || busy || !hasPendingChanges || (remoteConfigFlow && !remoteAuthorized)}
                className="h-8 rounded-full px-3"
                onClick={() => onSubmit?.(true)}
              >
                {busy
                  ? messages.inspector.openClawConfig.applying
                  : (remoteConfigFlow ? messages.inspector.openClawConfig.applyRemote : messages.inspector.openClawConfig.applyAndRestart)}
              </Button>
            </div>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawConfig.resultTitle}
                  </div>
                  <div className="text-sm font-semibold text-foreground">
                    {result.noChanges ? messages.inspector.openClawConfig.noChanges : messages.inspector.openClawConfig.appliedChanges}
                  </div>
                </div>
                <Badge variant={outcomeBadge.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${outcomeBadge.className}`}>
                  {messages.inspector.openClawConfig.outcomes[outcome]}
                </Badge>
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-foreground">
                {result.validation ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.validation}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {result.validation.ok ? messages.inspector.openClawConfig.validation.valid : messages.inspector.openClawConfig.validation.invalid}
                    </div>
                  </div>
                ) : null}
                {result.healthCheck ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.health}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {messages.inspector.openClawConfig.healthStatuses?.[result.healthCheck.status] || result.healthCheck.status}
                      {result.healthCheck?.url ? ` · ${result.healthCheck.url}` : ""}
                    </div>
                  </div>
                ) : null}
                {result.backupPath ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.backup}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <FileLink
                        item={{ path: result.backupPath, fullPath: result.backupPath, kind: "文件" }}
                        compact
                        currentWorkspaceRoot=""
                        label={compactHomePath(result.backupPath)}
                        onOpenPreview={onOpenPreview}
                        onRevealInFileManager={(targetItem) => {
                          onRevealInFileManager?.(targetItem).catch(() => {});
                        }}
                      />
                    </div>
                  </div>
                ) : null}
                {!result.backupPath && result.backupReference?.label ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.rollbackPoint}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.backupReference.label}</div>
                  </div>
                ) : null}
                {Array.isArray(result.changedFields) && result.changedFields.length ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawConfig.labels.changedFields}
                    </div>
                    <div className="space-y-2">
                      {result.changedFields.map((field) => {
                        const meta = fieldMeta.find((item) => item.key === field.key);
                        return (
                          <div key={field.key} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="text-[12px] font-medium text-foreground">{meta?.label || field.key}</div>
                            <div className="grid gap-1 text-[11px] leading-5 text-muted-foreground">
                              <div>
                                {messages.inspector.openClawConfig.labels.before}: {getOpenClawConfigFieldValueLabel(field.key, field.before, messages)}
                              </div>
                              <div>
                                {messages.inspector.openClawConfig.labels.after}: {getOpenClawConfigFieldValueLabel(field.key, field.after, messages)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawOnboardingPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onChange,
  onRefreshCapabilities,
  onReload,
  onSubmit,
  refreshResult = null,
  result = null,
  state = null,
  values = {},
  showTitle = true,
}) {
  const authChoice = String(values?.authChoice || state?.defaults?.authChoice || "openai-api-key").trim() || "openai-api-key";
  const daemonRuntime = String(values?.daemonRuntime || state?.defaults?.daemonRuntime || "node").trim() || "node";
  const flow = String(values?.flow || state?.defaults?.flow || "quickstart").trim() || "quickstart";
  const gatewayAuth = String(values?.gatewayAuth || state?.defaults?.gatewayAuth || "off").trim() || "off";
  const secretInputMode = String(values?.secretInputMode || state?.defaults?.secretInputMode || "plaintext").trim() || "plaintext";
  const gatewayTokenInputMode = String(values?.gatewayTokenInputMode || state?.defaults?.gatewayTokenInputMode || "plaintext").trim() || "plaintext";
  const gatewayBind = String(values?.gatewayBind || state?.defaults?.gatewayBind || "loopback").trim() || "loopback";
  const installDaemon = Boolean(values?.installDaemon ?? state?.defaults?.installDaemon ?? true);
  const skipHealthCheck = Boolean(values?.skipHealthCheck ?? state?.defaults?.skipHealthCheck ?? false);
  const supportedGatewayBinds = Array.isArray(state?.supportedGatewayBinds) && state.supportedGatewayBinds.length
    ? state.supportedGatewayBinds
    : ["loopback", "tailnet", "lan", "auto", "custom"];
  const authOptions = getOpenClawOnboardingAuthOptions(messages, state);
  const daemonRuntimeOptions = getOpenClawOnboardingDaemonRuntimeOptions(messages, state);
  const flowOptions = getOpenClawOnboardingFlowOptions(messages, state);
  const gatewayAuthOptions = getOpenClawOnboardingGatewayAuthOptions(messages, state);
  const gatewayTokenModeOptions = getOpenClawOnboardingGatewayTokenModeOptions(messages, state);
  const secretModeOptions = getOpenClawOnboardingSecretModeOptions(messages, state);
  const gatewayBindOptions = supportedGatewayBinds.map((value) => ({
    value,
    label: messages.inspector.openClawConfig.fields.gatewayBind.options?.[value] || value,
  }));
  const usesManagedAuth = OPENCLAW_MANAGED_AUTH_CHOICES.has(authChoice);
  const showCustomProviderFields = authChoice === "custom-api-key";
  const showProviderEndpointFields = authChoice === "custom-api-key" || authChoice === "ollama";
  const showTokenAuthFields = authChoice === "token";
  const supportsApiKey = authChoice !== "skip" && authChoice !== "ollama" && authChoice !== "token" && !usesManagedAuth;
  const showGatewayPasswordInput = gatewayAuth === "password";
  const showGatewayTokenFields = gatewayAuth === "token";
  const showPlaintextApiKeyInput = supportsApiKey && secretInputMode === "plaintext";
  const showPlaintextGatewayTokenInput = showGatewayTokenFields && gatewayTokenInputMode === "plaintext";
  const capabilityRows = [
    {
      label: messages.inspector.openClawOnboarding.capabilities.flows,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedFlows) ? state.supportedFlows : [],
        flowOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.providers,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedAuthChoices) ? state.supportedAuthChoices : [],
        authOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.gatewayBinds,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedGatewayBinds) ? state.supportedGatewayBinds : [],
        gatewayBindOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.daemonRuntimes,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedDaemonRuntimes) ? state.supportedDaemonRuntimes : [],
        daemonRuntimeOptions,
      ),
    },
  ].filter((row) => row.values.length);
  const fixedCapabilityHint = messages.inspector.openClawOnboarding.capabilities.lockedHint;
  const capabilityDetection = getOpenClawCapabilityDetectionText(messages, state?.capabilityDetection);
  const refreshCapabilityDetection = getOpenClawCapabilityDetectionText(messages, refreshResult?.capabilityDetection);
  const resultCapabilityDetection = getOpenClawCapabilityDetectionText(messages, result?.capabilityDetection);

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawOnboarding.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawOnboarding.description}
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={state?.ready ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                {state?.ready ? messages.inspector.openClawOnboarding.statuses.ready : messages.inspector.openClawOnboarding.statuses.required}
              </Badge>
              {state?.configPath ? (
                <div className="min-w-0 break-all font-mono text-[12px] text-foreground">{state.configPath}</div>
              ) : null}
            </div>
            {state?.validation ? (
              <div className="mt-2 text-muted-foreground">
                {messages.inspector.openClawOnboarding.labels.validation}:{" "}
                {state.validation.ok ? messages.inspector.openClawOnboarding.validation.valid : messages.inspector.openClawOnboarding.validation.invalid}
              </div>
            ) : null}
            {capabilityRows.length ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.openClawOnboarding.capabilities.title}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.capabilities.detectedBy}</span>
                    {": "}
                    <span>{capabilityDetection.sourceLabel}</span>
                    {capabilityDetection.reasonLabel ? (
                      <>
                        {" · "}
                        <span>{capabilityDetection.reasonLabel}</span>
                      </>
                    ) : null}
                    {capabilityDetection.signature ? (
                      <>
                        {" · "}
                        <span>{messages.inspector.openClawOnboarding.capabilities.signature}: {capabilityDetection.signature}</span>
                      </>
                    ) : null}
                    {capabilityDetection.detectedAt ? (
                      <>
                        {" · "}
                        <span>{messages.inspector.openClawOnboarding.capabilities.detectedAt}: {capabilityDetection.detectedAt}</span>
                      </>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-[11px]"
                    disabled={loading || busy}
                    onClick={() => onRefreshCapabilities?.()}
                  >
                    {loading ? messages.inspector.openClawOnboarding.refreshingCapabilities : messages.inspector.openClawOnboarding.refreshCapabilities}
                  </Button>
                </div>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-muted-foreground">
                  {capabilityRows.map((row) => (
                    <div key={row.label}>
                      <span className="font-medium text-foreground">{row.label}</span>
                      {": "}
                      <span>{row.values.join(" / ") || messages.inspector.openClawOnboarding.capabilities.empty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3">
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.flow.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.flow.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.flow.label}
              options={flowOptions}
              value={flow}
              onChange={(nextValue) => onChange?.("flow", nextValue)}
            />
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.authChoice.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.authChoice.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.authChoice.label}
              options={authOptions}
              value={authChoice}
              onChange={(nextValue) => onChange?.("authChoice", nextValue)}
            />
            {showTokenAuthFields ? (
              <>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenProvider.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenProvider.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenProvider.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenProvider.placeholder}
                    value={String(values?.tokenProvider || "")}
                    onChange={(event) => onChange?.("tokenProvider", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.token.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.token.description}</div>
                  <input
                    type="password"
                    aria-label={messages.inspector.openClawOnboarding.fields.token.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.token.placeholder}
                    value={String(values?.token || "")}
                    onChange={(event) => onChange?.("token", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenProfileId.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenProfileId.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenProfileId.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenProfileId.placeholder}
                    value={String(values?.tokenProfileId || "")}
                    onChange={(event) => onChange?.("tokenProfileId", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenExpiresIn.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenExpiresIn.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenExpiresIn.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenExpiresIn.placeholder}
                    value={String(values?.tokenExpiresIn || "")}
                    onChange={(event) => onChange?.("tokenExpiresIn", event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {usesManagedAuth ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.managedAuth.title}</div>
                <div className="mt-1">{messages.inspector.openClawOnboarding.managedAuth.description}</div>
              </div>
            ) : null}
            {supportsApiKey ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.secretInputMode.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.secretInputMode.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.secretInputMode.label}
                options={secretModeOptions}
                value={secretInputMode}
                onChange={(nextValue) => onChange?.("secretInputMode", nextValue)}
              />
            ) : null}
            {showPlaintextApiKeyInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.apiKey.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.apiKey.placeholder}
                  value={String(values?.apiKey || "")}
                  onChange={(event) => onChange?.("apiKey", event.target.value)}
                />
              </div>
            ) : null}
            {supportsApiKey && secretInputMode === "ref" ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.label}</div>
                <div className="mt-1">{messages.inspector.openClawOnboarding.fields.secretInputMode.refHint}</div>
              </div>
            ) : null}
            {showProviderEndpointFields ? (
              <>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customBaseUrl.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customBaseUrl.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.customBaseUrl.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.customBaseUrl.placeholder}
                    value={String(values?.customBaseUrl || "")}
                    onChange={(event) => onChange?.("customBaseUrl", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customModelId.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customModelId.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.customModelId.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.customModelId.placeholder}
                    value={String(values?.customModelId || "")}
                    onChange={(event) => onChange?.("customModelId", event.target.value)}
                  />
                </div>
                {showCustomProviderFields ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                      <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customProviderId.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customProviderId.description}</div>
                      <input
                        type="text"
                        aria-label={messages.inspector.openClawOnboarding.fields.customProviderId.label}
                        className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                        disabled={loading || busy}
                        placeholder={messages.inspector.openClawOnboarding.fields.customProviderId.placeholder}
                        value={String(values?.customProviderId || "")}
                        onChange={(event) => onChange?.("customProviderId", event.target.value)}
                      />
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                      <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customCompatibility.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customCompatibility.description}</div>
                      <div className="relative mt-3">
                        <select
                          aria-label={messages.inspector.openClawOnboarding.fields.customCompatibility.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={String(values?.customCompatibility || "openai")}
                          onChange={(event) => onChange?.("customCompatibility", event.target.value)}
                        >
                          {Object.entries(messages.inspector.openClawOnboarding.fields.customCompatibility.options || {}).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayBind.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.gatewayBind.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.gatewayBind.label}
              options={gatewayBindOptions}
              value={gatewayBind}
              onChange={(nextValue) => onChange?.("gatewayBind", nextValue)}
            />
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayAuth.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.gatewayAuth.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.gatewayAuth.label}
              options={gatewayAuthOptions}
              value={gatewayAuth}
              onChange={(nextValue) => onChange?.("gatewayAuth", nextValue)}
            />
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.installDaemon.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.installDaemon.description}</div>
                </div>
                <Switch
                  checked={installDaemon}
                  aria-label={messages.inspector.openClawOnboarding.fields.installDaemon.label}
                  disabled={loading || busy}
                  onCheckedChange={(checked) => onChange?.("installDaemon", checked)}
                />
              </label>
              <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {installDaemon
                  ? messages.inspector.openClawOnboarding.fields.installDaemon.enabledHint
                  : messages.inspector.openClawOnboarding.fields.installDaemon.disabledHint}
              </div>
            </div>
            {installDaemon ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.daemonRuntime.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.daemonRuntime.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.daemonRuntime.label}
                options={daemonRuntimeOptions}
                value={daemonRuntime}
                onChange={(nextValue) => onChange?.("daemonRuntime", nextValue)}
              />
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.skipHealthCheck.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.skipHealthCheck.description}</div>
                </div>
                <Switch
                  checked={skipHealthCheck}
                  aria-label={messages.inspector.openClawOnboarding.fields.skipHealthCheck.label}
                  disabled={loading || busy}
                  onCheckedChange={(checked) => onChange?.("skipHealthCheck", checked)}
                />
              </label>
              <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {messages.inspector.openClawOnboarding.fields.skipHealthCheck.hint}
              </div>
            </div>
            {showGatewayTokenFields ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.label}
                options={gatewayTokenModeOptions}
                value={gatewayTokenInputMode}
                onChange={(nextValue) => onChange?.("gatewayTokenInputMode", nextValue)}
              />
            ) : null}
            {showPlaintextGatewayTokenInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayToken.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayToken.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayToken.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayToken.placeholder}
                  value={String(values?.gatewayToken || "")}
                  onChange={(event) => onChange?.("gatewayToken", event.target.value)}
                />
              </div>
            ) : null}
            {showGatewayTokenFields && gatewayTokenInputMode === "ref" ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.description}</div>
                <input
                  type="text"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.placeholder}
                  value={String(values?.gatewayTokenRefEnv || "")}
                  onChange={(event) => onChange?.("gatewayTokenRefEnv", event.target.value)}
                />
              </div>
            ) : null}
            {showGatewayPasswordInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayPassword.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayPassword.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayPassword.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayPassword.placeholder}
                  value={String(values?.gatewayPassword || "")}
                  onChange={(event) => onChange?.("gatewayPassword", event.target.value)}
                />
              </div>
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.workspace.label}</div>
              <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.workspace.description}</div>
              <input
                type="text"
                aria-label={messages.inspector.openClawOnboarding.fields.workspace.label}
                className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                disabled={loading || busy}
                placeholder={messages.inspector.openClawOnboarding.fields.workspace.placeholder}
                value={String(values?.workspace || "")}
                onChange={(event) => onChange?.("workspace", event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              variant="ghost"
              aria-label={messages.inspector.openClawOnboarding.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawOnboarding.reloading : messages.inspector.openClawOnboarding.reload}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              className="h-8 rounded-full px-3"
              onClick={() => onSubmit?.()}
            >
              {busy ? messages.inspector.openClawOnboarding.running : messages.inspector.openClawOnboarding.run}
            </Button>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {refreshResult ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.refreshResultTitle}</div>
                <Badge variant={refreshResult.ok ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                  {refreshResult.ok
                    ? messages.inspector.openClawOnboarding.refreshStatuses.success
                    : messages.inspector.openClawOnboarding.refreshStatuses.failed}
                </Badge>
              </div>
              {refreshResult.requestedAt ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.refreshRequestedAt}
                  </div>
                  <div className="text-[12px] text-foreground">{refreshResult.requestedAt}</div>
                </div>
              ) : null}
              {refreshResult.capabilityDetection ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.capabilityDetection}
                  </div>
                  <div className="text-[12px] text-foreground">
                    {refreshCapabilityDetection.sourceLabel}
                    {refreshCapabilityDetection.reasonLabel ? ` · ${refreshCapabilityDetection.reasonLabel}` : ""}
                    {refreshCapabilityDetection.signature ? ` · ${messages.inspector.openClawOnboarding.capabilities.signature}: ${refreshCapabilityDetection.signature}` : ""}
                    {refreshCapabilityDetection.detectedAt ? ` · ${messages.inspector.openClawOnboarding.capabilities.detectedAt}: ${refreshCapabilityDetection.detectedAt}` : ""}
                  </div>
                </div>
              ) : null}
              {refreshResult.error ? (
                <div className="text-[12px] leading-5 text-destructive">
                  {refreshResult.error}
                </div>
              ) : null}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.resultTitle}</div>
                <Badge variant={result.ok ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                  {result.ok ? messages.inspector.openClawOnboarding.statuses.ready : messages.inspector.openClawOnboarding.statuses.required}
                </Badge>
              </div>
              {result.commandResult?.command?.display ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.command}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.commandResult.command.display}</div>
                </div>
              ) : null}
              {result.capabilityDetection ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.capabilityDetection}
                  </div>
                  <div className="text-[12px] text-foreground">
                    {resultCapabilityDetection.sourceLabel}
                    {resultCapabilityDetection.reasonLabel ? ` · ${resultCapabilityDetection.reasonLabel}` : ""}
                    {resultCapabilityDetection.signature ? ` · ${messages.inspector.openClawOnboarding.capabilities.signature}: ${resultCapabilityDetection.signature}` : ""}
                    {resultCapabilityDetection.detectedAt ? ` · ${messages.inspector.openClawOnboarding.capabilities.detectedAt}: ${resultCapabilityDetection.detectedAt}` : ""}
                  </div>
                </div>
              ) : null}
              {result.healthCheck ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.health}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.healthCheck.status}</div>
                </div>
              ) : null}
              {result.commandResult?.stdout ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.stdout}
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                </div>
              ) : null}
              {result.commandResult?.stderr ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.stderr}
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawUpdatePanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onOpenRemoteGuide,
  onOpenTroubleshooting,
  onReload,
  onRunUpdate,
  remoteGuard = null,
  result = null,
  state = null,
  showTitle = true,
}) {
  const outcome = result ? getOpenClawUpdateOutcome(result) : "";
  const outcomeBadge = getOpenClawUpdateOutcomeBadgeProps(outcome);
  const installed = Boolean(state?.installed);
  const availability = state?.availability;
  const shouldShowRunAction = Boolean(state) && (!installed || Boolean(availability?.available));
  const previewActions = Array.isArray(state?.preview?.actions) ? state.preview.actions : [];
  const runButtonLabel = installed ? messages.inspector.openClawUpdate.runUpdate : messages.inspector.openClawUpdate.runInstall;
  const runningLabel = installed ? messages.inspector.openClawUpdate.running : messages.inspector.openClawUpdate.installing;
  const troubleshootingEntries = buildOpenClawUpdateTroubleshootingEntries(result, messages);

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawUpdate.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawUpdate.description}
          </div>
          <OpenClawRemoteNotice messages={messages} onOpenGuide={onOpenRemoteGuide} remoteGuard={remoteGuard} />
          {state ? (
            installed ? (
              <div className="grid gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={availability?.available ? "secondary" : "success"} className="px-2 py-0.5 text-[11px] leading-5">
                    {availability?.available ? messages.inspector.openClawUpdate.statuses.updateAvailable : messages.inspector.openClawUpdate.statuses.upToDate}
                  </Badge>
                  <span className="text-muted-foreground">
                    {messages.inspector.openClawUpdate.labels.currentVersion}: {state.currentVersion || messages.inspector.openClawUpdate.emptyValue}
                  </span>
                  {state.targetVersion ? (
                    <span className="text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.targetVersion}: {state.targetVersion}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-1 text-muted-foreground">
                  <div>{messages.inspector.openClawUpdate.labels.installKind}: {state.update?.installKind || messages.inspector.openClawUpdate.emptyValue}</div>
                  <div>{messages.inspector.openClawUpdate.labels.channel}: {state.channel?.label || state.channel?.value || messages.inspector.openClawUpdate.emptyValue}</div>
                  <div>{messages.inspector.openClawUpdate.labels.packageManager}: {state.update?.packageManager || messages.inspector.openClawUpdate.emptyValue}</div>
                </div>
                {previewActions.length ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.preview}
                    </div>
                    <div className="space-y-1 text-[12px] leading-5 text-foreground">
                      {previewActions.map((item, index) => (
                        <div key={`${item}-${index}`}>• {item}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default" className="px-2 py-0.5 text-[11px] leading-5">
                    {messages.inspector.openClawUpdate.statuses.notInstalled}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{messages.inspector.openClawUpdate.notInstalledDescription}</div>
                {state.installGuidance?.docsUrl ? (
                  <a
                    href={state.installGuidance.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                    {messages.inspector.openClawUpdate.installDocs}
                  </a>
                ) : null}
                {state.installGuidance?.command ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.installCommand}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{state.installGuidance.command}</pre>
                  </div>
                ) : null}
              </div>
            )
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading || busy || remoteGuard?.blocked}
              aria-label={messages.inspector.openClawUpdate.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawUpdate.reloading : messages.inspector.openClawUpdate.reload}
            </Button>
            {shouldShowRunAction ? (
              <Button
                type="button"
                size="sm"
                disabled={loading || busy || remoteGuard?.blocked}
                className="h-8 rounded-full px-3"
                onClick={() => onRunUpdate?.()}
              >
                {busy ? runningLabel : runButtonLabel}
              </Button>
            ) : null}
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">
                  {messages.inspector.openClawUpdate.resultTitle}
                </div>
                <Badge variant={outcomeBadge.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${outcomeBadge.className}`}>
                  {messages.inspector.openClawUpdate.outcomes[outcome || "warning"]}
                </Badge>
              </div>
              <div className="grid gap-2 text-[12px] leading-5 text-foreground">
                {result.commandResult?.command?.display ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.command}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.commandResult.command.display}</div>
                  </div>
                ) : null}
                {result.result?.targetVersion ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.targetVersion}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.result.targetVersion}</div>
                  </div>
                ) : null}
                {result.healthCheck ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.health}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {messages.inspector.openClawUpdate.healthStatuses?.[result.healthCheck.status] || result.healthCheck.status}
                      {result.healthCheck?.url ? ` · ${result.healthCheck.url}` : ""}
                    </div>
                  </div>
                ) : null}
                {typeof result.commandResult?.exitCode === "number" ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.exitCode}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">{result.commandResult.exitCode}</div>
                  </div>
                ) : null}
                {typeof result.commandResult?.timedOut === "boolean" ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.timedOut}
                    </div>
                    <div className="font-mono text-[12px] text-foreground">
                      {result.commandResult.timedOut ? messages.inspector.openClawUpdate.flags.yes : messages.inspector.openClawUpdate.flags.no}
                    </div>
                  </div>
                ) : null}
                {result.commandResult?.stdout ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.stdout}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                  </div>
                ) : null}
                {result.commandResult?.stderr ? (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.stderr}
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                  </div>
                ) : null}
                {troubleshootingEntries.length ? (
                  <div className="space-y-2">
                    <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {messages.inspector.openClawUpdate.labels.troubleshooting}
                    </div>
                    <div className="space-y-2">
                      {troubleshootingEntries.map((entry) => (
                        <div key={entry.key} className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                          <div className="text-[12px] font-medium text-foreground">{entry.title}</div>
                          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{entry.summary}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {entry.docs.map((doc) => (
                              <a
                                key={doc.key}
                                href={doc.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-border hover:bg-accent/20"
                              >
                                <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                                {doc.label}
                              </a>
                            ))}
                            {entry.canPreview ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-2.5 text-[11px]"
                                onClick={() => onOpenTroubleshooting?.(entry)}
                              >
                                <ScrollText className="mr-1 h-3.5 w-3.5" />
                                {messages.inspector.openClawUpdate.guidance.viewFix}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawUpdateTroubleshootingDialog({ entry = null, messages, onClose }) {
  if (!entry) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="dialog"
          aria-modal="true"
          aria-label={entry.title}
          className="flex w-full max-w-2xl max-h-[min(80vh,48rem)] min-h-0 flex-col overflow-hidden rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base leading-6">{entry.title}</CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">{entry.summary}</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={messages.inspector.openClawUpdate.guidance.closeFix}
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="space-y-4">
              {entry.steps.length ? (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawUpdate.guidance.solutionTitle}
                  </div>
                  <div className="mt-2 space-y-2">
                    {entry.steps.map((step, index) => (
                      <div key={`${entry.key}-step-${index}`} className="flex gap-2 text-sm leading-6 text-foreground">
                        <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{index + 1}</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {entry.commands.length ? (
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawUpdate.guidance.commandsTitle}
                  </div>
                  <div className="mt-2 space-y-2">
                    {entry.commands.map((command, index) => (
                      <pre key={`${entry.key}-command-${index}`} className="overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{command}</pre>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function formatOperationTimestamp(timestamp = 0) {
  const numericTimestamp = Number(timestamp || 0);
  if (!numericTimestamp) {
    return "";
  }

  try {
    return new Date(numericTimestamp).toLocaleString();
  } catch {
    return "";
  }
}

function OpenClawOperationHistoryPanel({
  entries = [],
  error = "",
  loading = false,
  messages,
  onOpenGuide,
  onRequestRollback,
  onReload,
  rollbackBusy = false,
  remoteGuard = null,
  showTitle = true,
}) {
  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.remoteOperations.historyTitle}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.remoteOperations.historyDescription}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              aria-label={messages.inspector.remoteOperations.reloadHistory}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.remoteOperations.reloadingHistory : messages.inspector.remoteOperations.reloadHistory}
            </Button>
          </div>
          {remoteGuard?.blocked ? (
            <div className="flex justify-start">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={() => onOpenGuide?.()}
              >
                <ScrollText className="mr-1 h-3.5 w-3.5" />
                {messages.inspector.remoteOperations.openGuide}
              </Button>
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {entries.length ? (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{`${entry.scope}.${entry.action}`}</div>
                      <div className="text-[11px] leading-5 text-muted-foreground">{formatOperationTimestamp(entry.finishedAt || entry.startedAt)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={entry.outcome === "success" ? "success" : entry.outcome === "warning" ? "secondary" : "default"} className="px-2 py-0.5 text-[10px] leading-5">
                        {messages.inspector.remoteOperations.outcomes?.[entry.outcome] || entry.outcome}
                      </Badge>
                      <Badge variant="outline" className="px-2 py-0.5 text-[10px] leading-5">
                        {messages.inspector.remoteOperations.targets?.[entry.target] || entry.target}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] leading-5 text-muted-foreground">
                    {entry.blocked ? <div>{messages.inspector.remoteOperations.blockedBadge}</div> : null}
                    {entry.summary ? <div>{entry.summary}</div> : null}
                    {entry.error ? <div>{entry.error}</div> : null}
                    {entry.backupPath ? <div>{messages.inspector.remoteOperations.backupLabel}: {compactHomePath(entry.backupPath)}</div> : null}
                    {entry.backupLabel ? <div>{messages.inspector.remoteOperations.rollbackPointLabel}: {entry.backupLabel}</div> : null}
                    {entry.rolledBack ? <div>{messages.inspector.remoteOperations.rollbackLabel}</div> : null}
                  </div>
                  {entry.backupId && !entry.rolledBack ? (
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={rollbackBusy}
                        className="h-7 rounded-full px-2.5 text-[11px]"
                        onClick={() => onRequestRollback?.(entry)}
                      >
                        {rollbackBusy ? messages.inspector.remoteOperations.restoringAction : messages.inspector.remoteOperations.restoreAction}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
              {messages.inspector.remoteOperations.emptyHistory}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OpenClawRemoteRecoveryDialog({ messages, onClose, open = false }) {
  if (!open) {
    return null;
  }

  const docs = [
    { key: "install", href: OFFICIAL_OPENCLAW_DOC_URLS.install, label: messages.inspector.remoteOperations.docs.install },
    { key: "doctor", href: OFFICIAL_OPENCLAW_DOC_URLS.doctor, label: messages.inspector.remoteOperations.docs.doctor },
    { key: "troubleshooting", href: OFFICIAL_OPENCLAW_DOC_URLS.troubleshooting, label: messages.inspector.remoteOperations.docs.troubleshooting },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="dialog"
          aria-modal="true"
          aria-label={messages.inspector.remoteOperations.guideTitle}
          className="flex w-full max-w-2xl max-h-[min(80vh,48rem)] min-h-0 flex-col overflow-hidden rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base leading-6">{messages.inspector.remoteOperations.guideTitle}</CardTitle>
                <CardDescription className="mt-1 text-sm leading-6">{messages.inspector.remoteOperations.guideSummary}</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={messages.inspector.remoteOperations.closeGuide}
                className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.remoteOperations.solutionTitle}
                </div>
                <div className="mt-2 space-y-2">
                  {messages.inspector.remoteOperations.guideSteps.map((step, index) => (
                    <div key={`remote-guide-step-${index}`} className="flex gap-2 text-sm leading-6 text-foreground">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{index + 1}</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.remoteOperations.docsTitle}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {docs.map((doc) => (
                    <a
                      key={doc.key}
                      href={doc.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:border-border hover:bg-accent/20"
                    >
                      <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                      {doc.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function OpenClawRollbackConfirmDialog({
  authorization = null,
  busy = false,
  entry = null,
  messages,
  onCancel,
  onChange,
  onConfirm,
}) {
  if (!entry) {
    return null;
  }

  const label = entry.backupLabel || entry.backupId || messages.inspector.remoteOperations.rollbackPointLabel;
  const targetLabel = messages.inspector.remoteOperations.targets?.[entry.target] || entry.target || "";
  const dialogTitle = typeof messages.inspector.remoteOperations.restoreDialogTitle === "function"
    ? messages.inspector.remoteOperations.restoreDialogTitle(targetLabel)
    : messages.inspector.remoteOperations.restoreDialogTitle;
  const dialogDescription = typeof messages.inspector.remoteOperations.restoreDialogDescription === "function"
    ? messages.inspector.remoteOperations.restoreDialogDescription(label, targetLabel)
    : messages.inspector.remoteOperations.restoreDialogDescription;
  const dialogConfirm = typeof messages.inspector.remoteOperations.restoreDialogConfirm === "function"
    ? messages.inspector.remoteOperations.restoreDialogConfirm(targetLabel)
    : messages.inspector.remoteOperations.restoreDialogConfirm;
  const dialogNotePlaceholder = typeof messages.inspector.remoteOperations.restoreDialogNotePlaceholder === "function"
    ? messages.inspector.remoteOperations.restoreDialogNotePlaceholder(targetLabel)
    : messages.inspector.remoteOperations.restoreDialogNotePlaceholder;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={() => !busy && onCancel()} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="alertdialog"
          aria-modal="true"
          aria-label={dialogTitle}
          className="w-full max-w-md rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <CardTitle className="text-base">{dialogTitle}</CardTitle>
            <CardDescription className="text-sm leading-6">
              {dialogDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 px-5 py-4">
            <label className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <input
                type="checkbox"
                checked={Boolean(authorization?.confirmed)}
                aria-label={dialogConfirm}
                disabled={busy}
                className="mt-1 h-4 w-4 shrink-0 rounded border border-border/70 accent-primary"
                onChange={(event) => onChange?.("confirmed", event.target.checked)}
              />
              <span className="text-sm leading-6 text-foreground">{dialogConfirm}</span>
            </label>
            <div className="grid gap-1.5">
              <label className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {messages.inspector.remoteOperations.restoreDialogNoteLabel}
              </label>
              <input
                type="text"
                aria-label={messages.inspector.remoteOperations.restoreDialogNoteLabel}
                className="h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                disabled={busy}
                placeholder={dialogNotePlaceholder}
                value={String(authorization?.note || "")}
                onChange={(event) => onChange?.("note", event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
                {messages.inspector.remoteOperations.restoreDialogCancel}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || !authorization?.confirmed}
                onClick={onConfirm}
              >
                {busy ? messages.inspector.remoteOperations.restoreDialogRunning : messages.inspector.remoteOperations.restoreDialogRun}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function OpenClawManagementConfirmDialog({ action, busy = false, messages, onCancel, onConfirm }) {
  if (!action) {
    return null;
  }

  const actionLabel = messages.inspector.openClawManagement.actions?.[action.key] || action.label;
  const dialogTitle = messages.inspector.openClawManagement.confirmation.title(actionLabel);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]" onClick={() => !busy && onCancel()} />
      <div className="fixed inset-0 z-[41] flex items-center justify-center px-4">
        <Card
          role="alertdialog"
          aria-modal="true"
          aria-label={dialogTitle}
          className="w-full max-w-md rounded-[1.5rem] border-border/70 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
        >
          <CardHeader className="space-y-2 border-b border-border/70 px-5 py-4">
            <CardTitle className="text-base">{dialogTitle}</CardTitle>
            <CardDescription className="text-sm leading-6">
              {messages.inspector.openClawManagement.confirmation.description(actionLabel)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end gap-2 px-5 py-4">
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
              {messages.inspector.openClawManagement.confirmation.cancel}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={onConfirm}>
              {busy ? messages.inspector.openClawManagement.confirmation.confirming : messages.inspector.openClawManagement.confirmation.confirm}
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function EnvironmentSectionCard({ children, count = 0, defaultOpen = false, forceOpen = false, label, messages, wrapContent = true }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);
  const shouldShowCount = Number.isFinite(count) && count > 0;

  useEffect(() => {
    if (forceOpen) {
      setCollapsed(false);
    }
  }, [forceOpen]);

  return (
    <section className="space-y-1.5">
      <div className="px-1 py-0.5">
        <button
          type="button"
          className={cn(
            "grid min-h-9 w-full items-center gap-2 text-left",
            shouldShowCount ? "grid-cols-[1rem_minmax(0,1fr)_auto]" : "grid-cols-[1rem_minmax(0,1fr)]",
          )}
          aria-expanded={!collapsed}
          aria-label={`${label} ${collapsed ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
          onClick={() => {
            setCollapsed((current) => !current);
          }}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsed ? "-rotate-90" : "rotate-0")} />
          <div className="min-w-0 text-[13px] font-semibold leading-5 text-foreground">{label}</div>
          {shouldShowCount ? (
            <Badge variant="secondary" className="h-6 min-w-6 justify-center rounded-full border border-border/70 bg-background px-1.5 py-0 text-[10px] font-medium text-foreground">
              {count}
            </Badge>
          ) : null}
        </button>
      </div>
      {!collapsed ? (
        wrapContent ? (
          <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardContent className="space-y-2 px-3.5 py-3">
              {children}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">{children}</div>
        )
      ) : null}
    </section>
  );
}

function FileLink({ item, compact = false, currentWorkspaceRoot = "", label, onOpenPreview, onOpenContextMenu, onRevealInFileManager }) {
  const isDirectory = item.kind === "目录";
  const canPreview = Boolean((item.fullPath || item.path) && !isDirectory);
  const canReveal = Boolean((item.fullPath || item.path) && isDirectory && typeof onRevealInFileManager === "function");
  const canOpen = canPreview || canReveal;
  const displayPath = label || formatDisplayPath(item, currentWorkspaceRoot);

  return (
    <button
      type="button"
      onContextMenu={(event) => {
        if (!canPreview) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu?.(event, item);
      }}
      onClick={() => {
        if (canPreview) {
          onOpenPreview?.(item);
        } else if (canReveal) {
          onRevealInFileManager?.(item);
        }
      }}
      className={cn(
        "block w-full appearance-none rounded-sm border-0 bg-transparent px-1.5 text-left shadow-none transition-[background-color,color,box-shadow] focus:outline-none focus-visible:outline-none",
        canOpen ? "cursor-pointer hover:bg-accent/25 focus-visible:bg-accent/15 focus-visible:ring-1 focus-visible:ring-border/35" : "",
        compact ? "px-0 py-px" : "px-2 py-1",
      )}
      title={item.fullPath || item.path}
      disabled={!canOpen}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 font-mono",
          compact ? "text-[11px] leading-[1.35]" : "text-sm",
        )}
      >
        {isDirectory ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/80" aria-hidden="true">
            <FolderOpen data-testid="file-link-directory-icon" className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <span className={cn("file-link min-w-0 flex-1 break-all transition-colors", canOpen ? "" : "no-underline")}>{displayPath}</span>
      </div>
    </button>
  );
}

function normalizeWorkspaceNodes(items = [], currentWorkspaceRoot = "") {
  return items.map((item) => {
    const resolvedPath = resolveItemPath(item);
    const displayPath = formatDisplayPath(item, currentWorkspaceRoot);
    const normalizedChildren = Array.isArray(item?.children)
      ? normalizeWorkspaceNodes(item.children, currentWorkspaceRoot)
      : [];
    const fallbackName =
      item?.name
      || displayPath.split("/").filter(Boolean).pop()
      || resolvedPath.split("/").filter(Boolean).pop()
      || "";

    return {
      ...item,
      key: resolvedPath || `${item.kind || "item"}:${fallbackName}`,
      name: fallbackName,
      path: item?.path || resolvedPath,
      fullPath: item?.fullPath || resolvedPath,
      hasChildren: Boolean(item?.hasChildren) || normalizedChildren.length > 0,
      loaded: item?.kind !== "目录" || item?.hasChildren === false || normalizedChildren.length > 0,
      loading: false,
      expanded: Boolean(item?.expanded) || normalizedChildren.length > 0,
      error: "",
      children: normalizedChildren,
    };
  });
}

function joinPathSegments(basePath = "", segments = []) {
  if (!segments.length) {
    return basePath || "";
  }

  if (basePath === "/") {
    return `/${segments.join("/")}`;
  }

  const normalizedBase = String(basePath || "").replace(/\/+$/, "");
  return normalizedBase ? `${normalizedBase}/${segments.join("/")}` : segments.join("/");
}

function getSessionTreeLocation(item, currentWorkspaceRoot = "") {
  const sourcePath = resolveItemPath(item).replace(/\\/g, "/");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");

  if (!sourcePath) {
    return { basePath: "", segments: [] };
  }

  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return {
      basePath: workspaceRoot,
      segments: relativePath.split("/").filter(Boolean),
    };
  }

  if (sourcePath.startsWith(`${homePrefix}/`)) {
    return {
      basePath: homePrefix,
      segments: sourcePath.slice(homePrefix.length).replace(/^\/+/, "").split("/").filter(Boolean),
    };
  }

  return {
    basePath: sourcePath.startsWith("/") ? "/" : "",
    segments: sourcePath.replace(/^\/+/, "").split("/").filter(Boolean),
  };
}

function sortTreeNodes(nodes = []) {
  return [...nodes]
    .map((node) => (
      node.kind === "目录"
        ? { ...node, children: sortTreeNodes(node.children || []) }
        : node
    ))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "目录" ? -1 : 1;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), undefined, { numeric: true, sensitivity: "base" });
    });
}

function buildSessionTreeNodes(items = [], currentWorkspaceRoot = "") {
  const rootNodes = [];

  [...items]
    .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot))
    .forEach((item) => {
      const sourcePath = resolveItemPath(item);
      const { basePath, segments } = getSessionTreeLocation(item, currentWorkspaceRoot);
      if (!sourcePath || !segments.length) {
        return;
      }

      let currentLevel = rootNodes;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const name = segments[index];
        const fullPath = joinPathSegments(basePath, segments.slice(0, index + 1));
        let node = currentLevel.find((candidate) => candidate.kind === "目录" && candidate.fullPath === fullPath);
        if (!node) {
          node = {
            key: `session-dir:${fullPath}`,
            name,
            path: fullPath,
            fullPath,
            kind: "目录",
            loaded: true,
            children: [],
          };
          currentLevel.push(node);
        }
        currentLevel = node.children;
      }

      currentLevel.push({
        ...item,
        key: sourcePath,
        name: segments.at(-1) || sourcePath.split("/").pop() || "",
        path: sourcePath,
        fullPath: sourcePath,
        kind: "文件",
      });
    });

  return sortTreeNodes(rootNodes);
}

function getCompactDirectoryChain(node) {
  const chain = [node];
  let currentNode = node;

  while (
    currentNode?.kind === "目录"
    && currentNode.loaded
    && !currentNode.loading
    && !currentNode.error
    && Array.isArray(currentNode.children)
    && currentNode.children.length === 1
    && currentNode.children[0]?.kind === "目录"
  ) {
    currentNode = currentNode.children[0];
    chain.push(currentNode);
  }

  return chain;
}

function formatCompactDirectoryLabel(chain = []) {
  return chain.map((node) => node.name).filter(Boolean).join(" / ");
}

function renderCompactDirectoryLabel(chain = []) {
  const names = chain.map((node) => node.name).filter(Boolean);
  if (!names.length) {
    return null;
  }

  if (names.length === 1) {
    return <span className="truncate">{names[0]}</span>;
  }

  const parts = [];
  names.forEach((name, index) => {
    if (index > 0) {
      parts.push(
        <span
          key={`separator-${index}`}
          aria-hidden="true"
          className="shrink-0 text-[10px] font-normal text-muted-foreground/45"
        >
          /
        </span>,
      );
    }

    parts.push(
      <span
        key={`segment-${index}`}
        className={cn(index === names.length - 1 ? "truncate" : "shrink-0")}
      >
        {name}
      </span>,
    );
  });

  return (
    <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
      {parts}
    </span>
  );
}

function mergeWorkspaceNodes(previousNodes = [], nextNodes = []) {
  const previousByPath = new Map(
    previousNodes
      .map((node) => [resolveItemPath(node), node])
      .filter(([nodePath]) => Boolean(nodePath)),
  );

  return nextNodes.map((node) => {
    const nodePath = resolveItemPath(node);
    const previousNode = previousByPath.get(nodePath);

    if (!previousNode || node.kind !== "目录") {
      return previousNode && node.kind !== "目录"
        ? { ...node, expanded: previousNode.expanded, loaded: previousNode.loaded, loading: previousNode.loading, error: previousNode.error }
        : node;
    }

    return {
      ...node,
      expanded: previousNode.expanded,
      loaded: previousNode.loaded || node.loaded,
      loading: previousNode.loading,
      error: previousNode.error,
      children: previousNode.children || [],
      hasChildren: previousNode.hasChildren || node.hasChildren,
    };
  });
}

function updateWorkspaceNode(nodes = [], targetPath = "", updater) {
  return nodes.map((node) => {
    const nodePath = resolveItemPath(node);
    if (nodePath === targetPath) {
      return updater(node);
    }
    if (node.kind === "目录" && node.children?.length) {
      return {
        ...node,
        children: updateWorkspaceNode(node.children, targetPath, updater),
      };
    }
    return node;
  });
}

function WorkspaceTreeNode({ currentWorkspaceRoot = "", depth = 0, messages, node, onOpenContextMenu, onOpenDirectory, onOpenPreview }) {
  const isDirectory = node.kind === "目录";
  const compactChain = isDirectory ? getCompactDirectoryChain(node) : [];
  const visibleNode = compactChain.at(-1) || node;
  const displayName = compactChain.length ? formatCompactDirectoryLabel(compactChain) : node.name;
  const isExpandable = isDirectory && (visibleNode.hasChildren || visibleNode.children?.length || visibleNode.loading || visibleNode.error);

  if (!isDirectory) {
    return (
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <FileLink
          item={node}
          label={node.name}
          compact
          currentWorkspaceRoot={currentWorkspaceRoot}
          onOpenPreview={onOpenPreview}
          onOpenContextMenu={onOpenContextMenu}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm py-0.5 text-left text-[11px] font-medium text-muted-foreground transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/35",
          !isExpandable && "cursor-default hover:bg-transparent",
        )}
        aria-expanded={isExpandable ? node.expanded : undefined}
        aria-label={`${displayName} ${node.expanded ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenContextMenu?.(event, node);
        }}
        onClick={() => {
          if (isExpandable || !node.loaded) {
            onOpenDirectory?.(node);
          }
        }}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpandable ? (node.expanded ? "rotate-0" : "-rotate-90") : "opacity-0")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        {compactChain.length ? renderCompactDirectoryLabel(compactChain) : <span className="truncate">{displayName}</span>}
      </button>
      {node.expanded ? (
        <div className="space-y-1">
          {visibleNode.loading ? (
            <div className="px-1 py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              {messages.inspector.workspaceTree.loadingFolder}
            </div>
          ) : null}
          {!visibleNode.loading && visibleNode.error ? (
            <div className="px-1 py-1 text-[11px] text-rose-500" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              {visibleNode.error}
            </div>
          ) : null}
          {!visibleNode.loading && !visibleNode.error && visibleNode.loaded && !visibleNode.children.length ? (
            <div className="px-1 py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              {messages.inspector.workspaceTree.emptyFolder}
            </div>
          ) : null}
          {!visibleNode.loading && !visibleNode.error ? visibleNode.children.map((child) => (
            <WorkspaceTreeNode
              key={child.key}
              currentWorkspaceRoot={currentWorkspaceRoot}
              depth={depth + 1}
              messages={messages}
              node={child}
              onOpenPreview={onOpenPreview}
              onOpenContextMenu={onOpenContextMenu}
              onOpenDirectory={onOpenDirectory}
            />
          )) : null}
        </div>
      ) : null}
    </div>
  );
}

function SessionTreeNode({
  currentWorkspaceRoot = "",
  depth = 0,
  expandedDirectories = {},
  messages,
  node,
  onOpenContextMenu,
  onOpenPreview,
  onToggleDirectory,
}) {
  const isDirectory = node.kind === "目录";
  const compactChain = isDirectory ? getCompactDirectoryChain(node) : [];
  const visibleNode = compactChain.at(-1) || node;
  const displayName = compactChain.length ? formatCompactDirectoryLabel(compactChain) : node.name;

  if (!isDirectory) {
    return (
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <FileLink
          item={node}
          label={node.name}
          compact
          currentWorkspaceRoot={currentWorkspaceRoot}
          onOpenPreview={onOpenPreview}
          onOpenContextMenu={onOpenContextMenu}
        />
      </div>
    );
  }

  const isExpanded = expandedDirectories[node.fullPath] ?? true;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-left text-[11px] font-medium text-muted-foreground transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/35"
        aria-expanded={isExpanded}
        aria-label={`${displayName} ${isExpanded ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onClick={() => {
          onToggleDirectory?.(node.fullPath);
        }}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        {compactChain.length ? renderCompactDirectoryLabel(compactChain) : <span className="truncate">{displayName}</span>}
      </button>
      {isExpanded ? (
        <div className="space-y-1">
          {visibleNode.children.map((child) => (
            <SessionTreeNode
              key={child.key}
              currentWorkspaceRoot={currentWorkspaceRoot}
              depth={depth + 1}
              expandedDirectories={expandedDirectories}
              messages={messages}
              node={child}
              onOpenPreview={onOpenPreview}
              onOpenContextMenu={onOpenContextMenu}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileContextMenu({ menu, messages, onClose, onOpenEdit, onOpenPreview, onRefreshDirectory }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu) {
      return;
    }

    const menuNode = menuRef.current;
    if (!menuNode) {
      setPosition({ left: menu.x, top: menu.y });
      return;
    }

    const rect = menuNode.getBoundingClientRect();
    const maxLeft = Math.max(contextMenuViewportPadding, window.innerWidth - rect.width - contextMenuViewportPadding);
    const maxTop = Math.max(contextMenuViewportPadding, window.innerHeight - rect.height - contextMenuViewportPadding);

    setPosition({
      left: Math.min(Math.max(contextMenuViewportPadding, menu.x), maxLeft),
      top: Math.min(Math.max(contextMenuViewportPadding, menu.y), maxTop),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleViewportChange = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard?.writeText?.(resolveItemPath(menu.item));
    } finally {
      onClose();
    }
  };
  const canPreview = canPreviewFileItem(menu.item);
  const canEdit = canEditFileItem(menu.item);
  const canRefreshDirectory = menu.item?.kind === "目录" && typeof onRefreshDirectory === "function";
  const targetPath = resolveItemPath(menu.item);
  const vscodeHref = getVsCodeHref(targetPath);
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages);

  const handleRevealInFileManager = async () => {
    try {
      const response = await apiFetch("/api/file-manager/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Reveal in file manager failed");
      }
    } finally {
      onClose();
    }
  };

  const handleOpenInVsCode = () => {
    try {
      if (vscodeHref) {
        window.open(vscodeHref, "_blank", "noopener,noreferrer");
      }
    } finally {
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={messages.inspector.fileMenu.label}
      className="fixed z-50 min-w-40 rounded-md border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: position.left, top: position.top }}
    >
      {canRefreshDirectory ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onRefreshDirectory(menu.item).catch(() => {});
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
        >
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{messages.inspector.fileMenu.refresh}</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!canPreview}
            onClick={() => {
              if (!canPreview) {
                return;
              }
              onOpenPreview?.(menu.item);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.fileMenu.preview}</span>
          </button>
          {canEdit ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenEdit?.(menu.item);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{messages.inspector.fileMenu.edit}</span>
            </button>
          ) : null}
        </>
      )}
      {!canRefreshDirectory ? (
        <>
          <div role="separator" className="my-1 h-px bg-border/70" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              handleRevealInFileManager().catch(() => {});
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.previewActions.revealInFileManager(fileManagerLabel)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleOpenInVsCode}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.previewActions.openInCodeEditor}</span>
          </button>
          <div role="separator" className="my-1 h-px bg-border/70" />
        </>
      ) : null}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleCopyPath().catch(() => {});
        }}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
      >
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{messages.inspector.fileMenu.copyPath}</span>
      </button>
    </div>
  );
}

function FileGroupSection({ children, count = 0, defaultOpen = true, label, messages, onToggle, action, spacingClassName = "space-y-2" }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  return (
    <section className={cn(spacingClassName)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="grid min-w-0 flex-1 grid-cols-[1rem_auto_auto_1fr] items-center gap-2 rounded-md py-0.5 text-left transition hover:bg-muted/20"
          aria-expanded={!collapsed}
          aria-label={`${label} ${collapsed ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
          onClick={() => setCollapsed((current) => {
            const nextCollapsed = !current;
            onToggle?.(!nextCollapsed);
            return nextCollapsed;
          })}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsed ? "-rotate-90" : "rotate-0")} />
          <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
          <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
            {count}
          </Badge>
        </button>
        {action ? <div className="min-w-0 w-[10.5rem] max-w-[44%] shrink">{action}</div> : null}
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

function FileFilterInput({ filterInput, messages, onChange, onClear }) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{messages.label}</span>
      <input
        type="text"
        value={filterInput}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={messages.placeholder}
        aria-label={messages.label}
        className="flex h-7 w-full rounded-md border border-input bg-background px-2.5 py-1 pr-8 text-[12px] leading-none shadow-xs transition-[color,box-shadow] outline-none placeholder:text-[12px] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {filterInput ? (
        <button
          type="button"
          aria-label={messages.clear}
          onClick={onClear}
          className="absolute inset-y-0 right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

function FilesTab({
  currentAgentId = "",
  currentWorkspaceRoot = "",
  currentSessionUser = "",
  items,
  messages,
  onOpenEdit,
  onOpenPreview,
  workspaceCount,
  workspaceItems = [],
  workspaceLoaded = false,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [sessionFilterInput, setSessionFilterInput] = useState("");
  const [workspaceFilterInput, setWorkspaceFilterInput] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const fileActionSections = [
    { key: "created", label: messages.inspector.fileActions.created },
    { key: "modified", label: messages.inspector.fileActions.modified },
    { key: "viewed", label: messages.inspector.fileActions.viewed },
  ];
  const sessionFilterMatcher = buildFileFilterMatcher(sessionFilterInput);
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: items
        .filter((item) => item.primaryAction === section.key)
        .filter((item) => (sessionFilterMatcher ? sessionFilterMatcher(item, currentWorkspaceRoot) : true))
        .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot)),
    }))
    .filter((section) => section.items.length);
  const [workspaceNodes, setWorkspaceNodes] = useState(() => normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
  const [workspaceState, setWorkspaceState] = useState({
    loaded: workspaceLoaded,
    loading: false,
    error: "",
  });
  const previousWorkspaceRootRef = useRef(currentWorkspaceRoot);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [expandedSessionDirectories, setExpandedSessionDirectories] = useState({});
  const hasSessionFiles = items.length > 0;
  const hasSessionFilter = Boolean(String(sessionFilterInput || "").trim());
  const visibleSessionCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hasWorkspaceFilter = Boolean(String(workspaceFilter || "").trim());
  const visibleWorkspaceCount = hasWorkspaceFilter
    ? countWorkspaceFiles(workspaceNodes)
    : (Number.isFinite(workspaceCount) ? workspaceCount : workspaceNodes.length);

  const loadWorkspaceDirectoryChildren = useCallback(async (targetPath) => {
    const directChildren = await requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      targetPath,
    });

    if (directChildren.length === 1 && directChildren[0]?.kind === "目录" && directChildren[0].hasChildren) {
      const onlyChild = directChildren[0];
      const nestedChildren = await loadWorkspaceDirectoryChildren(resolveItemPath(onlyChild));
      return [
        {
          ...onlyChild,
          children: nestedChildren,
          loaded: true,
          expanded: true,
          loading: false,
          error: "",
          hasChildren: nestedChildren.length > 0,
        },
      ];
    }

    return directChildren;
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot]);

  const fetchWorkspaceDirectory = useCallback(async (node, { preserveExpanded } = {}) => {
    const nodePath = resolveItemPath(node);
    if (!nodePath) {
      return;
    }

    setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
      ...currentNode,
      expanded: preserveExpanded ?? currentNode.expanded,
      loading: true,
      error: "",
    })));

    try {
      const children = await loadWorkspaceDirectoryChildren(nodePath);
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
        ...currentNode,
        children,
        expanded: preserveExpanded ?? currentNode.expanded,
        loaded: true,
        loading: false,
        error: "",
        hasChildren: children.length > 0,
      })));
    } catch (error) {
      console.error(error);
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
        ...currentNode,
        expanded: preserveExpanded ?? currentNode.expanded,
        loading: false,
        error: messages.inspector.workspaceTree.loadFailed,
      })));
    }
  }, [loadWorkspaceDirectoryChildren, messages.inspector.workspaceTree.loadFailed]);

  useEffect(() => {
    const workspaceRootChanged = previousWorkspaceRootRef.current !== currentWorkspaceRoot;
    previousWorkspaceRootRef.current = currentWorkspaceRoot;

    if (workspaceRootChanged) {
      setExpandedSessionDirectories({});
      setSessionFilterInput("");
      setWorkspaceFilterInput("");
      setWorkspaceFilter("");
      setWorkspaceNodes(normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
      setWorkspaceState({
        loaded: workspaceLoaded,
        loading: false,
        error: "",
      });
      return;
    }

    if (!hasWorkspaceFilter) {
      const nextNodes = normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot);
      const hasFreshWorkspaceSnapshot = workspaceLoaded || nextNodes.length > 0;

      if (hasFreshWorkspaceSnapshot) {
        setWorkspaceNodes((current) => (workspaceLoaded ? mergeWorkspaceNodes(current, nextNodes) : nextNodes));
        setWorkspaceState((current) => ({
          ...current,
          loaded: workspaceLoaded,
          loading: false,
          error: "",
        }));
      }
    }
  }, [currentWorkspaceRoot, hasWorkspaceFilter, workspaceItems, workspaceLoaded]);

  useEffect(() => {
    const nextFilter = String(workspaceFilterInput || "");
    if (!nextFilter.trim()) {
      setWorkspaceFilter("");
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setWorkspaceFilter(nextFilter);
    }, WORKSPACE_FILTER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspaceFilterInput]);

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = {};
      let changed = false;

      for (const group of groups) {
        if (Object.prototype.hasOwnProperty.call(current, group.key)) {
          next[group.key] = current[group.key];
        } else {
          next[group.key] = false;
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }

      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!hasWorkspaceFilter || !currentWorkspaceRoot) {
      return undefined;
    }

    let cancelled = false;
    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));

    requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      filter: workspaceFilter.trim(),
    })
      .then((nextNodes) => {
        if (cancelled) {
          return;
        }
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setWorkspaceNodes([]);
        setWorkspaceState({
          loaded: false,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot, hasWorkspaceFilter, messages.inspector.workspaceTree.loadFailed, workspaceFilter]);

  const loadWorkspaceRoot = async () => {
    if (workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const nextNodes = await requestWorkspaceTree({
        currentAgentId,
        currentSessionUser,
        currentWorkspaceRoot,
        filter: hasWorkspaceFilter ? workspaceFilter.trim() : "",
      });
      setWorkspaceNodes(nextNodes);
      setWorkspaceState({ loaded: true, loading: false, error: "" });
    } catch (error) {
      console.error(error);
      setWorkspaceState({
        loaded: false,
        loading: false,
        error: messages.inspector.workspaceTree.loadFailed,
      });
    }
  };

  useEffect(() => {
    if (hasWorkspaceFilter || workspaceLoaded || workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
    })
      .then((nextNodes) => {
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      })
      .catch((error) => {
        console.error(error);
        setWorkspaceState({
          loaded: false,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        });
      });
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree.loadFailed,
    workspaceLoaded,
    workspaceState.loaded,
    workspaceState.loading,
  ]);

  const handleWorkspaceDirectoryOpen = async (node) => {
    const nodePath = resolveItemPath(node);

    if (!nodePath || node.loading) {
      return;
    }

    if (node.expanded) {
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({ ...currentNode, expanded: false })));
      return;
    }

    if (node.loaded) {
      setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({ ...currentNode, expanded: true })));
      return;
    }

    await fetchWorkspaceDirectory(node, { preserveExpanded: true });
  };

  const handleRefreshWorkspaceDirectory = useCallback(async (node) => {
    await fetchWorkspaceDirectory(node);
  }, [fetchWorkspaceDirectory]);

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1 pr-4">
          <InspectorHint text={messages.inspector.filesHint} />
          {hasSessionFiles ? (
            <FileGroupSection
              count={hasSessionFilter ? visibleSessionCount : items.length}
              defaultOpen
              label={messages.inspector.fileCollections.session}
              messages={messages}
              spacingClassName="space-y-1"
              action={(
                <FileFilterInput
                  filterInput={sessionFilterInput}
                  messages={messages.inspector.sessionFilter}
                  onChange={setSessionFilterInput}
                  onClear={() => {
                    setSessionFilterInput("");
                  }}
                />
              )}
            >
              {groups.length ? (
                <div className="space-y-1 pl-2">
                  {groups.map((group) => (
                    <section key={group.key} className="space-y-1">
                      <button
                        type="button"
                        className="grid w-full grid-cols-[1rem_auto_auto_1fr] items-center gap-2 rounded-md py-0.5 text-left transition hover:bg-muted/20"
                        aria-expanded={!collapsedGroups[group.key]}
                        aria-label={`${group.label} ${collapsedGroups[group.key] ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
                        onClick={() => {
                          setCollapsedGroups((current) => ({
                            ...current,
                            [group.key]: !current[group.key],
                          }));
                        }}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsedGroups[group.key] ? "-rotate-90" : "rotate-0")} />
                        <div className="text-[11px] font-medium uppercase text-muted-foreground">{group.label}</div>
                        <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
                          {group.items.length}
                        </Badge>
                      </button>
                      {!collapsedGroups[group.key] ? (
                        <div className="space-y-1 pl-2">
                          {buildSessionTreeNodes(group.items, currentWorkspaceRoot).map((node) => (
                            <SessionTreeNode
                              key={`${group.key}-${node.key}`}
                              currentWorkspaceRoot={currentWorkspaceRoot}
                              expandedDirectories={expandedSessionDirectories}
                              messages={messages}
                              node={node}
                              onOpenPreview={onOpenPreview}
                              onOpenContextMenu={(event, nextItem) => {
                                setContextMenu({
                                  item: nextItem,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              onToggleDirectory={(directoryPath) => {
                                setExpandedSessionDirectories((current) => ({
                                  ...current,
                                  [directoryPath]: !(current[directoryPath] ?? true),
                                }));
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              ) : <PanelEmpty compact text={hasSessionFilter ? messages.inspector.sessionFilter.empty(sessionFilterInput.trim()) : messages.inspector.empty.files} />}
            </FileGroupSection>
          ) : null}

          <FileGroupSection
            count={visibleWorkspaceCount}
            defaultOpen={false}
            label={messages.inspector.fileCollections.workspace}
            messages={messages}
            action={(
              <FileFilterInput
                filterInput={workspaceFilterInput}
                messages={messages.inspector.workspaceFilter}
                onChange={setWorkspaceFilterInput}
                onClear={() => {
                  setWorkspaceFilterInput("");
                  setWorkspaceFilter("");
                }}
              />
            )}
            onToggle={(expanded) => {
              if (expanded) {
                loadWorkspaceRoot().catch(() => {});
              }
            }}
          >
            {workspaceState.loading ? (
              <PanelEmpty compact text={messages.inspector.workspaceTree.loading} />
            ) : workspaceState.error ? (
              <PanelEmpty compact text={workspaceState.error} />
            ) : workspaceNodes.length ? (
              <div className="space-y-1 pl-2">
                {workspaceNodes.map((node) => (
                  <WorkspaceTreeNode
                    key={node.key}
                    currentWorkspaceRoot={currentWorkspaceRoot}
                    messages={messages}
                    node={node}
                    onOpenPreview={onOpenPreview}
                    onOpenDirectory={handleWorkspaceDirectoryOpen}
                    onOpenContextMenu={(event, nextItem) => {
                      setContextMenu({
                        item: nextItem,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  />
                ))}
              </div>
            ) : <PanelEmpty compact text={hasWorkspaceFilter ? messages.inspector.workspaceFilter.empty(workspaceFilter.trim()) : messages.inspector.empty.workspaceFiles} />}
          </FileGroupSection>
        </div>
      </ScrollArea>
      <FileContextMenu
        menu={contextMenu}
        messages={messages}
        onClose={() => setContextMenu(null)}
        onOpenEdit={onOpenEdit}
        onOpenPreview={onOpenPreview}
        onRefreshDirectory={!hasWorkspaceFilter ? handleRefreshWorkspaceDirectory : undefined}
      />
    </>
  );
}

function PanelEmpty({ compact = false, text }) {
  return (
    <div className={cn(compact && "rounded-[16px]")}>
      <div className={cn("flex items-center justify-center text-center text-sm text-muted-foreground", compact ? "px-5 py-5" : "py-8")}>
        {text}
      </div>
    </div>
  );
}

function InspectorHint({ text }) {
  if (!text) {
    return null;
  }

  return (
    <p className="pr-6 text-[11px] leading-5 text-muted-foreground/80">
      {text}
    </p>
  );
}

function TabCountBadge({ count, active = false }) {
  if (!count) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none transition-colors",
        active
          ? "border-white/12 bg-black/14 text-white"
          : "border-[var(--inspector-tab-count-border)] bg-[var(--inspector-tab-count-bg)] text-[var(--inspector-tab-count-fg)]",
      )}
    >
      {count}
    </span>
  );
}

function DataList({ empty, getItemActionLabel, headerAction, hint, items, onSelect, render }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-2 py-1 pr-4">
        {headerAction ? (
          <div className="flex items-start justify-between gap-2">
            <InspectorHint text={hint} />
            {headerAction}
          </div>
        ) : (
          <InspectorHint text={hint} />
        )}
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item, index) => (
              <Card key={getItemKey(item, index)}>
                <CardContent className={cn(onSelect ? "p-0" : "py-4")}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-label={getItemActionLabel?.(item) || item.title || item.label || "item"}
                      className="block w-full rounded-[inherit] px-6 py-4 text-left transition hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {render(item)}
                    </button>
                  ) : render(item)}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <PanelEmpty text={empty} />}
      </div>
    </ScrollArea>
  );
}

function TimelineDetailCard({ title, children, emptyText }) {
  return (
    <section className="space-y-1.5">
      <div className="text-left text-xs font-medium text-muted-foreground">{title}</div>
      {children || <PanelEmpty text={emptyText} compact />}
    </section>
  );
}

function looksLikeJson(value = "") {
  const trimmed = String(value || "").trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function CopyCodeButton({ content }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/75 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function HoverCopyValueButton({ content }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function ToolIoCodeBlock({ emptyText, label, resolvedTheme = "light", value }) {
  const content = String(value || emptyText || "").trim() || String(emptyText || "");
  const language = looksLikeJson(content) ? "json" : "text";
  const toolIoTheme = resolvedTheme === "dark" ? darkToolIoTheme : lightToolIoTheme;
  const highlightedLanguage = usePrismLanguage(language);

  return (
    <div
      className={cn(
        "rounded-lg border",
        resolvedTheme === "dark" ? "border-border bg-background/90" : "border-slate-200 bg-[#fbfcfe]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] font-medium",
          resolvedTheme === "dark" ? "border-border/70 text-muted-foreground" : "border-slate-200 text-slate-500",
        )}
      >
        <span>{label}</span>
        <CopyCodeButton content={content} />
      </div>
      <Highlight prism={Prism} theme={toolIoTheme} code={content} language={highlightedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "tool-io-code overflow-x-auto px-0 py-2 whitespace-pre-wrap",
              resolvedTheme === "dark" ? "text-zinc-50" : "text-slate-800",
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className="min-h-5 px-3">
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function ToolCallCard({ isFirst = false, isLast = false, messages, resolvedTheme = "light", tool }) {
  const [open, setOpen] = useState(true);
  const normalizedStatus = normalizeStatusKey(tool.status);
  const localizedStatus = getLocalizedStatusLabel(tool.status, messages);

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <div className="relative flex justify-center">
        {!isFirst ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-0 h-[0.625rem] w-px bg-border/70" /> : null}
        <div
          aria-hidden="true"
          className={cn(
            "relative mt-[0.625rem] h-2.5 w-2.5 rounded-full border",
            normalizedStatus === "failed"
              ? "border-rose-400/60 bg-rose-400/20"
              : resolvedTheme === "dark"
                ? "border-emerald-400/50 bg-emerald-400/20"
                : "border-emerald-500/50 bg-emerald-500/15",
          )}
        />
        {!isLast ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-[calc(0.625rem+0.625rem)] bottom-0 w-px bg-border/70" /> : null}
      </div>
      <div className={cn("min-w-0 space-y-3", !isLast && "pb-4")}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${tool.name} ${open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-muted/20"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium">{tool.name}</div>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </div>
          <Badge variant={normalizedStatus === "failed" ? "default" : "success"} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
            {localizedStatus}
          </Badge>
        </button>

        {open ? (
          <div className="space-y-2 text-xs leading-6">
            <ToolIoCodeBlock label={messages.inspector.timeline.input} value={tool.input} emptyText={messages.inspector.timeline.none} resolvedTheme={resolvedTheme} />
            <ToolIoCodeBlock label={messages.inspector.timeline.output} value={tool.output || tool.detail} emptyText={messages.inspector.timeline.noOutput} resolvedTheme={resolvedTheme} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallTimeline({ messages, resolvedTheme = "light", tools }) {
  if (!tools?.length) {
    return null;
  }

  const orderedTools = tools
    .map((tool, index) => ({ tool, index }))
    .sort((left, right) => {
      const leftTimestamp = Number(left.tool?.timestamp || 0);
      const rightTimestamp = Number(right.tool?.timestamp || 0);
      const leftHasTimestamp = Number.isFinite(leftTimestamp) && leftTimestamp > 0;
      const rightHasTimestamp = Number.isFinite(rightTimestamp) && rightTimestamp > 0;

      if (leftHasTimestamp && rightHasTimestamp && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      if (leftHasTimestamp !== rightHasTimestamp) {
        return rightHasTimestamp ? 1 : -1;
      }

      return left.index - right.index;
    })
    .map(({ tool }) => tool);

  return (
    <div className="space-y-0">
      {orderedTools.map((tool, toolIndex) => (
        <ToolCallCard
          key={tool.id || `${tool.name}-${tool.timestamp}`}
          isFirst={toolIndex === 0}
          isLast={toolIndex === orderedTools.length - 1}
          tool={tool}
          messages={messages}
          resolvedTheme={resolvedTheme}
        />
      ))}
    </div>
  );
}

function getRelationshipDisplay(relationship, messages) {
  const fallbackLabel =
    relationship?.type === "session_spawn"
      ? messages.inspector.relationships.sessionSpawn
      : relationship?.targetAgentId || messages.inspector.relationships.childAgent;
  const primaryLabel = relationship?.detail || fallbackLabel;
  const secondaryLabel = relationship?.detail && relationship?.detail !== fallbackLabel ? fallbackLabel : "";

  return {
    primaryLabel,
    secondaryLabel,
  };
}

function RelationshipCard({ relationship, sessionAgentId = "main", messages }) {
  const { primaryLabel, secondaryLabel } = getRelationshipDisplay(relationship, messages);
  const statusLabel = getLocalizedStatusLabel(relationship.status, messages);
  const statusBadgeProps = getRelationshipStatusBadgeProps(relationship.status);

  return (
    <Card className="border-border/70 bg-muted/15">
      <CardContent className="py-4">
        <div className="grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-3">
          <Badge variant="secondary" className="h-7 justify-center rounded-full px-2.5 text-[11px] font-medium">
            {relationship.sourceAgentId || sessionAgentId}
          </Badge>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-px flex-1 bg-border/70" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 text-left">
              <div className="truncate text-sm font-medium text-foreground">{primaryLabel}</div>
              {secondaryLabel ? <div className="truncate text-[11px] text-muted-foreground">{secondaryLabel}</div> : null}
            </div>
            {statusLabel ? (
              <Badge
                variant={statusBadgeProps.variant}
                className={`shrink-0 self-center whitespace-nowrap px-2 py-0.5 text-[11px] leading-5 ${statusBadgeProps.className}`}
              >
                {statusLabel}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineItemCard({ currentWorkspaceRoot = "", defaultOpen = false, item, messages, onOpenPreview, resolvedTheme = "light" }) {
  const { intlLocale } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const normalizedStatus = normalizeStatusKey(item.status);
  const localizedStatus = getLocalizedStatusLabel(item.status, messages);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  const badgeVariant =
    normalizedStatus === "failed"
      ? "default"
      : normalizedStatus === "running" || normalizedStatus === "dispatching"
        ? "success"
        : "active";
  const displayTime = item.timestamp
    ? new Intl.DateTimeFormat(intlLocale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.timestamp))
    : "";

  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                <span>{item.timestamp ? messages.inspector.timeline.runTitle : item.title}</span>
                {displayTime ? <span className="text-muted-foreground"> {displayTime}</span> : null}
              </div>
              <div className="text-sm text-muted-foreground">{item.prompt}</div>
            </div>
            <Badge variant={badgeVariant} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
              {localizedStatus}
            </Badge>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>{messages.inspector.timeline.tool}: {localizeStatusSummary(item.toolsSummary, messages) || messages.inspector.timeline.noToolCalls}</div>
            <div>{messages.inspector.timeline.result}: {item.outcome}</div>
          </div>
        </div>

        <Separator className="mt-4" />

        <div className="mt-2 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="relative h-7 justify-start rounded-md px-0 text-left text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown
              className={cn(
                "absolute -left-4 h-3.5 w-3.5 transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
            <span>{open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}</span>
          </Button>

          {open ? (
            <div className="space-y-3">
              <TimelineDetailCard title={messages.inspector.timeline.toolIo} emptyText={messages.inspector.empty.noTools}>
                {item.tools?.length ? <ToolCallTimeline tools={item.tools} messages={messages} resolvedTheme={resolvedTheme} /> : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.relationships.title} emptyText={messages.inspector.empty.agents}>
                {item.relationships?.length
                  ? item.relationships.map((relationship) => (
                      <RelationshipCard key={relationship.id} relationship={relationship} sessionAgentId={item.sessionAgentId || "main"} messages={messages} />
                    ))
                  : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.timeline.fileChanges} emptyText={messages.inspector.empty.noFiles}>
                {item.files?.length
                  ? item.files.map((file) => (
                      <Card key={file.path} className="border-border/70 bg-muted/15">
                        <CardContent className="py-4">
                          <FileLink item={file} currentWorkspaceRoot={currentWorkspaceRoot} onOpenPreview={onOpenPreview} />
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </TimelineDetailCard>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineTab({ currentWorkspaceRoot = "", items, messages, onOpenPreview, resolvedTheme }) {
  return (
    <div
      data-testid="timeline-scroll-region"
      className="cc-scroll-region min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2"
    >
      <div className="space-y-2 py-1">
        <InspectorHint text={messages.inspector.timelineHint} />
        {items.length
          ? (
            <div className="grid gap-3">
              {items.map((item, index) => (
                <TimelineItemCard
                  key={getItemKey(item, index)}
                  item={item}
                  defaultOpen={index === 0}
                  messages={messages}
                  onOpenPreview={onOpenPreview}
                  resolvedTheme={resolvedTheme}
                  currentWorkspaceRoot={currentWorkspaceRoot}
                />
              ))}
            </div>
          )
          : <PanelEmpty text={messages.inspector.empty.timeline} />}
      </div>
    </div>
  );
}

function EnvironmentTab({
  configEditor = null,
  history = null,
  items = [],
  lalaclawFlow = null,
  management = null,
  messages,
  onboarding = null,
  onOpenPreview,
  onOpenRemoteGuide,
  onRevealInFileManager,
  updateFlow = null,
}) {
  if (!items.length) {
    return <PanelEmpty text={messages.inspector.empty.noEnvironment} />;
  }

  const { sections: openClawDiagnostics, remainingItems } = collectOpenClawDiagnostics(items);
  const lalaclawItems = remainingItems.filter((item) => isLalaClawEnvironmentItem(item));
  const groupedEnvironmentItems = collectEnvironmentGroups(
    remainingItems.filter((item) => !isLalaClawEnvironmentItem(item)),
    messages,
  );
  const remoteGuard = buildOpenClawRemoteGuard(items, messages);

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="min-w-0">
      <div className="min-w-0 max-w-full space-y-2 overflow-hidden py-1 pr-4">
        <InspectorHint text={messages.inspector.empty.environment} />
        {lalaclawFlow?.enabled ? (
          <EnvironmentSectionCard
            defaultOpen={Boolean(lalaclawFlow.defaultOpen)}
            forceOpen={Boolean(lalaclawFlow.forceOpen)}
            label={messages.inspector.lalaclawUpdate.title}
            messages={messages}
            wrapContent={false}
          >
            <LalaClawPanel
              busy={lalaclawFlow.busy}
              error={lalaclawFlow.error}
              loading={lalaclawFlow.loading}
              messages={messages}
              metadataItems={lalaclawItems}
              onReload={lalaclawFlow.onReload}
              onRunUpdate={lalaclawFlow.onRunUpdate}
              showTitle={false}
              state={lalaclawFlow.state}
            />
          </EnvironmentSectionCard>
        ) : null}
        {onboarding?.enabled ? (
          <EnvironmentSectionCard
            defaultOpen={Boolean(onboarding.defaultOpen)}
            forceOpen={Boolean(onboarding.forceOpen)}
            label={messages.inspector.openClawOnboarding.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawOnboardingPanel
              busy={onboarding.busy}
              error={onboarding.error}
              loading={onboarding.loading}
              messages={messages}
              onChange={onboarding.onChange}
              onRefreshCapabilities={onboarding.onRefreshCapabilities}
              onReload={onboarding.onReload}
              onSubmit={onboarding.onSubmit}
              refreshResult={onboarding.refreshResult}
              result={onboarding.result}
              showTitle={false}
              state={onboarding.state}
              values={onboarding.values}
            />
          </EnvironmentSectionCard>
        ) : null}
        {configEditor?.enabled ? (
          <EnvironmentSectionCard
            label={messages.inspector.openClawConfig.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawConfigPanel
              busy={configEditor.busy}
              error={configEditor.error}
              loading={configEditor.loading}
              messages={messages}
              onChange={configEditor.onChange}
              onChangeRemoteAuthorization={configEditor.onChangeRemoteAuthorization}
              onOpenPreview={onOpenPreview}
              onOpenRemoteGuide={onOpenRemoteGuide}
              onReload={configEditor.onReload}
              onRevealInFileManager={onRevealInFileManager}
              onSubmit={configEditor.onSubmit}
              remoteAuthorization={configEditor.remoteAuthorization}
              remoteGuard={remoteGuard}
              result={configEditor.result}
              showTitle={false}
              state={configEditor.state}
              values={configEditor.values}
            />
          </EnvironmentSectionCard>
        ) : null}
        {updateFlow?.enabled ? (
          <EnvironmentSectionCard
            label={messages.inspector.openClawUpdate.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawUpdatePanel
              busy={updateFlow.busy}
              error={updateFlow.error}
              loading={updateFlow.loading}
              messages={messages}
              onOpenRemoteGuide={onOpenRemoteGuide}
              onOpenTroubleshooting={updateFlow.onOpenTroubleshooting}
              onReload={updateFlow.onReload}
              onRunUpdate={updateFlow.onRunUpdate}
              remoteGuard={remoteGuard}
              result={updateFlow.result}
              showTitle={false}
              state={updateFlow.state}
            />
          </EnvironmentSectionCard>
        ) : null}
        {management?.enabled ? (
          <EnvironmentSectionCard
            label={messages.inspector.openClawManagement.title}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawManagementPanel
              actionIntent={management.actionIntent}
              busyActionKey={management.busyActionKey}
              messages={messages}
              onOpenRemoteGuide={onOpenRemoteGuide}
              onRefresh={management.onRefresh}
              onRequestAction={management.onRequestAction}
              remoteGuard={remoteGuard}
              refreshing={management.refreshing}
              result={management.result}
              showTitle={false}
            />
          </EnvironmentSectionCard>
        ) : null}
        {history?.enabled ? (
          <EnvironmentSectionCard
            count={Array.isArray(history.entries) ? history.entries.length : 0}
            label={messages.inspector.remoteOperations.historyTitle}
            messages={messages}
            wrapContent={false}
          >
            <OpenClawOperationHistoryPanel
              entries={history.entries}
              error={history.error}
              loading={history.loading}
              messages={messages}
              onOpenGuide={onOpenRemoteGuide}
              onRequestRollback={history.onRequestRollback}
              onReload={history.onReload}
              rollbackBusy={history.rollbackBusy}
              remoteGuard={remoteGuard}
              showTitle={false}
            />
          </EnvironmentSectionCard>
        ) : null}
        {openClawDiagnostics.length ? (
          <div className="grid gap-2">
            {openClawDiagnostics.map((section) => (
              <EnvironmentSectionCard
                key={section.key}
                count={section.items.length}
                label={messages.inspector.openClawDiagnostics.sections?.[section.key] || section.key}
                messages={messages}
              >
                  {section.items.map((item, index) => {
                    const badgeProps = getOpenClawDiagnosticBadgeProps(item.value);
                    return (
                      <div
                        key={`${item.label}-${index}`}
                        className="group grid gap-0.5 overflow-hidden border-b border-border/55 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            {localizeOpenClawDiagnosticLabel(item.label, messages)}
                          </div>
                          <HoverCopyValueButton content={localizeOpenClawDiagnosticValue(item.value, messages)} />
                        </div>
                        {shouldRenderOpenClawDiagnosticBadge(item.label) ? (
                          <div>
                            <Badge variant={badgeProps.variant} className={`px-2 py-0.5 text-[11px] leading-5 ${badgeProps.className}`}>
                              {localizeOpenClawDiagnosticValue(item.value, messages)}
                            </Badge>
                          </div>
                        ) : shouldRenderEnvironmentPathLink(item) ? (
                          <div className="min-w-0 overflow-hidden">
                            <FileLink
                              item={buildEnvironmentPathItem(item)}
                              compact
                              currentWorkspaceRoot=""
                              label={localizeOpenClawDiagnosticValue(item.value, messages)}
                              onOpenPreview={onOpenPreview}
                              onRevealInFileManager={(targetItem) => {
                                onRevealInFileManager?.(targetItem).catch(() => {});
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word] font-mono text-[12px] leading-5 text-foreground">
                            {localizeOpenClawDiagnosticValue(item.value, messages)}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </EnvironmentSectionCard>
            ))}
          </div>
        ) : null}
        {groupedEnvironmentItems.map((group) => (
          <EnvironmentSectionCard
            key={group.key}
            count={group.items.length}
            label={group.label}
            messages={messages}
          >
            {group.items.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="group w-full min-w-0 max-w-full overflow-hidden border-b border-border/55 pb-2 last:border-b-0 last:pb-0"
              >
                <div className="min-w-0 space-y-0.5 overflow-hidden">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {localizeEnvironmentItemLabel(item.label, messages)}
                    </div>
                    <HoverCopyValueButton content={localizeEnvironmentItemValue(item.value, messages)} />
                  </div>
                  {shouldRenderEnvironmentPathLink(item) ? (
                    <div className="min-w-0 overflow-hidden">
                      <FileLink
                        item={buildEnvironmentPathItem(item)}
                        compact
                        currentWorkspaceRoot=""
                        label={localizeEnvironmentItemValue(item.value, messages)}
                        onOpenPreview={onOpenPreview}
                        onRevealInFileManager={(targetItem) => {
                          onRevealInFileManager?.(targetItem).catch(() => {});
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all [overflow-wrap:anywhere] [word-break:break-word] font-mono text-[12px] leading-5 text-foreground">
                      {localizeEnvironmentItemValue(item.value, messages)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </EnvironmentSectionCard>
        ))}
      </div>
    </ScrollArea>
  );
}

export function InspectorPanel({
  activeTab,
  artifacts,
  compact = false,
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  files,
  onSelectArtifact,
  onRefreshEnvironment,
  onSyncCurrentSessionModel,
  peeks,
  resolvedTheme = "light",
  runtimeFallbackReason = "",
  runtimeReconnectAttempts = 0,
  runtimeSocketStatus = "disconnected",
  runtimeTransport = "polling",
  setActiveTab,
  taskTimeline,
}) {
  const { messages } = useI18n();
  const { filePreview, imagePreview, handleOpenPreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const tabsListRef = useRef(null);
  const [showTabLabels, setShowTabLabels] = useState(true);
  const [tooltipTabKey, setTooltipTabKey] = useState("");
  const [compactSheetOpen, setCompactSheetOpen] = useState(false);
  const [contextPreviewOpen, setContextPreviewOpen] = useState(false);
  const resolvedActiveTab = inspectorTabKeys.includes(activeTab) ? activeTab : "files";
  const workspaceFiles = peeks?.workspace?.entries || [];
  const workspaceCount = Number(peeks?.workspace?.totalCount);
  const workspaceLoaded = Array.isArray(peeks?.workspace?.entries);
  const previewFiles = [...files, ...workspaceFiles].filter((item, index, collection) => {
    const itemKey = item?.fullPath || item?.path;
    if (!itemKey || item?.kind === "目录") {
      return false;
    }
    return collection.findIndex((candidate) => (candidate?.fullPath || candidate?.path) === itemKey) === index;
  });
  const runtimeEnvironmentItems = [
    {
      label: messages.inspector.environment.runtimeTransport,
      value: messages.sessionOverview.runtimeTransport?.[runtimeTransport] || runtimeTransport,
    },
    {
      label: messages.inspector.environment.runtimeSocket,
      value: messages.sessionOverview.runtimeSocket?.[runtimeSocketStatus] || runtimeSocketStatus,
    },
    ...(runtimeReconnectAttempts > 0
      ? [{
          label: messages.inspector.environment.runtimeReconnectAttempts,
          value: String(runtimeReconnectAttempts),
        }]
      : []),
    ...(runtimeFallbackReason
      ? [{
          label: messages.inspector.environment.runtimeFallbackReason,
          value: runtimeFallbackReason,
        }]
      : []),
  ];
  const handleRevealInFileManager = useCallback(async (item) => {
    const targetPath = resolveItemPath(item);
    if (!targetPath) {
      return;
    }

    const response = await apiFetch("/api/file-manager/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: targetPath }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Reveal in file manager failed");
    }
  }, []);
  const environmentSection = {
    summary: peeks?.environment?.summary || messages.inspector.empty.environment,
    items: [...runtimeEnvironmentItems, ...(peeks?.environment?.items || [])],
  };
  const hasOpenClawDiagnostics = environmentSection.items.some((item) => isOpenClawDiagnosticItem(item));
  const {
    openClawActionBusyKey,
    openClawActionIntent,
    openClawActionResult,
    handleLoadLalaClawUpdate,
    handleRunLalaClawUpdate,
    lalaclawUpdateBusy,
    lalaclawUpdateError,
    lalaclawUpdateLoading,
    lalaclawUpdateState,
    openClawConfigBusy,
    openClawConfigError,
    openClawConfigLoading,
    openClawConfigRemoteAuthorization,
    openClawConfigResult,
    openClawConfigState,
    openClawConfigValues,
    openClawEnvironmentRefreshing,
    openClawHistoryEntries,
    openClawHistoryError,
    openClawHistoryLoading,
    openClawOnboardingBusy,
    openClawOnboardingError,
    openClawOnboardingLoading,
    openClawOnboardingRefreshResult,
    openClawOnboardingResult,
    openClawOnboardingState,
    openClawOnboardingValues,
    openClawRemoteGuideOpen,
    openClawRollbackAuthorization,
    openClawRollbackIntent,
    openClawUpdateBusy,
    openClawUpdateError,
    openClawUpdateHelpEntry,
    openClawUpdateLoading,
    openClawUpdateResult,
    openClawUpdateState,
    setOpenClawActionIntent,
    setOpenClawRemoteGuideOpen,
    setOpenClawRollbackAuthorization,
    setOpenClawRollbackIntent,
    setOpenClawUpdateHelpEntry,
    handleChangeOpenClawConfigRemoteAuthorization,
    handleChangeOpenClawConfigValue,
    handleChangeOpenClawOnboardingValue,
    handleChangeOpenClawRollbackAuthorization,
    handleLoadOpenClawConfig,
    handleLoadOpenClawHistory,
    handleLoadOpenClawOnboarding,
    handleLoadOpenClawUpdate,
    handleRefreshEnvironment,
    handleRequestOpenClawAction,
    handleRunOpenClawAction,
    handleSubmitOpenClawOnboarding,
    handleRunOpenClawUpdate,
    handleSubmitOpenClawConfig,
    handleSubmitOpenClawRollback,
  } = useOpenClawInspector({
    activeTab,
    currentAgentId,
    environmentItems: environmentSection.items,
    hasOpenClawDiagnostics,
    messages,
    onRefreshEnvironment,
    onSyncCurrentSessionModel,
  });
  const tabDefinitions = [
    { key: "files", icon: FolderOpen, label: messages.inspector.tabs.files, count: files.length },
    { key: "artifacts", icon: FileText, label: messages.inspector.tabs.artifacts },
    { key: "timeline", icon: Hammer, label: messages.inspector.tabs.timeline },
    { key: "environment", icon: Monitor, label: messages.inspector.tabs.environment, alertDot: Boolean(lalaclawUpdateState?.updateAvailable) },
  ];

  useEffect(() => {
    if (activeTab && !inspectorTabKeys.includes(activeTab)) {
      setActiveTab("files");
    }
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    const node = tabsListRef.current;
    if (!node || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const updateLayout = (width) => {
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }
      setShowTabLabels(width >= 430);
    };

    updateLayout(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateLayout(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showTabLabels && tooltipTabKey) {
      setTooltipTabKey("");
    }
  }, [showTabLabels, tooltipTabKey]);

  useEffect(() => {
    if (!compact && compactSheetOpen) {
      setCompactSheetOpen(false);
    }
  }, [compact, compactSheetOpen]);

  useEffect(() => {
    if ((filePreview || imagePreview) && compactSheetOpen) {
      setCompactSheetOpen(false);
    }
  }, [compactSheetOpen, filePreview, imagePreview]);

  useEffect(() => {
    if (!compactSheetOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setCompactSheetOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [compactSheetOpen]);

  const filesTabContent = (
    <FilesTab
      currentAgentId={currentAgentId}
      currentSessionUser={currentSessionUser}
      items={files}
      messages={messages}
      onOpenEdit={(item) => handleOpenPreview(item, { startInEditMode: true })}
      onOpenPreview={handleOpenPreview}
      currentWorkspaceRoot={currentWorkspaceRoot}
      workspaceCount={workspaceCount}
      workspaceItems={workspaceFiles}
      workspaceLoaded={workspaceLoaded}
    />
  );
  const artifactsTabContent = (
    <DataList
      items={artifacts}
      hint={messages.inspector.artifactsHint}
      empty={messages.inspector.empty.artifacts}
      getItemActionLabel={(item) => `${messages.inspector.artifactJumpTo} ${localizeArtifactTitle(item.title || messages.inspector.tabs.artifacts, messages)}`}
      onSelect={onSelectArtifact}
      headerAction={
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setContextPreviewOpen(true)}
        >
          <ScrollText className="h-3.5 w-3.5" />
          {messages.inspector.contextPreview.button}
        </Button>
      }
      render={(item) => (
        <>
          <div className="text-sm font-medium">{localizeArtifactTitle(item.title, messages)}</div>
          <div className="text-xs text-muted-foreground">{stripMarkdownForDisplay(item.detail)}</div>
        </>
      )}
    />
  );
  const timelineTabContent = (
    <TimelineTab items={taskTimeline} messages={messages} onOpenPreview={handleOpenPreview} resolvedTheme={resolvedTheme} currentWorkspaceRoot={currentWorkspaceRoot} />
  );
  const environmentTabContent = (
    <EnvironmentTab
      lalaclawFlow={{
        enabled: true,
        busy: lalaclawUpdateBusy || Boolean(lalaclawUpdateState?.job?.active),
        defaultOpen: Boolean(lalaclawUpdateState?.updateAvailable),
        error: lalaclawUpdateError,
        forceOpen: resolvedActiveTab === "environment" && Boolean(lalaclawUpdateState?.updateAvailable),
        loading: lalaclawUpdateLoading,
        onReload: handleLoadLalaClawUpdate,
        onRunUpdate: handleRunLalaClawUpdate,
        state: lalaclawUpdateState,
      }}
      updateFlow={{
        enabled: true,
        busy: openClawUpdateBusy,
        error: openClawUpdateError,
        loading: openClawUpdateLoading,
        onOpenTroubleshooting: setOpenClawUpdateHelpEntry,
        onReload: handleLoadOpenClawUpdate,
        onRunUpdate: handleRunOpenClawUpdate,
        result: openClawUpdateResult,
        state: openClawUpdateState,
      }}
      onboarding={{
        enabled: Boolean(openClawOnboardingResult) || (Boolean(openClawOnboardingState?.installed) && !openClawOnboardingState?.ready),
        busy: openClawOnboardingBusy,
        defaultOpen: Boolean(openClawOnboardingState?.needsOnboarding),
        error: openClawOnboardingError,
        forceOpen: resolvedActiveTab === "environment" && Boolean(openClawOnboardingState?.needsOnboarding),
        loading: openClawOnboardingLoading,
        onChange: handleChangeOpenClawOnboardingValue,
        onRefreshCapabilities: () => handleLoadOpenClawOnboarding({ refreshCapabilities: true }),
        onReload: handleLoadOpenClawOnboarding,
        onSubmit: handleSubmitOpenClawOnboarding,
        refreshResult: openClawOnboardingRefreshResult,
        result: openClawOnboardingResult,
        state: openClawOnboardingState,
        values: openClawOnboardingValues,
      }}
      history={{
        enabled: true,
        entries: openClawHistoryEntries,
        error: openClawHistoryError,
        loading: openClawHistoryLoading,
        onRequestRollback: (entry) => {
          setOpenClawRollbackIntent(entry || null);
          setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
        },
        onReload: handleLoadOpenClawHistory,
        rollbackBusy: openClawConfigBusy,
      }}
      configEditor={{
        enabled: hasOpenClawDiagnostics && !openClawOnboardingState?.needsOnboarding,
        busy: openClawConfigBusy,
        error: openClawConfigError,
        loading: openClawConfigLoading,
        onChange: handleChangeOpenClawConfigValue,
        onChangeRemoteAuthorization: handleChangeOpenClawConfigRemoteAuthorization,
        onReload: handleLoadOpenClawConfig,
        onSubmit: handleSubmitOpenClawConfig,
        remoteAuthorization: openClawConfigRemoteAuthorization,
        result: openClawConfigResult,
        state: openClawConfigState,
        values: openClawConfigValues,
      }}
      items={environmentSection.items}
      management={{
        enabled: hasOpenClawDiagnostics,
        actionIntent: openClawActionIntent,
        busyActionKey: openClawActionBusyKey,
        onRefresh: handleRefreshEnvironment,
        onRequestAction: handleRequestOpenClawAction,
        refreshing: openClawEnvironmentRefreshing,
        result: openClawActionResult,
      }}
      messages={messages}
      onOpenPreview={handleOpenPreview}
      onOpenRemoteGuide={() => setOpenClawRemoteGuideOpen(true)}
      onRevealInFileManager={handleRevealInFileManager}
    />
  );
  const tabContentByKey = {
    files: filesTabContent,
    artifacts: artifactsTabContent,
    timeline: timelineTabContent,
    environment: environmentTabContent,
  };
  const activeCompactTab = tabDefinitions.find((tab) => tab.key === resolvedActiveTab) || tabDefinitions[0];

  if (compact) {
    return (
      <>
        <div className="flex h-full min-h-0 min-w-0 flex-col items-center gap-2 rounded-[18px] border border-border/70 bg-card/80 px-1.5 py-2 backdrop-blur">
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            const isActive = compactSheetOpen && resolvedActiveTab === tab.key;
            return (
              <Tooltip key={tab.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={tab.label}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setCompactSheetOpen(true);
                    }}
                    className={cn(
                      "relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      isActive
                        ? resolvedTheme === "dark"
                          ? "border-[#0f3e6a] bg-[#0f3e6a] text-white"
                          : "border-[#1677eb] bg-[#1677eb] text-white"
                        : "border-transparent bg-background/75 text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0 stroke-[1.9]" />
                    {tab.alertDot ? (
                      <span
                        data-testid={`inspector-tab-alert-${tab.key}`}
                        aria-hidden="true"
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
                      />
                    ) : null}
                    {tab.count ? (
                      <span
                        className={cn(
                          "absolute -right-1 -top-1 min-w-[1.15rem] rounded-full px-1 py-[1px] text-center text-[10px] font-semibold leading-none",
                          isActive ? "bg-white/22 text-white" : "bg-muted text-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{tab.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {compactSheetOpen ? (
          <>
            <button
              type="button"
              aria-label={messages.inspector.compact.closeSheet}
              className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]"
              onClick={() => setCompactSheetOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 z-[41] w-[min(28rem,calc(100vw-5.5rem))] min-w-[18rem] max-w-[30rem] pl-3">
              <Card
                role="dialog"
                aria-modal="true"
                aria-label={`${messages.inspector.title} - ${activeCompactTab.label}`}
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-none rounded-l-[1.5rem] border-y-0 border-r-0 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
              >
                <CardHeader className="flex min-h-12 flex-row items-start justify-between gap-3 border-b border-border/70 bg-card/92 px-4 py-3 text-left backdrop-blur">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm leading-[1.15]">{activeCompactTab.label}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2 text-[11px] leading-[1.35rem]">
                      {messages.inspector.subtitle}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={messages.inspector.compact.closeSheet}
                    className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => setCompactSheetOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
                  {tabContentByKey[resolvedActiveTab]}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
        {filePreview ? (
          <Suspense fallback={null}>
            <LazyFilePreviewOverlay
              currentAgentId={currentAgentId}
              currentSessionUser={currentSessionUser}
              currentWorkspaceRoot={currentWorkspaceRoot}
              files={previewFiles}
              preview={filePreview}
              resolvedTheme={resolvedTheme}
              sessionFiles={files}
              onClose={closeFilePreview}
              onOpenFilePreview={handleOpenPreview}
              workspaceCount={workspaceCount}
              workspaceFiles={workspaceFiles}
              workspaceLoaded={workspaceLoaded}
            />
          </Suspense>
        ) : null}
        {imagePreview ? (
          <Suspense fallback={null}>
            <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
          </Suspense>
        ) : null}
        {contextPreviewOpen ? (
          <Suspense fallback={null}>
            <LazyContextPreviewDialog open={contextPreviewOpen} onClose={() => setContextPreviewOpen(false)} sessionUser={currentSessionUser} />
          </Suspense>
        ) : null}
        <OpenClawUpdateTroubleshootingDialog
          entry={openClawUpdateHelpEntry}
          messages={messages}
          onClose={() => setOpenClawUpdateHelpEntry(null)}
        />
        <OpenClawRemoteRecoveryDialog
          messages={messages}
          onClose={() => setOpenClawRemoteGuideOpen(false)}
          open={openClawRemoteGuideOpen}
        />
        <OpenClawRollbackConfirmDialog
          authorization={openClawRollbackAuthorization}
          busy={openClawConfigBusy}
          entry={openClawRollbackIntent}
          messages={messages}
          onCancel={() => {
            setOpenClawRollbackIntent(null);
            setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
          }}
          onChange={handleChangeOpenClawRollbackAuthorization}
          onConfirm={() => {
            void handleSubmitOpenClawRollback();
          }}
        />
        <OpenClawManagementConfirmDialog
          action={openClawActionIntent}
          busy={Boolean(openClawActionBusyKey)}
          messages={messages}
          onCancel={() => setOpenClawActionIntent(null)}
          onConfirm={() => {
            if (!openClawActionIntent?.key) {
              return;
            }
            void handleRunOpenClawAction(openClawActionIntent.key);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader className="flex min-h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-[1.15]">{messages.inspector.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-5">{messages.inspector.subtitle}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabsList ref={tabsListRef} className="grid h-auto w-full shrink-0 grid-cols-2 gap-1 p-1 md:grid-cols-4">
              {tabDefinitions.map((tab) => {
                const Icon = tab.icon;
                const isActive = resolvedActiveTab === tab.key;
                const showCountBadge = Boolean(tab.count) && (showTabLabels || tab.key === "files");
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    aria-label={tab.label}
                    onPointerEnter={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onPointerLeave={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    onFocus={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onBlur={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    className={cn(
                      "group/tab relative text-[13px] data-[state=active]:text-white data-[state=active]:shadow-sm",
                      showTabLabels ? "px-3" : "px-2",
                      isActive ? "text-white shadow-sm" : "",
                      resolvedTheme === "dark"
                        ? cn(
                            "data-[state=active]:bg-[#0f3e6a] data-[state=active]:hover:bg-[#0f3e6a]",
                            isActive ? "bg-[#0f3e6a] hover:bg-[#0f3e6a]" : "",
                          )
                        : cn(
                            "data-[state=active]:bg-[#1677eb] data-[state=active]:hover:bg-[#0f6fe0]",
                            isActive ? "bg-[#1677eb] hover:bg-[#0f6fe0]" : "",
                          ),
                    )}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                      <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.9]" />
                    </span>
                    {tab.alertDot ? (
                      <span
                        data-testid={`inspector-tab-alert-${tab.key}`}
                        aria-hidden="true"
                        className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
                      />
                    ) : null}
                    {showTabLabels ? <span className="truncate">{tab.label}</span> : null}
                    {showCountBadge ? <TabCountBadge count={tab.count} active={resolvedActiveTab === tab.key} /> : null}
                    {!showTabLabels && tooltipTabKey === tab.key ? (
                      <span
                        aria-hidden="true"
                        data-testid={`inspector-tab-tooltip-${tab.key}`}
                        className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background shadow-md"
                      >
                        {tab.label}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="files" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {filesTabContent}
            </TabsContent>

            <TabsContent value="artifacts" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {artifactsTabContent}
            </TabsContent>

            <TabsContent value="timeline" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {timelineTabContent}
            </TabsContent>

            <TabsContent value="environment" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {environmentTabContent}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      {filePreview ? (
        <Suspense fallback={null}>
          <LazyFilePreviewOverlay
            currentAgentId={currentAgentId}
            currentSessionUser={currentSessionUser}
            currentWorkspaceRoot={currentWorkspaceRoot}
            files={previewFiles}
            preview={filePreview}
            resolvedTheme={resolvedTheme}
            sessionFiles={files}
            onClose={closeFilePreview}
            onOpenFilePreview={handleOpenPreview}
            workspaceCount={workspaceCount}
            workspaceFiles={workspaceFiles}
            workspaceLoaded={workspaceLoaded}
          />
        </Suspense>
      ) : null}
      {imagePreview ? (
        <Suspense fallback={null}>
          <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
        </Suspense>
      ) : null}
      <OpenClawUpdateTroubleshootingDialog
        entry={openClawUpdateHelpEntry}
        messages={messages}
        onClose={() => setOpenClawUpdateHelpEntry(null)}
      />
      <OpenClawRemoteRecoveryDialog
        messages={messages}
        onClose={() => setOpenClawRemoteGuideOpen(false)}
        open={openClawRemoteGuideOpen}
      />
      <OpenClawRollbackConfirmDialog
        authorization={openClawRollbackAuthorization}
        busy={openClawConfigBusy}
        entry={openClawRollbackIntent}
        messages={messages}
        onCancel={() => {
          setOpenClawRollbackIntent(null);
          setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
        }}
        onChange={handleChangeOpenClawRollbackAuthorization}
        onConfirm={() => {
          void handleSubmitOpenClawRollback();
        }}
      />
      <OpenClawManagementConfirmDialog
        action={openClawActionIntent}
        busy={Boolean(openClawActionBusyKey)}
        messages={messages}
        onCancel={() => setOpenClawActionIntent(null)}
        onConfirm={() => {
          if (!openClawActionIntent?.key) {
            return;
          }
          void handleRunOpenClawAction(openClawActionIntent.key);
        }}
      />
      {contextPreviewOpen ? (
        <Suspense fallback={null}>
          <LazyContextPreviewDialog open={contextPreviewOpen} onClose={() => setContextPreviewOpen(false)} sessionUser={currentSessionUser} />
        </Suspense>
      ) : null}
    </>
  );
}
