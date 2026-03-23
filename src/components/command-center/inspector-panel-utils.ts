import { getPathName, resolveItemPath } from "@/components/command-center/inspector-files-panel-utils";
import { isApplePlatform } from "@/lib/utils";

type InspectorPanelItem = {
  label?: string;
  value?: unknown;
  previewable?: boolean;
  revealable?: boolean;
  [key: string]: unknown;
};

const homePrefix = "/Users/marila";

export const OFFICIAL_OPENCLAW_DOC_URLS = {
  install: "https://docs.openclaw.ai/install",
  update: "https://docs.openclaw.ai/updating",
  doctor: "https://docs.openclaw.ai/doctor",
  troubleshooting: "https://openclawlab.com/en/docs/gateway/troubleshooting/",
};

const OFFICIAL_OPENCLAW_INSTALL_DOC_URLS = {
  en: "https://docs.openclaw.ai/install",
  zh: "https://docs.openclaw.ai/zh-CN/install",
  ja: "https://docs.openclaw.ai/ja-JP/start/getting-started",
};

function normalizeOpenClawDocLocale(locale: unknown = "") {
  const normalized = String(locale || "").trim().toLowerCase();
  if (normalized === "zh" || normalized === "zh-hk" || normalized.startsWith("zh-")) {
    return "zh";
  }
  if (normalized === "ja" || normalized.startsWith("ja-")) {
    return "ja";
  }
  return "en";
}

export function getOfficialOpenClawDocUrl(docKey: keyof typeof OFFICIAL_OPENCLAW_DOC_URLS | string, locale: unknown = "") {
  if (docKey === "install") {
    return OFFICIAL_OPENCLAW_INSTALL_DOC_URLS[normalizeOpenClawDocLocale(locale)] || OFFICIAL_OPENCLAW_INSTALL_DOC_URLS.en;
  }
  return OFFICIAL_OPENCLAW_DOC_URLS[docKey as keyof typeof OFFICIAL_OPENCLAW_DOC_URLS] || OFFICIAL_OPENCLAW_DOC_URLS.install;
}

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

