import { useEffect, useState } from "react";
import { FolderOpen, LoaderCircle, Maximize2, Minimize2, RefreshCcw, RotateCcw, RotateCw, SquareArrowOutUpRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { Prism } from "@/lib/prism-languages";
import { cn } from "@/lib/utils";

const homePrefix = "/Users/marila";
const filePreviewCodeTheme = themes.dracula;
const frontMatterDarkTheme = {
  plain: {
    color: "#f5f7ff",
    backgroundColor: "#14161a",
  },
  styles: [
    {
      types: ["atrule", "key", "property", "keyword"],
      style: { color: "#82aaff" },
    },
    {
      types: ["punctuation", "operator"],
      style: { color: "#89ddff" },
    },
    {
      types: ["boolean", "number", "important"],
      style: { color: "#ffcb6b", fontWeight: "600" },
    },
    {
      types: ["string", "scalar", "plain"],
      style: { color: "#c3e88d" },
    },
  ],
};
const frontMatterLightTheme = {
  plain: {
    color: "#1f2937",
    backgroundColor: "#f8fafc",
  },
  styles: [
    {
      types: ["atrule", "key", "property", "keyword"],
      style: { color: "#2563eb" },
    },
    {
      types: ["punctuation", "operator"],
      style: { color: "#0891b2" },
    },
    {
      types: ["boolean", "number", "important"],
      style: { color: "#b45309", fontWeight: "600" },
    },
    {
      types: ["string", "scalar", "plain"],
      style: { color: "#166534" },
    },
  ],
};
const previewLanguageByExtension = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  lua: "lua",
  m: "objectivec",
  mm: "objectivec",
  scala: "scala",
  dart: "dart",
  ex: "elixir",
  exs: "elixir",
  pl: "perl",
  pm: "perl",
  r: "r",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  sql: "sql",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  html: "markup",
  xml: "markup",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  ini: "ini",
  conf: "ini",
  env: "bash",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
  text: "text",
  log: "text",
};

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

function isCodeLikePreviewTarget(filePath = "", kind = "") {
  const normalizedKind = String(kind || "").toLowerCase();
  if (normalizedKind === "json" || normalizedKind === "markdown") {
    return true;
  }

  const normalizedPath = String(filePath || "").trim().toLowerCase();
  if (!normalizedPath) {
    return false;
  }

  const fileName = normalizedPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && previewLanguageByExtension[extension] && previewLanguageByExtension[extension] !== "text";
}

function inferPreviewLanguage(filePath = "", kind = "") {
  const normalizedKind = String(kind || "").toLowerCase();
  if (normalizedKind === "json") {
    return "json";
  }
  if (normalizedKind === "markdown") {
    return "markdown";
  }

  const normalizedPath = String(filePath || "").trim().toLowerCase();
  const fileName = normalizedPath.split("/").pop() || "";
  if (fileName === "dockerfile") {
    return "docker";
  }
  if (fileName === "makefile") {
    return "makefile";
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return previewLanguageByExtension[extension] || "text";
}

function resolveFileManagerLocaleLabel(messages, rawLabel = "") {
  const label = String(rawLabel || "").trim().toLowerCase();
  if (label === "finder") {
    return messages.inspector.previewActions.fileManagers.finder;
  }
  if (label === "explorer") {
    return messages.inspector.previewActions.fileManagers.explorer;
  }
  return messages.inspector.previewActions.fileManagers.folder;
}

function splitMarkdownFrontMatter(content = "") {
  const source = String(content || "");
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);

  if (!match) {
    return {
      frontMatter: "",
      body: source,
    };
  }

  return {
    frontMatter: String(match[1] || "").trim(),
    body: String(match[2] || ""),
  };
}

