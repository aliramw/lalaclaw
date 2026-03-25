import { CircleUserRound } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SettingsTriggerProps = {
  label: string;
  onOpen: () => void;
};

export function SettingsTrigger({ label, onOpen }: SettingsTriggerProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/70 text-muted-foreground transition hover:border-border hover:bg-accent/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={onOpen}
        >
          <CircleUserRound className="h-[1.1rem] w-[1.1rem]" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
