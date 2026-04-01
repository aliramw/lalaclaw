import type { ChatPanelRenderTool } from "@/components/command-center/chat-panel-render-items";
import { CardContentSurface as CardContent, CardSurface as Card } from "@/components/command-center/chat-panel-surfaces";
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";
import { useI18n } from "@/lib/i18n";

type ChatTurnActivityProps = {
  resolvedTheme?: string;
  tools?: ChatPanelRenderTool[];
};

export function ChatTurnActivity({
  resolvedTheme = "light",
  tools = [],
}: ChatTurnActivityProps) {
  const { messages } = useI18n();

  if (!tools.length) {
    return null;
  }

  return (
    <div className="group/message flex w-fit max-w-full">
      <div className="flex max-w-full flex-col items-start">
        <Card className="w-[700px] max-w-[calc(100vw-12rem)] border-border/70 bg-muted/15">
          <CardContent className="px-3 py-3">
            <ToolCallTimeline
              copyLabels={{ copy: messages.markdown.copyCode, copied: messages.markdown.copiedCode }}
              labels={{
                collapse: messages.inspector.timeline.collapse,
                expand: messages.inspector.timeline.expand,
                input: messages.inspector.timeline.input,
                output: messages.inspector.timeline.output,
                none: messages.inspector.timeline.none,
                noOutput: messages.inspector.timeline.noOutput,
              }}
              messages={messages}
              resolvedTheme={resolvedTheme}
              tools={tools}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
