import { useEffect, useState } from "react";
import { Boxes, ChevronDown, Eye, FileText, FolderOpen, Hammer, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const homePrefix = "/Users/marila";
const fileActionSections = [
  { key: "created", label: "创建" },
  { key: "modified", label: "修改" },
  { key: "viewed", label: "查看" },
];

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

function FilesTab({ items }) {
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: items.filter((item) => item.primaryAction === section.key),
    }))
    .filter((section) => section.items.length);

  if (!groups.length) {
    return <PanelEmpty text="当前会话中检测到的文件会显示在这里。" />;
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

function PanelEmpty({ text }) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="py-8 text-sm text-muted-foreground">{text}</CardContent>
    </Card>
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
    <section className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      {children || <PanelEmpty text={emptyText} />}
    </section>
  );
}

function TimelineItemCard({ item, defaultOpen = false, index }) {
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
          <div>工具：{item.toolsSummary || "未调用工具"}</div>
          <div>结果：{item.outcome}</div>
        </div>

        <Separator />

        <div className="space-y-4">
          <Button variant="ghost" size="sm" className="px-0 text-sm" onClick={() => setOpen((current) => !current)}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")} />
            {open ? "收起详情" : "查看详情"}
          </Button>

          {open ? (
            <div className="space-y-4">
              <TimelineDetailCard title="工具输入 / 输出" emptyText="本轮未调用工具">
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
                            <div className="rounded-lg border border-border bg-background/90 p-3 whitespace-pre-wrap">{`输入\n${tool.input || "无"}`}</div>
                            <div className="rounded-lg border border-border bg-background/90 p-3 whitespace-pre-wrap">{`输出\n${tool.output || tool.detail || "等待结果"}`}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </TimelineDetailCard>

              <TimelineDetailCard title="文件变更" emptyText="未检测到文件变更">
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

              <TimelineDetailCard title="快照入口" emptyText="本轮暂无快照">
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

function TimelineTab({ items }) {
  return (
    <ScrollArea className="h-full">
      <div className="grid gap-3 pr-4">
        {items.length ? items.map((item, index) => <TimelineItemCard key={getItemKey(item, index)} item={item} index={index} defaultOpen={index === 0} />) : <PanelEmpty text="每次任务执行后，这里会按时间线聚合展示工具链路。" />}
      </div>
    </ScrollArea>
  );
}

function PeekTab({ peeks, renderPeek }) {
  const sections = [
    { key: "workspace", title: "工作区", fallback: "等待工作区预览…" },
    { key: "terminal", title: "终端", fallback: "等待终端预览…" },
    { key: "browser", title: "浏览器", fallback: "等待浏览器预览…" },
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
  return (
    <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden">
      <CardHeader className="flex h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center justify-start gap-2 text-left">
          <CardTitle className="truncate text-sm leading-none">追踪与观察</CardTitle>
          <CardDescription className="truncate text-[11px] leading-none">执行、文件、产出与预览</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="min-h-0 p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 xl:grid-cols-6">
            <TabsTrigger value="timeline">
              <Hammer className="h-4 w-4" />
              执行
            </TabsTrigger>
            <TabsTrigger value="files">
              <FolderOpen className="h-4 w-4" />
              文件
            </TabsTrigger>
            <TabsTrigger value="artifacts">
              <FileText className="h-4 w-4" />
              产出
            </TabsTrigger>
            <TabsTrigger value="snapshots">
              <History className="h-4 w-4" />
              快照
            </TabsTrigger>
            <TabsTrigger value="agents">
              <Boxes className="h-4 w-4" />
              协作
            </TabsTrigger>
            <TabsTrigger value="peek">
              <Eye className="h-4 w-4" />
              预览
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="min-h-0">
            <TimelineTab items={taskTimeline} />
          </TabsContent>

          <TabsContent value="files" className="min-h-0">
            <FilesTab items={files} />
          </TabsContent>

          <TabsContent value="artifacts" className="min-h-0">
            <DataList
              items={artifacts}
              empty="助手的真实产出会显示在这里。"
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
              empty="每次完成回复后会生成一个可回看快照。"
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
              empty="首次执行后显示 Agent 协作结构。"
              render={(item) => (
                <>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.detail || item.state}</div>
                </>
              )}
            />
          </TabsContent>

          <TabsContent value="peek" className="min-h-0">
            <PeekTab peeks={peeks} renderPeek={renderPeek} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
