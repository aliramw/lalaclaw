import { memo } from "react";
import { cn } from "@/lib/utils";
import { CopyMessageButton } from "./chat-copy-button";
import { PreviousUserMessageButton } from "./chat-navigation-buttons";

export const MessageMeta = memo(function MessageMeta({
  align,
  content,
  copyFirst = false,
  formatTime,
  onJumpPreviousUserMessage,
  pending,
  streaming,
  sticky,
  compact,
  timestamp,
  textClassName,
}: {
  align?: "left" | "right";
  content?: string;
  copyFirst?: boolean;
  formatTime: (value: unknown) => string;
  onJumpPreviousUserMessage?: (() => void) | null;
  pending?: boolean;
  streaming?: boolean;
  sticky?: boolean;
  compact?: boolean;
  timestamp?: number | string;
  textClassName?: string;
}) {
  void align;
  void streaming;

  const baseClassName = cn(
    "flex items-center gap-1 text-muted-foreground tabular-nums",
    textClassName,
    sticky ? "sticky top-0" : "",
    compact ? "self-center" : "self-start pt-2.5",
  );

  if (copyFirst) {
    return (
      <div className={baseClassName}>
        {onJumpPreviousUserMessage ? <PreviousUserMessageButton onClick={onJumpPreviousUserMessage} /> : null}
        {pending ? null : <CopyMessageButton content={content} />}
        <time>{formatTime(timestamp)}</time>
      </div>
    );
  }

  return (
    <div className={baseClassName}>
      <time>{formatTime(timestamp)}</time>
      {pending ? null : <CopyMessageButton content={content} />}
      {onJumpPreviousUserMessage ? <PreviousUserMessageButton onClick={onJumpPreviousUserMessage} /> : null}
    </div>
  );
});
