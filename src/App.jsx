import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Boxes,
  Eye,
  FileText,
  FolderOpen,
  Hammer,
  History,
  LoaderCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownIcon,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const storageKey = "command-center-ui-state-v2";
const defaultTab = "timeline";
const defaultSessionUser = "command-center";
const maxPromptRows = 15;

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderMarkdown(text) {
  const source = String(text || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listType = "";
  let inCodeBlock = false;
  let codeFence = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map((line) => renderInlineMarkdown(line)).join("<br>")}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    const tag = listType === "ol" ? "ol" : "ul";
    blocks.push(`<${tag}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`);
    listItems = [];
    listType = "";
  };

  const flushCodeBlock = () => {
    const language = codeFence ? `<span class="code-fence-label">${escapeHtml(codeFence)}</span>` : "";
    blocks.push(`<pre><code>${language}${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines = [];
    codeFence = "";
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\S+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeFence = fenceMatch[1] || "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(6, headingMatch[1].length);
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1])}</p></blockquote>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(orderedMatch[1]);
      continue;
    }

    const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bulletMatch[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (inCodeBlock) flushCodeBlock();
  flushParagraph();
  flushList();

  return blocks.join("") || `<p>${renderInlineMarkdown(source)}</p>`;
}

function loadStoredState() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      activeTab: parsed?.activeTab || defaultTab,
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      fastMode: Boolean(parsed?.fastMode),
      model: parsed?.model || "",
      agentId: parsed?.agentId || "main",
      sessionUser: parsed?.sessionUser || defaultSessionUser,
    };
  } catch {
    return null;
  }
}

function baseSession(overrides = {}) {
  return {
    mode: "mock",
    model: "",
    selectedModel: "",
    agentId: "main",
    selectedAgentId: "main",
    sessionUser: defaultSessionUser,
    sessionKey: "",
    status: "空闲",
    fastMode: "关闭",
    contextUsed: 0,
    contextMax: 16000,
    contextDisplay: "0 / 16000",
    runtime: "mock",
    queue: "无",
    updatedLabel: "暂无更新",
    tokens: "0 in / 0 out",
    auth: "",
    time: "",
    availableModels: [],
    availableAgents: [],
    ...overrides,
  };
}

export default function App() {
  const stored = useMemo(() => loadStoredState(), []);
  const [messages, setMessages] = useState(stored?.messages || []);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(stored?.activeTab || defaultTab);
  const [fastMode, setFastMode] = useState(Boolean(stored?.fastMode));
  const [model, setModel] = useState(stored?.model || "");
  const [availableModels, setAvailableModels] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [taskTimeline, setTaskTimeline] = useState([]);
  const [files, setFiles] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [agents, setAgents] = useState([]);
  const [peeks, setPeeks] = useState({ workspace: null, terminal: null, browser: null });
  const [session, setSession] = useState(
    baseSession({
      agentId: stored?.agentId || "main",
      selectedAgentId: stored?.agentId || "main",
      sessionUser: stored?.sessionUser || defaultSessionUser,
    }),
  );
  const [prompt, setPrompt] = useState("");
  const promptRef = useRef(null);
  const messageViewportRef = useRef(null);

  const persist = (next = {}) => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          activeTab,
          messages: (next.messages || messages).filter((message) => !message.pending).slice(-80),
          fastMode,
          model,
          agentId: session.agentId,
          sessionUser: session.sessionUser,
          ...next,
        }),
      );
    } catch {}
  };

  const adjustPromptHeight = () => {
    const textarea = promptRef.current;
    if (!textarea) return;
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    const maxHeight = lineHeight * maxPromptRows + paddingTop + paddingBottom + borderTop + borderBottom;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(() => {
    adjustPromptHeight();
  }, [prompt]);

  useEffect(() => {
    persist();
  }, [messages, fastMode, activeTab, model, session.agentId, session.sessionUser]);

  useEffect(() => {
    if (messageViewportRef.current) {
      messageViewportRef.current.scrollTop = messageViewportRef.current.scrollHeight;
    }
  }, [messages]);

  const applySnapshot = (snapshot) => {
    if (!snapshot) return;
    const nextSession = baseSession({
      ...session,
      ...(snapshot.session || {}),
      mode: snapshot.session?.mode || session.mode,
    });
    setSession(nextSession);
    setAvailableModels(snapshot.session?.availableModels || snapshot.availableModels || []);
    setAvailableAgents(snapshot.session?.availableAgents || snapshot.availableAgents || []);
    setTaskTimeline(snapshot.taskTimeline || []);
    setFiles(snapshot.files || []);
    setArtifacts(snapshot.artifacts || []);
    setSnapshots(snapshot.snapshots || []);
    setAgents(snapshot.agents || []);
    setPeeks(snapshot.peeks || { workspace: null, terminal: null, browser: null });
    setModel(snapshot.session?.selectedModel || snapshot.model || nextSession.model || "");
  };

  const loadRuntime = async (sessionUser = session.sessionUser) => {
    const response = await fetch(`/api/runtime?sessionUser=${encodeURIComponent(sessionUser)}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Runtime snapshot failed");
    }
    applySnapshot(payload);
  };

  useEffect(() => {
    loadRuntime(session.sessionUser).catch(() => {
      setSession((current) => ({ ...current, status: "离线" }));
    });

    const id = window.setInterval(() => {
      if (!busy) {
        loadRuntime(session.sessionUser).catch(() => {});
      }
    }, 15000);

    return () => window.clearInterval(id);
  }, [busy, session.sessionUser]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        handleReset().catch(() => {});
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const updateSessionSettings = async (payload) => {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionUser: session.sessionUser,
        ...payload,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Session update failed");
    }
    applySnapshot(data);
  };

  const handleSend = async () => {
    const content = prompt.trim();
    if (!content || busy) return;

    const userMessage = { role: "user", content, timestamp: Date.now() };
    const pendingMessage = { role: "assistant", content: "正在思考…", timestamp: Date.now(), pending: true };
    const nextMessages = [...messages, userMessage, pendingMessage];
    setMessages(nextMessages);
    setPrompt("");
    setBusy(true);
    setSession((current) => ({ ...current, status: "执行中" }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          agentId: session.agentId,
          sessionUser: session.sessionUser,
          fastMode,
          messages: nextMessages.filter((message) => !message.pending).map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Request failed");
      }

      applySnapshot(payload);
      setMessages((current) => {
        const withoutPending = current.filter((item) => !item.pending);
        return [
          ...withoutPending,
          {
            role: "assistant",
            content: payload.outputText,
            timestamp: Date.now(),
          },
        ];
      });
      setSession((current) => ({ ...current, status: payload.metadata?.status || "已完成" }));
    } catch (error) {
      setMessages((current) => {
        const withoutPending = current.filter((item) => !item.pending);
        return [
          ...withoutPending,
          {
            role: "assistant",
            content: `请求失败。\n${error.message}`,
            timestamp: Date.now(),
          },
        ];
      });
      setSession((current) => ({ ...current, status: "失败" }));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    const nextSessionUser = `command-center-${Date.now()}`;
    setMessages([]);
    setTaskTimeline([]);
    setFiles([]);
    setArtifacts([]);
    setSnapshots([]);
    setSession((current) =>
      baseSession({
        ...current,
        model: current.model,
        selectedModel: current.selectedModel,
        agentId: current.agentId,
        selectedAgentId: current.selectedAgentId,
        sessionUser: nextSessionUser,
        contextMax: current.contextMax || 16000,
        updatedLabel: "刚刚重置",
      }),
    );
    setPrompt("");
    await loadRuntime(nextSessionUser).catch(() => {});
  };

  const handleModelChange = async (nextModel) => {
    if (!nextModel || nextModel === model) return;
    setModel(nextModel);
    await updateSessionSettings({ model: nextModel }).catch(() => {});
  };

  const handleAgentChange = async (nextAgent) => {
    if (!nextAgent || nextAgent === session.agentId) return;
    setSession((current) => ({ ...current, agentId: nextAgent, selectedAgentId: nextAgent }));
    await updateSessionSettings({ agentId: nextAgent }).catch(() => {});
  };

  const handlePromptKeyDown = (event) => {
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const statusVariant = session.status.includes("执行中") ? "success" : session.status.includes("失败") ? "default" : "active";

  const renderPeek = (section, fallback) => {
    if (!section) return fallback;
    return [section.summary, ...(section.items || []).map((item) => `${item.label}：${item.value}`)].filter(Boolean).join("\n");
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen min-w-[1080px] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(30,41,59,0.08),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f4f7fb_38%,#edf2f7_100%)] text-slate-950">
        <div className="mx-auto grid h-dvh w-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] gap-3 p-3">
          <Card className="overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur">
            <CardContent className="p-0">
              <div className="grid gap-0">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 border-b border-slate-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-[5px] bg-slate-950 text-white shadow-sm">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">OpenClaw Workspace</div>
                      <div className="mt-1 flex items-center gap-3">
                        <h1 className="text-[22px] font-semibold tracking-tight text-slate-950">指挥中心</h1>
                        <Badge variant="default" className="border-sky-200 bg-sky-50 text-sky-700">
                          实时会话
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">面向 Agent 操作与追踪的统一工作台</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="hidden rounded-[5px] border border-slate-200 bg-slate-50 px-3 py-2 text-right md:block">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Session</div>
                      <div className="mt-1 max-w-[260px] truncate text-sm font-medium text-slate-700">{session.sessionUser}</div>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 border-slate-200 bg-white px-3" onClick={() => handleReset().catch(() => {})}>
                          <RotateCcw className="h-3.5 w-3.5" />
                          重置对话
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>重置对话 (⌘N)</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-px bg-slate-200/80">
                  <ControlTile
                    label="模型"
                    value={model || session.model || "未知"}
                    meta={session.auth || session.time || "等待模型状态"}
                    control={<ModelMenu items={availableModels} value={model || session.model} onSelect={handleModelChange} />}
                  />
                  <ControlTile
                    label="Agent"
                    value={session.agentId || "main"}
                    meta={session.sessionKey || "等待会话"}
                    control={<AgentMenu items={availableAgents} value={session.agentId} onSelect={handleAgentChange} />}
                  />
                  <ControlTile
                    label="运行状态"
                    value={<Badge variant={statusVariant}>{session.status || "空闲"}</Badge>}
                    meta={session.runtime || "未知"}
                  />
                  <ControlTile
                    label="快速模式"
                    value={
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input
                          checked={fastMode}
                          onChange={(event) => setFastMode(event.target.checked)}
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        {fastMode ? "开启" : "关闭"}
                      </label>
                    }
                    meta={session.mode === "openclaw" ? "真实网关" : "模拟模式"}
                  />
                  <ControlTile
                    label="上下文"
                    value={`${session.contextUsed || 0} / ${session.contextMax || 16000}`}
                    meta={session.tokens || session.contextDisplay || "等待状态"}
                  />
                  <ControlTile
                    label="队列"
                    value={session.queue || "无"}
                    meta={session.updatedLabel || "暂无更新"}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <main className="grid min-h-0 grid-cols-[minmax(0,1.72fr)_minmax(360px,0.92fr)] gap-3">
            <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur">
              <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.88))] pb-4">
                <div>
                  <CardDescription className="uppercase tracking-[0.18em]">对话区</CardDescription>
                  <CardTitle className="mt-1 text-lg">当前会话</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="border-slate-200 bg-white text-slate-600">
                    {session.agentId || "main"}
                  </Badge>
                  <Badge variant={busy ? "success" : "default"}>{busy ? "思考中" : "待命"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="min-h-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.42),rgba(255,255,255,0.88))] pt-4">
                <ScrollArea className="h-full rounded-[5px] pr-3">
                  <div ref={messageViewportRef} className="grid gap-3">
                    {messages.length ? (
                      messages.map((message, index) => (
                        <article
                          key={`${message.timestamp}-${index}`}
                          className={cn(
                            "w-fit max-w-[85%] min-w-[240px] rounded-[5px] border px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]",
                            message.role === "user"
                              ? "justify-self-end border-slate-300 bg-slate-950 text-white"
                              : "justify-self-start border-slate-200 bg-white",
                            message.pending && "animate-pulse",
                          )}
                        >
                          <header className={cn(
                            "mb-2 flex items-center justify-between gap-3 text-[11px]",
                            message.role === "user" ? "text-slate-300" : "text-slate-500",
                          )}>
                            <span className="font-medium">{message.role === "user" ? "你" : "OpenClaw"}</span>
                            <time>{formatTime(message.timestamp)}</time>
                          </header>
                          {message.role === "assistant" ? (
                            <div className="markdown-body text-[15px] leading-7" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
                          ) : (
                            <div className="whitespace-pre-wrap text-[15px] leading-7 text-white">{message.content}</div>
                          )}
                        </article>
                      ))
                    ) : (
                      <Card className="border-dashed border-slate-200 bg-white/70 shadow-none">
                        <CardContent className="grid gap-3 px-6 py-12 text-center">
                          <div className="mx-auto grid h-12 w-12 place-items-center rounded-[5px] bg-slate-100 text-slate-500">
                            <Send className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-base font-medium text-slate-800">等待第一条指令</div>
                            <div className="mt-1 text-sm text-slate-500">这里会显示你和当前 Agent 的完整协作过程。</div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
              <div className="border-t border-slate-200/70 bg-white/95 p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>输入指令</span>
                  <span>Shift + 回车发送，回车换行</span>
                </div>
                <Textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={handlePromptKeyDown}
                  className="min-h-0 border-slate-200 bg-slate-50/70 text-[15px] leading-7 shadow-none"
                  placeholder="描述你希望 Agent 在当前 workspace 中完成什么。"
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="border-slate-200 bg-white text-slate-600">
                      {session.sessionUser}
                    </Badge>
                    <span className="text-xs text-slate-500">{session.time || "等待时间同步"}</span>
                  </div>
                  <Button onClick={handleSend} disabled={busy} className="h-10 px-4">
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    发送
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-slate-200/80 bg-white/90 shadow-[0_18px_42px_rgba(15,23,42,0.08)] backdrop-blur">
              <CardHeader className="border-b border-slate-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.88))] pb-4">
                <div>
                  <CardDescription className="uppercase tracking-[0.18em]">工作台</CardDescription>
                  <CardTitle className="mt-1 text-lg">追踪与观察</CardTitle>
                </div>
                <Badge variant="default" className="border-slate-200 bg-white text-slate-600">
                  只读视图
                </Badge>
              </CardHeader>
              <CardContent className="min-h-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.52),rgba(255,255,255,0.92))] pt-4">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                  <TabsList className="grid w-full grid-cols-6 overflow-hidden rounded-[5px] bg-slate-100 p-1">
                    <TabsTrigger value="timeline">
                      <Hammer className="mr-1 h-3.5 w-3.5" />
                      执行
                    </TabsTrigger>
                    <TabsTrigger value="files">
                      <FolderOpen className="mr-1 h-3.5 w-3.5" />
                      文件
                    </TabsTrigger>
                    <TabsTrigger value="artifacts">
                      <FileText className="mr-1 h-3.5 w-3.5" />
                      产出
                    </TabsTrigger>
                    <TabsTrigger value="snapshots">
                      <History className="mr-1 h-3.5 w-3.5" />
                      快照
                    </TabsTrigger>
                    <TabsTrigger value="agents">
                      <Boxes className="mr-1 h-3.5 w-3.5" />
                      协作
                    </TabsTrigger>
                    <TabsTrigger value="peek">
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      预览
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="timeline" className="min-h-0">
                    <ScrollArea className="h-[calc(100dvh-220px)] pr-3">
                      <div className="grid gap-2">
                        {taskTimeline.length ? (
                          taskTimeline.map((item, index) => (
                            <Card key={item.id || index} className="border-slate-200">
                              <CardContent className="p-3">
                                <details open={index === 0} className="group">
                                  <summary className="cursor-pointer list-none">
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <div className="text-sm font-medium text-slate-950">{item.title}</div>
                                        <p className="mt-1 text-sm text-slate-600">{item.prompt}</p>
                                      </div>
                                      <Badge variant={item.status === "失败" ? "default" : item.status.includes("进行") ? "success" : "active"}>
                                        {item.status}
                                      </Badge>
                                    </div>
                                    <div className="mt-2 grid gap-1 text-xs text-slate-500">
                                      <div>工具：{item.toolsSummary || "未调用工具"}</div>
                                      <div>结果：{item.outcome}</div>
                                    </div>
                                  </summary>
                                  <Separator className="my-3" />
                                  <div className="grid gap-3">
                                    <TimelineSection title="工具输入 / 输出">
                                      {item.tools?.length ? (
                                        item.tools.map((tool) => (
                                          <div key={tool.id || `${tool.name}-${tool.timestamp}`} className="rounded-[5px] border border-slate-200 bg-slate-50 p-2">
                                            <div className="flex items-center justify-between gap-2">
                                              <strong className="text-sm">{tool.name}</strong>
                                              <Badge variant={tool.status === "失败" ? "default" : "success"}>{tool.status}</Badge>
                                            </div>
                                            <pre className="mt-2 overflow-auto rounded-[5px] border border-slate-200 bg-white p-2 text-xs text-slate-700">
输入
{tool.input || "无"}
                                            </pre>
                                            <pre className="mt-2 overflow-auto rounded-[5px] border border-slate-200 bg-white p-2 text-xs text-slate-700">
输出
{tool.output || tool.detail || "等待结果"}
                                            </pre>
                                          </div>
                                        ))
                                      ) : (
                                        <EmptyHint text="本轮未调用工具" />
                                      )}
                                    </TimelineSection>
                                    <TimelineSection title="文件变更">
                                      {item.files?.length ? (
                                        item.files.map((file) => (
                                          <div key={file.path} className="rounded-[5px] border border-slate-200 bg-slate-50 p-2 text-sm">
                                            <div className="font-medium">{file.path}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                              {file.kind}
                                              {file.updatedLabel ? ` · ${file.updatedLabel}` : ""}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <EmptyHint text="未检测到文件变更" />
                                      )}
                                    </TimelineSection>
                                    <TimelineSection title="快照入口">
                                      {item.snapshots?.length ? (
                                        item.snapshots.map((snapshot) => (
                                          <div key={snapshot.id} className="rounded-[5px] border border-slate-200 bg-slate-50 p-2 text-sm">
                                            <div className="font-medium">{snapshot.title}</div>
                                            <div className="mt-1 text-xs text-slate-500">{snapshot.detail}</div>
                                          </div>
                                        ))
                                      ) : (
                                        <EmptyHint text="本轮暂无快照" />
                                      )}
                                    </TimelineSection>
                                  </div>
                                </details>
                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <EmptyHint text="每次任务执行后，这里会按时间线聚合展示工具链路。" />
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="files" className="min-h-0">
                    <ListPanel items={files} empty="当前会话中检测到的文件会显示在这里。" render={(item) => (
                      <>
                        <div className="font-medium">{item.path}</div>
                        <div className="text-xs text-slate-500">{item.kind}</div>
                      </>
                    )} />
                  </TabsContent>

                  <TabsContent value="artifacts" className="min-h-0">
                    <ListPanel items={artifacts} empty="助手的真实产出会显示在这里。" render={(item) => (
                      <>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-slate-500">{item.type} · {item.detail}</div>
                      </>
                    )} />
                  </TabsContent>

                  <TabsContent value="snapshots" className="min-h-0">
                    <ListPanel items={snapshots} empty="每次完成回复后会生成一个可回看快照。" render={(item) => (
                      <>
                        <div className="font-medium">{item.title}</div>
                        <div className="text-xs text-slate-500">{item.detail}</div>
                      </>
                    )} />
                  </TabsContent>

                  <TabsContent value="agents" className="min-h-0">
                    <ListPanel items={agents} empty="首次执行后显示 Agent 协作结构。" render={(item) => (
                      <>
                        <div className="font-medium">{item.label}</div>
                        <div className="text-xs text-slate-500">{item.detail || item.state}</div>
                      </>
                    )} />
                  </TabsContent>

                  <TabsContent value="peek" className="min-h-0">
                    <ScrollArea className="h-[calc(100dvh-220px)] pr-3">
                      <div className="grid gap-2">
                        <PeekCard title="工作区" value={renderPeek(peeks.workspace, "等待工作区预览…")} />
                        <PeekCard title="终端" value={renderPeek(peeks.terminal, "等待终端预览…")} />
                        <PeekCard title="浏览器" value={renderPeek(peeks.browser, "等待浏览器预览…")} />
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ControlTile({ label, value, meta, control }) {
  return (
    <div className="grid min-h-[86px] grid-cols-[1fr_auto] grid-rows-[auto_auto_auto] items-start gap-x-2 gap-y-1 bg-white px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="justify-self-end">{control}</div>
      <div className="col-span-2 text-sm font-semibold text-slate-950">{value}</div>
      <div className="col-span-2 line-clamp-2 text-xs leading-5 text-slate-500">{meta}</div>
    </div>
  );
}

function StatusCard({ label, value, meta, control }) {
  return (
    <Card className="rounded-[5px] border-slate-200 bg-white/90 shadow-sm">
      <CardContent className="grid min-h-[64px] grid-cols-[1fr_auto] grid-rows-[auto_auto] items-start gap-x-2 gap-y-1 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="justify-self-end">{control}</div>
        <div className="col-span-2 text-sm font-semibold text-slate-950">{value}</div>
        <div className="col-span-2 line-clamp-2 text-xs text-slate-500">{meta}</div>
      </CardContent>
    </Card>
  );
}

function ModelMenu({ items, value, onSelect }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-[4px]">
          <DropdownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>切换模型</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          items.map((item) => (
            <DropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => onSelect(item)}>
              {item}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-slate-500">暂无可选模型</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AgentMenu({ items, value, onSelect }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-[4px]">
          <DropdownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>切换 Agent</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          items.map((item) => (
            <DropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => onSelect(item)}>
              {item}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-slate-500">暂无可选 Agent</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ListPanel({ items, empty, render }) {
  return (
    <ScrollArea className="h-[calc(100dvh-220px)] pr-3">
      <div className="grid gap-2">
        {items.length ? (
          items.map((item, index) => (
            <Card key={item.id || item.path || item.title || index} className="border-slate-200">
              <CardContent className="p-3">{render(item)}</CardContent>
            </Card>
          ))
        ) : (
          <EmptyHint text={empty} />
        )}
      </div>
    </ScrollArea>
  );
}

function TimelineSection({ title, children }) {
  return (
    <section className="grid gap-2">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{title}</div>
      {children}
    </section>
  );
}

function PeekCard({ title, value }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-3">
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{title}</div>
        <pre className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{value}</pre>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ text }) {
  return (
    <div className="rounded-[5px] border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-sm text-slate-500">
      {text}
    </div>
  );
}
