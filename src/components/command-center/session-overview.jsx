import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SelectionMenu } from "@/components/command-center/selection-menu";

function StatusPill({ label, value, action, valueClassName, children }) {
  return (
    <div className="inline-flex h-14 min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={cn("truncate text-sm font-semibold", valueClassName)}>{value}</div>
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function MetaChip({ label, value }) {
  if (!value) return null;

  return (
    <div className="inline-flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
      <span className="uppercase tracking-[0.12em]">{label}</span>
      <span className="max-w-[28rem] truncate text-foreground/80">{value}</span>
    </div>
  );
}

export function SessionOverview({
  availableAgents,
  availableModels,
  fastMode,
  formatCompactK,
  model,
  onAgentChange,
  onFastModeChange,
  onModelChange,
  session,
}) {
  return (
    <section>
      <Card className="overflow-hidden">
        <CardContent className="space-y-1.5 px-3 py-2.5">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-2">
              <div className="mr-1 inline-flex h-14 min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                <h1 className="truncate text-sm font-semibold tracking-tight">指挥中心</h1>
                <span className="truncate text-xs text-muted-foreground">OpenClaw 会话工作台</span>
              </div>

              <StatusPill
                label="Agent"
                value={session.agentId || "main"}
                action={
                  <SelectionMenu
                    label="切换 Agent"
                    items={availableAgents}
                    value={session.agentId}
                    onSelect={onAgentChange}
                    emptyText="暂无可选 Agent"
                  />
                }
              />

              <StatusPill
                label="模型"
                value={model || session.model || "未知"}
                action={
                  <SelectionMenu
                    label="切换模型"
                    items={availableModels}
                    value={model || session.model}
                    onSelect={onModelChange}
                    emptyText="暂无可选模型"
                  />
                }
              />

              <div className="inline-flex h-14 items-center gap-3 rounded-lg border border-border/70 bg-background/80 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">快速模式</div>
                  <div className={cn("text-sm font-semibold", fastMode && "text-emerald-700")}>{fastMode ? "已开启" : "已关闭"}</div>
                </div>
                <Switch checked={fastMode} onCheckedChange={onFastModeChange} />
              </div>

              <StatusPill label="上下文" value={`${formatCompactK(session.contextUsed)} / ${formatCompactK(session.contextMax)}`}>
                <Badge variant="default">{session.tokens || session.contextDisplay || "等待状态"}</Badge>
              </StatusPill>

              <StatusPill label="队列" value={session.queue || "无"}>
                <Badge variant="default">{session.updatedLabel || "暂无更新"}</Badge>
              </StatusPill>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              <MetaChip label="鉴权" value={session.auth} />
              <MetaChip label="运行" value={session.runtime} />
              <MetaChip label="时间" value={session.time} />
              <MetaChip label="会话" value={session.sessionKey} />
              <MetaChip label="模式" value={session.mode === "openclaw" ? "真实网关" : "模拟模式"} />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
