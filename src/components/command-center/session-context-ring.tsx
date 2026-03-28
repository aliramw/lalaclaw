import { clamp } from "./session-math-utils";

export function ContextUsageRing({ color, ratio, resolvedTheme }: { color?: string; ratio?: number; resolvedTheme?: string }) {
  const normalizedRatio = clamp(ratio, 0, 1);
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedRatio);
  const trackColor = resolvedTheme === "light" ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.18)";

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
      data-testid="context-usage-ring"
      style={{ color }}
    >
      <svg className="-rotate-90" viewBox="0 0 16 16" width="16" height="16">
        <circle cx="8" cy="8" r={radius} fill="none" stroke={trackColor} strokeWidth="2" />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}
