import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Copy, Eye, FileText, FolderOpen, Hammer, History } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePreviewOverlay as SharedFilePreviewOverlay, ImagePreviewOverlay as SharedImagePreviewOverlay } from "@/components/command-center/file-preview-overlay";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { Prism } from "@/lib/prism-languages";
import { cn } from "@/lib/utils";
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
        compact ? "px-1.5 py-0.5" : "px-2 py-1",
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
    return <PanelEmpty text={messages.inspector.empty.files} />;
  }

  return (
    <>
      <ScrollArea className="h-full">
        <Card>
          <CardContent className="space-y-4 py-4">
            {groups.map((group) => (
              <section key={group.key} className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition hover:bg-muted/20"
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
                  <div className="grid gap-1">
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
          </CardContent>
        </Card>
      </ScrollArea>
      <FileContextMenu menu={contextMenu} messages={messages} onClose={() => setContextMenu(null)} />
    </>
  );
}

function PanelEmpty({ compact = false, text }) {
  return (
    <Card className={cn("border-dashed bg-muted/20", compact && "rounded-[16px]")}>
      <CardContent className={cn("text-sm text-muted-foreground", compact ? "px-5 py-5" : "py-8")}>{text}</CardContent>
    </Card>
  );
}

function TabCountBadge({ count }) {
  if (!count) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground"
    >
      {count}
    </span>
  );
}

function DataList({ items, empty, render }) {
  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-4">
        {items.length ? (
          items.map((item, index) => (
            <Card key={getItemKey(item, index)}>
              <CardContent className="py-4">{render(item)}</CardContent>
            </Card>
          ))
        ) : (
          <PanelEmpty text={empty} />
        )}
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
      title={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
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

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <div className="relative flex justify-center">
        {!isFirst ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-0 h-[0.625rem] w-px bg-border/70" /> : null}
        <div
          aria-hidden="true"
          className={cn(
            "relative mt-[0.625rem] h-2.5 w-2.5 rounded-full border",
            tool.status === "失败"
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
          <Badge variant={tool.status === "失败" ? "default" : "success"} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
            {tool.status}
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

function TimelineItemCard({ currentWorkspaceRoot = "", defaultOpen = false, item, messages, onOpenPreview, resolvedTheme = "light" }) {
  const { intlLocale } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  const badgeVariant = item.status === "失败" ? "default" : item.status?.includes("进行") ? "success" : "active";
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
              {item.status}
            </Badge>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>{messages.inspector.timeline.tool}：{item.toolsSummary || messages.inspector.timeline.noToolCalls}</div>
            <div>{messages.inspector.timeline.result}：{item.outcome}</div>
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

              <TimelineDetailCard title={messages.inspector.timeline.snapshotEntries} emptyText={messages.inspector.empty.noSnapshots}>
                {item.snapshots?.length
                  ? item.snapshots.map((snapshot) => (
                      <Card key={snapshot.id} className="border-border/70 bg-muted/15">
                        <CardContent className="space-y-1 py-4">
                          <div className="text-sm font-medium">{snapshot.title}</div>
                          <div className="text-xs text-muted-foreground">{snapshot.detail}</div>
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
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-2">
        {items.length
          ? items.map((item, index) => (
              <TimelineItemCard
                key={getItemKey(item, index)}
                item={item}
                defaultOpen={index === 0}
                messages={messages}
                onOpenPreview={onOpenPreview}
                resolvedTheme={resolvedTheme}
                currentWorkspaceRoot={currentWorkspaceRoot}
              />
            ))
          : <PanelEmpty text={messages.inspector.empty.timeline} />}
      </div>
    </ScrollArea>
  );
}

function PeekTab({ peeks, renderPeek, messages }) {
  const sections = [
    { key: "workspace", title: messages.inspector.peek.workspace, fallback: messages.inspector.empty.workspace },
    { key: "terminal", title: messages.inspector.peek.terminal, fallback: messages.inspector.empty.terminal },
    { key: "browser", title: messages.inspector.peek.browser, fallback: messages.inspector.empty.browser },
  ];

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-4">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
                {renderPeek(peeks[section.key], section.fallback)}
              </pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

export function InspectorPanel({ activeTab, agents, artifacts, currentWorkspaceRoot = "", files, peeks, renderPeek, resolvedTheme = "light", setActiveTab, snapshots, taskTimeline }) {
  const { messages } = useI18n();
  const { filePreview, imagePreview, handleOpenPreview, closeFilePreview, closeImagePreview } = useFilePreview();

  return (
    <>
      <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden">
        <CardHeader className="flex h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-none">{messages.inspector.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-none">{messages.inspector.subtitle}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 xl:grid-cols-6">
              <TabsTrigger value="timeline">
                <Hammer className="h-4 w-4" />
                {messages.inspector.tabs.timeline}
              </TabsTrigger>
              <TabsTrigger value="files">
                <FolderOpen className="h-4 w-4" />
                {messages.inspector.tabs.files}
                <TabCountBadge count={files.length} />
              </TabsTrigger>
              <TabsTrigger value="artifacts">
                <FileText className="h-4 w-4" />
                {messages.inspector.tabs.artifacts}
              </TabsTrigger>
              <TabsTrigger value="snapshots">
                <History className="h-4 w-4" />
                {messages.inspector.tabs.snapshots}
              </TabsTrigger>
              <TabsTrigger value="agents">
                <Boxes className="h-4 w-4" />
                {messages.inspector.tabs.agents}
              </TabsTrigger>
              <TabsTrigger value="peek">
                <Eye className="h-4 w-4" />
                {messages.inspector.tabs.peek}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline" className="min-h-0">
              <TimelineTab items={taskTimeline} messages={messages} onOpenPreview={handleOpenPreview} resolvedTheme={resolvedTheme} currentWorkspaceRoot={currentWorkspaceRoot} />
            </TabsContent>

            <TabsContent value="files" className="min-h-0">
              <FilesTab items={files} messages={messages} onOpenPreview={handleOpenPreview} currentWorkspaceRoot={currentWorkspaceRoot} />
            </TabsContent>

            <TabsContent value="artifacts" className="min-h-0">
              <DataList
                items={artifacts}
                empty={messages.inspector.empty.artifacts}
                render={(item) => (
                  <>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.detail}</div>
                  </>
                )}
              />
            </TabsContent>

            <TabsContent value="snapshots" className="min-h-0">
              <DataList
                items={snapshots}
                empty={messages.inspector.empty.snapshots}
                render={(item) => (
                  <>
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.detail}</div>
                  </>
                )}
              />
            </TabsContent>

            <TabsContent value="agents" className="min-h-0">
              <DataList
                items={agents}
                empty={messages.inspector.empty.agents}
                render={(item) => (
                  <>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.detail || item.state}</div>
                  </>
                )}
              />
            </TabsContent>

            <TabsContent value="peek" className="min-h-0">
              <PeekTab peeks={peeks} renderPeek={renderPeek} messages={messages} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <SharedFilePreviewOverlay files={files} preview={filePreview} resolvedTheme={resolvedTheme} onClose={closeFilePreview} onOpenFilePreview={handleOpenPreview} />
      <SharedImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
    </>
  );
}
