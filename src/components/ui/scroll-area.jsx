import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef(({ className, children, viewportClassName, viewportRef, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("group/scroll-area relative min-w-0 overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport ref={viewportRef} className={cn("h-full min-w-0 w-full rounded-[inherit]", viewportClassName)}>
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export function ScrollBar({ className, orientation = "vertical", ...props }) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      orientation={orientation}
      className={cn(
        "pointer-events-none flex touch-none select-none p-0.5 opacity-0 transition-[opacity,colors] duration-150 group-hover/scroll-area:pointer-events-auto group-hover/scroll-area:opacity-100 group-focus-within/scroll-area:pointer-events-auto group-focus-within/scroll-area:opacity-100",
        orientation === "vertical" ? "h-full w-2.5 border-l border-l-transparent" : "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea };
