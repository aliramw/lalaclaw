import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import { cn } from "@/lib/utils";

const resizeHandleDots = Array.from({ length: 12 });

type AppSplitLayoutProps = {
  chatPanel: ReactNode;
  inspectorPanel: ReactNode;
  isResizingPanels: boolean;
  isWideLayout: boolean;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  resizeLabel: string;
  splitLayoutRef: MutableRefObject<HTMLElement | null>;
  splitLayoutStyle: CSSProperties;
  taskRelationshipsPanel: ReactNode;
};

export function AppSplitLayout({
  chatPanel,
  inspectorPanel,
  isResizingPanels,
  isWideLayout,
  onResizeStart,
  resizeLabel,
  splitLayoutRef,
  splitLayoutStyle,
  taskRelationshipsPanel,
}: AppSplitLayoutProps) {
  return (
    <main
      ref={splitLayoutRef}
      className="cc-workspace-layout-shell grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-[24px] border border-border/55 bg-[var(--surface-elevated)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]"
      style={splitLayoutStyle}
    >
      <div className="cc-workspace-stage min-h-0 min-w-0 overflow-hidden">
        {chatPanel}
      </div>

      {isWideLayout ? (
        <div className="xl:flex xl:min-h-0 xl:items-stretch xl:justify-center">
          <button
            type="button"
            aria-label={resizeLabel}
            onPointerDown={onResizeStart}
            className="cc-split-resize-handle group relative h-full w-full cursor-col-resize touch-none select-none"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-1/2 top-1/2 inline-grid h-[22px] w-[6.8px] -translate-x-1/2 -translate-y-1/2 grid-cols-2 grid-rows-6 gap-x-[2px] gap-y-[2px] transition-colors",
                isResizingPanels
                  ? "bg-transparent"
                  : "bg-transparent",
              )}
            >
              {resizeHandleDots.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-[2.4px] w-[2.4px] rounded-full transition-colors",
                    isResizingPanels ? "bg-primary/80" : "bg-muted-foreground/45 group-hover:bg-foreground/55",
                  )}
                />
              ))}
            </span>
          </button>
        </div>
      ) : null}

      <div className="cc-inspector-stage flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden xl:min-w-[300px] xl:border-l xl:border-border/45 xl:pl-4">
        {taskRelationshipsPanel}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {inspectorPanel}
        </div>
      </div>
    </main>
  );
}
