import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }) {
  return <TabsPrimitive.List className={cn("inline-flex gap-1 rounded-[5px] bg-slate-100 p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[4px] px-3 text-xs font-medium text-slate-500 transition data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn("mt-3 outline-none", className)} {...props} />;
}
