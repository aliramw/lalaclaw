import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-28 w-full rounded-[5px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-300/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
