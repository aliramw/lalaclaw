import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AccessGateContext } from "@/features/auth/access-context";
import { useI18n } from "@/lib/i18n";
import { authRequiredEventName } from "@/lib/api-client";

type AccessStatePayload = {
  accessMode?: string;
  authenticated?: boolean;
  error?: string;
  hints?: Record<string, unknown>;
  ok?: boolean;
};

type AccessGateState = {
  accessMode: string;
  authenticated: boolean;
  hints: Record<string, unknown>;
  loading: boolean;
};

const AccessGateButton: any = Button;
const AccessGateCard: any = Card;
const AccessGateCardContent: any = CardContent;

const accessTokenHelpUrls = {
  zh: "https://github.com/aliramw/lalaclaw/blob/main/docs/zh/documentation-quick-start.md#browser-access-tokens",
  "zh-hk": "https://github.com/aliramw/lalaclaw/blob/main/docs/zh-hk/documentation-quick-start.md#browser-access-tokens",
  en: "https://github.com/aliramw/lalaclaw/blob/main/docs/en/documentation-quick-start.md#browser-access-tokens",
  ja: "https://github.com/aliramw/lalaclaw/blob/main/docs/ja/documentation-quick-start.md#browser-access-tokens",
  ko: "https://github.com/aliramw/lalaclaw/blob/main/docs/ko/documentation-quick-start.md#browser-access-tokens",
  fr: "https://github.com/aliramw/lalaclaw/blob/main/docs/fr/documentation-quick-start.md#browser-access-tokens",
  es: "https://github.com/aliramw/lalaclaw/blob/main/docs/es/documentation-quick-start.md#browser-access-tokens",
  pt: "https://github.com/aliramw/lalaclaw/blob/main/docs/pt/documentation-quick-start.md#browser-access-tokens",
  de: "https://github.com/aliramw/lalaclaw/blob/main/docs/de/documentation-quick-start.md#browser-access-tokens",
  ms: "https://github.com/aliramw/lalaclaw/blob/main/docs/ms/documentation-quick-start.md#browser-access-tokens",
  ta: "https://github.com/aliramw/lalaclaw/blob/main/docs/ta/documentation-quick-start.md#browser-access-tokens",
};

const accessGatePrimaryButtonClassName = "h-12 w-full rounded-2xl border-0 bg-primary text-base font-semibold text-primary-foreground shadow-none transition-colors hover:translate-y-0 hover:bg-primary/90";

async function fetchAccessState(fallbackError = "") {
  const response = await fetch("/api/auth/state", {
    credentials: "same-origin",
  });
  const payload = await response.json() as AccessStatePayload;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || fallbackError);
  }
  return payload;
}

