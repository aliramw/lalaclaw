import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return <div className={cn("rounded-[5px] border border-slate-200 bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("flex items-start justify-between gap-3 p-4 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn("text-sm font-semibold tracking-tight text-slate-950", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn("text-xs text-slate-500", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("p-4", className)} {...props} />;
}
