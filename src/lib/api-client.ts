const authRequiredEventName = "command-center-auth-required";

function dispatchAuthRequired(detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  window.dispatchEvent(new CustomEvent(authRequiredEventName, { detail }));
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });

  if (response.status === 401) {
    dispatchAuthRequired({ responseStatus: response.status, url: String(input || "") });
  }

  return response;
}

export { authRequiredEventName, dispatchAuthRequired };
