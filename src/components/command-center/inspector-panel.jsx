import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, FileText, FolderOpen, Hammer, Monitor } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePreviewOverlay as SharedFilePreviewOverlay, ImagePreviewOverlay as SharedImagePreviewOverlay } from "@/components/command-center/file-preview-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { getLocalizedStatusLabel, getRelationshipStatusBadgeProps, localizeStatusSummary, normalizeStatusKey } from "@/features/session/status-display";
import { Prism } from "@/lib/prism-languages";
import { cn, stripMarkdownForDisplay } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const homePrefix = "/Users/marila";
const darkToolIoTheme = themes.dracula;
const lightToolIoTheme = themes.vsLight;

function getItemKey(item, index) {
  return item.id || item.path || item.title || `${item.label || "item"}-${index}`;
}

function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }
  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

function formatDisplayPath(item, currentWorkspaceRoot = "") {
  const sourcePath = String(item.fullPath || item.path || "");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\/+$/, "");
  if (!sourcePath) {
    return "";
  }
  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return relativePath || sourcePath.split("/").pop() || "";
  }
  return compactHomePath(sourcePath);
}

function compareFileItemsByPath(left, right, currentWorkspaceRoot = "") {
  return formatDisplayPath(left, currentWorkspaceRoot).localeCompare(
    formatDisplayPath(right, currentWorkspaceRoot),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

function resolveItemPath(item) {
  return String(item?.fullPath || item?.path || "").trim();
}

function localizeArtifactTitle(title = "", messages) {
  const value = String(title || "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/^(回复|reply)\s*/i, `${messages.inspector.artifactReplyPrefix} `).trim();
}

function FileLink({ item, compact = false, currentWorkspaceRoot = "", onOpenPreview, onOpenContextMenu }) {
  const canOpen = Boolean(item.fullPath || item.path);
  const displayPath = formatDisplayPath(item, currentWorkspaceRoot);

  return (
    <button
      type="button"
      onContextMenu={(event) => {
        if (!canOpen) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu?.(event, item);
      }}
      onClick={() => {
        if (canOpen) {
          onOpenPreview?.(item);
        }
      }}
      className={cn(
        "block w-full appearance-none rounded-sm border-0 bg-transparent px-1.5 text-left shadow-none transition-[background-color,color,box-shadow] focus:outline-none focus-visible:outline-none",
        canOpen ? "cursor-pointer hover:bg-accent/25 focus-visible:bg-accent/15 focus-visible:ring-1 focus-visible:ring-border/35" : "",
        compact ? "px-0 py-0.5" : "px-2 py-1",
      )}
      title={item.fullPath || item.path}
      disabled={!canOpen}
    >
      <div
        className={cn(
          "file-link break-all font-mono transition-colors",
          compact ? "text-[11px] leading-5" : "text-sm",
          canOpen ? "" : "no-underline",
        )}
      >
        {displayPath}
      </div>
    </button>
  );
}

function FileContextMenu({ menu, messages, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleViewportChange = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard?.writeText?.(resolveItemPath(menu.item));
    } finally {
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={messages.inspector.fileMenu.label}
      className="fixed z-50 min-w-40 rounded-md border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleCopyPath().catch(() => {});
        }}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
      >
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{messages.inspector.fileMenu.copyPath}</span>
      </button>
    </div>
  );
}

function FilesTab({ currentWorkspaceRoot = "", items, messages, onOpenPreview }) {
  const [contextMenu, setContextMenu] = useState(null);
  const fileActionSections = [
    { key: "created", label: messages.inspector.fileActions.created },
    { key: "modified", label: messages.inspector.fileActions.modified },
    { key: "viewed", label: messages.inspector.fileActions.viewed },
  ];
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: items
        .filter((item) => item.primaryAction === section.key)
        .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot)),
    }))
    .filter((section) => section.items.length);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = {};
      let changed = false;

      for (const group of groups) {
        if (Object.prototype.hasOwnProperty.call(current, group.key)) {
          next[group.key] = current[group.key];
        } else {
          next[group.key] = false;
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }

      return next;
    });
  }, [groups]);

  if (!groups.length) {
    return (
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1">
          <InspectorHint text={messages.inspector.filesHint} />
          <PanelEmpty text={messages.inspector.empty.files} />
        </div>
      </ScrollArea>
    );
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1">
          <InspectorHint text={messages.inspector.filesHint} />
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <button
                type="button"
                className="grid w-full grid-cols-[1rem_auto_auto_1fr] items-center gap-2 rounded-md py-0.5 text-left transition hover:bg-muted/20"
                aria-expanded={!collapsedGroups[group.key]}
                aria-label={`${group.label} ${collapsedGroups[group.key] ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
                onClick={() => {
                  setCollapsedGroups((current) => ({
                    ...current,
                    [group.key]: !current[group.key],
                  }));
                }}
              >
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsedGroups[group.key] ? "-rotate-90" : "rotate-0")} />
                <div className="text-[11px] font-medium uppercase text-muted-foreground">{group.label}</div>
                <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
                  {group.items.length}
                </Badge>
              </button>
              {!collapsedGroups[group.key] ? (
                <div className="grid gap-1 pl-6">
                  {group.items.map((item) => (
                    <FileLink
                      key={`${group.key}-${item.path}`}
                      item={item}
                      compact
                      currentWorkspaceRoot={currentWorkspaceRoot}
                      onOpenPreview={onOpenPreview}
                      onOpenContextMenu={(event, nextItem) => {
                        setContextMenu({
                          item: nextItem,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </ScrollArea>
      <FileContextMenu menu={contextMenu} messages={messages} onClose={() => setContextMenu(null)} />
    </>
  );
}

function PanelEmpty({ compact = false, text }) {
  return (
    <div className={cn(compact && "rounded-[16px]")}>
      <div className={cn("flex items-center justify-center text-center text-sm text-muted-foreground", compact ? "px-5 py-5" : "py-8")}>
        {text}
      </div>
    </div>
  );
}

function InspectorHint({ text }) {
  if (!text) {
    return null;
  }

  return (
    <p className="pr-6 text-[11px] leading-5 text-muted-foreground/80">
      {text}
    </p>
  );
}

function TabCountBadge({ count, active = false }) {
  if (!count) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        active ? "bg-black/14 text-white" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

function DataList({ empty, getItemActionLabel, hint, items, onSelect, render }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-2 py-1 pr-4">
        <InspectorHint text={hint} />
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item, index) => (
              <Card key={getItemKey(item, index)}>
                <CardContent className={cn(onSelect ? "p-0" : "py-4")}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-label={getItemActionLabel?.(item) || item.title || item.label || "item"}
                      className="block w-full rounded-[inherit] px-6 py-4 text-left transition hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {render(item)}
                    </button>
                  ) : render(item)}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <PanelEmpty text={empty} />}
      </div>
    </ScrollArea>
  );
}

function TimelineDetailCard({ title, children, emptyText }) {
  return (
    <section className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {children || <PanelEmpty text={emptyText} compact />}
    </section>
  );
}

function looksLikeJson(value = "") {
  const trimmed = String(value || "").trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function CopyCodeButton({ content }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(String(content || ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/75 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ToolIoCodeBlock({ emptyText, label, resolvedTheme = "light", value }) {
  const content = String(value || emptyText || "").trim() || String(emptyText || "");
  const language = looksLikeJson(content) ? "json" : "text";
  const toolIoTheme = resolvedTheme === "dark" ? darkToolIoTheme : lightToolIoTheme;

  return (
    <div
      className={cn(
        "rounded-lg border",
        resolvedTheme === "dark" ? "border-border bg-background/90" : "border-slate-200 bg-[#fbfcfe]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] font-medium",
          resolvedTheme === "dark" ? "border-border/70 text-muted-foreground" : "border-slate-200 text-slate-500",
        )}
      >
        <span>{label}</span>
        <CopyCodeButton content={content} />
      </div>
      <Highlight prism={Prism} theme={toolIoTheme} code={content} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "tool-io-code overflow-x-auto px-0 py-2 whitespace-pre-wrap",
              resolvedTheme === "dark" ? "text-zinc-50" : "text-slate-800",
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className="min-h-5 px-3">
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function ToolCallCard({ isFirst = false, isLast = false, messages, resolvedTheme = "light", tool }) {
  const [open, setOpen] = useState(true);
  const normalizedStatus = normalizeStatusKey(tool.status);
  const localizedStatus = getLocalizedStatusLabel(tool.status, messages);

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <div className="relative flex justify-center">
        {!isFirst ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-0 h-[0.625rem] w-px bg-border/70" /> : null}
        <div
          aria-hidden="true"
          className={cn(
            "relative mt-[0.625rem] h-2.5 w-2.5 rounded-full border",
            normalizedStatus === "failed"
              ? "border-rose-400/60 bg-rose-400/20"
              : resolvedTheme === "dark"
                ? "border-emerald-400/50 bg-emerald-400/20"
                : "border-emerald-500/50 bg-emerald-500/15",
          )}
        />
        {!isLast ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-[calc(0.625rem+0.625rem)] bottom-0 w-px bg-border/70" /> : null}
      </div>
      <div className={cn("min-w-0 space-y-3", !isLast && "pb-4")}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${tool.name} ${open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-muted/20"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
            <div className="truncate text-sm font-medium">{tool.name}</div>
          </div>
          <Badge variant={normalizedStatus === "failed" ? "default" : "success"} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
            {localizedStatus}
          </Badge>
        </button>

        {open ? (
          <div className="space-y-2 text-xs leading-6">
            <ToolIoCodeBlock label={messages.inspector.timeline.input} value={tool.input} emptyText={messages.inspector.timeline.none} resolvedTheme={resolvedTheme} />
            <ToolIoCodeBlock label={messages.inspector.timeline.output} value={tool.output || tool.detail} emptyText={messages.inspector.timeline.noOutput} resolvedTheme={resolvedTheme} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallTimeline({ messages, resolvedTheme = "light", tools }) {
  if (!tools?.length) {
    return null;
  }

  return (
    <div className="space-y-0">
      {tools.map((tool, toolIndex) => (
        <ToolCallCard
          key={tool.id || `${tool.name}-${tool.timestamp}`}
          isFirst={toolIndex === 0}
          isLast={toolIndex === tools.length - 1}
          tool={tool}
          messages={messages}
          resolvedTheme={resolvedTheme}
        />
      ))}
    </div>
  );
}

function getRelationshipDisplay(relationship, messages) {
  const fallbackLabel =
    relationship?.type === "session_spawn"
      ? messages.inspector.relationships.sessionSpawn
      : relationship?.targetAgentId || messages.inspector.relationships.childAgent;
  const primaryLabel = relationship?.detail || fallbackLabel;
  const secondaryLabel = relationship?.detail && relationship?.detail !== fallbackLabel ? fallbackLabel : "";

  return {
    primaryLabel,
    secondaryLabel,
  };
}

function RelationshipCard({ relationship, sessionAgentId = "main", messages }) {
  const { primaryLabel, secondaryLabel } = getRelationshipDisplay(relationship, messages);
  const statusLabel = getLocalizedStatusLabel(relationship.status, messages);
  const statusBadgeProps = getRelationshipStatusBadgeProps(relationship.status);

  return (
    <Card className="border-border/70 bg-muted/15">
      <CardContent className="py-4">
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
      </CardContent>
    </Card>
  );
}

function TimelineItemCard({ currentWorkspaceRoot = "", defaultOpen = false, item, messages, onOpenPreview, resolvedTheme = "light" }) {
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
    <Card>
      <CardContent className="py-4">
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 rounded-md px-1 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "rotate-0" : "-rotate-90")} />
            {open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}
          </Button>

          {open ? (
            <div className="space-y-3">
              <TimelineDetailCard title={messages.inspector.timeline.toolIo} emptyText={messages.inspector.empty.noTools}>
                {item.tools?.length ? <ToolCallTimeline tools={item.tools} messages={messages} resolvedTheme={resolvedTheme} /> : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.relationships.title} emptyText={messages.inspector.empty.agents}>
                {item.relationships?.length
                  ? item.relationships.map((relationship) => (
                      <RelationshipCard key={relationship.id} relationship={relationship} sessionAgentId={item.sessionAgentId || "main"} messages={messages} />
                    ))
                  : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.timeline.fileChanges} emptyText={messages.inspector.empty.noFiles}>
                {item.files?.length
                  ? item.files.map((file) => (
                      <Card key={file.path} className="border-border/70 bg-muted/15">
                        <CardContent className="py-4">
                          <FileLink item={file} currentWorkspaceRoot={currentWorkspaceRoot} onOpenPreview={onOpenPreview} />
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </TimelineDetailCard>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineTab({ currentWorkspaceRoot = "", items, messages, onOpenPreview, resolvedTheme }) {
  return (
    <div
      data-testid="timeline-scroll-region"
      className="cc-scroll-region min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2"
    >
      <div className="space-y-2 py-1">
        <InspectorHint text={messages.inspector.timelineHint} />
        {items.length
          ? (
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
                />
              ))}
            </div>
          )
          : <PanelEmpty text={messages.inspector.empty.timeline} />}
      </div>
    </div>
  );
}

function EnvironmentTab({ section, messages }) {
  if (!section?.items?.length) {
    return <PanelEmpty text={messages.inspector.empty.noEnvironment} />;
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="min-w-0">
      <div className="min-w-0 max-w-full space-y-2 overflow-hidden py-1 pr-4">
        <InspectorHint text={messages.inspector.empty.environment} />
        {section.items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="w-full min-w-0 max-w-full border-b border-border/55 pb-3 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0 space-y-1 overflow-hidden">
              <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </div>
              <div className="w-full min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[13px] text-foreground">
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function InspectorPanel({ activeTab, artifacts, currentWorkspaceRoot = "", files, onSelectArtifact, peeks, resolvedTheme = "light", setActiveTab, taskTimeline }) {
  const { messages } = useI18n();
  const { filePreview, imagePreview, handleOpenPreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const tabsListRef = useRef(null);
  const [showTabLabels, setShowTabLabels] = useState(true);
  const [tooltipTabKey, setTooltipTabKey] = useState("");
  const availableTabKeys = ["files", "artifacts", "timeline", "environment"];
  const tabDefinitions = [
    { key: "files", icon: FolderOpen, label: messages.inspector.tabs.files, count: files.length },
    { key: "artifacts", icon: FileText, label: messages.inspector.tabs.artifacts },
    { key: "timeline", icon: Hammer, label: messages.inspector.tabs.timeline },
    { key: "environment", icon: Monitor, label: messages.inspector.tabs.environment },
  ];
  const resolvedActiveTab = availableTabKeys.includes(activeTab) ? activeTab : "files";

  useEffect(() => {
    if (activeTab && !availableTabKeys.includes(activeTab)) {
      setActiveTab("files");
    }
  }, [activeTab, availableTabKeys, setActiveTab]);

  useEffect(() => {
    const node = tabsListRef.current;
    if (!node || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const updateLayout = (width) => {
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }
      setShowTabLabels(width >= 430);
    };

    updateLayout(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateLayout(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showTabLabels && tooltipTabKey) {
      setTooltipTabKey("");
    }
  }, [showTabLabels, tooltipTabKey]);

  return (
    <>
      <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader className="flex min-h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
          <div className="flex min-w-0 flex-1 items-baseline justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-[1.15]">{messages.inspector.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-4">{messages.inspector.subtitle}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabsList ref={tabsListRef} className="grid h-auto w-full shrink-0 grid-cols-2 gap-1 p-1 md:grid-cols-4">
              {tabDefinitions.map((tab) => {
                const Icon = tab.icon;
                const isActive = resolvedActiveTab === tab.key;
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    aria-label={tab.label}
                    onPointerEnter={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onPointerLeave={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    onFocus={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onBlur={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    className={cn(
                      "group/tab relative text-[13px] data-[state=active]:text-white data-[state=active]:shadow-sm",
                      showTabLabels ? "px-3" : "px-2",
                      isActive ? "text-white shadow-sm" : "",
                      resolvedTheme === "dark"
                        ? cn(
                            "data-[state=active]:bg-[#0f3e6a] data-[state=active]:hover:bg-[#0f3e6a]",
                            isActive ? "bg-[#0f3e6a] hover:bg-[#0f3e6a]" : "",
                          )
                        : cn(
                            "data-[state=active]:bg-[#1677eb] data-[state=active]:hover:bg-[#0f6fe0]",
                            isActive ? "bg-[#1677eb] hover:bg-[#0f6fe0]" : "",
                          ),
                    )}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                      <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.9]" />
                    </span>
                    {showTabLabels ? <span className="truncate">{tab.label}</span> : null}
                    {showTabLabels ? <TabCountBadge count={tab.count} active={resolvedActiveTab === tab.key} /> : null}
                    {!showTabLabels && tooltipTabKey === tab.key ? (
                      <span
                        aria-hidden="true"
                        data-testid={`inspector-tab-tooltip-${tab.key}`}
                        className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background shadow-md"
                      >
                        {tab.label}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="files" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              <FilesTab items={files} messages={messages} onOpenPreview={handleOpenPreview} currentWorkspaceRoot={currentWorkspaceRoot} />
            </TabsContent>

            <TabsContent value="artifacts" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              <DataList
                items={artifacts}
                hint={messages.inspector.artifactsHint}
                empty={messages.inspector.empty.artifacts}
                getItemActionLabel={(item) => `${messages.inspector.artifactJumpTo} ${localizeArtifactTitle(item.title || messages.inspector.tabs.artifacts, messages)}`}
                onSelect={onSelectArtifact}
                render={(item) => (
                  <>
                    <div className="text-sm font-medium">{localizeArtifactTitle(item.title, messages)}</div>
                    <div className="text-xs text-muted-foreground">{stripMarkdownForDisplay(item.detail)}</div>
                  </>
                )}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              <TimelineTab items={taskTimeline} messages={messages} onOpenPreview={handleOpenPreview} resolvedTheme={resolvedTheme} currentWorkspaceRoot={currentWorkspaceRoot} />
            </TabsContent>

            <TabsContent value="environment" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              <EnvironmentTab section={peeks?.environment} messages={messages} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <SharedFilePreviewOverlay files={files} preview={filePreview} resolvedTheme={resolvedTheme} onClose={closeFilePreview} onOpenFilePreview={handleOpenPreview} />
      <SharedImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
    </>
  );
}
