type StatusMessages = {
  common?: {
    idle?: string;
    offline?: string;
  };
  inspector?: {
    relationships?: {
      statuses?: Record<string, string | undefined>;
    };
  };
};

export function normalizeStatusKey(status: unknown = "") {
  const value = String(status || "").trim().toLowerCase();
  if (!value) {
    return "";
  }

  if (/offline|离线/.test(value)) {
    return "offline";
  }

  if (/idle|待命|空闲|就绪|ready/.test(value)) {
    return "idle";
  }

  if (/dispatch|派发/.test(value)) {
    return "dispatching";
  }

  if (/fail|error|失败/.test(value)) {
    return "failed";
  }

  if (/establish|建立/.test(value)) {
    return "established";
  }

  if (/run|progress|运行中|进行|执行中|处理中|thinking|思考中|消化 token 中/.test(value)) {
    return "running";
  }

  if (/complete|done|success|完成/.test(value)) {
    return "completed";
  }

  return "";
}

export function getLocalizedStatusLabel(status: unknown, messages?: StatusMessages) {
  const normalized = normalizeStatusKey(status);
  const fallbackStatus = String(status || "");

  if (!normalized) {
    return fallbackStatus;
  }

  if (normalized === "idle") {
    return messages?.common?.idle || fallbackStatus;
  }

  if (normalized === "offline") {
    return messages?.common?.offline || fallbackStatus;
  }

  return messages?.inspector?.relationships?.statuses?.[normalized] || fallbackStatus;
}

export function localizeStatusSummary(summary = "", messages?: StatusMessages) {
  return String(summary || "").replace(/[（(]([^()（）]+)[)）]/g, (match, inner) => {
    const localized = getLocalizedStatusLabel(inner, messages);
    return localized && localized !== inner ? match.replace(inner, localized) : match;
  });
}

export function getRelationshipStatusBadgeProps(status: unknown) {
  const normalized = normalizeStatusKey(status);

  if (normalized === "completed" || normalized === "established") {
    return { variant: "success", className: "" };
  }

  if (normalized === "running" || normalized === "dispatching") {
    return { variant: "active", className: "" };
  }

  if (normalized === "failed") {
    return {
      variant: "default",
      className: "border-transparent bg-destructive/10 text-destructive",
    };
  }

  return { variant: "default", className: "border-transparent bg-muted text-muted-foreground" };
}

export function isOfflineStatus(status: unknown) {
  return normalizeStatusKey(status) === "offline";
}
