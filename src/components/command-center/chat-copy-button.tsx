import { Check, Copy } from "lucide-react";
import { memo, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

type CopyMessageButtonProps = {
  content?: string | null;
};

export const CopyMessageButton = memo(function CopyMessageButton({ content }: CopyMessageButtonProps) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(String(content || ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="pointer-events-none inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground/75 opacity-0 transition hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover/message:pointer-events-auto group-hover/message:opacity-100"
          aria-label={copied ? messages.chat.copiedMessage : messages.chat.copyMessage}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? messages.chat.copiedMessageTitle : messages.chat.copyMessageTitle}</TooltipContent>
    </Tooltip>
  );
});