export function localizeArtifactTitle(title = "", messages: any) {
  const value = String(title || "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/^(回复|reply)\s*/i, `${messages.inspector.artifactReplyPrefix} `).trim();
}

export function isOpenClawDiagnosticItem(item?: InspectorPanelItem | null) {
  return String(item?.label || "").startsWith(OPENCLAW_DIAGNOSTIC_PREFIX);
}

export function localizeOpenClawDiagnosticLabel(label: unknown = "", messages: any) {
  const key = String(label || "");
  return messages.inspector.openClawDiagnostics.fields?.[key] || key;
}

export function localizeOpenClawDiagnosticValue(value: unknown = "", messages: any) {
  const key = String(value || "");
  return messages.inspector.openClawDiagnostics.values?.[key] || key;
}

export function localizeEnvironmentItemLabel(label: unknown = "", messages: any) {
  const key = String(label || "");
  return messages.inspector.environmentFields?.[key] || key;
}

export function localizeEnvironmentItemValue(value: unknown = "", messages: any) {
  const key = String(value || "");
  return messages.inspector.environmentValues?.[key] || key;
}

export function getOpenClawDiagnosticBadgeProps(value: unknown = "") {
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

export function shouldRenderOpenClawDiagnosticBadge(label = "") {
  return label === "openclaw.runtime.profile"
    || label.endsWith(".status")
    || label.startsWith("openclaw.doctor.");
}

export function collectOpenClawDiagnostics(items: InspectorPanelItem[] = []) {
  const diagnosticEntries = new Map(
    items
      .filter((item) => isOpenClawDiagnosticItem(item))
      .map((item) => [String(item.label), item] as const),
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

export function collectEnvironmentGroups(items: InspectorPanelItem[] = [], messages: any) {
  const groupedItems = new Map<string, InspectorPanelItem[]>();
  items.forEach((item) => {
    const groupKey = getEnvironmentGroupKey(String(item?.label || ""));
    if (!groupedItems.has(groupKey)) {
      groupedItems.set(groupKey, []);
    }
    groupedItems.get(groupKey)?.push(item);
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

export function isLalaClawEnvironmentItem(item?: InspectorPanelItem | null) {
  return String(item?.label || "").startsWith("LALACLAW.");
}

export function shouldRenderEnvironmentPathLink(item?: InspectorPanelItem | null) {
  return Boolean(item?.previewable || item?.revealable);
}

export function buildEnvironmentPathItem(item?: InspectorPanelItem | null) {
  const normalizedValue = String(item?.value || "").trim();
  const isDirectory = Boolean(item?.revealable);
  return {
    path: normalizedValue,
    fullPath: normalizedValue,
    kind: isDirectory ? "目录" : "文件",
  };
}

export function getOpenClawManagementActions(messages: any) {
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

export function getOpenClawManagementOutcome(result: Record<string, any> = {}) {
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

export function getOpenClawManagementOutcomeBadgeProps(outcome = "") {
  switch (outcome) {
    case "success":
      return { variant: "success", className: "" };
    case "warning":
      return { variant: "secondary", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}


export function getOpenClawConfigFieldMeta(messages: any, state: Record<string, any> | null = null) {
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

export function getOpenClawConfigFieldValueLabel(fieldKey = "", value: unknown, messages: any) {
  if (typeof value === "boolean") {
    return value ? messages.inspector.openClawConfig.boolean.on : messages.inspector.openClawConfig.boolean.off;
  }

  if (value === null || typeof value === "undefined" || String(value).trim() === "") {
    return messages.inspector.openClawConfig.emptyValue;
  }

  if (fieldKey === "gatewayBind") {
    return messages.inspector.openClawConfig.fields.gatewayBind.options?.[value as string] || String(value);
  }

  return String(value);
}

export function getOpenClawConfigOutcome(result: Record<string, any> = {}) {
  if (result?.ok) {
    return "success";
  }
  if (result?.rolledBack || result?.validation?.ok === false) {
    return "error";
  }
  return "warning";
}

export function getOpenClawConfigOutcomeBadgeProps(outcome = "") {
  switch (outcome) {
    case "success":
      return { variant: "success", className: "" };
    case "warning":
      return { variant: "secondary", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}

export function getOpenClawUpdateOutcome(result: Record<string, any> = {}) {
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

export function getOpenClawUpdateOutcomeBadgeProps(outcome = "") {
  switch (outcome) {
    case "success":
      return { variant: "success", className: "" };
    case "warning":
      return { variant: "secondary", className: "" };
    default:
      return { variant: "default", className: "" };
  }
}

export function getOpenClawOnboardingAuthOptions(messages: any, state: Record<string, any> | null = null) {
  const supportedChoices = Array.isArray(state?.supportedAuthChoices) && state.supportedAuthChoices.length
    ? state.supportedAuthChoices
    : Object.keys(messages.inspector.openClawOnboarding.fields.authChoice.options || {});
  return supportedChoices.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.authChoice.options?.[value] || value,
  }));
}

export function getOpenClawOnboardingSecretModeOptions(messages: any, state: Record<string, any> | null = null) {
  const supportedModes = Array.isArray(state?.supportedSecretInputModes) && state.supportedSecretInputModes.length
    ? state.supportedSecretInputModes
    : ["plaintext", "ref"];
  return supportedModes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.secretInputMode.options?.[value] || value,
  }));
}

export function getOpenClawOnboardingFlowOptions(messages: any, state: Record<string, any> | null = null) {
  const supportedFlows = Array.isArray(state?.supportedFlows) && state.supportedFlows.length
    ? state.supportedFlows
    : ["quickstart", "advanced", "manual"];
  return supportedFlows.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.flow.options?.[value] || value,
  }));
}

export function getOpenClawOnboardingDaemonRuntimeOptions(messages: any, state: Record<string, any> | null = null) {
  const supportedRuntimes = Array.isArray(state?.supportedDaemonRuntimes) && state.supportedDaemonRuntimes.length
    ? state.supportedDaemonRuntimes
    : ["node", "bun"];
  return supportedRuntimes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.daemonRuntime.options?.[value] || value,
  }));
}

export function getOpenClawOnboardingGatewayAuthOptions(messages: any, state: Record<string, any> | null = null) {
  const supportedModes = Array.isArray(state?.supportedGatewayAuthModes) && state.supportedGatewayAuthModes.length
    ? state.supportedGatewayAuthModes
    : ["off", "token", "password"];
  return supportedModes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.gatewayAuth.options?.[value] || value,
  }));
}

