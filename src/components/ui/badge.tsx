import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        // Theme-specific success colors are defined in index.css tokens on purpose,
        // so light/dark can evolve independently without coupling both modes here.
        success: "border-transparent bg-[var(--badge-success-bg)] text-[var(--badge-success-fg)]",
        active: "border-transparent bg-primary text-primary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) {
  return <span className={cn(badgeVariants({ variant: variant as any }), className)} {...props} />;
}