function FilePreviewCodeBlock({ content = "", language = "text", resolvedTheme = "dark", syntaxTheme, variant = "default" }) {
  const isSubtle = variant === "subtle";
  const theme = syntaxTheme || filePreviewCodeTheme;

  return (
    <div
      className={cn(
        "overflow-hidden border",
        isSubtle
          ? "rounded-2xl border-zinc-800 bg-[#14161a]"
          : "rounded-xl border-zinc-700 bg-zinc-950",
      )}
    >
      <div
        className={cn(
          "px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-400",
          isSubtle ? "border-b border-white/6 bg-transparent" : "border-b border-zinc-800 bg-zinc-900/90",
        )}
      >
        {language}
      </div>
      <Highlight prism={Prism} theme={theme} code={String(content || "")} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "overflow-auto px-0 text-[13px] leading-6",
              isSubtle
                ? resolvedTheme === "dark"
                  ? "py-2.5 text-zinc-50"
                  : "py-2.5 text-slate-900"
                : "py-3 text-zinc-50",
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className={cn("min-h-6 px-4 font-mono", isSubtle && "text-[12.5px]")}>
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

export function ImagePreviewOverlay({ image, onClose }) {
  const { messages } = useI18n();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [openingInFileManager, setOpeningInFileManager] = useState(false);

  useEffect(() => {
    if (!image?.src) {
      setScale(1);
      setRotation(0);
    }
  }, [image?.src]);

  useEffect(() => {
    if (!image?.src) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [image?.src, onClose]);

  if (!image?.src) {
    return null;
  }

  const clampScale = (value) => Math.min(4, Math.max(0.5, value));
  const handleZoomIn = () => setScale((current) => clampScale(current + 0.25));
  const handleZoomOut = () => setScale((current) => clampScale(current - 0.25));
  const handleReset = () => setScale(1);
  const handleRotateLeft = () => setRotation((current) => current - 90);
  const handleRotateRight = () => setRotation((current) => current + 90);
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages, image.fileManagerLabel || "Folder");
  const handleWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setScale((current) => clampScale(current + delta));
  };
  const handleRevealInFileManager = async () => {
    if (!image.path || openingInFileManager) {
      return;
    }

    try {
      setOpeningInFileManager(true);
      const response = await fetch("/api/file-manager/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: image.path }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Reveal in file manager failed");
      }
    } catch {} finally {
      setOpeningInFileManager(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/88 backdrop-blur-[2px]" onClick={onClose}>
      <button
        type="button"
        className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/16"
        aria-label={messages.common.closePreview}
        title={messages.common.closePreview}
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="h-full overflow-auto p-6" onClick={(event) => event.stopPropagation()} onWheel={handleWheel}>
        <div className="flex min-h-full items-center justify-center">
          <img
            src={image.src}
            alt={image.alt || ""}
            className="max-h-[92vh] max-w-[92vw] object-contain shadow-2xl transition-transform duration-150 ease-out"
            style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
          />
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-6 pb-6 pt-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-1.5 shadow-2xl backdrop-blur">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={messages.inspector.previewActions.imageRotateLeft}
                onClick={handleRotateLeft}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{messages.inspector.previewActions.imageRotateLeft}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={messages.inspector.previewActions.imageRotateRight}
                onClick={handleRotateRight}
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{messages.inspector.previewActions.imageRotateRight}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={messages.inspector.previewActions.imageZoomOut}
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{messages.inspector.previewActions.imageZoomOut}</TooltipContent>
          </Tooltip>
          <div className="min-w-12 text-center text-[11px] font-medium text-white/75">{Math.round(scale * 100)}%</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
                aria-label={messages.inspector.previewActions.imageResetZoom}
                onClick={handleReset}
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{messages.inspector.previewActions.imageResetZoom}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={messages.inspector.previewActions.imageZoomIn}
                onClick={handleZoomIn}
                disabled={scale >= 4}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{messages.inspector.previewActions.imageZoomIn}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                aria-label={messages.inspector.previewActions.revealInFileManager(fileManagerLabel)}
                onClick={handleRevealInFileManager}
                disabled={!image.path || openingInFileManager}
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{messages.inspector.previewActions.revealInFileManager(fileManagerLabel)}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export function FilePreviewOverlay({ files, preview, resolvedTheme = "light", onClose, onOpenFilePreview }) {
  const { messages } = useI18n();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openingInFileManager, setOpeningInFileManager] = useState(false);

  useEffect(() => {
    if (!preview) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, preview]);

  useEffect(() => {
    if (!preview) {
      setIsFullscreen(false);
    }
  }, [preview]);

  if (!preview) {
    return null;
  }

  const title = preview.item?.fullPath || preview.item?.path || preview.path || "";
  const displayPath = compactHomePath(title);
  const isDark = resolvedTheme === "dark";
  const vscodeHref = getVsCodeHref(title);
  const showVsCodeButton = isCodeLikePreviewTarget(title, preview.kind);
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages, preview.fileManagerLabel || "Folder");
  const isPdfPreview = preview.kind === "pdf" && Boolean(preview.contentUrl);

  const handleRevealInFileManager = async () => {
    if (!title || openingInFileManager) {
      return;
    }

    try {
      setOpeningInFileManager(true);
      const response = await fetch("/api/file-manager/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: title }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Reveal in file manager failed");
      }
    } catch {} finally {
      setOpeningInFileManager(false);
    }
  };

  let body = null;
  if (preview.loading) {
    body = (
      <div className={cn("flex min-h-[40vh] items-center justify-center text-sm", isDark ? "text-zinc-300" : "text-slate-600")}>
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        正在加载预览…
      </div>
    );
  } else if (preview.error) {
    body = <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">{preview.error}</div>;
  } else if (preview.kind === "markdown") {
    const { frontMatter, body: markdownBody } = splitMarkdownFrontMatter(preview.content);
    body = (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        {frontMatter ? (
          <div className="space-y-2">
            <div className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", isDark ? "text-zinc-400" : "text-slate-500")}>
              {messages.inspector.previewActions.frontMatter}
            </div>
            <FilePreviewCodeBlock
              content={frontMatter}
              language="yaml"
              resolvedTheme={resolvedTheme}
              syntaxTheme={resolvedTheme === "dark" ? frontMatterDarkTheme : frontMatterLightTheme}
              variant="subtle"
            />
          </div>
        ) : null}
        {markdownBody.trim() ? (
          <MarkdownContent
            content={markdownBody}
            files={files}
            headingScopeId={`file-preview-${preview.path || preview.item?.path || "file"}`}
            resolvedTheme={resolvedTheme}
            onOpenFilePreview={onOpenFilePreview}
          />
        ) : null}
      </div>
    );
  } else if (preview.kind === "json") {
    body = <FilePreviewCodeBlock content={preview.content} language="json" />;
  } else if (preview.kind === "text") {
    body = isCodeLikePreviewTarget(title, preview.kind)
      ? <FilePreviewCodeBlock content={preview.content} language={inferPreviewLanguage(title, preview.kind)} />
      : (
        <div className={cn("overflow-hidden rounded-xl border", isDark ? "border-border/70 bg-background/80" : "border-slate-200 bg-white")}>
          <pre className="overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[13px] leading-6 text-foreground">{preview.content}</pre>
        </div>
      );
  } else if (preview.kind === "image" && preview.contentUrl) {
    body = <img src={preview.contentUrl} alt={preview.name || ""} className="mx-auto max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl" />;
  } else if (preview.kind === "video" && preview.contentUrl) {
    body = <video src={preview.contentUrl} controls className="mx-auto max-h-[78vh] max-w-full rounded-xl bg-black" />;
  } else if (preview.kind === "audio" && preview.contentUrl) {
    body = (
      <div className="flex min-h-[40vh] items-center justify-center">
        <audio src={preview.contentUrl} controls className="w-full max-w-3xl" />
      </div>
    );
  } else if (isPdfPreview) {
    body = (
      <div
        className={cn(
          "overflow-hidden border shadow-sm",
          isFullscreen ? "h-full rounded-none" : "h-[78vh] rounded-xl",
          isDark ? "border-white/8 bg-[#111318]" : "border-slate-200 bg-white",
        )}
      >
        <iframe
          src={preview.contentUrl}
          title={preview.name || preview.item?.name || "PDF preview"}
          className="block h-full w-full bg-transparent"
        />
      </div>
    );
  } else {
    body = (
      <div className="rounded-xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
        该文件类型暂不支持内联预览。
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/58 backdrop-blur-[2px]" onClick={onClose}>
      <div className={cn("flex h-full items-center justify-center p-6", isFullscreen && "p-0")} onClick={(event) => event.stopPropagation()}>
        <div
          className={cn(
            "flex h-[min(88vh,980px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-[24px] border shadow-2xl",
            isFullscreen && "h-full w-full max-w-none rounded-none border-0 shadow-none",
            isDark ? "border-white/10 bg-[#16181d]" : "border-slate-200 bg-white",
          )}
        >
          <div className={cn("flex items-start justify-between gap-4 border-b px-6 py-4", isDark ? "border-white/10" : "border-slate-200")}>
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
                  isDark
                    ? "border-white/8 text-zinc-400 hover:border-white/14 hover:bg-white/6 hover:text-zinc-200"
                    : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800",
                )}
                aria-label={isFullscreen ? messages.inspector.previewActions.restore : messages.inspector.previewActions.maximize}
                title={isFullscreen ? messages.inspector.previewActions.restore : messages.inspector.previewActions.maximize}
                onClick={() => setIsFullscreen((current) => !current)}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0">
                <div className={cn("truncate text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>{preview.name || preview.item?.name || "文件预览"}</div>
                <div className={cn("truncate text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>{displayPath}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center overflow-hidden rounded-full border",
                  isDark ? "border-white/8 bg-white/[0.045]" : "border-slate-200 bg-slate-50/90",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 rounded-none gap-1.5 px-3 text-xs font-medium shadow-none",
                        isDark
                          ? "text-zinc-300 hover:bg-white/8 hover:text-white"
                          : "text-slate-700 hover:bg-white hover:text-slate-950",
                      )}
                      aria-label={messages.inspector.previewActions.revealInFileManager(fileManagerLabel)}
                      onClick={handleRevealInFileManager}
                      disabled={openingInFileManager}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>{fileManagerLabel}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{messages.inspector.previewActions.revealInFileManager(fileManagerLabel)}</TooltipContent>
                </Tooltip>
                {showVsCodeButton ? (
                  <>
                    <div className={cn("h-4 w-px", isDark ? "bg-white/10" : "bg-slate-200")} aria-hidden="true" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={vscodeHref}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition",
                            isDark
                              ? "text-zinc-300 hover:bg-white/8 hover:text-white"
                              : "text-slate-700 hover:bg-white hover:text-slate-950",
                          )}
                          aria-label={messages.inspector.previewActions.openInCodeEditor}
                        >
                          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                          <span>{messages.inspector.previewActions.codeEditorLabel}</span>
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>{messages.inspector.previewActions.openInCodeEditor}</TooltipContent>
                    </Tooltip>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                  isDark
                    ? "text-zinc-400 hover:bg-white/8 hover:text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
                aria-label={messages.common.closePreview}
                title={messages.common.closePreview}
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {isPdfPreview ? (
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden",
                isFullscreen ? "h-full p-0" : "px-6 py-5",
              )}
            >
              {body}
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="min-h-full px-6 py-5">{body}</div>
              {preview.truncated ? <div className={cn("px-6 pb-6 text-xs", isDark ? "text-zinc-500" : "text-slate-500")}>文件过大，当前只显示前 1 MB 内容。</div> : null}
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
