import { ArrowUp, ArrowUpToLine } from "lucide-react";
import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

export const PreviousUserMessageButton = memo(function PreviousUserMessageButton({ onClick }) {
  const { messages } = useI18n();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="pointer-events-none inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/75 opacity-0 transition hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100"
          aria-label={messages.chat.jumpToPreviousUserMessage}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{messages.chat.jumpToPreviousUserMessage}</TooltipContent>
    </Tooltip>
  );
});

export const BubbleTopJumpButton = memo(function BubbleTopJumpButton({ onClick }) {
  const { messages } = useI18n();

  return (
    <div className="pointer-events-none sticky top-2 z-10 -mb-7 flex justify-end px-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className="pointer-events-none inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/92 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-background hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100"
            aria-label={messages.chat.jumpToMessageTop}
          >
            <ArrowUpToLine className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{messages.chat.jumpToMessageTop}</TooltipContent>
      </Tooltip>
    </div>
  );
});
