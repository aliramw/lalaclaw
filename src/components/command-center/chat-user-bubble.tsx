import { memo } from "react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { MessageLabel } from "./chat-message-label";
import { MessageMeta } from "./chat-message-meta";
import { BubbleTopJumpButton } from "./chat-navigation-buttons";
import { MessageAttachments } from "./chat-panel-attachments";
import { MarkdownContent } from "./markdown-content";

type UserMessageBubbleProps = {
  bubbleBaseClassName?: string;
  bubbleContentClassName?: string;
  chatFontSize?: string;
  files?: Array<Record<string, unknown>>;
  focusBubbleClassName?: string;
  fontSizeStyles: {
    label?: string;
    meta?: string;
    userMarkdown?: string;
  };
  formatTime: (value: unknown) => string;
  handleJumpBubbleTop?: (() => void) | null;
  handleJumpPreviousMessage?: (() => void) | null;
  handleOpenFilePreview?: ComponentProps<typeof MarkdownContent>["onOpenFilePreview"];
  handleOpenImagePreview?: ComponentProps<typeof MarkdownContent>["onOpenImagePreview"];
  headingScopeId: string;
  message: {
    attachments?: ComponentProps<typeof MessageAttachments>["attachments"];
    content?: string;
    timestamp?: number | string;
  };
  messageBubbleAttributes?: Record<string, string | undefined>;
  previousMessageId?: string;
  renderedContent?: string;
  resolvedTheme?: string;
  setBubbleNode?: ((node: HTMLDivElement | null) => void) | null;
  setBubbleSurfaceNode?: ((node: HTMLDivElement | null) => void) | null;
  showBubbleTopJump?: boolean;
  supportsBubbleTopJump?: boolean;
  userBubbleClassName?: string;
  userBubbleWidthClassName?: string;
  userLabel?: string;
};

export const UserMessageBubble = memo(function UserMessageBubble({
  bubbleBaseClassName,
  bubbleContentClassName,
  chatFontSize,
  files,
  focusBubbleClassName,
  fontSizeStyles,
  formatTime,
  handleJumpBubbleTop,
  handleJumpPreviousMessage,
  handleOpenFilePreview,
  handleOpenImagePreview,
  headingScopeId,
  message,
  messageBubbleAttributes,
  previousMessageId,
  renderedContent,
  resolvedTheme,
  setBubbleNode,
  setBubbleSurfaceNode,
  showBubbleTopJump,
  supportsBubbleTopJump,
  userBubbleClassName,
  userBubbleWidthClassName,
  userLabel,
}: UserMessageBubbleProps) {
  return (
    <div
      ref={setBubbleNode}
      {...messageBubbleAttributes}
      className="group/message flex w-full justify-end"
    >
      <div className="flex max-w-full flex-col items-end">
        <MessageLabel align="right" value={userLabel} textClassName={fontSizeStyles.label} />
        <div className="flex max-w-full items-center gap-2">
          <MessageMeta
            align="left"
            content={message.content}
            copyFirst
            formatTime={formatTime}
            onJumpPreviousUserMessage={previousMessageId ? handleJumpPreviousMessage : undefined}
            pending={false}
            streaming={false}
            compact
            textClassName={fontSizeStyles.meta}
            timestamp={message.timestamp}
          />
          <Card ref={setBubbleSurfaceNode} data-bubble-layout="user" className={cn(bubbleBaseClassName, userBubbleWidthClassName, "cc-user-bubble", userBubbleClassName, focusBubbleClassName)}>
            {supportsBubbleTopJump && showBubbleTopJump ? <BubbleTopJumpButton onClick={handleJumpBubbleTop} /> : null}
            <CardContent className={cn(bubbleContentClassName, message.attachments?.length && "space-y-2")}>
              <MessageAttachments
                attachments={message.attachments}
                onPreviewImage={handleOpenImagePreview}
                scrollAnchorBaseId={`${headingScopeId}-attachment`}
              />
              {message.content ? (
                <MarkdownContent
                  content={renderedContent}
                  files={files as any}
                  fontSize={chatFontSize as any}
                  headingScopeId={headingScopeId}
                  resolvedTheme={resolvedTheme}
                  streaming={false}
                  onOpenFilePreview={handleOpenFilePreview}
                  onOpenImagePreview={handleOpenImagePreview}
                  className={fontSizeStyles.userMarkdown}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});
