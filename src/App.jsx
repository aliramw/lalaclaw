import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionOverview } from "@/components/command-center/session-overview";
import { ChatPanel } from "@/components/command-center/chat-panel";
import { InspectorPanel } from "@/components/command-center/inspector-panel";
import { useCommandCenter } from "@/features/app/controllers";
import { I18nProvider } from "@/lib/i18n";

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
    taskTimeline,
    theme,
  } = useCommandCenter();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-screen overflow-hidden bg-background text-foreground">
        <div className="mx-auto flex h-full w-full max-w-[1760px] flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8">
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
