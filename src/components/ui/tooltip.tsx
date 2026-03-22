import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { createContext, forwardRef, useCallback, useContext, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, ElementRef, PointerEvent } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

type TooltipDismissContextValue = {
  clearSuppression: () => void;
  dismiss: () => void;
};

const TooltipDismissContext = createContext<TooltipDismissContextValue | null>(null);

/**
 * Tooltip root that auto-dismisses on click and suppresses reopening until
 * the pointer leaves the trigger.  Supports both controlled (`open` /
 * `onOpenChange`) and uncontrolled usage — every existing call-site works
 * without changes.
 */
export function Tooltip({ open: controlledOpen, onOpenChange, children, ...props }: ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const suppressedRef = useRef(false);

  const isControlled = controlledOpen !== undefined;

  const handleOpenChange = useCallback((nextOpen) => {
    if (suppressedRef.current) {
      if (isControlled) onOpenChange?.(false);
      else setInternalOpen(false);
      return;
    }
    if (isControlled) onOpenChange?.(nextOpen);
    else setInternalOpen(nextOpen);
  }, [isControlled, onOpenChange]);

  const dismiss = useCallback(() => {
    if (isControlled) onOpenChange?.(false);
    else setInternalOpen(false);
    suppressedRef.current = true;
  }, [isControlled, onOpenChange]);

  const clearSuppression = useCallback(() => {
    suppressedRef.current = false;
  }, []);

  return (
    <TooltipDismissContext.Provider value={{ dismiss, clearSuppression }}>
      <TooltipPrimitive.Root
        open={isControlled ? controlledOpen : internalOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipDismissContext.Provider>
  );
}

export const TooltipTrigger = forwardRef(function TooltipTrigger(
  { onPointerDown, onPointerLeave, ...props }: ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>,
  ref: React.ForwardedRef<ElementRef<typeof TooltipPrimitive.Trigger>>,
) {
  const ctx = useContext(TooltipDismissContext);

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      ctx?.dismiss();
      onPointerDown?.(e as any);
    },
    [ctx, onPointerDown],
  );

  const handlePointerLeave = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      ctx?.clearSuppression();
      onPointerLeave?.(e as any);
    },
    [ctx, onPointerLeave],
  );

  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      {...props}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
    />
  );
});

export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
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
