import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-[250px] rounded-md bg-foreground px-3 py-1.5 text-[11px] font-medium text-background shadow-md [&_.text-muted-foreground]:text-background/72",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
