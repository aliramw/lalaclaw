import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function buildOpenClawConfigFormValues(state = null) {
  const values = {};
  (state?.fields || []).forEach((field) => {
    values[field.key] = field.value;
  });
  return values;
}

function getOpenClawConfigFieldValue(state = null, fieldKey = "", options = {}) {
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

function resolveOpenClawConfigSessionModel(state = null, agentId = "") {
  const normalizedAgentId = String(agentId || state?.currentAgentId || "").trim();
  const agentModel = String(getOpenClawConfigFieldValue(state, "agentModel", { agentId: normalizedAgentId }) ?? "").trim();
  const primaryModel = String(getOpenClawConfigFieldValue(state, "modelPrimary") ?? "").trim();
  return agentModel || primaryModel;
}

function hasOpenClawConfigModelChanges(previousValues = {}, nextValues = {}) {
  return String(previousValues?.modelPrimary ?? "") !== String(nextValues?.modelPrimary ?? "")
    || String(previousValues?.agentModel ?? "") !== String(nextValues?.agentModel ?? "");
}

function resolveOpenClawConfigErrorMessage(errorCode = "", messages) {
  if (!errorCode) {
    return messages.inspector.openClawConfig.errors.requestFailed;
  }

  return messages.inspector.openClawConfig.errors[errorCode] || messages.inspector.openClawConfig.errors.requestFailed;
}

function resolveOpenClawUpdateErrorMessage(errorCode = "", messages) {
  if (!errorCode) {
    return messages.inspector.openClawUpdate.errors.requestFailed;
  }

  return messages.inspector.openClawUpdate.errors[errorCode] || messages.inspector.openClawUpdate.errors.requestFailed;
}

function resolveLalaClawUpdateErrorMessage(errorCode = "", messages) {
  if (!errorCode) {
    return messages.inspector.lalaclawUpdate.errors.requestFailed;
  }

  return messages.inspector.lalaclawUpdate.errors[errorCode] || messages.inspector.lalaclawUpdate.errors.requestFailed;
}

function readEnvironmentItemValue(items = [], label = "") {
  return items.find((item) => String(item?.label || "").trim() === String(label || "").trim())?.value;
}

export function buildOpenClawRemoteGuard(items = [], messages) {
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

export function useOpenClawInspector({
  activeTab = "",
  currentAgentId = "",
  environmentItems = [],
  hasOpenClawDiagnostics = false,
  messages,
  onRefreshEnvironment,
  onSyncCurrentSessionModel,
} = {}) {
  const [openClawActionIntent, setOpenClawActionIntent] = useState(null);
  const [openClawActionBusyKey, setOpenClawActionBusyKey] = useState("");
  const [openClawActionResult, setOpenClawActionResult] = useState(null);
  const [lalaclawUpdateBusy, setLalaclawUpdateBusy] = useState(false);
  const [lalaclawUpdateError, setLalaclawUpdateError] = useState("");
  const [lalaclawUpdateLoading, setLalaclawUpdateLoading] = useState(false);
  const [lalaclawUpdateRequested, setLalaclawUpdateRequested] = useState(false);
  const [lalaclawUpdateState, setLalaclawUpdateState] = useState(null);
  const [openClawConfigBusy, setOpenClawConfigBusy] = useState(false);
  const [openClawConfigError, setOpenClawConfigError] = useState("");
  const [openClawConfigLoading, setOpenClawConfigLoading] = useState(false);
  const [openClawConfigRequested, setOpenClawConfigRequested] = useState(false);
  const [openClawConfigRemoteAuthorization, setOpenClawConfigRemoteAuthorization] = useState({ confirmed: false, note: "" });
  const [openClawConfigResult, setOpenClawConfigResult] = useState(null);
  const [openClawConfigState, setOpenClawConfigState] = useState(null);
  const [openClawConfigValues, setOpenClawConfigValues] = useState({});
  const [openClawUpdateBusy, setOpenClawUpdateBusy] = useState(false);
  const [openClawUpdateError, setOpenClawUpdateError] = useState("");
  const [openClawUpdateLoading, setOpenClawUpdateLoading] = useState(false);
  const [openClawUpdateRequested, setOpenClawUpdateRequested] = useState(false);
  const [openClawUpdateHelpEntry, setOpenClawUpdateHelpEntry] = useState(null);
  const [openClawRemoteGuideOpen, setOpenClawRemoteGuideOpen] = useState(false);
  const [openClawRollbackAuthorization, setOpenClawRollbackAuthorization] = useState({ confirmed: false, note: "" });
  const [openClawRollbackIntent, setOpenClawRollbackIntent] = useState(null);
  const [openClawUpdateResult, setOpenClawUpdateResult] = useState(null);
  const [openClawUpdateState, setOpenClawUpdateState] = useState(null);
  const [openClawHistoryEntries, setOpenClawHistoryEntries] = useState([]);
  const [openClawHistoryError, setOpenClawHistoryError] = useState("");
  const [openClawHistoryLoading, setOpenClawHistoryLoading] = useState(false);
  const [openClawHistoryRequested, setOpenClawHistoryRequested] = useState(false);
  const [openClawEnvironmentRefreshing, setOpenClawEnvironmentRefreshing] = useState(false);
  const lastKnownLalaclawVersion = useRef("");

  const openClawRemoteGuard = buildOpenClawRemoteGuard(environmentItems, messages);
  const normalizedConfigAgentId = String(currentAgentId || "").trim();

  const handleRunOpenClawAction = useCallback(async (actionKey) => {
    const normalizedAction = String(actionKey || "").trim();
    if (!normalizedAction) {
      return;
    }

    setOpenClawActionBusyKey(normalizedAction);
    try {
      const response = await apiFetch("/api/openclaw/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: normalizedAction }),
      });
      const payload = await response.json();
      setOpenClawActionResult({
        ...payload,
        ok: Boolean(payload?.ok),
        error: payload?.error || "",
      });
      if (response.ok && typeof onRefreshEnvironment === "function") {
        setOpenClawEnvironmentRefreshing(true);
        try {
          await onRefreshEnvironment();
        } catch {}
        setOpenClawEnvironmentRefreshing(false);
      }
    } catch (error) {
      setOpenClawActionResult({
        ok: false,
        action: normalizedAction,
        error: error.message || messages.inspector.openClawManagement.errors.requestFailed,
        commandResult: { ok: false, stdout: "", stderr: "", timedOut: false },
        healthCheck: { status: "unknown", url: "", detail: "" },
        guidance: [messages.inspector.openClawManagement.errors.requestFailed],
      });
    } finally {
      setOpenClawEnvironmentRefreshing(false);
      setOpenClawActionBusyKey("");
      setOpenClawActionIntent(null);
    }
  }, [messages.inspector.openClawManagement.errors.requestFailed, onRefreshEnvironment]);

  const handleRefreshEnvironment = useCallback(async () => {
    if (typeof onRefreshEnvironment !== "function") {
      return;
    }
    setOpenClawEnvironmentRefreshing(true);
    try {
      await onRefreshEnvironment();
    } finally {
      setOpenClawEnvironmentRefreshing(false);
    }
  }, [onRefreshEnvironment]);

  const handleLoadLalaClawUpdate = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLalaclawUpdateRequested(true);
      setLalaclawUpdateLoading(true);
      setLalaclawUpdateError("");
    }

    try {
      const response = await apiFetch("/api/lalaclaw/update", {
        method: "GET",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(resolveLalaClawUpdateErrorMessage(payload?.errorCode, messages));
      }
      setLalaclawUpdateState(payload);
      if (!silent && payload?.job?.status !== "failed") {
        setLalaclawUpdateError("");
      }
    } catch (error) {
      if (!silent) {
        setLalaclawUpdateError(error.message || messages.inspector.lalaclawUpdate.errors.requestFailed);
      }
    } finally {
      if (!silent) {
        setLalaclawUpdateLoading(false);
      }
    }
  }, [messages]);

  const handleRunLalaClawUpdate = useCallback(async () => {
    setLalaclawUpdateBusy(true);
    setLalaclawUpdateError("");
    try {
      const response = await apiFetch("/api/lalaclaw/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update" }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(resolveLalaClawUpdateErrorMessage(payload?.errorCode, messages));
      }
      if (payload?.state) {
        setLalaclawUpdateState(payload.state);
      } else if (payload?.ok) {
        await handleLoadLalaClawUpdate({ silent: true });
      }
    } catch (error) {
      setLalaclawUpdateError(error.message || messages.inspector.lalaclawUpdate.errors.requestFailed);
    } finally {
      setLalaclawUpdateBusy(false);
    }
  }, [handleLoadLalaClawUpdate, messages]);

  const handleLoadOpenClawUpdate = useCallback(async () => {
    if (openClawRemoteGuard.blocked) {
      setOpenClawUpdateState(null);
      return;
    }
    setOpenClawUpdateRequested(true);
    setOpenClawUpdateLoading(true);
    setOpenClawUpdateError("");
    try {
      const response = await apiFetch("/api/openclaw/update", {
        method: "GET",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(resolveOpenClawUpdateErrorMessage(payload?.errorCode, messages));
      }
      setOpenClawUpdateState(payload);
    } catch (error) {
      setOpenClawUpdateError(error.message || messages.inspector.openClawUpdate.errors.requestFailed);
    } finally {
      setOpenClawUpdateLoading(false);
    }
  }, [messages, openClawRemoteGuard.blocked]);

  const handleRunOpenClawUpdate = useCallback(async () => {
    setOpenClawUpdateBusy(true);
    setOpenClawUpdateError("");
    setOpenClawUpdateHelpEntry(null);
    try {
      const action = openClawUpdateState?.installed ? "update" : "install";
      const response = await apiFetch("/api/openclaw/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, restartGateway: true }),
      });
      const payload = await response.json();
      const normalizedPayload = {
        ...payload,
        ok: Boolean(payload?.ok),
        errorCode: payload?.errorCode || "",
        error: payload?.error || "",
      };
      setOpenClawUpdateResult(normalizedPayload);
      if (!response.ok || payload?.ok === false) {
        setOpenClawUpdateError(resolveOpenClawUpdateErrorMessage(payload?.errorCode, messages));
        return;
      }
      if (payload?.state) {
        setOpenClawUpdateState(payload.state);
      }
      if (typeof onRefreshEnvironment === "function") {
        setOpenClawEnvironmentRefreshing(true);
        try {
          await onRefreshEnvironment();
        } catch {}
        setOpenClawEnvironmentRefreshing(false);
      }
    } catch (error) {
      const errorMessage = error.message || messages.inspector.openClawUpdate.errors.requestFailed;
      setOpenClawUpdateResult({
        ok: false,
        action: openClawUpdateState?.installed ? "update" : "install",
        errorCode: "requestFailed",
        error: errorMessage,
        commandResult: {
          ok: false,
          stdout: "",
          stderr: "",
          timedOut: false,
          exitCode: null,
          command: { display: "" },
        },
      });
      setOpenClawUpdateError(errorMessage);
    } finally {
      setOpenClawEnvironmentRefreshing(false);
      setOpenClawUpdateBusy(false);
    }
  }, [messages, onRefreshEnvironment, openClawUpdateState]);

  const handleLoadOpenClawHistory = useCallback(async () => {
    setOpenClawHistoryRequested(true);
    setOpenClawHistoryLoading(true);
    setOpenClawHistoryError("");
    try {
      const response = await apiFetch("/api/openclaw/history", { method: "GET" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(messages.inspector.remoteOperations.historyRequestFailed);
      }
      setOpenClawHistoryEntries(Array.isArray(payload.entries) ? payload.entries : []);
    } catch (error) {
      setOpenClawHistoryError(error.message || messages.inspector.remoteOperations.historyRequestFailed);
    } finally {
      setOpenClawHistoryLoading(false);
    }
  }, [messages]);

  const handleLoadOpenClawConfig = useCallback(async () => {
    setOpenClawConfigRequested(true);
    setOpenClawConfigLoading(true);
    setOpenClawConfigError("");
    try {
      const params = new URLSearchParams();
      if (normalizedConfigAgentId) {
        params.set("agentId", normalizedConfigAgentId);
      }
      const response = await apiFetch(`/api/openclaw/config${params.toString() ? `?${params.toString()}` : ""}`, {
        method: "GET",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(resolveOpenClawConfigErrorMessage(payload?.errorCode, messages));
      }
      setOpenClawConfigState(payload);
      setOpenClawConfigValues(buildOpenClawConfigFormValues(payload));
    } catch (error) {
      setOpenClawConfigError(error.message || messages.inspector.openClawConfig.errors.requestFailed);
    } finally {
      setOpenClawConfigLoading(false);
    }
  }, [messages, normalizedConfigAgentId]);

  const handleChangeOpenClawConfigValue = useCallback((fieldKey, value) => {
    setOpenClawConfigValues((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  }, []);

  const handleChangeOpenClawConfigRemoteAuthorization = useCallback((fieldKey, value) => {
    setOpenClawConfigRemoteAuthorization((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  }, []);

  const handleChangeOpenClawRollbackAuthorization = useCallback((fieldKey, value) => {
    setOpenClawRollbackAuthorization((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  }, []);

  const handleSubmitOpenClawConfig = useCallback(async (restartGateway = false) => {
    if (!openClawConfigState?.baseHash) {
      await handleLoadOpenClawConfig();
      return;
    }

    setOpenClawConfigBusy(true);
    setOpenClawConfigError("");
    try {
      const previousConfigValues = buildOpenClawConfigFormValues(openClawConfigState);
      const response = await apiFetch("/api/openclaw/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: normalizedConfigAgentId,
          baseHash: openClawConfigState.baseHash,
          remoteAuthorization: openClawRemoteGuard.blocked ? openClawConfigRemoteAuthorization : null,
          restartGateway,
          values: openClawConfigValues,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        if (payload?.errorCode === "config_conflict") {
          await handleLoadOpenClawConfig();
        }
        throw new Error(resolveOpenClawConfigErrorMessage(payload?.errorCode, messages));
      }
      setOpenClawConfigResult(payload);
      if (payload?.state) {
        setOpenClawConfigState(payload.state);
        setOpenClawConfigValues(buildOpenClawConfigFormValues(payload.state));
      }
      if (
        typeof onSyncCurrentSessionModel === "function"
        && normalizedConfigAgentId
        && hasOpenClawConfigModelChanges(previousConfigValues, openClawConfigValues)
      ) {
        const syncedModel = resolveOpenClawConfigSessionModel(payload?.state || openClawConfigState, normalizedConfigAgentId);
        if (syncedModel) {
          await onSyncCurrentSessionModel(syncedModel);
        }
      }
      if (openClawRemoteGuard.blocked) {
        setOpenClawConfigRemoteAuthorization((current) => ({ ...current, confirmed: false }));
      }
      if (typeof onRefreshEnvironment === "function") {
        setOpenClawEnvironmentRefreshing(true);
        try {
          await onRefreshEnvironment();
        } catch {}
        setOpenClawEnvironmentRefreshing(false);
      }
    } catch (error) {
      setOpenClawConfigError(error.message || messages.inspector.openClawConfig.errors.requestFailed);
    } finally {
      setOpenClawEnvironmentRefreshing(false);
      setOpenClawConfigBusy(false);
    }
  }, [handleLoadOpenClawConfig, messages, normalizedConfigAgentId, onRefreshEnvironment, onSyncCurrentSessionModel, openClawConfigRemoteAuthorization, openClawConfigState, openClawConfigValues, openClawRemoteGuard.blocked]);

  const handleSubmitOpenClawRollback = useCallback(async () => {
    if (!openClawRollbackIntent?.backupId) {
      return;
    }

    setOpenClawConfigBusy(true);
    setOpenClawConfigError("");
    try {
      const response = await apiFetch("/api/openclaw/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rollback",
          agentId: normalizedConfigAgentId,
          backupId: openClawRollbackIntent.backupId,
          remoteAuthorization: openClawRollbackAuthorization,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok === false) {
        throw new Error(resolveOpenClawConfigErrorMessage(payload?.errorCode, messages));
      }
      setOpenClawConfigResult(payload);
      if (payload?.state) {
        setOpenClawConfigState(payload.state);
        setOpenClawConfigValues(buildOpenClawConfigFormValues(payload.state));
      }
      setOpenClawRollbackIntent(null);
      setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
      if (typeof onRefreshEnvironment === "function") {
        setOpenClawEnvironmentRefreshing(true);
        try {
          await onRefreshEnvironment();
        } catch {}
      }
      await handleLoadOpenClawHistory();
    } catch (error) {
      setOpenClawConfigError(error.message || messages.inspector.openClawConfig.errors.requestFailed);
    } finally {
      setOpenClawEnvironmentRefreshing(false);
      setOpenClawConfigBusy(false);
    }
  }, [handleLoadOpenClawHistory, messages, normalizedConfigAgentId, onRefreshEnvironment, openClawRollbackAuthorization, openClawRollbackIntent]);

  const handleRequestOpenClawAction = useCallback((action) => {
    if (!action) {
      return;
    }
    if (action.confirm) {
      setOpenClawActionIntent(action);
      return;
    }
    void handleRunOpenClawAction(action.key);
  }, [handleRunOpenClawAction]);

  useEffect(() => {
    setOpenClawConfigState(null);
    setOpenClawConfigValues({});
    setOpenClawConfigRemoteAuthorization({ confirmed: false, note: "" });
    setOpenClawRollbackAuthorization({ confirmed: false, note: "" });
    setOpenClawRollbackIntent(null);
    setOpenClawConfigResult(null);
    setOpenClawConfigError("");
    setOpenClawConfigRequested(false);
  }, [normalizedConfigAgentId]);

  useEffect(() => {
    if (lalaclawUpdateState || lalaclawUpdateLoading || lalaclawUpdateRequested) {
      return;
    }
    void handleLoadLalaClawUpdate();
  }, [handleLoadLalaClawUpdate, lalaclawUpdateLoading, lalaclawUpdateRequested, lalaclawUpdateState]);

  useEffect(() => {
    if (!lalaclawUpdateState?.job?.active) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void handleLoadLalaClawUpdate({ silent: true });
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [handleLoadLalaClawUpdate, lalaclawUpdateState?.job?.active]);

  useEffect(() => {
    const currentVersion = String(lalaclawUpdateState?.currentVersion || "").trim();
    const previousVersion = String(lastKnownLalaclawVersion.current || "").trim();
    if (!currentVersion) {
      return;
    }

    if (
      previousVersion
      && previousVersion !== currentVersion
      && lalaclawUpdateState?.job?.status === "completed"
      && typeof window !== "undefined"
      && typeof window.location?.reload === "function"
    ) {
      lastKnownLalaclawVersion.current = currentVersion;
      window.location.reload();
      return;
    }

    lastKnownLalaclawVersion.current = currentVersion;
  }, [lalaclawUpdateState?.currentVersion, lalaclawUpdateState?.job?.status]);

  useEffect(() => {
    if (
      activeTab !== "environment"
      || !hasOpenClawDiagnostics
      || openClawConfigState
      || openClawConfigLoading
      || openClawConfigRequested
    ) {
      return;
    }
    void handleLoadOpenClawConfig();
  }, [activeTab, handleLoadOpenClawConfig, hasOpenClawDiagnostics, openClawConfigLoading, openClawConfigRequested, openClawConfigState]);

  useEffect(() => {
    if (
      activeTab !== "environment"
      || openClawUpdateState
      || openClawUpdateLoading
      || openClawUpdateRequested
      || openClawRemoteGuard.blocked
    ) {
      return;
    }
    void handleLoadOpenClawUpdate();
  }, [activeTab, handleLoadOpenClawUpdate, openClawUpdateLoading, openClawUpdateRequested, openClawUpdateState, openClawRemoteGuard.blocked]);

  useEffect(() => {
    if (activeTab !== "environment" || openClawHistoryLoading || openClawHistoryRequested) {
      return;
    }
    void handleLoadOpenClawHistory();
  }, [activeTab, handleLoadOpenClawHistory, openClawHistoryLoading, openClawHistoryRequested]);

  useEffect(() => {
    if (!openClawRemoteGuard.blocked) {
      return;
    }
    setOpenClawUpdateState(null);
    setOpenClawUpdateRequested(false);
  }, [openClawRemoteGuard.blocked]);

  return {
    handleLoadLalaClawUpdate,
    handleRunLalaClawUpdate,
    lalaclawUpdateBusy,
    lalaclawUpdateError,
    lalaclawUpdateLoading,
    lalaclawUpdateState,
    openClawActionBusyKey,
    openClawActionIntent,
    openClawActionResult,
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
    openClawRemoteGuard,
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
    handleChangeOpenClawRollbackAuthorization,
    handleLoadOpenClawConfig,
    handleLoadOpenClawHistory,
    handleLoadOpenClawUpdate,
    handleRefreshEnvironment,
    handleRequestOpenClawAction,
    handleRunOpenClawAction,
    handleRunOpenClawUpdate,
    handleSubmitOpenClawConfig,
    handleSubmitOpenClawRollback,
  };
}