export function AccessGate({ children }: { children?: ReactNode }) {
  const { locale, messages } = useI18n();
  const [state, setState] = useState<AccessGateState>({ loading: true, accessMode: "off", authenticated: true, hints: {} });
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const accessTokenHelpUrl = accessTokenHelpUrls[locale] || accessTokenHelpUrls.en;

  const refreshState = useCallback(async () => {
    const payload = await fetchAccessState(messages.authGate.errors.loadState);
    setState({
      loading: false,
      accessMode: payload.accessMode || "off",
      authenticated: payload.accessMode !== "token" || payload.authenticated === true,
      hints: payload.hints || {},
    });
    setLoggingOut(false);
    setError("");
  }, [messages.authGate.errors.loadState]);

  useEffect(() => {
    let cancelled = false;
    refreshState().catch((nextError: any) => {
      if (!cancelled) {
        setState((current) => ({ ...current, loading: false, authenticated: false }));
        setError(nextError?.message || messages.authGate.errors.loadState);
      }
    });

    const handleAuthRequired = () => {
      setState((current) => ({ ...current, loading: false, accessMode: "token", authenticated: false }));
      setToken("");
      setSubmitting(false);
      setLoggingOut(false);
      setError("");
    };

    window.addEventListener(authRequiredEventName, handleAuthRequired);

    return () => {
      cancelled = true;
      window.removeEventListener(authRequiredEventName, handleAuthRequired);
    };
  }, [messages.authGate.errors.loadState, refreshState]);

  const shellTitle = useMemo(() => {
    if (error) {
      return messages.authGate.connectionErrorTitle;
    }
    if (state.loading) {
      return messages.authGate.loadingTitle;
    }
    return messages.authGate.title;
  }, [error, messages.authGate.connectionErrorTitle, messages.authGate.loadingTitle, messages.authGate.title, state.loading]);

  const brandWordmark = useMemo(() => {
    const title = String(messages.app.title || "").trim();
    const segments = title.split(/\s+/);
    return segments.length > 1 ? segments.slice(1).join(" ") : title;
  }, [messages.app.title]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextToken = token.trim();
    if (!nextToken) {
      setError(messages.authGate.errors.emptyToken);
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/token", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: nextToken }),
      });
      const payload = await response.json() as AccessStatePayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || messages.authGate.errors.invalidToken);
      }

      setState({
        loading: false,
        accessMode: payload.accessMode || "token",
        authenticated: true,
        hints: payload.hints || state.hints || {},
      });
      setToken("");
    } catch (nextError: any) {
      setError(nextError?.message || messages.authGate.errors.invalidToken);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = useCallback(async () => {
    if (loggingOut) {
      return;
    }

    setLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json() as AccessStatePayload;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || messages.authGate.errors.logout);
      }

      setState((current) => ({
        loading: false,
        accessMode: payload.accessMode || current.accessMode || "token",
        authenticated: false,
        hints: payload.hints || current.hints || {},
      }));
      setLoggingOut(false);
      setToken("");
      setError("");
    } catch (nextError: any) {
      setLoggingOut(false);
      throw new Error(nextError?.message || messages.authGate.errors.logout);
    }
  }, [loggingOut, messages.authGate.errors.logout]);

  const contextValue = useMemo(() => ({
    accessMode: state.accessMode,
    authenticated: state.authenticated,
    loggingOut,
    logout: handleLogout,
  }), [handleLogout, loggingOut, state.accessMode, state.authenticated]);

  if (!state.loading && !error && (state.accessMode !== "token" || state.authenticated)) {
    return <AccessGateContext.Provider value={contextValue}>{children}</AccessGateContext.Provider>;
  }

  return (
    <AccessGateContext.Provider value={contextValue}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.16),_transparent_36%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(226,232,240,0.9))] px-4 py-12 dark:bg-[radial-gradient(circle_at_top,_rgba(45,212,191,0.12),_transparent_30%),linear-gradient(180deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.94))]">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(15,23,42,0.04)_50%,transparent_100%)] dark:bg-[linear-gradient(135deg,transparent_0%,rgba(148,163,184,0.08)_50%,transparent_100%)]" />
        <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
          <div className="flex w-full items-center justify-center">
            <div className="inline-flex max-w-full items-center justify-center gap-3 px-4 py-2" aria-label={messages.app.title}>
              <img src="/favicon.svg" alt="" aria-hidden="true" className="h-11 w-11 shrink-0 drop-shadow-[0_6px_18px_rgba(15,23,42,0.12)] sm:h-12 sm:w-12" />
              <span className="max-w-full truncate text-center text-[1.9rem] font-bold tracking-[-0.06em] text-slate-900 dark:text-slate-100 sm:text-[2.3rem]">
                {brandWordmark}
              </span>
            </div>
          </div>

          <AccessGateCard className="w-full rounded-[1.8rem] border-border/70 bg-card/95 shadow-[0_22px_80px_rgba(15,23,42,0.14)] backdrop-blur">
            <AccessGateCardContent className="space-y-6 p-7">
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{shellTitle}</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  {error ? error : state.loading ? messages.authGate.loadingDescription : messages.authGate.description}
                </p>
                {!error && state.accessMode === "token" ? (
                  <p className="text-xs leading-5 text-muted-foreground/90">
                    <a
                      href={accessTokenHelpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[#007aff] underline decoration-[#007aff]/35 underline-offset-4 transition hover:text-[#006ee6] dark:text-[#78b7ff] dark:decoration-[#78b7ff]/35 dark:hover:text-[#a8d0ff]"
                    >
                      {messages.authGate.helpLink}
                    </a>
                  </p>
                ) : null}
              </div>

              {!state.loading && !error ? (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-[0.875rem]">
                    <label htmlFor="access-token" className="block text-sm font-semibold tracking-[-0.02em] text-foreground">
                      {messages.authGate.tokenLabel}
                    </label>
                    <div className="flex h-12 items-center gap-3 rounded-2xl border border-border/80 bg-background/95 px-4 transition focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
                      <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <input
                        id="access-token"
                        type="password"
                        autoComplete="current-password"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        placeholder={messages.authGate.tokenPlaceholder}
                        className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/75"
                      />
                    </div>
                  </div>
                  <AccessGateButton type="submit" className={accessGatePrimaryButtonClassName} disabled={submitting}>
                    {submitting ? messages.authGate.submitting : messages.authGate.submit}
                  </AccessGateButton>
                </form>
              ) : error ? (
                <AccessGateButton type="button" className={accessGatePrimaryButtonClassName} onClick={() => {
                  setState((current) => ({ ...current, loading: true }));
                  refreshState().catch((nextError) => {
                    setState((current) => ({ ...current, loading: false, authenticated: false }));
                    setError(nextError?.message || messages.authGate.errors.loadState);
                  });
                }}>
                  {messages.authGate.retry}
                </AccessGateButton>
              ) : (
                <div
                  data-testid="access-gate-loading-state"
                  className="flex h-12 items-center justify-center rounded-2xl bg-background/45 text-sm text-muted-foreground"
                >
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                </div>
              )}
            </AccessGateCardContent>
          </AccessGateCard>
        </div>
      </div>
    </AccessGateContext.Provider>
  );
}
