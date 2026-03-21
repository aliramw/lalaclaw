import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle, Maximize2, Minimize2, Pencil, RefreshCcw, RotateCcw, RotateCw, SquareArrowOutUpRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { InspectorFilesPanel } from "@/components/command-center/inspector-files-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isEditableElement } from "@/features/chat/utils";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { Prism, usePrismLanguage } from "@/lib/prism-languages";
import { cn, isApplePlatform } from "@/lib/utils";

const homePrefix = "/Users/marila";
const filePreviewDarkCodeTheme = themes.dracula;
const filePreviewLightCodeTheme = themes.vsLight;
const defaultSpreadsheetPreviewLimitRows = 200;
const defaultSpreadsheetPreviewLimitColumns = 50;
const filePreviewFontSizeStorageKey = "file-preview-font-size";
const filePreviewExpandedStorageKey = "file-preview-expanded";
const filePreviewFontSizeOptions = [
  { value: "small", glyphClassName: "text-[14px]" },
  { value: "medium", glyphClassName: "text-[18px]" },
  { value: "large", glyphClassName: "text-[22px]" },
];
const richTextPreviewFontSizeClassNames = {
  small: "text-[12px] leading-5 [&_p]:!leading-5 [&_li]:!leading-5 [&_blockquote]:!leading-5 [&_td]:!leading-5 [&_th]:!leading-5 [&_p]:!mb-1.5 [&_ul]:!my-1.5 [&_ol]:!my-1.5",
  medium: "text-[14px] leading-6 [&_p]:!leading-6 [&_li]:!leading-6 [&_blockquote]:!leading-6 [&_td]:!leading-6 [&_th]:!leading-6 [&_p]:!mb-2 [&_ul]:!my-2 [&_ol]:!my-2",
  large: "text-[16px] leading-7 [&_p]:!leading-7 [&_li]:!leading-7 [&_blockquote]:!leading-7 [&_td]:!leading-7 [&_th]:!leading-7 [&_p]:!mb-2.5 [&_ul]:!my-2.5 [&_ol]:!my-2.5",
};
const codePreviewFontSizeClassNames = {
  small: "text-[12px] leading-5 [&_.token-line]:min-h-5 [&_.token-line]:text-[12px]",
  medium: "text-[13px] leading-6 [&_.token-line]:min-h-6 [&_.token-line]:text-[13px]",
  large: "text-[15px] leading-7 [&_.token-line]:min-h-7 [&_.token-line]:text-[15px]",
};
const editorFontSizeByPreviewSize = {
  small: 12,
  medium: 14,
  large: 16,
};
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

let monacoEditorComponentPromise = null;

function loadMonacoEditorComponent() {
  if (!monacoEditorComponentPromise) {
    monacoEditorComponentPromise = import("@monaco-editor/react").then((module) => module.default);
  }

  return monacoEditorComponentPromise;
}

function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }
  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

function loadStoredFilePreviewFontSize() {
  if (typeof window === "undefined") {
    return "medium";
  }

  try {
    const value = window.localStorage.getItem(filePreviewFontSizeStorageKey);
    return filePreviewFontSizeOptions.some((option) => option.value === value) ? value : "medium";
  } catch {
    return "medium";
  }
}

function loadStoredFilePreviewExpanded() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(filePreviewExpandedStorageKey) === "true";
  } catch {
    return false;
  }
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

function resolveMonacoLanguage(filePath = "", kind = "") {
  const inferred = inferPreviewLanguage(filePath, kind);
  if (inferred === "text") {
    return "plaintext";
  }
  if (inferred === "markup") {
    return "html";
  }
  if (inferred === "bash") {
    return "shell";
  }
  if (inferred === "objectivec") {
    return "objective-c";
  }
  return inferred;
}

