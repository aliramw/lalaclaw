import { memo } from "react";
import { cn } from "@/lib/utils";

export const AgentLabel = memo(function AgentLabel({ tokenBadge, value, textClassName, tokenBadgeClassName }: { tokenBadge?: string; value?: string; textClassName?: string; tokenBadgeClassName?: string }) {
  return (
    <div className={cn("mb-1 flex max-w-full items-center gap-2 px-1 text-muted-foreground/85", textClassName)}>
      <span className="truncate">
        {value}
      </span>
      {tokenBadge ? <span className={cn("shrink-0 text-muted-foreground/70", tokenBadgeClassName)}>{tokenBadge}</span> : null}
    </div>
  );
});
