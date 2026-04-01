import { useEffect, useState, type ComponentType } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InspectorHint, PanelEmpty, TimelineDetailCard } from "@/components/command-center/inspector-panel-primitives";
import { getRelationshipDisplay } from "@/components/command-center/inspector-panel-utils";
import { getLocalizedStatusLabel, getRelationshipStatusBadgeProps, localizeStatusSummary, normalizeStatusKey } from "@/features/session/status-display";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { ToolCallTimeline } from "@/components/command-center/tool-call-timeline";
const ButtonSurface: any = Button;
const CardSurface: any = Card;
const CardContentSurface: any = CardContent;

type RelationshipCardProps = {
  messages: any;
  relationship: Record<string, any>;
  sessionAgentId?: string;
};

type TimelineItemCardProps = {
  currentWorkspaceRoot?: string;
  defaultOpen?: boolean;
  item: Record<string, any>;
  messages: any;
  onOpenPreview?: (item: Record<string, any>) => void;
  resolvedTheme?: "light" | "dark";
  FileLinkComponent: ComponentType<{
    item: Record<string, any>;
    currentWorkspaceRoot?: string;
    onOpenPreview?: (item: Record<string, any>) => void;
  }>;
};

type TimelineTabProps = {
  currentWorkspaceRoot?: string;
  items?: Record<string, any>[];
  messages: any;
  onOpenPreview?: (item: Record<string, any>) => void;
  resolvedTheme?: "light" | "dark";
  getItemKey: (item: Record<string, any>, index: number) => string;
  FileLinkComponent: TimelineItemCardProps["FileLinkComponent"];
};

export function RelationshipCard({ relationship, sessionAgentId = "main", messages }: RelationshipCardProps) {
  const { primaryLabel, secondaryLabel } = getRelationshipDisplay(relationship, messages);
  const statusLabel = getLocalizedStatusLabel(relationship.status, messages);
  const statusBadgeProps = getRelationshipStatusBadgeProps(relationship.status);

  return (
    <CardSurface className="border-border/70 bg-muted/15">
      <CardContentSurface className="py-4">
        <div className="grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-3">
          <Badge variant="secondary" className="h-7 justify-center rounded-full px-2.5 text-[11px] font-medium">
            {relationship.sourceAgentId || sessionAgentId}
          </Badge>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-px flex-1 bg-border/70" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 text-left">
              <div className="truncate text-sm font-medium text-foreground">{primaryLabel}</div>
              {secondaryLabel ? <div className="truncate text-[11px] text-muted-foreground">{secondaryLabel}</div> : null}
            </div>
            {statusLabel ? (
              <Badge
                variant={statusBadgeProps.variant}
                className={`shrink-0 self-center whitespace-nowrap px-2 py-0.5 text-[11px] leading-5 ${statusBadgeProps.className}`}
              >
                {statusLabel}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardContentSurface>
    </CardSurface>
  );
}

export function TimelineItemCard({
  currentWorkspaceRoot = "",
  defaultOpen = false,
  item,
  messages,
  onOpenPreview,
  resolvedTheme = "light",
  FileLinkComponent,
}: TimelineItemCardProps) {
  const { intlLocale } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const normalizedStatus = normalizeStatusKey(item.status);
  const localizedStatus = getLocalizedStatusLabel(item.status, messages);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  const badgeVariant =
    normalizedStatus === "failed"
      ? "default"
      : normalizedStatus === "running" || normalizedStatus === "dispatching"
        ? "success"
        : "active";
  const displayTime = item.timestamp
    ? new Intl.DateTimeFormat(intlLocale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.timestamp))
    : "";

  return (
    <CardSurface>
      <CardContentSurface className="py-4">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                <span>{item.timestamp ? messages.inspector.timeline.runTitle : item.title}</span>
                {displayTime ? <span className="text-muted-foreground"> {displayTime}</span> : null}
              </div>
              <div className="text-sm text-muted-foreground">{item.prompt}</div>
            </div>
            <Badge variant={badgeVariant} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
              {localizedStatus}
            </Badge>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>{messages.inspector.timeline.tool}: {localizeStatusSummary(item.toolsSummary, messages) || messages.inspector.timeline.noToolCalls}</div>
            <div>{messages.inspector.timeline.result}: {item.outcome}</div>
          </div>
        </div>

        <Separator className="mt-4" />

        <div className="mt-2 space-y-2">
          <ButtonSurface
            variant="ghost"
            size="sm"
            className="relative h-7 justify-start rounded-md px-0 text-left text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown
              className={cn(
                "absolute -left-4 h-3.5 w-3.5 transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
            <span>{open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}</span>
          </ButtonSurface>

          {open ? (
            <div className="space-y-3">
              <TimelineDetailCard title={messages.inspector.timeline.toolIo} emptyText={messages.inspector.empty.noTools}>
                {item.tools?.length ? (
                  <ToolCallTimeline
                    copyLabels={{ copy: messages.markdown.copyCode, copied: messages.markdown.copiedCode }}
                    labels={{
                      collapse: messages.inspector.timeline.collapse,
                      expand: messages.inspector.timeline.expand,
                      input: messages.inspector.timeline.input,
                      output: messages.inspector.timeline.output,
                      none: messages.inspector.timeline.none,
                      noOutput: messages.inspector.timeline.noOutput,
                    }}
                    messages={messages}
                    resolvedTheme={resolvedTheme}
                    tools={item.tools}
                  />
                ) : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.relationships.title} emptyText={messages.inspector.empty.agents}>
                {item.relationships?.length
                  ? item.relationships.map((relationship: Record<string, any>) => (
                      <RelationshipCard key={relationship.id} relationship={relationship} sessionAgentId={item.sessionAgentId || "main"} messages={messages} />
                    ))
                  : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.timeline.fileChanges} emptyText={messages.inspector.empty.noFiles}>
                {item.files?.length
                  ? item.files.map((file: Record<string, any>) => (
                      <CardSurface key={file.path} className="border-border/70 bg-muted/15">
                        <CardContentSurface className="py-4">
                          <FileLinkComponent item={file} currentWorkspaceRoot={currentWorkspaceRoot} onOpenPreview={onOpenPreview} />
                        </CardContentSurface>
                      </CardSurface>
                    ))
                  : null}
              </TimelineDetailCard>
            </div>
          ) : null}
        </div>
      </CardContentSurface>
    </CardSurface>
  );
}

export function TimelineTab({
  currentWorkspaceRoot = "",
  items = [],
  messages,
  onOpenPreview,
  resolvedTheme = "light",
  getItemKey,
  FileLinkComponent,
}: TimelineTabProps) {
  return (
    <div
      data-testid="timeline-scroll-region"
      className="cc-scroll-region min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2"
    >
      <div className="space-y-2 py-1">
        <InspectorHint text={messages.inspector.timelineHint} />
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item, index) => (
              <TimelineItemCard
                key={getItemKey(item, index)}
                item={item}
                defaultOpen={index === 0}
                messages={messages}
                onOpenPreview={onOpenPreview}
                resolvedTheme={resolvedTheme}
                currentWorkspaceRoot={currentWorkspaceRoot}
                FileLinkComponent={FileLinkComponent}
              />
            ))}
          </div>
        ) : <PanelEmpty text={messages.inspector.empty.timeline} />}
      </div>
    </div>
  );
}
