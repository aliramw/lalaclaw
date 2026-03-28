import type { ReactNode } from "react";
import { TooltipContent } from "@/components/ui/tooltip";

const OverviewTooltipContent = TooltipContent as any;

export function BlockTooltipContent({ label, value }: { label?: ReactNode; value?: ReactNode }) {
  return (
    <OverviewTooltipContent side="bottom" className="px-2.5 py-2">
      <div className="space-y-0.5">
        <div className="text-[10px] uppercase text-background/70">{label}</div>
        <div className="max-w-[28rem] break-words">{value}</div>
      </div>
    </OverviewTooltipContent>
  );
}
