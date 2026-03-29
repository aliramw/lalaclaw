import { memo } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { AgentLabel } from "./chat-agent-label";
import { MessageMeta } from "./chat-message-meta";
import { MarkdownContent } from "./markdown-content";

type PendingAssistantBubbleProps = {
  agentLabel?: string;
  assistantBubbleClassName?: string;
  bubbleBaseClassName?: string;
  bubbleContentClassName?: string;
  bubbleStreaming?: boolean;
  bubbleTopJumpButton?: ReactNode;
  chatFontSize?: string;
  files?: Array<Record<string, unknown>>;
  focusBubbleClassName?: string;
  fontSizeStyles: {
    label?: string;
    meta?: string;
    pendingMarkdown?: string;
    tokenBadge?: string;
  };
  formatTime: (value: unknown) => string;
  handleOpenFilePreview?: ComponentProps<typeof MarkdownContent>["onOpenFilePreview"];
  handleOpenImagePreview?: ComponentProps<typeof MarkdownContent>["onOpenImagePreview"];
  headingScopeId: string;
  message: {
    timestamp?: number | string;
  };
  messageBubbleAttributes?: Record<string, string | undefined>;
  renderedContent?: string;
  resolvedTheme?: string;
  setBubbleNode?: ((node: HTMLDivElement | null) => void) | null;
  setBubbleSurfaceNode?: ((node: HTMLDivElement | null) => void) | null;
  staleWarning?: string | null;
};

export const PendingAssistantBubble = memo(function PendingAssistantBubble({
  agentLabel,
  assistantBubbleClassName,
  bubbleBaseClassName,
  bubbleContentClassName,
  bubbleStreaming,
  bubbleTopJumpButton,
  chatFontSize,
  files,
  focusBubbleClassName,
  fontSizeStyles,
  formatTime,
  handleOpenFilePreview,
  handleOpenImagePreview,
  headingScopeId,
  message,
  messageBubbleAttributes,
  renderedContent,
  resolvedTheme,
  setBubbleNode,
  setBubbleSurfaceNode,
  staleWarning,
}: PendingAssistantBubbleProps) {
  return (
    <div
      ref={setBubbleNode}
      {...messageBubbleAttributes}
      className="group/message flex w-fit max-w-full"
    >
      <div className="flex max-w-full flex-col items-start">
        <AgentLabel value={agentLabel} textClassName={fontSizeStyles.label} tokenBadgeClassName={fontSizeStyles.tokenBadge} />
        <div className="inline-flex max-w-full items-center gap-2">
          <Card
            ref={setBubbleSurfaceNode}
            data-bubble-layout="compact"
            className={cn(
              bubbleBaseClassName,
              "cc-thinking-bubble inline-block w-fit max-w-[min(60vw,14rem)] shrink-0 motion-reduce:animate-none",
              "cc-assistant-bubble",
              assistantBubbleClassName,
              focusBubbleClassName,
            )}
          >
            {bubbleTopJumpButton}
            <CardContent className={bubbleContentClassName}>
              <MarkdownContent
                content={renderedContent}
                files={files as any}
                fontSize={chatFontSize as any}
                headingScopeId={headingScopeId}
                resolvedTheme={resolvedTheme}
                streaming={bubbleStreaming}
                onOpenFilePreview={handleOpenFilePreview}
                onOpenImagePreview={handleOpenImagePreview}
                className={fontSizeStyles.pendingMarkdown}
              />
            </CardContent>
          </Card>
          <MessageMeta align="right" content={renderedContent} formatTime={formatTime} pending compact textClassName={fontSizeStyles.meta} timestamp={message.timestamp} />
        </div>
        {staleWarning ? (
          <p className="mt-1 text-xs text-muted-foreground/80">{staleWarning}</p>
        ) : null}
      </div>
    </div>
  );
});
