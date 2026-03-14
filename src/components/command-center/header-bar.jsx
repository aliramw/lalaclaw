import { Bot, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function HeaderBar({ onReset }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/80 px-4 py-2 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">🦞 LalaClaw.ai</h1>
          <p className="truncate text-xs text-muted-foreground">龙虾指挥中心</p>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="sm" onClick={onReset} className="shrink-0">
            <RotateCcw className="h-4 w-4" />
            重置对话
          </Button>
        </TooltipTrigger>
        <TooltipContent>重置对话 (⌘N)</TooltipContent>
      </Tooltip>
    </div>
  );
}
