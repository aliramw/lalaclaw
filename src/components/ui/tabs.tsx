import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn("inline-flex h-11 items-center justify-center rounded-xl border border-border/70 bg-[var(--panel-muted)] p-1 text-muted-foreground", className)}
      {...props}
    />
  );
});

export function TabsTrigger({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium ring-offset-background transition-[color,box-shadow,background-color,border-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--surface)] data-[state=active]:text-foreground data-[state=active]:shadow-[0_6px_18px_rgba(15,23,42,0.08)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 min-w-0 outline-none", className)} {...props} />;
}