function isEditablePreview(preview) {
  const kind = String(preview?.kind || "").toLowerCase();
  return kind === "markdown" || kind === "json" || kind === "text";
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

function FilePreviewCodeBlock({
  content = "",
  language = "text",
  resolvedTheme = "dark",
  syntaxTheme,
  variant = "default",
  fontSize = "medium",
  fillHeight = false,
}) {
  const isSubtle = variant === "subtle";
  const isDarkTheme = resolvedTheme === "dark";
  const theme = syntaxTheme || (isDarkTheme ? filePreviewDarkCodeTheme : filePreviewLightCodeTheme);
  const fontSizeClassName = codePreviewFontSizeClassNames[fontSize] || codePreviewFontSizeClassNames.medium;
  const highlightedLanguage = usePrismLanguage(language);

  return (
    <div
      data-testid="file-preview-code-block"
      className={cn(
        "min-w-0 max-w-full overflow-hidden border",
        fillHeight && "flex min-h-0 flex-1 flex-col",
        isSubtle
          ? isDarkTheme
            ? "rounded-2xl border-zinc-800 bg-[#14161a]"
            : "rounded-2xl border-slate-200 bg-[#f8fafc]"
          : isDarkTheme
            ? "rounded-xl border-zinc-700 bg-zinc-950"
            : "rounded-xl border-slate-200 bg-[#f6f8fb]",
      )}
    >
      <div
        data-testid="file-preview-code-header"
        className={cn(
          "min-w-0 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em]",
          isSubtle
            ? isDarkTheme
              ? "border-b border-white/6 bg-transparent text-zinc-400"
              : "border-b border-slate-200/90 bg-transparent text-slate-500"
            : isDarkTheme
              ? "border-b border-zinc-800 bg-zinc-900/90 text-zinc-400"
              : "border-b border-slate-200 bg-white/88 text-slate-500",
        )}
      >
        {language}
      </div>
      <Highlight prism={Prism} theme={theme} code={String(content || "")} language={highlightedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            data-testid="file-preview-code-scroll"
            className={cn(
              "min-w-0 w-full max-w-full overflow-auto px-0",
              fillHeight && "min-h-0 flex-1",
              fontSizeClassName,
              isSubtle
                ? isDarkTheme
                  ? "py-2.5 text-zinc-50"
                  : "py-2.5 text-slate-900"
                : isDarkTheme
                  ? "py-3 text-zinc-50"
                  : "py-3 text-slate-900",
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div
                key={lineIndex}
                {...getLineProps({ line })}
                className={cn("token-line block min-w-max px-4 font-mono", isSubtle && "text-[12.5px]")}
              >
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function EditableFilePreview({
  path,
  kind,
  initialScrollRatio = null,
  value,
  onChange,
  resolvedTheme = "dark",
  fontSize = "medium",
  isDark = false,
  messages,
}) {
  const [EditorComponent, setEditorComponent] = useState(null);
  const initialScrollRatioRef = useRef(initialScrollRatio);
  const focusFrameRef = useRef(0);
  const focusTimeoutRef = useRef(0);

  useEffect(() => {
    initialScrollRatioRef.current = initialScrollRatio;
  }, [initialScrollRatio]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function" && focusFrameRef.current) {
      window.cancelAnimationFrame(focusFrameRef.current);
    }
    if (focusTimeoutRef.current) {
      window.clearTimeout(focusTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadMonacoEditorComponent().then((component) => {
      if (!cancelled) {
        setEditorComponent(() => component);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadingState = (
    <div className={cn("flex h-full items-center justify-center text-sm", isDark ? "text-zinc-300" : "text-slate-600")}>
      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
      {messages.inspector.previewActions.loadingPreview}
    </div>
  );

  return (
    <div
      data-inline-file-editor="true"
      className="h-full min-h-0 flex-1 overflow-hidden"
    >
      {EditorComponent ? (
        <EditorComponent
          path={path || "preview.txt"}
          language={resolveMonacoLanguage(path, kind)}
          value={value}
          onChange={(nextValue) => onChange(nextValue || "")}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          loading={loadingState}
          onMount={(editor) => {
            const focusEditor = () => {
              focusFrameRef.current = 0;
              focusTimeoutRef.current = 0;
              editor.focus();
            };

            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
              focusFrameRef.current = window.requestAnimationFrame(focusEditor);
            } else {
              focusTimeoutRef.current = window.setTimeout(focusEditor, 0);
            }

            const normalizedRatio = Number(initialScrollRatioRef.current);
            initialScrollRatioRef.current = null;
            if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) {
              return;
            }

            const syncPreviewPosition = () => {
              const layoutHeight = Number(
                editor.getLayoutInfo?.()?.height
                || editor.getDomNode?.()?.clientHeight
                || 0,
              );
              const scrollHeight = Number(editor.getScrollHeight?.() || 0);
              const maxScrollTop = Math.max(0, scrollHeight - layoutHeight);

              editor.setScrollTop?.(maxScrollTop * Math.min(normalizedRatio, 1));
            };

            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
              window.requestAnimationFrame(syncPreviewPosition);
            } else {
              setTimeout(syncPreviewPosition, 0);
            }
          }}
          height="100%"
          options={{
            autoClosingBrackets: "always",
            autoIndent: "advanced",
            autoSurround: "languageDefined",
            autoClosingQuotes: "always",
            formatOnPaste: false,
            formatOnType: false,
            automaticLayout: true,
            glyphMargin: false,
            fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: editorFontSizeByPreviewSize[fontSize] || editorFontSizeByPreviewSize.medium,
            lineNumbers: isCodeLikePreviewTarget(path, kind) || kind === "json" ? "on" : "off",
            minimap: { enabled: false },
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: "on",
          }}
        />
      ) : loadingState}
    </div>
  );
}

function DocxPreviewContent({ preview, resolvedTheme = "light" }) {
  const { messages } = useI18n();
  const containerRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    async function renderDocxPreview() {
      if (!preview?.contentUrl || !container) {
        setStatus("error");
        return;
      }

      setStatus("loading");

      try {
        const [response, docxPreviewModule] = await Promise.all([
          apiFetch(preview.contentUrl),
          import("docx-preview"),
        ]);

        if (!response.ok) {
          throw new Error("DOCX content request failed");
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) {
          return;
        }

        container.innerHTML = "";
        await docxPreviewModule.renderAsync(arrayBuffer, container, undefined, {
          className: "cc-docx",
          inWrapper: true,
          ignoreLastRenderedPageBreak: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });

        if (cancelled) {
          return;
        }

        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    renderDocxPreview();

    return () => {
      cancelled = true;
      if (container) {
        container.innerHTML = "";
      }
    };
  }, [preview?.contentUrl]);

  if (status === "error") {
    return (
      <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">
        {messages.inspector.previewErrors.docxFailed}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-auto rounded-xl border",
        resolvedTheme === "dark" ? "border-white/10 bg-[#111318]" : "border-slate-200 bg-slate-100/80",
      )}
    >
      {status === "loading" ? (
        <div className={cn("flex min-h-[40vh] items-center justify-center px-6 py-10 text-sm", resolvedTheme === "dark" ? "text-zinc-300" : "text-slate-600")}>
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          {messages.inspector.previewActions.renderingDocx}
        </div>
      ) : null}
      <div
        ref={containerRef}
        data-testid="docx-preview-content"
        className={cn(
          "min-h-[40vh] overflow-auto px-4 py-5",
          status === "loading" && "hidden",
          "[&_.cc-docx-wrapper]:bg-transparent [&_.cc-docx-wrapper]:p-0",
          "[&_.cc-docx]:mx-auto [&_.cc-docx]:max-w-[900px] [&_.cc-docx]:shadow-[0_18px_60px_rgba(15,23,42,0.12)]",
          "[&_.cc-docx]:rounded-[18px] [&_.cc-docx]:overflow-hidden",
          "[&_.cc-docx]:!bg-white [&_.cc-docx]:text-slate-900",
          "[&_.cc-docx_a]:text-sky-700 [&_.cc-docx_table]:max-w-full",
        )}
      />
    </div>
  );
}

function SpreadsheetPreview({ preview, resolvedTheme = "light" }) {
  const { messages } = useI18n();
  const isDark = resolvedTheme === "dark";
  const rows = preview?.spreadsheet?.rows || [];
  const sheetName = preview?.spreadsheet?.sheetName || preview?.name || "";
  const totalRows = Number(preview?.spreadsheet?.totalRows || 0);
  const totalColumns = Number(preview?.spreadsheet?.totalColumns || 0);
  const previewRowLimit = Number(preview?.spreadsheet?.previewRowLimit || defaultSpreadsheetPreviewLimitRows);
  const previewColumnLimit = Number(preview?.spreadsheet?.previewColumnLimit || defaultSpreadsheetPreviewLimitColumns);
  const truncatedRows = Boolean(preview?.spreadsheet?.truncatedRows);
  const truncatedColumns = Boolean(preview?.spreadsheet?.truncatedColumns);

  if (!rows.length) {
    return (
      <div className={cn("rounded-xl border p-4 text-sm", isDark ? "border-border/70 bg-background/80 text-zinc-300" : "border-slate-200 bg-white text-slate-600")}>
        {messages.inspector.spreadsheet.empty}
      </div>
    );
  }

  const columnHeaders = Array.from({ length: Math.max(...rows.map((row) => row.length), 0) }, (_, index) => String(index + 1));

  return (
    <div className={cn("overflow-hidden rounded-xl border", isDark ? "border-border/70 bg-background/80" : "border-slate-200 bg-white")}>
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-2 text-[11px]", isDark ? "border-border/70 text-zinc-400" : "border-slate-200 text-slate-500")}>
        <div className="truncate">
          {messages.inspector.spreadsheet.sheet}: {sheetName}
        </div>
        <div className="shrink-0">
          {totalRows} x {totalColumns}
        </div>
      </div>
      <ScrollArea className="max-h-[70vh]">
        <div className="min-w-max">
          <table className="w-full border-collapse text-left text-[12px] leading-5">
            <thead className={cn(isDark ? "bg-zinc-900/60 text-zinc-300" : "bg-slate-50 text-slate-600")}>
              <tr>
                <th className={cn("sticky left-0 z-10 border-b px-3 py-2 font-medium", isDark ? "border-border/60 bg-zinc-900/95" : "border-slate-200 bg-slate-50")}>#</th>
                {columnHeaders.map((header) => (
                  <th key={header} className={cn("border-b px-3 py-2 font-medium", isDark ? "border-border/60" : "border-slate-200")}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`${sheetName}-${rowIndex}`} className={cn(isDark ? "odd:bg-zinc-950/20" : "odd:bg-slate-50/70")}>
                  <td className={cn("sticky left-0 z-10 border-b px-3 py-2 align-top font-medium", isDark ? "border-border/50 bg-[#16181d]" : "border-slate-200 bg-white")}>
                    {rowIndex + 1}
                  </td>
                  {columnHeaders.map((header, columnIndex) => (
                    <td key={`${sheetName}-${rowIndex}-${header}`} className={cn("max-w-[22rem] border-b px-3 py-2 align-top whitespace-pre-wrap break-words", isDark ? "border-border/50 text-zinc-100" : "border-slate-200 text-slate-800")}>
                      {row[columnIndex] || ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ScrollArea>
      {truncatedRows || truncatedColumns ? (
        <div className={cn("border-t px-4 py-2 text-[11px]", isDark ? "border-border/60 text-zinc-400" : "border-slate-200 text-slate-500")}>
          {messages.inspector.spreadsheet.truncated(previewRowLimit, previewColumnLimit)}
        </div>
      ) : null}
    </div>
  );
}

export function ImagePreviewOverlay({ image, onClose }) {
  const { messages } = useI18n();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [openingInFileManager, setOpeningInFileManager] = useState(false);
  const imageRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
  });

  useEffect(() => {
    if (!image?.src) {
      setScale(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setIsDraggingImage(false);
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
  const clampOffset = (candidate, nextScale = scale, nextRotation = rotation) => {
    if (nextScale <= 1) {
      return { x: 0, y: 0 };
    }

    const imageNode = imageRef.current;
    if (!imageNode) {
      return candidate;
    }

    const baseWidth = imageNode.offsetWidth || 0;
    const baseHeight = imageNode.offsetHeight || 0;
    const normalizedQuarterTurns = Math.abs(Math.round(nextRotation / 90)) % 2;
    const effectiveWidth = normalizedQuarterTurns ? baseHeight : baseWidth;
    const effectiveHeight = normalizedQuarterTurns ? baseWidth : baseHeight;
    const maxX = Math.max(0, ((effectiveWidth * nextScale) - effectiveWidth) / 2);
    const maxY = Math.max(0, ((effectiveHeight * nextScale) - effectiveHeight) / 2);

    return {
      x: Math.min(maxX, Math.max(-maxX, candidate.x)),
      y: Math.min(maxY, Math.max(-maxY, candidate.y)),
    };
  };
  const updateScale = (updater) => {
    setScale((current) => {
      const nextScale = clampScale(typeof updater === "function" ? updater(current) : updater);
      setOffset((currentOffset) => clampOffset(currentOffset, nextScale, rotation));
      return nextScale;
    });
  };
  const handleZoomIn = () => updateScale((current) => current + 0.25);
  const handleZoomOut = () => updateScale((current) => current - 0.25);
  const handleReset = () => {
    setOffset({ x: 0, y: 0 });
    setScale(1);
  };
  const handleRotateLeft = () => {
    setRotation((current) => {
      const nextRotation = current - 90;
      setOffset((currentOffset) => clampOffset(currentOffset, scale, nextRotation));
      return nextRotation;
    });
  };
  const handleRotateRight = () => {
    setRotation((current) => {
      const nextRotation = current + 90;
      setOffset((currentOffset) => clampOffset(currentOffset, scale, nextRotation));
      return nextRotation;
    });
  };
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages, image.fileManagerLabel || messages.inspector.previewActions.fileManagers.folder);
  const handleWheel = (event) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    updateScale((current) => current + delta);
  };
  const handleImagePointerDown = (event) => {
    if (scale <= 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    setIsDraggingImage(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleImagePointerMove = (event) => {
    if (!dragStateRef.current.active || dragStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaX = event.clientX - dragStateRef.current.lastX;
    const deltaY = event.clientY - dragStateRef.current.lastY;
    dragStateRef.current.lastX = event.clientX;
    dragStateRef.current.lastY = event.clientY;
    setOffset((current) => clampOffset({ x: current.x + deltaX, y: current.y + deltaY }));
  };
  const endImageDrag = (event) => {
    if (
      Number.isInteger(dragStateRef.current.pointerId)
      && event?.currentTarget?.hasPointerCapture?.(dragStateRef.current.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(dragStateRef.current.pointerId);
    }

    dragStateRef.current = {
      active: false,
      pointerId: null,
      lastX: 0,
      lastY: 0,
    };
    setIsDraggingImage(false);
  };
  const handleRevealInFileManager = async () => {
    if (!image.path || openingInFileManager) {
      return;
    }

    try {
      setOpeningInFileManager(true);
      const response = await apiFetch("/api/file-manager/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: image.path }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || messages.inspector.previewErrors.revealInFileManagerFailed);
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
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="h-full overflow-auto p-6" onClick={(event) => event.stopPropagation()} onWheel={handleWheel}>
        <div className="flex min-h-full items-center justify-center">
          <img
            ref={imageRef}
            src={image.src}
            alt={image.alt || ""}
            className={cn(
              "max-h-[92vh] max-w-[92vw] object-contain shadow-2xl transition-transform duration-150 ease-out",
              scale > 1 ? (isDraggingImage ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
            )}
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)` }}
            onPointerDown={handleImagePointerDown}
            onPointerMove={handleImagePointerMove}
            onPointerUp={endImageDrag}
            onPointerCancel={endImageDrag}
            onPointerLeave={(event) => {
              if (dragStateRef.current.active) {
                return;
              }
              endImageDrag(event);
            }}
            draggable={false}
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

export function FilePreviewOverlay({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  files,
  preview,
  resolvedTheme = "light",
  sessionFiles = [],
  onClose,
  onOpenFilePreview,
  workspaceCount,
  workspaceFiles = [],
  workspaceLoaded = false,
}) {
  const { messages } = useI18n();
  const applePlatform = isApplePlatform();
  const [isFullscreen, setIsFullscreen] = useState(() => loadStoredFilePreviewExpanded());
  const [openingInFileManager, setOpeningInFileManager] = useState(false);
  const [filePreviewFontSize, setFilePreviewFontSize] = useState(() => loadStoredFilePreviewFontSize());
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editSessionDirty, setEditSessionDirty] = useState(false);
  const [editableContent, setEditableContent] = useState("");
  const [previewContentOverride, setPreviewContentOverride] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState(null);
  const [pendingLeaveAction, setPendingLeaveAction] = useState("");
  const previewViewportRef = useRef(null);
  const pendingEditorScrollRatioRef = useRef(null);
  const editSessionInitialContentRef = useRef("");
  const previewIdentity = `${preview?.path || preview?.item?.path || preview?.name || ""}:${preview?.kind || ""}`;

  useEffect(() => {
    try {
      window.localStorage.setItem(filePreviewFontSizeStorageKey, filePreviewFontSize);
    } catch {}
  }, [filePreviewFontSize]);

  useEffect(() => {
    try {
      window.localStorage.setItem(filePreviewExpandedStorageKey, String(isFullscreen));
    } catch {}
  }, [isFullscreen]);

  useEffect(() => {
    if (!preview) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (isEditing && editSessionDirty) {
        setPendingLeaveAction("close-preview");
        return;
      }
      onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editSessionDirty, isEditing, onClose, preview]);

  useEffect(() => {
    if (!preview) {
      setIsFullscreen(loadStoredFilePreviewExpanded());
      setIsEditing(false);
      setIsSaving(false);
      setEditableContent("");
      setPreviewContentOverride(null);
      setSaveError("");
      setSaveNotice(null);
      setEditSessionDirty(false);
      setPendingLeaveAction("");
      editSessionInitialContentRef.current = "";
      pendingEditorScrollRatioRef.current = null;
      return;
    }

    const shouldStartEditing = Boolean(preview.startInEditMode) && isEditablePreview(preview) && !preview.loading && !preview.error && !preview.truncated;
    setIsEditing(shouldStartEditing);
    setIsSaving(false);
    editSessionInitialContentRef.current = isEditablePreview(preview) ? String(preview.content || "") : "";
    setEditableContent(editSessionInitialContentRef.current);
    setPreviewContentOverride(null);
    setSaveError("");
    setSaveNotice(null);
    setEditSessionDirty(false);
    setPendingLeaveAction("");
    pendingEditorScrollRatioRef.current = null;
  }, [preview, previewIdentity]);

  useEffect(() => {
    if (!preview || !isEditablePreview(preview) || isEditing || previewContentOverride !== null) {
      return;
    }

    setEditableContent(String(preview.content || ""));
  }, [isEditing, preview, previewContentOverride]);

  useEffect(() => {
    if (!saveNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveNotice(null);
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [saveNotice]);

  const title = preview?.item?.fullPath || preview?.item?.path || preview?.path || "";
  const displayPath = compactHomePath(title);
  const isDark = resolvedTheme === "dark";
  const vscodeHref = getVsCodeHref(title);
  const showVsCodeButton = isCodeLikePreviewTarget(title, preview?.kind);
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages, preview.fileManagerLabel || messages.inspector.previewActions.fileManagers.folder);
  const isPdfPreview = preview?.kind === "pdf" && Boolean(preview.contentUrl);
  const editablePreview = isEditablePreview(preview);
  const effectivePreviewContent = editablePreview
    ? (previewContentOverride !== null ? previewContentOverride : String(preview?.content || ""))
    : "";
  const canEditPreview = editablePreview && !preview?.loading && !preview?.error && !preview?.truncated && Boolean(title);
  const showFilesSidebar = editablePreview && Boolean(title);
  const richTextPreviewFontSizeClassName = richTextPreviewFontSizeClassNames[filePreviewFontSize] || richTextPreviewFontSizeClassNames.medium;
  const showPreviewFontSizeControls = preview?.kind === "markdown" || preview?.kind === "text" || preview?.kind === "json";
  const editShortcutLabel = "E";

  const handleRevealInFileManager = async () => {
    if (!title || openingInFileManager) {
      return;
    }

    try {
      setOpeningInFileManager(true);
      const response = await apiFetch("/api/file-manager/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: title }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || messages.inspector.previewErrors.revealInFileManagerFailed);
      }
    } catch {} finally {
      setOpeningInFileManager(false);
    }
  };

  const handleStartEditing = useCallback(() => {
    if (!canEditPreview) {
      return;
    }

    const previewViewport = previewViewportRef.current;
    if (previewViewport) {
      const maxScrollTop = Math.max(0, previewViewport.scrollHeight - previewViewport.clientHeight);
      pendingEditorScrollRatioRef.current = maxScrollTop > 0 ? previewViewport.scrollTop / maxScrollTop : 0;
    } else {
      pendingEditorScrollRatioRef.current = null;
    }

    editSessionInitialContentRef.current = effectivePreviewContent;
    setEditableContent(effectivePreviewContent);
    setEditSessionDirty(false);
    setSaveError("");
    setSaveNotice(null);
    setIsEditing(true);
  }, [canEditPreview, effectivePreviewContent]);

  const handleCancelEditing = () => {
    setEditableContent(effectivePreviewContent);
    setSaveError("");
    setSaveNotice(null);
    setEditSessionDirty(false);
    setPendingLeaveAction("");
    setIsEditing(false);
  };

  const handleRequestClose = useCallback(() => {
    if (isEditing && editSessionDirty) {
      setPendingLeaveAction("close-preview");
      return;
    }
    onClose?.();
  }, [editSessionDirty, isEditing, onClose]);

  const handleRequestCancelEditing = useCallback(() => {
    if (editSessionDirty) {
      setPendingLeaveAction("cancel-edit");
      return;
    }
    handleCancelEditing();
  }, [editSessionDirty]);

  const handleConfirmLeave = useCallback(() => {
    if (pendingLeaveAction === "cancel-edit") {
      handleCancelEditing();
      return;
    }
    setPendingLeaveAction("");
    onClose?.();
  }, [onClose, pendingLeaveAction]);

  const handleSaveEditing = useCallback(async ({ stayInEditing = false } = {}) => {
    if (!canEditPreview || isSaving) {
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");
      setSaveNotice(null);
      const response = await apiFetch("/api/file-preview/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: title,
          content: editableContent,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 405 && payload?.error === "Method not allowed") {
        throw new Error(messages.inspector.previewErrors.saveRequiresRestart);
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || messages.inspector.previewErrors.saveFailed);
      }

      setPreviewContentOverride(editableContent);
      editSessionInitialContentRef.current = editableContent;
      setEditSessionDirty(false);
      setPendingLeaveAction("");
      setIsEditing(stayInEditing);
      setSaveNotice({
        id: Date.now(),
        message: messages.inspector.previewActions.saveSucceeded,
      });
    } catch (error) {
      setSaveError(error.message || messages.inspector.previewErrors.saveFailed);
    } finally {
      setIsSaving(false);
    }
  }, [
    canEditPreview,
    editableContent,
    isSaving,
    messages.inspector.previewActions.saveSucceeded,
    messages.inspector.previewErrors.saveFailed,
    messages.inspector.previewErrors.saveRequiresRestart,
    title,
  ]);

  const handleChangeEditableContent = useCallback((nextValue) => {
    if (!editSessionDirty && nextValue !== editSessionInitialContentRef.current) {
      setEditSessionDirty(true);
    }
    setEditableContent(nextValue);
  }, [editSessionDirty]);

  useEffect(() => {
    if (!preview || !canEditPreview) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      const normalizedKey = String(event.key || "").trim().toLowerCase();
      const activeElement = document.activeElement;
      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const usesExpectedModifier = applePlatform
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      const supportsSaveShortcut =
        usesExpectedModifier
        && !event.shiftKey
        && !event.altKey
        && !event.repeat
        && !event.isComposing;

      const isEditShortcut =
        !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !event.shiftKey
        && !event.repeat
        && !event.isComposing
        && (event.code === "KeyE" || normalizedKey === "e");
      const isSaveShortcut = event.code === "KeyS" || normalizedKey === "s";

      if (isEditShortcut && !isEditing) {
        if (isEditableElement(activeElement) || isEditableElement(eventTarget)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handleStartEditing();
        return;
      }

      if (supportsSaveShortcut && isSaveShortcut && isEditing) {
        event.preventDefault();
        event.stopPropagation();
        handleSaveEditing({ stayInEditing: true });
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [applePlatform, canEditPreview, handleSaveEditing, handleStartEditing, isEditing, preview]);

  if (!preview) {
    return null;
  }

  let body = null;
  if (preview.loading) {
    body = (
      <div className={cn("flex min-h-[40vh] items-center justify-center text-sm", isDark ? "text-zinc-300" : "text-slate-600")}>
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        {messages.inspector.previewActions.loadingPreview}
      </div>
    );
  } else if (preview.error) {
    body = <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">{preview.error}</div>;
  } else if (isEditing) {
    body = (
      <div className="flex h-full min-h-0 flex-col gap-3">
        {saveError ? (
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">{saveError}</div>
        ) : null}
        <EditableFilePreview
          path={title}
          kind={preview.kind}
          initialScrollRatio={pendingEditorScrollRatioRef.current}
          value={editableContent}
          onChange={handleChangeEditableContent}
          resolvedTheme={resolvedTheme}
          fontSize={filePreviewFontSize}
          isDark={isDark}
          messages={messages}
        />
      </div>
    );
  } else if (preview.kind === "markdown") {
    const { frontMatter, body: markdownBody } = splitMarkdownFrontMatter(effectivePreviewContent);
    body = (
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4">
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
              fontSize={filePreviewFontSize}
            />
          </div>
        ) : null}
        {markdownBody.trim() ? (
          <div data-testid="markdown-preview-content" className="min-w-0 max-w-full overflow-x-auto">
            <MarkdownContent
              content={markdownBody}
              files={files}
              headingScopeId={`file-preview-${preview.path || preview.item?.path || "file"}`}
              resolvedTheme={resolvedTheme}
              className={cn("min-w-0 max-w-full", richTextPreviewFontSizeClassName)}
              onOpenFilePreview={onOpenFilePreview}
            />
          </div>
        ) : null}
      </div>
    );
  } else if (preview.kind === "docx" && preview.contentUrl) {
    body = <DocxPreviewContent preview={preview} resolvedTheme={resolvedTheme} />;
  } else if (preview.kind === "json") {
    body = <FilePreviewCodeBlock content={effectivePreviewContent} language="json" fontSize={filePreviewFontSize} resolvedTheme={resolvedTheme} fillHeight />;
  } else if (preview.kind === "text") {
    body = isCodeLikePreviewTarget(title, preview.kind)
      ? <FilePreviewCodeBlock content={effectivePreviewContent} language={inferPreviewLanguage(title, preview.kind)} fontSize={filePreviewFontSize} resolvedTheme={resolvedTheme} fillHeight />
      : (
        <div className={cn("overflow-hidden rounded-xl border", isDark ? "border-border/70 bg-background/80" : "border-slate-200 bg-white")}>
          <pre className={cn("overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-foreground", richTextPreviewFontSizeClassName)}>{effectivePreviewContent}</pre>
        </div>
      );
  } else if (preview.kind === "spreadsheet") {
    body = <SpreadsheetPreview preview={preview} resolvedTheme={resolvedTheme} />;
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
          title={preview.name || preview.item?.name || messages.inspector.previewActions.pdfPreviewTitle}
          className="block h-full w-full bg-transparent"
        />
      </div>
    );
  } else {
    body = (
      <div className="rounded-xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
        {messages.inspector.previewActions.unsupportedInlinePreview}
      </div>
    );
  }

  const useDirectBodyLayout = isPdfPreview
    || isEditing
    || preview.kind === "json"
    || (preview.kind === "text" && isCodeLikePreviewTarget(title, preview.kind));
  const directBodyPaddingClassName = isFullscreen
    ? (isPdfPreview ? "h-full p-0" : "h-full px-6 py-5")
    : isEditing
      ? "h-full p-0"
      : "px-6 py-5";
  const mainBody = useDirectBodyLayout ? (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        directBodyPaddingClassName,
      )}
    >
      {body}
    </div>
  ) : (
    <ScrollArea
      className="min-h-0 min-w-0 flex-1"
      viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0 [&>div]:!max-w-full"
      viewportRef={previewViewportRef}
      style={{ contain: "layout inline-size paint" }}
    >
      <div className="min-h-full min-w-0 max-w-full overflow-x-hidden px-6 py-5">{body}</div>
      {preview.truncated ? (
        <div className={cn("px-6 pb-6 text-xs", isDark ? "text-zinc-500" : "text-slate-500")}>
          {messages.inspector.previewActions.truncatedPreview}
        </div>
      ) : null}
    </ScrollArea>
  );

  const leaveDialogTitle = pendingLeaveAction === "cancel-edit"
    ? messages.inspector.previewActions.unsavedChanges.cancelTitle
    : messages.inspector.previewActions.unsavedChanges.closeTitle;
  const leaveDialogConfirmLabel = pendingLeaveAction === "cancel-edit"
    ? messages.inspector.previewActions.unsavedChanges.discardAndStopEditing
    : messages.inspector.previewActions.unsavedChanges.discardAndClose;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/58 backdrop-blur-[2px]" onClick={handleRequestClose}>
      {saveNotice?.message ? (
        <div className="pointer-events-none fixed inset-x-0 top-5 z-[130] flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-medium shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur-xl",
              isDark
                ? "border-emerald-400/18 bg-[#10231c]/92 text-emerald-200 shadow-[0_22px_48px_rgba(0,0,0,0.42)]"
                : "border-emerald-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,247,0.97))] text-emerald-800",
            )}
          >
            {saveNotice.message}
          </div>
        </div>
      ) : null}
      <div className={cn("flex h-full items-center justify-center p-6", isFullscreen && "p-0")} onClick={(event) => event.stopPropagation()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={preview.name || preview.item?.name || messages.inspector.previewActions.previewTitle}
          className={cn(
            "flex h-[min(88vh,980px)] w-full max-w-[1200px] flex-col overflow-hidden rounded-[24px] border shadow-2xl",
            isFullscreen && "h-full w-full max-w-none rounded-none border-0 shadow-none",
            isDark ? "border-white/10 bg-[#16181d]" : "border-slate-200 bg-white",
          )}
        >
          <div className={cn("flex items-start justify-between gap-4 border-b px-6 py-4", isDark ? "border-white/10" : "border-slate-200")}>
            <div className="flex min-w-0 items-start gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition",
                      isDark
                        ? "border-white/8 text-zinc-400 hover:border-white/14 hover:bg-white/6 hover:text-zinc-200"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800",
                    )}
                    aria-label={isFullscreen ? messages.inspector.previewActions.restore : messages.inspector.previewActions.maximize}
                    onClick={() => setIsFullscreen((current) => !current)}
                  >
                    {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? messages.inspector.previewActions.restore : messages.inspector.previewActions.maximize}</TooltipContent>
              </Tooltip>
              <div className="min-w-0">
                <div className={cn("truncate text-sm font-semibold", isDark ? "text-white" : "text-slate-950")}>
                  {preview.name || preview.item?.name || messages.inspector.previewActions.previewTitle}
                </div>
                <div className={cn("truncate text-xs", isDark ? "text-zinc-400" : "text-slate-500")}>{displayPath}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {showPreviewFontSizeControls ? (
                <>
                  <div
                    className={cn(
                      "flex h-[34px] items-center gap-0.5 rounded-full border px-0.5",
                      isDark ? "border-white/8 bg-white/[0.045]" : "border-slate-200 bg-slate-50/90",
                    )}
                  >
                    {filePreviewFontSizeOptions.map((option) => {
                      const active = option.value === filePreviewFontSize;
                      const label = messages.chat.fontSizes?.[option.value] || option.value;
                      return (
                        <Tooltip key={option.value}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                active && "bg-muted text-foreground",
                              )}
                              aria-label={messages.inspector.previewActions.previewFontSizeOptionTooltip(label)}
                              onClick={() => setFilePreviewFontSize(option.value)}
                            >
                              <span className={cn("font-semibold leading-none", option.glyphClassName)}>A</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{messages.inspector.previewActions.previewFontSizeOptionTooltip(label)}</TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {canEditPreview ? (
                isEditing ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={handleRequestCancelEditing}
                      disabled={isSaving}
                    >
                      {messages.inspector.previewActions.cancelEdit}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1.5 px-3 text-xs"
                      aria-label={isSaving ? messages.inspector.previewActions.savingFile : messages.inspector.previewActions.saveFile}
                      onClick={() => handleSaveEditing({ stayInEditing: false })}
                      disabled={isSaving}
                    >
                      {isSaving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
                      <span>{isSaving ? messages.inspector.previewActions.savingFile : messages.inspector.previewActions.saveFile}</span>
                    </Button>
                  </>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-8 gap-1.5 px-3 text-xs",
                          isDark
                            ? "border-white/8 bg-white/[0.045] text-zinc-300 hover:border-white/12 hover:bg-white/8 hover:text-white"
                            : "border-slate-200 bg-slate-50/90 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-950",
                        )}
                        onClick={handleStartEditing}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {messages.inspector.previewActions.editFile}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{messages.theme.shortcutHint(editShortcutLabel)}</TooltipContent>
                  </Tooltip>
                )
              ) : null}
              <div
                className={cn(
                  "flex h-[34px] items-center overflow-hidden rounded-full border",
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
                onClick={handleRequestClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {showFilesSidebar ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
                <div
                  data-testid="file-preview-main-column"
                  className="relative z-0 flex min-h-0 min-w-0 w-full flex-col overflow-hidden"
                  style={{ contain: "layout inline-size paint" }}
                >
                  {mainBody}
                </div>
                <aside
                  data-testid="file-preview-files-sidebar"
                  className={cn(
                    "relative z-10 hidden min-h-0 min-w-0 w-[340px] shrink-0 border-l lg:flex lg:flex-col",
                    isDark ? "border-white/10 bg-[#13151a]" : "border-slate-200 bg-slate-50/70",
                  )}
                  aria-label={messages.inspector.tabs.files}
                >
                  <div className="min-h-0 flex flex-1 flex-col overflow-hidden px-4 py-3">
                    <InspectorFilesPanel
                      currentAgentId={currentAgentId}
                      currentSessionUser={currentSessionUser}
                      currentWorkspaceRoot={currentWorkspaceRoot}
                      fileSelectionMode="edit"
                      items={sessionFiles}
                      messages={messages}
                      onOpenEdit={(item) => onOpenFilePreview?.(item, { startInEditMode: true })}
                      onOpenPreview={onOpenFilePreview}
                      showHint={false}
                      workspaceCount={workspaceCount}
                      workspaceItems={workspaceFiles}
                      workspaceLoaded={workspaceLoaded}
                    />
                  </div>
                </aside>
              </div>
            </div>
          ) : mainBody}
        </div>
      </div>
      </div>
      {pendingLeaveAction ? (
        <>
          <div className="fixed inset-0 z-[140] bg-black/24" onClick={() => setPendingLeaveAction("")} />
          <div className="fixed inset-0 z-[141] flex items-center justify-center px-4">
            <Card
              role="alertdialog"
              aria-modal="true"
              aria-label={leaveDialogTitle}
              className={cn(
                "w-full max-w-md rounded-[1.5rem] border shadow-[0_18px_55px_rgba(15,23,42,0.18)]",
                isDark ? "border-white/10 bg-[#16181d]" : "border-slate-200 bg-white",
              )}
            >
              <CardContent className="px-5 py-4">
                <div className="space-y-2">
                  <div className={cn("text-base font-semibold", isDark ? "text-white" : "text-slate-950")}>
                    {leaveDialogTitle}
                  </div>
                  <div className={cn("text-sm leading-6", isDark ? "text-zinc-300" : "text-slate-600")}>
                    {messages.inspector.previewActions.unsavedChanges.description}
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPendingLeaveAction("")}>
                    {messages.inspector.previewActions.unsavedChanges.keepEditing}
                  </Button>
                  <Button type="button" size="sm" onClick={handleConfirmLeave}>
                    {leaveDialogConfirmLabel}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}