export function getOpenClawOnboardingGatewayTokenModeOptions(messages: any, state: Record<string, any> | null = null) {
  const supportedModes = Array.isArray(state?.supportedGatewayTokenInputModes) && state.supportedGatewayTokenInputModes.length
    ? state.supportedGatewayTokenInputModes
    : ["plaintext", "ref"];
  return supportedModes.map((value) => ({
    value,
    label: messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.options?.[value] || value,
  }));
}

export function getOpenClawOnboardingOptionLabels(values: string[] = [], options: Array<{ value: string; label: string }> = []) {
  const labelMap = new Map(options.map((option) => [option.value, option.label] as const));
  return values
    .map((value) => labelMap.get(value) || value)
    .filter(Boolean);
}

export function getOpenClawCapabilityDetectionText(messages: any, detection: Record<string, any> | null = null) {
  const source = String(detection?.source || "").trim();
  const reason = String(detection?.reason || "").trim();
  const detectedAt = String(detection?.detectedAt || "").trim();
  const signature = String(detection?.signature || "").trim();
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

function normalizeOpenClawUpdateIssueKey(value = "") {
  return String(value || "").trim();
}

export function buildOpenClawUpdateTroubleshootingEntries(
  result: Record<string, any> | null = null,
  messages: any,
  locale: unknown = "",
) {
  const issueKeys: string[] = [];
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

    const docs = (issue.docs || []).map((docKey: string) => ({
      key: docKey,
      href: getOfficialOpenClawDocUrl(docKey, locale),
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

export function getLalaClawUpdateBadgeVariant(state: Record<string, any> | null = null) {
  const status = String(state?.job?.status || "").trim();
  if (status === "failed") {
    return "default";
  }
  if (status === "completed" || (!state?.updateAvailable && state?.check?.ok)) {
    return "success";
  }
  return "secondary";
}

export function formatOperationTimestamp(timestamp = 0) {
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

export function looksLikeJson(value = "") {
  const trimmed = String(value || "").trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

export function getRelationshipDisplay(relationship: Record<string, any> | null | undefined, messages: any) {
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

export function getInspectorItemKey(item: Record<string, any> | null | undefined, index: number) {
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

export function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }

  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

export function isAbsoluteFileSystemPath(value = "") {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith("/") || /^[A-Za-z]:[\\/]/.test(normalized);
}

export function resolveSessionItemAction(...actions: any[]) {
  if (actions.includes("modified")) {
    return "modified";
  }
  if (actions.includes("created")) {
    return "created";
  }
  if (actions.includes("viewed")) {
    return "viewed";
  }

  return actions.find(Boolean) || "viewed";
}

export function mergeSessionFileItems(baseItems: Record<string, any>[] = [], extraItems: Record<string, any>[] = []) {
  const mergedByPath = new Map();

  [...baseItems, ...extraItems].forEach((item) => {
    const resolvedPath = resolveItemPath(item);
    if (!resolvedPath) {
      return;
    }

    const previous = mergedByPath.get(resolvedPath);
    mergedByPath.set(resolvedPath, {
      ...previous,
      ...item,
      key: resolvedPath,
      path: item?.path || resolvedPath,
      fullPath: item?.fullPath || resolvedPath,
      name: item?.name || previous?.name || getPathName(resolvedPath),
      kind: item?.kind || previous?.kind || "文件",
      primaryAction: resolveSessionItemAction(previous?.primaryAction, item?.primaryAction),
    });
  });

  return [...mergedByPath.values()];
}

export function buildUserSessionItemsFromPaths(paths: string[] = [], primaryAction = "created") {
  return paths
    .map((sourcePath) => String(sourcePath || "").trim())
    .filter(Boolean)
    .map((resolvedPath) => ({
      key: resolvedPath,
      path: resolvedPath,
      fullPath: resolvedPath,
      name: getPathName(resolvedPath),
      kind: "文件",
      primaryAction,
    }));
}

type OpenClawOnboardingValues = Record<string, unknown> | null | undefined;
type OpenClawOnboardingState = {
  defaults?: Record<string, unknown> | null;
  supportedGatewayBinds?: string[] | null;
} | null | undefined;

function readOnboardingStringValue(
  values: OpenClawOnboardingValues,
  defaults: Record<string, unknown>,
  key: string,
  fallback = "",
) {
  return String(values?.[key] ?? defaults?.[key] ?? fallback).trim() || fallback;
}

function readOnboardingBooleanValue(
  values: OpenClawOnboardingValues,
  defaults: Record<string, unknown>,
  key: string,
  fallback = false,
) {
  return Boolean(values?.[key] ?? defaults?.[key] ?? fallback);
}

export function getOpenClawOnboardingFormState(values: OpenClawOnboardingValues, state: OpenClawOnboardingState = null) {
  const defaults = state?.defaults || {};
  const authChoice = readOnboardingStringValue(values, defaults, "authChoice", "openai-api-key");
  const daemonRuntime = readOnboardingStringValue(values, defaults, "daemonRuntime", "node");
  const flow = readOnboardingStringValue(values, defaults, "flow", "quickstart");
  const gatewayAuth = readOnboardingStringValue(values, defaults, "gatewayAuth", "off");
  const secretInputMode = readOnboardingStringValue(values, defaults, "secretInputMode", "plaintext");
  const gatewayTokenInputMode = readOnboardingStringValue(values, defaults, "gatewayTokenInputMode", "plaintext");
  const gatewayBind = readOnboardingStringValue(values, defaults, "gatewayBind", "loopback");
  const installDaemon = readOnboardingBooleanValue(values, defaults, "installDaemon", true);
  const skipHealthCheck = readOnboardingBooleanValue(values, defaults, "skipHealthCheck", false);
  const supportedGatewayBinds = Array.isArray(state?.supportedGatewayBinds) && state.supportedGatewayBinds.length
    ? state.supportedGatewayBinds
    : ["loopback", "tailnet", "lan", "auto", "custom"];

  return {
    authChoice,
    daemonRuntime,
    flow,
    gatewayAuth,
    gatewayTokenInputMode,
    installDaemon,
    secretInputMode,
    skipHealthCheck,
    gatewayBind,
    supportedGatewayBinds,
    values: {
      tokenProvider: String(values?.tokenProvider ?? ""),
      token: String(values?.token ?? ""),
      tokenProfileId: String(values?.tokenProfileId ?? ""),
      tokenExpiresIn: String(values?.tokenExpiresIn ?? ""),
      apiKey: String(values?.apiKey ?? ""),
      customBaseUrl: String(values?.customBaseUrl ?? ""),
      customModelId: String(values?.customModelId ?? ""),
      customProviderId: String(values?.customProviderId ?? ""),
      customCompatibility: String(values?.customCompatibility ?? "openai"),
      gatewayToken: String(values?.gatewayToken ?? ""),
      gatewayTokenRefEnv: String(values?.gatewayTokenRefEnv ?? ""),
      gatewayPassword: String(values?.gatewayPassword ?? ""),
      workspace: String(values?.workspace ?? ""),
    },
  };
}

type OpenClawConfigValues = Record<string, unknown> | null | undefined;
type OpenClawConfigState = {
  modelOptions?: string[] | null;
} | null | undefined;
type OpenClawRemoteAuthorization = Record<string, unknown> | null | undefined;

export function getOpenClawConfigFormState(
  values: OpenClawConfigValues,
  state: OpenClawConfigState = null,
  remoteAuthorization: OpenClawRemoteAuthorization = null,
) {
  const normalizedValues = Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => [key, value ?? ""]),
  );
  const modelOptions = Array.isArray(state?.modelOptions) ? state.modelOptions : [];
  const remoteAuthorized = Boolean(remoteAuthorization?.confirmed);
  const remoteNote = String(remoteAuthorization?.note ?? "");

  return {
    modelOptions,
    remoteAuthorized,
    remoteNote,
    values: normalizedValues,
  };
}

export function resolveFileManagerLocaleLabel(messages: any) {
  return isApplePlatform()
    ? messages.inspector.previewActions.fileManagers.finder
    : messages.inspector.previewActions.fileManagers.explorer;
}

export function resolveFileManagerActionLabel(messages: any, isDirectory = false) {
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages);
  return isDirectory
    ? messages.inspector.previewActions.openDirectoryInFileManager(fileManagerLabel)
    : messages.inspector.previewActions.revealInFileManager(fileManagerLabel);
}

export function findWorkspaceNodeByPath(nodes: Record<string, any>[] = [], targetPath = ""): Record<string, any> | null {
  for (const node of nodes) {
    if (resolveItemPath(node) === targetPath) {
      return node;
    }
    if (node.kind === "目录" && node.children?.length) {
      const nestedNode = findWorkspaceNodeByPath(node.children, targetPath);
      if (nestedNode) {
        return nestedNode;
      }
    }
  }

  return null;
}
