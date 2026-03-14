import { useEffect, useState } from "react";
import { Boxes, ChevronDown, Eye, FileText, FolderOpen, Hammer, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const homePrefix = "/Users/marila";

function getItemKey(item, index) {
  return item.id || item.path || item.title || `${item.label || "item"}-${index}`;
}

function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }
  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

function getVsCodeHref(filePath) {
  if (!filePath) {
    return "#";
  }
  return `vscode://file/${encodeURIComponent(filePath)}`;
}

function FileLink({ item, compact = false }) {
  const href = getVsCodeHref(item.fullPath || item.path);
  const canOpen = Boolean(item.fullPath || item.path);

  return (
    <a
      href={href}
      className={cn(
        "block rounded-md transition-colors focus-visible:outline-none",
        canOpen ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50" : "",
        compact ? "px-0 py-0.5" : "",
      )}
      title={item.fullPath || item.path}
    >
      <div
        className={cn(
          "file-link break-all font-mono transition-colors",
          compact ? "text-[11px] leading-5" : "text-sm",
          canOpen ? "" : "no-underline",
        )}
      >
        {compactHomePath(item.path)}
      </div>
    </a>
  );
}

function FilesTab({ items, messages }) {
  const fileActionSections = [
    { key: "created", label: messages.inspector.fileActions.created },
    { key: "modified", label: messages.inspector.fileActions.modified },
    { key: "viewed", label: messages.inspector.fileActions.viewed },
  ];
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: items.filter((item) => item.primaryAction === section.key),
    }))
    .filter((section) => section.items.length);

  if (!groups.length) {
    return <PanelEmpty text={messages.inspector.empty.files} />;
  }

  return (
    <ScrollArea className="h-full">
      <Card>
        <CardContent className="space-y-4 py-4">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{group.label}</div>
                <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
                  {group.items.length}
                </Badge>
              </div>
              <div className="grid gap-1">
                {group.items.map((item) => (
                  <FileLink key={`${group.key}-${item.path}`} item={item} compact />
                ))}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>
    </ScrollArea>
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

function TimelineItemCard({ item, defaultOpen = false, index, messages }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  const badgeVariant = item.status === "失败" ? "default" : item.status?.includes("进行") ? "success" : "active";

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">{item.title}</div>
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

        <Separator />

        <div className="space-y-2">
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
                {item.tools?.length
                  ? item.tools.map((tool) => (
                      <Card key={tool.id || `${tool.name}-${tool.timestamp}`} className="border-border/70 bg-muted/15">
                        <CardContent className="space-y-3 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">{tool.name}</div>
                            <Badge variant={tool.status === "失败" ? "default" : "success"} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
                              {tool.status}
                            </Badge>
                          </div>
                          <div className="space-y-2 text-xs leading-6">
                            <div className="rounded-lg border border-border bg-background/90 p-3 whitespace-pre-wrap">{`${messages.inspector.timeline.input}\n${tool.input || messages.inspector.timeline.none}`}</div>
                            <div className="rounded-lg border border-border bg-background/90 p-3 whitespace-pre-wrap">{`${messages.inspector.timeline.output}\n${tool.output || tool.detail || messages.inspector.timeline.noOutput}`}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.timeline.fileChanges} emptyText={messages.inspector.empty.noFiles}>
                {item.files?.length
                  ? item.files.map((file) => (
                      <Card key={file.path} className="border-border/70 bg-muted/15">
                        <CardContent className="py-4">
                          <FileLink item={file} />
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

function TimelineTab({ items, messages }) {
  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-4">
        {items.length ? items.map((item, index) => <TimelineItemCard key={getItemKey(item, index)} item={item} index={index} defaultOpen={index === 0} messages={messages} />) : <PanelEmpty text={messages.inspector.empty.timeline} />}
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

export function InspectorPanel({ activeTab, agents, artifacts, files, peeks, renderPeek, setActiveTab, snapshots, taskTimeline }) {
  const { messages } = useI18n();

  return (
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
            <TimelineTab items={taskTimeline} messages={messages} />
          </TabsContent>

          <TabsContent value="files" className="min-h-0">
            <FilesTab items={files} messages={messages} />
          </TabsContent>

          <TabsContent value="artifacts" className="min-h-0">
            <DataList
              items={artifacts}
              empty={messages.inspector.empty.artifacts}
              render={(item) => (
                <>
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.type} · {item.detail}
                  </div>
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
  );
}
