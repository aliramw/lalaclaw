export function normalizeStatusKey(status = "") {
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

  if (/run|progress|进行|执行中|处理中|thinking|思考中|消化 token 中/.test(value)) {
    return "running";
  }

  if (/complete|done|success|完成/.test(value)) {
    return "completed";
  }

  return "";
}

export function getLocalizedStatusLabel(status, messages) {
  const normalized = normalizeStatusKey(status);

  if (!normalized) {
    return status || "";
  }

  if (normalized === "idle") {
    return messages?.common?.idle || status || "";
  }

  if (normalized === "offline") {
    return messages?.common?.offline || status || "";
  }

  return messages?.inspector?.relationships?.statuses?.[normalized] || status || "";
}

export function localizeStatusSummary(summary = "", messages) {
  return String(summary || "").replace(/[（(]([^()（）]+)[)）]/g, (match, inner) => {
    const localized = getLocalizedStatusLabel(inner, messages);
    return localized && localized !== inner ? match.replace(inner, localized) : match;
  });
}

export function getRelationshipStatusBadgeProps(status) {
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

export function isOfflineStatus(status) {
  return normalizeStatusKey(status) === "offline";
}
