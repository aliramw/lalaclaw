import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { useCommandCenter } from "@/features/app/controllers";
import { I18nProvider } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

function AgentSwitchOverlay({ agentLabel }) {
  const { messages } = useI18n();

  if (!agentLabel) {
    return null;
  }

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
            {messages.common.switchingToAgent(agentLabel)}
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {messages.common.switchingAgentWait}
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const {
    activeQueuedMessages,
    activeTab,
    agents,
    artifacts,
    availableAgents,
    availableModels,
    busy,
    composerAttachments,
    files,
    fastMode,
    formatCompactK,
    handleAddAttachments,
    handleAgentChange,
    handleFastModeChange,
    handleModelChange,
    handlePromptChange,
    handlePromptKeyDown,
    handleRemoveAttachment,
    handleReset,
    handleSend,
    handleThinkModeChange,
    localizedFormatTime,
    messageViewportRef,
    messages,
    model,
    peeks,
    prompt,
    promptRef,
    renderPeek,
    resolvedTheme,
    session,
    setActiveTab,
    setTheme,
    snapshots,
    switchingAgentLabel,
    taskTimeline,
    theme,
  } = useCommandCenter();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-screen overflow-hidden bg-background text-foreground" aria-busy={switchingAgentLabel ? "true" : "false"}>
        <div className="mx-auto flex h-full w-full max-w-[1760px] flex-col gap-3 overflow-hidden py-3">
          <SessionOverview
            availableAgents={availableAgents}
            availableModels={availableModels}
            fastMode={fastMode}
            formatCompactK={formatCompactK}
            model={model}
            onAgentChange={handleAgentChange}
            onFastModeChange={handleFastModeChange}
            onModelChange={handleModelChange}
            onThinkModeChange={handleThinkModeChange}
            onThemeChange={setTheme}
            resolvedTheme={resolvedTheme}
            session={session}
            theme={theme}
          />

          <main className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
            <ChatPanel
              agentLabel={session.agentLabel || session.agentId || "main"}
              busy={busy}
              composerAttachments={composerAttachments}
              files={files}
              formatTime={localizedFormatTime}
              messageViewportRef={messageViewportRef}
              messages={messages}
              onAddAttachments={handleAddAttachments}
              queuedMessages={activeQueuedMessages}
              onRemoveAttachment={handleRemoveAttachment}
              onPromptChange={handlePromptChange}
              onPromptKeyDown={handlePromptKeyDown}
              onReset={() => handleReset().catch(() => {})}
              onSend={handleSend}
              prompt={prompt}
              promptRef={promptRef}
              resolvedTheme={resolvedTheme}
              session={session}
              userLabel="marila"
            />

            <InspectorPanel
              activeTab={activeTab}
              agents={agents}
              artifacts={artifacts}
              currentWorkspaceRoot={session.workspaceRoot}
              files={files}
              peeks={peeks}
              renderPeek={renderPeek}
              resolvedTheme={resolvedTheme}
              setActiveTab={setActiveTab}
              snapshots={snapshots}
              taskTimeline={taskTimeline}
            />
          </main>
        </div>
        <AgentSwitchOverlay agentLabel={switchingAgentLabel} />
      </div>
    </TooltipProvider>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
