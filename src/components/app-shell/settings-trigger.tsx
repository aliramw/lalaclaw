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
          className="cc-settings-trigger cc-shell-utility-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-[var(--surface)] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.24)] transition hover:border-[var(--border-strong)] hover:bg-accent/28 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={onOpen}
        >
          <CircleUserRound className="h-[1.1rem] w-[1.1rem]" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
