import { Bot, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";

type HeaderBarProps = {
  onReset?: () => void;
};

const HeaderButton = Button as any;
const HeaderTooltip = Tooltip as any;
const HeaderTooltipContent = TooltipContent as any;
const HeaderTooltipTrigger = TooltipTrigger as any;

export function HeaderBar({ onReset }: HeaderBarProps) {
  const { messages } = useI18n();

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-2 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{messages.app.title}</h1>
          <p className="truncate text-xs text-muted-foreground">{messages.app.subtitle}</p>
        </div>
      </div>
      <HeaderTooltip>
        <HeaderTooltipTrigger asChild>
          <HeaderButton variant="outline" size="sm" onClick={onReset} className="shrink-0">
            <RotateCcw className="h-4 w-4" />
            {messages.chat.resetConversation}
          </HeaderButton>
        </HeaderTooltipTrigger>
        <HeaderTooltipContent>{messages.chat.resetConversationHotkey}</HeaderTooltipContent>
      </HeaderTooltip>
    </div>
  );
}
