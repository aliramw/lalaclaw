import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AgentSwitchOverlayProps = {
  agentLabel: string;
  mode?: string;
};

type ModelSwitchOverlayProps = {
  modelLabel: string;
};

type SessionNoticeProps = {
  notice: {
    message?: string;
    type?: "success" | "error";
  } | null;
};

export function AgentSwitchOverlay({ agentLabel, mode = "switching" }: AgentSwitchOverlayProps) {
  const { messages } = useI18n();

  if (!agentLabel) {
    return null;
  }

  const title = mode === "opening-session"
    ? messages.common.openingAgentSession(agentLabel)
    : messages.common.switchingToAgent(agentLabel);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/78 backdrop-blur-[6px]">
      <div className="cc-agent-switch-card flex w-[min(26rem,calc(100vw-2rem))] flex-col items-center gap-4 rounded-[1.75rem] border border-border/70 bg-card/94 px-7 py-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="cc-agent-switch-orbit" aria-hidden="true">
          <span className="cc-agent-switch-dot cc-agent-switch-dot-1" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-2" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-3" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {messages.sessionOverview.labels.agent}
          </div>
          <div className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {messages.common.switchingAgentWait}
        </div>
      </div>
    </div>
  );
}

export function ModelSwitchOverlay({ modelLabel }: ModelSwitchOverlayProps) {
  const { messages } = useI18n();

  if (!modelLabel) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/78 backdrop-blur-[6px]">
      <div className="cc-agent-switch-card flex w-[min(30rem,calc(100vw-2rem))] flex-col items-center gap-4 rounded-[1.75rem] border border-border/70 bg-card/94 px-7 py-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
        <div className="cc-agent-switch-orbit" aria-hidden="true">
          <span className="cc-agent-switch-dot cc-agent-switch-dot-1" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-2" />
          <span className="cc-agent-switch-dot cc-agent-switch-dot-3" />
        </div>
        <div className="space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {messages.sessionOverview.labels.model}
          </div>
          <div className="space-y-2">
            <div className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              {messages.common.switchingModelTo}
            </div>
            <div className="break-all text-xl font-semibold tracking-[-0.02em] text-foreground">
              {modelLabel}
            </div>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {messages.common.switchingModelWait}
        </div>
      </div>
    </div>
  );
}

export function SessionNotice({ notice }: SessionNoticeProps) {
  if (!notice?.message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-[130] flex justify-center px-4">
      <div
        className={cn(
          "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium shadow-lg backdrop-blur",
          notice.type === "error"
            ? "border-rose-200/70 bg-rose-50/95 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/80 dark:text-rose-100"
            : "border-sky-200/80 bg-white/96 text-slate-800 dark:border-sky-500/25 dark:bg-slate-900/88 dark:text-slate-100",
        )}
      >
        {notice.message}
      </div>
    </div>
  );
}
