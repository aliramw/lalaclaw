export function StreamingTailDots() {
  return (
    <span
      aria-hidden="true"
      data-streaming-tail-dots="true"
      className="cc-streaming-tail-dots ml-1.5 inline-flex items-center gap-1 align-middle text-foreground/70"
    >
      <span className="cc-streaming-tail-dot" />
      <span className="cc-streaming-tail-dot cc-streaming-tail-dot-2" />
      <span className="cc-streaming-tail-dot cc-streaming-tail-dot-3" />
    </span>
  );
}
