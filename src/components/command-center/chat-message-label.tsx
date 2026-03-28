import { cn } from "@/lib/utils";

export function MessageLabel({ align = "left", value, textClassName }) {
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
}
