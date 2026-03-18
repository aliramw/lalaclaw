import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { createContext, forwardRef, useCallback, useContext, useRef, useState } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

const TooltipDismissContext = createContext(null);

/**
 * Tooltip root that auto-dismisses on click and suppresses reopening until
 * the pointer leaves the trigger.  Supports both controlled (`open` /
 * `onOpenChange`) and uncontrolled usage — every existing call-site works
 * without changes.
 */
export function Tooltip({ open: controlledOpen, onOpenChange, children, ...props }) {
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
  { onPointerDown, onPointerLeave, ...props },
  ref,
) {
  const ctx = useContext(TooltipDismissContext);

  const handlePointerDown = useCallback(
    (e) => {
      ctx?.dismiss();
      onPointerDown?.(e);
    },
    [ctx, onPointerDown],
  );

  const handlePointerLeave = useCallback(
    (e) => {
      ctx?.clearSuppression();
      onPointerLeave?.(e);
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
