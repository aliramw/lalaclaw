import { memo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MessageLabelProps = {
  align?: "left" | "right";
  value?: ReactNode;
  textClassName?: string;
};

export const MessageLabel = memo(function MessageLabel({ align = "left", value, textClassName }: MessageLabelProps) {
  return (
    <div
      className={cn(
        "mb-1 max-w-full truncate px-1 text-muted-foreground/85",
        textClassName,
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {value}
    </div>
  );
});
