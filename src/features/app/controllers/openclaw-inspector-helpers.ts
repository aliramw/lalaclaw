type ConfigField = {
  key?: string;
  value?: unknown;
  meta?: {
    agentId?: string;
  };
};

type OpenClawConfigStateLike = {
  fields?: ConfigField[];
  currentAgentId?: string;
};

type OpenClawOnboardingStateLike = {
  defaults?: Record<string, unknown>;
};

type EnvironmentItem = {
  label?: string;
  value?: unknown;
};

export function buildOpenClawConfigFormValues(state: OpenClawConfigStateLike | null = null) {
  const values: Record<string, unknown> = {};
  (state?.fields || []).forEach((field) => {
    values[String(field.key || "")] = field.value;
  });
  return values;
}

export function buildOpenClawOnboardingFormValues(state: OpenClawOnboardingStateLike | null = null) {
  return {
    authChoice: String(state?.defaults?.authChoice || "openai-api-key").trim() || "openai-api-key",
    apiKey: "",
    customBaseUrl: "",
    customCompatibility: String(state?.defaults?.customCompatibility || "openai").trim() || "openai",
    customModelId: "",
    customProviderId: "",
    daemonRuntime: String(state?.defaults?.daemonRuntime || "node").trim() || "node",
    flow: String(state?.defaults?.flow || "quickstart").trim() || "quickstart",
    gatewayAuth: String(state?.defaults?.gatewayAuth || "off").trim() || "off",
    gatewayBind: String(state?.defaults?.gatewayBind || "loopback").trim() || "loopback",
    gatewayPassword: "",
    gatewayToken: "",
    gatewayTokenInputMode: String(state?.defaults?.gatewayTokenInputMode || "plaintext").trim() || "plaintext",
    gatewayTokenRefEnv: "",
    installDaemon: Boolean(state?.defaults?.installDaemon ?? true),
    secretInputMode: String(state?.defaults?.secretInputMode || "plaintext").trim() || "plaintext",
    skipHealthCheck: Boolean(state?.defaults?.skipHealthCheck ?? false),
    token: "",
    tokenExpiresIn: "",
    tokenProfileId: "",
    tokenProvider: "",
    workspace: String(state?.defaults?.workspace || "").trim(),
  };
}

function getOpenClawConfigFieldValue(state: OpenClawConfigStateLike | null = null, fieldKey = "", options: { agentId?: string } = {}) {
  const normalizedKey = String(fieldKey || "").trim();
  const normalizedAgentId = String(options?.agentId || "").trim();
  const matchingField = (state?.fields || []).find((field) => {
    if (field?.key !== normalizedKey) {
      return false;
    }
    if (!normalizedAgentId) {
      return true;
    }
    return String(field?.meta?.agentId || "").trim() === normalizedAgentId;
  });
  return matchingField?.value;
}

export function resolveOpenClawConfigSessionModel(state: OpenClawConfigStateLike | null = null, agentId = "") {
  const normalizedAgentId = String(agentId || state?.currentAgentId || "").trim();
  const agentModel = String(getOpenClawConfigFieldValue(state, "agentModel", { agentId: normalizedAgentId }) ?? "").trim();
  const primaryModel = String(getOpenClawConfigFieldValue(state, "modelPrimary") ?? "").trim();
  return agentModel || primaryModel;
}

export function hasOpenClawConfigModelChanges(previousValues: Record<string, unknown> = {}, nextValues: Record<string, unknown> = {}) {
  return String(previousValues?.modelPrimary ?? "") !== String(nextValues?.modelPrimary ?? "")
    || String(previousValues?.agentModel ?? "") !== String(nextValues?.agentModel ?? "");
}

function readEnvironmentItemValue(items: EnvironmentItem[] = [], label = "") {
  return items.find((item) => String(item?.label || "").trim() === String(label || "").trim())?.value;
}

export function buildOpenClawRemoteGuard(items: EnvironmentItem[] = [], messages: any) {
  const target = String(readEnvironmentItemValue(items, "openclaw.remote.target") || "").trim();
  const writeAccess = String(readEnvironmentItemValue(items, "openclaw.remote.writeAccess") || "").trim();
  const remoteTarget = target === "remote";
  const blocked = remoteTarget && writeAccess === "blocked";

  return {
    remoteTarget,
    blocked,
    title: blocked ? messages.inspector.remoteOperations.blockedTitle : "",
    description: blocked ? messages.inspector.remoteOperations.blockedDescription : "",
  };
}
