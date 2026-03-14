import { LoaderCircle, RotateCcw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/command-center/markdown-content";

function EmptyConversation() {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
          <Send className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">等待第一条指令</div>
          <div className="text-sm text-muted-foreground">这里会显示你和 Agent 的对话过程。</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message, formatTime }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className="flex max-w-[86%] items-start gap-2">
        {!isUser ? null : (
          <time className="pt-2 text-[11px] leading-5 text-muted-foreground tabular-nums">
            {formatTime(message.timestamp)}
          </time>
        )}
        <Card
          className={cn(
            "min-w-0",
            isUser ? "border-primary/10 bg-primary/[0.04]" : "bg-card",
            message.pending && "animate-pulse",
          )}
        >
          <CardContent className="px-3 py-2.5">
            {isUser ? (
              <div className="whitespace-pre-wrap text-[13px] leading-6">{message.content}</div>
            ) : (
              <MarkdownContent content={message.content} className="text-[12px] leading-5" />
            )}
          </CardContent>
        </Card>
        {isUser ? null : (
          <time className="pt-2 text-[11px] leading-5 text-muted-foreground tabular-nums">
            {formatTime(message.timestamp)}
          </time>
        )}
      </div>
    </div>
  );
}

function ConnectionStatus({ session }) {
  const isOffline = session.status === "离线";
  const isOpenClaw = session.mode === "openclaw";
  const toneClassName = isOffline ? "bg-rose-500" : isOpenClaw ? "bg-emerald-500" : "bg-slate-400";
  const label = isOffline ? "OpenClaw 离线" : isOpenClaw ? "OpenClaw 在线" : "模拟模式";

  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", toneClassName)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

function QueuedMessages({ items }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="border-b border-border/70 bg-muted/20 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
          待发送 {items.length}
        </Badge>
        <span>当前回复结束后将按顺序发送</span>
      </div>
      <div className="grid gap-1.5">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-md border border-border/70 bg-background/80 px-2.5 py-1.5 text-[12px] leading-5">
            <span className="mr-2 text-[10px] text-muted-foreground">#{index + 1}</span>
            <span className="line-clamp-2 whitespace-pre-wrap">{item.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  busy,
  formatTime,
  messageViewportRef,
  messages,
  onPromptChange,
  onPromptKeyDown,
  onReset,
  onSend,
  prompt,
  promptRef,
  queuedMessages,
  session,
}) {
  return (
    <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden">
      <CardHeader className="flex h-12 flex-row items-center justify-between gap-3 border-b border-border/70 bg-card/80 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate text-sm leading-none">当前会话</CardTitle>
          <CardDescription className="truncate text-[11px] leading-none">与当前 Agent 协作</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onReset} className="h-6 w-6 rounded-md" aria-label="重置对话">
                <RotateCcw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>重置对话 (⌘N)</TooltipContent>
          </Tooltip>
          <Badge variant="default" className="h-6 px-2 py-0 text-[10px]">
            {session.agentId || "main"}
          </Badge>
          <Badge variant={busy ? "success" : "default"} className="h-6 px-2 py-0 text-[10px]">
            {busy ? "思考中" : "待命"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] p-0">
        <QueuedMessages items={queuedMessages || []} />
        <ScrollArea className="h-full" viewportRef={messageViewportRef}>
          <div className="grid gap-2.5 p-3">
            {messages.length ? messages.map((message, index) => <MessageBubble key={`${message.timestamp}-${index}`} message={message} formatTime={formatTime} />) : <EmptyConversation />}
          </div>
        </ScrollArea>
      </CardContent>

      <CardContent className="space-y-4 border-t border-border/70 bg-muted/20 px-4 py-4">
        <Textarea
          ref={promptRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={onPromptKeyDown}
          placeholder="描述你希望 Agent 在当前 workspace 中完成什么。"
          className="min-h-0 resize-none bg-background"
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-y-1 text-xs text-muted-foreground">
            {session.time || "等待时间同步"}
            <span className="mx-2">·</span>
            <ConnectionStatus session={session} />
          </div>
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground">Shift + 回车发送，回车换行</span>
            <Button onClick={onSend} className="md:min-w-28">
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              发送
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
