import { Children, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import "katex/dist/katex.min.css";
import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import { Prism, usePrismLanguage } from "@/lib/prism-languages";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type TrackedFile = {
  fullPath?: string;
  path?: string;
};

type ImagePreviewValue = {
  alt?: string;
  path?: string;
  src: string;
};

type MarkdownRendererProps = {
  className?: string;
  content?: string;
  files?: TrackedFile[];
  headingScopeId?: string;
  onOpenFilePreview?: (file: TrackedFile) => void;
  onOpenImagePreview?: (image: ImagePreviewValue) => void;
  resolvedTheme?: string;
  shellClassName?: string;
  streaming?: boolean;
};

type MarkdownRenderProps = {
  children?: ReactNode;
  className?: string;
} & Record<string, unknown>;

type MarkdownHeadingOutlineItem = {
  id: string;
  level: number;
  text: string;
};

type MarkdownImageRendererProps = {
  alt?: string;
  src?: string;
};

type MarkdownLinkRendererProps = {
  children?: ReactNode;
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
} & Record<string, unknown>;

type MarkdownImageProps = {
  alt?: string;
  onOpenInlineImagePreview?: (image: ImagePreviewValue) => void;
  resolvedPath?: string;
  resolvedSrc?: string;
  scrollAnchorId?: string;
  streaming?: boolean;
};

const MarkdownReact = ReactMarkdown as any;
type MarkdownBlockTag = "blockquote" | "p";
type MarkdownHeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

const codeTheme = themes.dracula;
const homePrefix = "/Users/marila";
const trackedFileLinkButtonClassName =
  "file-link inline appearance-none border-0 bg-transparent p-0 text-left align-baseline font-inherit text-inherit leading-inherit";
const emptyMarkdownPluginState = Object.freeze({ remarkPlugins: [], rehypePlugins: [] });
type MarkdownPluginState = {
  rehypePlugins: unknown[];
  remarkPlugins: unknown[];
};

type OpenFenceState = {
  indent: string;
  markerChar: string;
  markerLength: number;
} | null;

let mermaidLibraryPromise: Promise<any> | null = null;
let remarkGfmLibraryPromise: Promise<any> | null = null;
let remarkMathLibraryPromise: Promise<any> | null = null;
let rehypeKatexLibraryPromise: Promise<any> | null = null;
const streamingMarkdownImageNodeCache = new Map<string, HTMLImageElement>();

function contentNeedsGfmPlugin(content = "") {
  const text = String(content || "");
  return (
    /(^|\n)\|.+\|/.test(text)
    || /(^|\n)\s*[-*]\s+\[[ xX]\]\s+/.test(text)
    || /~~[^~]+~~/.test(text)
    || /(^|[\s(])https?:\/\/\S+/i.test(text)
  );
}

function contentNeedsMathPlugin(content = "") {
  const text = String(content || "");
  return /\$\$[\s\S]+?\$\$/.test(text)
    || /\$(?!\s)([^$\n]+?)\$/.test(text)
    || /\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/.test(text);
}

async function loadMermaid() {
  if (!mermaidLibraryPromise) {
    mermaidLibraryPromise = import("mermaid").then((module) => module.default || module);
  }

  return mermaidLibraryPromise;
}

async function loadRemarkGfm() {
  if (!remarkGfmLibraryPromise) {
    remarkGfmLibraryPromise = import("remark-gfm").then((module) => module.default || module);
  }

  return remarkGfmLibraryPromise;
}

async function loadRemarkMath() {
  if (!remarkMathLibraryPromise) {
    remarkMathLibraryPromise = import("remark-math").then((module) => module.default || module);
  }

  return remarkMathLibraryPromise;
}

async function loadRehypeKatex() {
  if (!rehypeKatexLibraryPromise) {
    rehypeKatexLibraryPromise = import("rehype-katex").then((module) => module.default || module);
  }

  return rehypeKatexLibraryPromise;
}

function stabilizeMermaidTooltips() {
  if (typeof document === "undefined") {
    return;
  }

  document.querySelectorAll(".mermaidTooltip").forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    // Mermaid appends a global absolute tooltip node to <body>, which can add page-level overflow.
    node.style.position = "fixed";

    if (node.style.opacity === "0" && !node.style.top && !node.style.left) {
      node.style.top = "0px";
      node.style.left = "0px";
    }
  });
}

function encodeSvgDataUrl(svg = "") {
  if (!svg) {
    return "";
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getInlineCodeClassName(interactive = false) {
  return cn(
    "cc-inline-code inline border-0 align-baseline font-mono font-normal",
    interactive && "cc-inline-code-link cursor-pointer appearance-none text-left no-underline",
  );
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

function getPathBasename(filePath = "") {
  return String(filePath || "")
    .split("/")
    .filter(Boolean)
    .pop() || "";
}

function buildLocalFilePreviewUrl(filePath = "") {
  const normalizedPath = String(filePath || "").trim();
  return normalizedPath ? `/api/file-preview/content?path=${encodeURIComponent(normalizedPath)}` : "";
}

function normalizeFileToken(value = "") {
  return String(value || "")
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^\.\/+/, "")
    .replace(/\\/g, "/");
}

function resolveTrackedFile(token = "", files: TrackedFile[] = []) {
  const normalizedToken = normalizeFileToken(token);
  if (!normalizedToken) {
    return null;
  }

  const exactMatch = files.find((item) => {
    const displayPath = normalizeFileToken(item.path);
    const fullPath = normalizeFileToken(item.fullPath);
    const compactPath = normalizeFileToken(compactHomePath(item.fullPath || item.path));
    return normalizedToken === displayPath || normalizedToken === fullPath || normalizedToken === compactPath;
  });

  if (exactMatch) {
    return exactMatch;
  }

  const suffixMatches = files.filter((item) => {
    const displayPath = normalizeFileToken(item.path);
    const fullPath = normalizeFileToken(item.fullPath);
    const compactPath = normalizeFileToken(compactHomePath(item.fullPath || item.path));
    return [displayPath, fullPath, compactPath].some((candidate) => candidate && candidate.endsWith(`/${normalizedToken}`));
  });
  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  const basenameMatches = files.filter((item) => normalizedToken === getPathBasename(item.path || item.fullPath));
  return basenameMatches.length === 1 ? basenameMatches[0] : null;
}

function slugifyHeading(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function stripInlineMarkdown(value = "") {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

function extractHeadingOutline(content = ""): MarkdownHeadingOutlineItem[] {
  const seen = new Map<string, number>();
  return String(content || "")
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
      if (!match) {
        return null;
      }
      const text = stripInlineMarkdown(String(match[2] || "").replace(/\s+#+\s*$/, ""));
      if (!text) {
        return null;
      }
      const baseSlug = slugifyHeading(text);
      const currentCount = (seen.get(baseSlug) || 0) + 1;
      seen.set(baseSlug, currentCount);
      return {
        id: currentCount === 1 ? baseSlug : `${baseSlug}-${currentCount}`,
        level: String(match[1] || "").length,
        text,
      };
    })
    .filter((item): item is MarkdownHeadingOutlineItem => Boolean(item));
}

function promoteStandaloneImageLinks(content = "") {
  return String(content || "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp|svg)(\?\S+)?$/i.test(trimmed)) {
        return `![](${trimmed})`;
      }
      return line;
    })
    .join("\n");
}

function normalizeMathDelimiters(content = "") {
  return String(content || "")
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, expression) => `\n$$\n${String(expression || "").trim()}\n$$\n`)
    .replace(/\\\((.+?)\\\)/g, (_, expression) => `$${String(expression || "").trim()}$`);
}

function repairFencedCodeBlocks(content = "") {
  const lines = String(content || "").split("\n");
  const repaired: string[] = [];
  let openFence: OpenFenceState = null;

  for (const line of lines) {
    if (!openFence) {
      const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      if (match) {
        const indent = match[1] || "";
        const marker = match[2] || "";
        const rest = match[3] || "";
        const markerChar = marker[0] || "";
        if (markerChar !== "`" || !String(rest || "").includes("`")) {
          openFence = {
            indent,
            markerChar,
            markerLength: marker.length,
          };
        }
      }

      repaired.push(line);
      continue;
    }

    const closingPattern = new RegExp(`^ {0,3}${openFence.markerChar}{${openFence.markerLength},}\\s*$`);
    if (closingPattern.test(line)) {
      openFence = null;
      repaired.push(line);
      continue;
    }

    // Some model outputs accidentally end fenced blocks with two backticks.
    if (openFence.markerChar === "`") {
      const malformedCloseMatch = /^( {0,3})``\s*$/.exec(line);
      if (malformedCloseMatch) {
        repaired.push(`${malformedCloseMatch[1]}${"`".repeat(openFence.markerLength)}`);
        openFence = null;
        continue;
      }
    }

    repaired.push(line);
  }

  if (openFence) {
    repaired.push(`${openFence.indent}${openFence.markerChar.repeat(openFence.markerLength)}`);
  }

  return repaired.join("\n");
}

function resolveMarkdownImagePath(src = "", files: TrackedFile[] = []) {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) {
    return "";
  }

  if (/^file:\/\//i.test(normalizedSrc)) {
    try {
      const fileUrl = new URL(normalizedSrc);
      const filePath = decodeURIComponent(fileUrl.pathname || "");
      if (/^\/[A-Za-z]:\//.test(filePath)) {
        return filePath.slice(1);
      }
      if (fileUrl.host) {
        return `\\\\${fileUrl.host}${filePath.replace(/\//g, "\\")}`;
      }
      return filePath;
    } catch {}
  }

  if (/^\/(Users|tmp|private|var|home|mnt|opt|Volumes|Library)\b/.test(normalizedSrc) || /^[A-Za-z]:[\\/]/.test(normalizedSrc) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(normalizedSrc)) {
    return normalizedSrc;
  }

  if (normalizedSrc.startsWith("~/")) {
    return `${homePrefix}${normalizedSrc.slice(1)}`;
  }

  const matchedFile = resolveTrackedFile(normalizedSrc, files);
  const matchedPath = String(matchedFile?.fullPath || matchedFile?.path || "").trim();
  if (matchedPath) {
    return matchedPath;
  }

  return "";
}

function resolveMarkdownImageSource(src = "", files: TrackedFile[] = []) {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) {
    return "";
  }

  const resolvedPath = resolveMarkdownImagePath(normalizedSrc, files);
  if (resolvedPath) {
    return buildLocalFilePreviewUrl(resolvedPath);
  }

  return normalizedSrc;
}

function markdownUrlTransform(url = "") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) {
    return normalizedUrl;
  }

  if (/^file:\/\//i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  if (/^\/(Users|tmp|private|var|home|mnt|opt|Volumes|Library)\b/.test(normalizedUrl) || /^[A-Za-z]:[\\/]/.test(normalizedUrl) || /^\\\\[^\\/]+[\\/][^\\/]+/.test(normalizedUrl)) {
    return normalizedUrl;
  }

  return defaultUrlTransform(normalizedUrl);
}

function resolveScopedHashTarget(href = "", headingScopeId = "message") {
  const normalizedHref = String(href || "").trim();
  if (!normalizedHref.startsWith("#") || normalizedHref === "#") {
    return "";
  }

  let decodedTarget = normalizedHref.slice(1);
  try {
    decodedTarget = decodeURIComponent(decodedTarget);
  } catch {}

  if (!decodedTarget) {
    return "";
  }

  if (decodedTarget.startsWith(`${headingScopeId}-`)) {
    return decodedTarget;
  }

  const slug = slugifyHeading(decodedTarget);
  return slug ? `${headingScopeId}-${slug}` : "";
}

function findScrollableContainer(element) {
  let current = element?.parentElement || null;

  while (current) {
    if (current.hasAttribute("data-radix-scroll-area-viewport")) {
      return current;
    }

    if (typeof window !== "undefined") {
      const computedStyle = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll)/.test(computedStyle.overflowY || "")
        && current.scrollHeight > current.clientHeight;
      if (canScrollY) {
        return current;
      }
    }

    current = current.parentElement;
  }

  return null;
}

function flattenChildrenText(children: ReactNode) {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") {
        return String(child);
      }
      return "";
    })
    .join("")
    .trim();
}

function LinkRenderer({ href, children, files, headingScopeId, onOpenFilePreview, onClick, ...props }: MarkdownLinkRendererProps & {
  files: TrackedFile[];
  headingScopeId: string;
  onOpenFilePreview?: (file: TrackedFile) => void;
}) {
  const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
  const scopedHashTarget = resolveScopedHashTarget(href, headingScopeId);
  const matchedFile = resolveTrackedFile(href, files) || resolveTrackedFile(flattenChildrenText(children), files);
  const resolvedHref = matchedFile
    ? getVsCodeHref(matchedFile.fullPath || matchedFile.path)
    : scopedHashTarget
      ? `#${scopedHashTarget}`
      : href;

  if (matchedFile && onOpenFilePreview) {
    return (
      <button
        type="button"
        className={trackedFileLinkButtonClassName}
        onClick={() => onOpenFilePreview(matchedFile)}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      href={resolvedHref}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className="file-link"
        onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || !scopedHashTarget || typeof document === "undefined") {
          return;
        }
        const element = document.getElementById(scopedHashTarget);
        if (!element) {
          return;
        }
        event.preventDefault();
        const scrollContainer = findScrollableContainer(element);
        if (scrollContainer && typeof scrollContainer.scrollTo === "function") {
          const elementRect = element.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const targetTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - 12;
          scrollContainer.scrollTo({
            top: Math.max(targetTop, 0),
            behavior: "smooth",
          });
          return;
        }
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
          inline: "nearest",
        });
      }}
      {...props}
    >
      {children}
    </a>
  );
}

async function copyTextToClipboard(text = "") {
  const content = String(text || "");

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch {}
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return typeof document.execCommand === "function" ? document.execCommand("copy") : false;
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function CopyButton({ code, className = "" }: { code: string; className?: string }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    try {
      const didCopy = await copyTextToClipboard(code);
      if (!didCopy) {
        return;
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={handleCopy}
      className={cn(
        "relative z-10 inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 text-[9px] font-medium text-zinc-300 transition hover:border-white/15 hover:bg-white/10",
        className,
      )}
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? messages.markdown.copiedCodeShort : messages.markdown.copyCodeShort}
    </button>
  );
}

function CodeBlock({ code, language, scrollAnchorId = "" }: { code: string; language: string; scrollAnchorId?: string }) {
  const { messages } = useI18n();
  const normalizedLanguage = String(language || "text").toLowerCase();
  const aliasedLanguage = normalizedLanguage === "md" ? "markdown" : normalizedLanguage;
  const highlightedLanguage = usePrismLanguage(aliasedLanguage);
  const languageLabel = messages.markdown.languageLabels?.[aliasedLanguage]
    || aliasedLanguage
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join("-");

  return (
    <div data-scroll-anchor-id={scrollAnchorId || undefined} className="my-2 min-w-0 max-w-full overflow-hidden rounded-[5px] border border-zinc-700 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-800/90 px-2 py-1">
        <span className="text-[9px] font-medium tracking-[0.06em] text-zinc-100">
          {languageLabel}
        </span>
        <CopyButton code={code} />
      </div>
      <Highlight prism={Prism} theme={codeTheme} code={code} language={highlightedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="min-w-0 w-full max-w-full overflow-x-auto px-0 py-1.5 text-[12px] leading-5 text-zinc-50">
            {tokens.map((line, lineIndex) => (
              <div
                key={lineIndex}
                {...getLineProps({ line })}
                className="block min-h-5 min-w-max px-2.5 font-mono"
              >
                {line.map((token, tokenIndex) => (
                  <span key={tokenIndex} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

const MermaidBlock = memo(function MermaidBlock({
  code,
  resolvedTheme = "light",
  scrollAnchorId = "",
  onOpenImagePreview,
}: {
  code: string;
  onOpenImagePreview?: (image: ImagePreviewValue) => void;
  resolvedTheme?: string;
  scrollAnchorId?: string;
}) {
  const { messages } = useI18n();
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceId = useId();
  const isDarkTheme = resolvedTheme === "dark";
  const frameClassName = isDarkTheme
    ? "border-zinc-700 bg-zinc-900/80"
    : "border-zinc-200 bg-zinc-50/85";
  const headerClassName = isDarkTheme
    ? "border-white/10 bg-zinc-800/90 text-zinc-100"
    : "border-zinc-200 bg-zinc-100/90 text-zinc-700";
  const diagramBodyClassName = isDarkTheme
    ? "bg-zinc-950/30"
    : "bg-white/70";
  const copyButtonClassName = isDarkTheme
    ? ""
    : "border-transparent bg-transparent text-zinc-600 hover:border-transparent hover:bg-zinc-200/60 hover:text-zinc-900";

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
        });
        const renderId = `cc-mermaid-${instanceId.replace(/[:]/g, "")}`;
        const { svg: nextSvg, bindFunctions } = await mermaid.render(renderId, code);

        if (cancelled) {
          return;
        }

        setSvg(nextSvg);
        setFailed(false);
        stabilizeMermaidTooltips();

        window.requestAnimationFrame(() => {
          if (cancelled) {
            return;
          }
          bindFunctions?.(containerRef.current);
          stabilizeMermaidTooltips();
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("Failed to render Mermaid diagram.", error);
        setFailed(true);
        setSvg("");
      }
    };

    setSvg("");
    setFailed(false);
    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code, instanceId, resolvedTheme]);

  if (failed) {
    return <CodeBlock code={code} language="mermaid" scrollAnchorId={scrollAnchorId} />;
  }

  const handlePreviewDiagram = () => {
    if (!svg) {
      return;
    }

    onOpenImagePreview?.({
      src: encodeSvgDataUrl(svg),
      alt: messages.markdown.mermaidDiagramAlt,
    });
  };

  return (
    <div
      data-scroll-anchor-id={scrollAnchorId || undefined}
      className={cn("my-2 overflow-hidden rounded-[5px] border", frameClassName)}
    >
      <div className={cn("flex items-center justify-between border-b px-2 py-1", headerClassName)}>
        <span className="text-[9px] font-medium tracking-[0.06em]">
          Mermaid
        </span>
        <CopyButton code={code} className={copyButtonClassName} />
      </div>
      <button
        type="button"
        className={cn(
          "block w-full text-left transition",
          svg ? "cursor-zoom-in" : "cursor-default",
          isDarkTheme ? "hover:bg-white/5" : "hover:bg-zinc-100/70",
        )}
        aria-label={messages.markdown.previewMermaid}
        onClick={handlePreviewDiagram}
        disabled={!svg}
      >
        <div
          ref={containerRef}
          data-mermaid-diagram=""
          className={cn("overflow-x-auto px-3 py-3 [&_svg]:h-auto [&_svg]:max-w-full", diagramBodyClassName)}
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
      </button>
    </div>
  );
}, (previousProps, nextProps) => {
  return previousProps.code === nextProps.code
    && previousProps.resolvedTheme === nextProps.resolvedTheme
    && previousProps.scrollAnchorId === nextProps.scrollAnchorId
    && previousProps.onOpenImagePreview === nextProps.onOpenImagePreview;
});

function CodeRenderer({
  className,
  children,
  files,
  onOpenFilePreview,
  onOpenImagePreview,
  resolvedTheme = "light",
  scrollAnchorId = "",
  streaming = false,
  ...props
}: MarkdownRenderProps & {
  files: TrackedFile[];
  onOpenFilePreview?: (file: TrackedFile) => void;
  onOpenImagePreview?: (image: ImagePreviewValue) => void;
  resolvedTheme?: string;
  scrollAnchorId?: string;
  streaming?: boolean;
}) {
  const match = /language-([\w-]+)/.exec(className || "");
  const normalizedLanguage = String(match?.[1] || "text").toLowerCase();
  const code = String(children || "").replace(/\n$/, "");
  const isBlock = Boolean(match) || code.includes("\n");

  if (!isBlock) {
    const matchedFile = resolveTrackedFile(code, files);

    if (matchedFile) {
      if (onOpenFilePreview) {
        return (
          <button
            type="button"
            className={getInlineCodeClassName(true)}
            onClick={() => onOpenFilePreview(matchedFile)}
          >
            {children}
          </button>
        );
      }

      return (
        <a
          href={getVsCodeHref(matchedFile.fullPath || matchedFile.path)}
          className={getInlineCodeClassName(true)}
        >
          {children}
        </a>
      );
    }

    return (
      <code
        className={getInlineCodeClassName()}
        {...props}
      >
        {children}
      </code>
    );
  }

  if (normalizedLanguage === "mermaid" && !streaming) {
    return (
      <MermaidBlock
        code={code}
        resolvedTheme={resolvedTheme}
        scrollAnchorId={scrollAnchorId}
        onOpenImagePreview={onOpenImagePreview}
      />
    );
  }

  return <CodeBlock code={code} language={normalizedLanguage} scrollAnchorId={scrollAnchorId} />;
}

function TableRenderer({ children, scrollAnchorId = "" }: { children?: ReactNode; scrollAnchorId?: string }) {
  return (
    <div data-scroll-anchor-id={scrollAnchorId || undefined} className="my-2 min-w-0 max-w-full overflow-x-auto rounded-[5px] border border-border bg-background">
      <table className="my-0 w-full min-w-0 border-collapse">{children}</table>
    </div>
  );
}

const MarkdownImage = memo(function MarkdownImage({
  alt = "",
  resolvedSrc = "",
  resolvedPath = "",
  scrollAnchorId = "",
  streaming = false,
  onOpenInlineImagePreview,
}: MarkdownImageProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useLayoutEffect(() => {
    if (!streaming || !resolvedSrc || !containerRef.current || typeof document === "undefined") {
      return undefined;
    }

    const cacheKey = `${resolvedSrc}::${alt || ""}`;
    let imageNode = streamingMarkdownImageNodeCache.get(cacheKey);
    if (!imageNode) {
      imageNode = document.createElement("img");
      imageNode.src = resolvedSrc;
      imageNode.alt = alt || "";
      imageNode.className = "block max-h-[28rem] w-auto max-w-full object-contain";
      imageNode.loading = "eager";
      imageNode.decoding = "async";
      streamingMarkdownImageNodeCache.set(cacheKey, imageNode);
    } else {
      imageNode.alt = alt || "";
      imageNode.className = "block max-h-[28rem] w-auto max-w-full object-contain";
    }

    const container = containerRef.current;
    container.replaceChildren(imageNode);

    return () => {
      if (container.contains(imageNode)) {
        container.removeChild(imageNode);
      }
    };
  }, [alt, resolvedSrc, streaming]);

  return (
    <button
      type="button"
      data-scroll-anchor-id={scrollAnchorId || undefined}
      className="my-2 block overflow-hidden rounded-md border border-border/70 bg-background/40"
      onClick={() => {
        onOpenInlineImagePreview?.({
          src: resolvedSrc,
          alt: alt || "",
          path: resolvedPath,
        });
      }}
    >
      {streaming ? (
        <span ref={containerRef} className="block max-h-[28rem] w-fit max-w-full" />
      ) : (
        <img
          src={resolvedSrc}
          alt={alt || ""}
          className="block max-h-[28rem] w-auto max-w-full object-contain"
          loading="eager"
          decoding="async"
        />
      )}
    </button>
  );
});

export default function MarkdownRenderer({
  content,
  files,
  headingScopeId = "message",
  resolvedTheme = "light",
  streaming = false,
  className,
  shellClassName,
  onOpenFilePreview,
  onOpenImagePreview,
}: MarkdownRendererProps) {
  const { messages } = useI18n();
  const [previewImage, setPreviewImage] = useState<ImagePreviewValue | null>(null);
  const normalizedContent = useMemo(
    () => repairFencedCodeBlocks(normalizeMathDelimiters(promoteStandaloneImageLinks(content))),
    [content],
  );
  const shouldLoadGfmPlugin = useMemo(() => contentNeedsGfmPlugin(normalizedContent), [normalizedContent]);
  const shouldLoadMathPlugin = useMemo(() => contentNeedsMathPlugin(normalizedContent), [normalizedContent]);
  const [pluginState, setPluginState] = useState<MarkdownPluginState>(emptyMarkdownPluginState);
  const outlineItems = useMemo<MarkdownHeadingOutlineItem[]>(
    () => extractHeadingOutline(normalizedContent),
    [normalizedContent],
  );
  const headingRenderIndexRef = useRef(0);
  const blockRenderIndexRef = useRef(0);
  headingRenderIndexRef.current = 0;
  blockRenderIndexRef.current = 0;

  useEffect(() => {
    let cancelled = false;

    if (!shouldLoadGfmPlugin && !shouldLoadMathPlugin) {
      setPluginState((current) => (
        current.remarkPlugins.length || current.rehypePlugins.length ? emptyMarkdownPluginState : current
      ));
      return undefined;
    }

    const loadPlugins = async () => {
      const remarkPlugins: unknown[] = [];
      const rehypePlugins: unknown[] = [];

      if (shouldLoadGfmPlugin) {
        remarkPlugins.push(await loadRemarkGfm());
      }

      if (shouldLoadMathPlugin) {
        const [remarkMathPlugin, rehypeKatexPlugin] = await Promise.all([
          loadRemarkMath(),
          loadRehypeKatex(),
        ]);
        remarkPlugins.push(remarkMathPlugin);
        rehypePlugins.push(rehypeKatexPlugin);
      }

      if (!cancelled) {
        setPluginState({ remarkPlugins, rehypePlugins });
      }
    };

    void loadPlugins();

    return () => {
      cancelled = true;
    };
  }, [shouldLoadGfmPlugin, shouldLoadMathPlugin]);

  useEffect(() => {
    if (!previewImage?.src) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setPreviewImage(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  const handleOpenInlineImagePreview = useCallback((image: ImagePreviewValue) => {
    if (onOpenImagePreview) {
      onOpenImagePreview(image);
      return;
    }

    setPreviewImage(image);
  }, [onOpenImagePreview]);

  const nextScrollAnchorId = useCallback(() => `${headingScopeId}-block-${blockRenderIndexRef.current++}`, [headingScopeId]);

  const renderBlock = useCallback((Tag: MarkdownBlockTag, classNameValue = "") => ({ children, className: blockClassName, ...props }: MarkdownRenderProps) => (
    <Tag
      data-scroll-anchor-id={nextScrollAnchorId()}
      className={cn(classNameValue, blockClassName)}
      {...props}
    >
      {children}
    </Tag>
  ), [nextScrollAnchorId]);

  const renderList = useCallback((ordered = false) => ({ children, className: blockClassName, ...props }: MarkdownRenderProps) => {
    const isTaskList = String(blockClassName || "").includes("contains-task-list");
    const Tag = ordered ? "ol" : "ul";

    return (
      <Tag
        data-scroll-anchor-id={nextScrollAnchorId()}
        className={cn(
          "my-1.5",
          ordered ? "list-decimal pl-5" : isTaskList ? "list-none pl-0" : "list-disc pl-5",
          "[&:last-child]:mb-0",
          blockClassName,
        )}
        {...props}
      >
        {children}
      </Tag>
    );
  }, [nextScrollAnchorId]);

  const renderListItem = useCallback(({ children, className: blockClassName, ...props }: MarkdownRenderProps) => {
    const isTaskItem = String(blockClassName || "").includes("task-list-item");

    return (
      <li
        data-scroll-anchor-id={nextScrollAnchorId()}
        className={cn(
          "leading-5",
          isTaskItem ? "ml-0 flex items-start gap-2" : "",
          blockClassName,
        )}
        {...props}
      >
        {children}
      </li>
    );
  }, [nextScrollAnchorId]);

  const renderHeading = useCallback((Tag: MarkdownHeadingTag) => ({ children, ...props }: MarkdownRenderProps) => {
    const current = outlineItems[headingRenderIndexRef.current++];
    const anchorId = current?.id ? `${headingScopeId}-${current.id}` : undefined;
    return (
      <Tag id={anchorId} data-heading-anchor={anchorId} data-scroll-anchor-id={nextScrollAnchorId()} className="scroll-mt-3" {...props}>
        {children}
      </Tag>
    );
  }, [headingScopeId, nextScrollAnchorId, outlineItems]);

  const renderImage = useCallback(({ alt, src = "" }: MarkdownImageRendererProps) => {
    const trackedFiles = files || [];
    const resolvedSrc = resolveMarkdownImageSource(src, trackedFiles);
    const resolvedPath = resolveMarkdownImagePath(src, trackedFiles);
    return (
        <MarkdownImage
          alt={alt || ""}
          resolvedSrc={resolvedSrc}
          resolvedPath={resolvedPath}
          scrollAnchorId={nextScrollAnchorId()}
          streaming={streaming}
          onOpenInlineImagePreview={handleOpenInlineImagePreview}
        />
      );
  }, [files, handleOpenInlineImagePreview, nextScrollAnchorId, streaming]);

  const paragraphRenderer = useMemo(() => renderBlock("p"), [renderBlock]);
  const blockquoteRenderer = useMemo(() => renderBlock("blockquote"), [renderBlock]);
  const orderedListRenderer = useMemo(() => renderList(true), [renderList]);
  const unorderedListRenderer = useMemo(() => renderList(false), [renderList]);
  const heading1Renderer = useMemo(() => renderHeading("h1"), [renderHeading]);
  const heading2Renderer = useMemo(() => renderHeading("h2"), [renderHeading]);
  const heading3Renderer = useMemo(() => renderHeading("h3"), [renderHeading]);
  const heading4Renderer = useMemo(() => renderHeading("h4"), [renderHeading]);
  const heading5Renderer = useMemo(() => renderHeading("h5"), [renderHeading]);
  const heading6Renderer = useMemo(() => renderHeading("h6"), [renderHeading]);
  const codeRenderer = useCallback((props: MarkdownRenderProps) => (
    <CodeRenderer
      {...props}
      files={files || []}
      resolvedTheme={resolvedTheme}
      streaming={streaming}
      onOpenFilePreview={onOpenFilePreview}
      onOpenImagePreview={handleOpenInlineImagePreview}
      scrollAnchorId={nextScrollAnchorId()}
    />
  ), [files, handleOpenInlineImagePreview, nextScrollAnchorId, onOpenFilePreview, resolvedTheme, streaming]);
  const linkRenderer = useCallback((props: MarkdownLinkRendererProps) => (
    <LinkRenderer {...props} files={files || []} headingScopeId={headingScopeId} onOpenFilePreview={onOpenFilePreview} />
  ), [files, headingScopeId, onOpenFilePreview]);
  const tableRenderer = useCallback((props: MarkdownRenderProps) => <TableRenderer {...props} scrollAnchorId={nextScrollAnchorId()} />, [nextScrollAnchorId]);
  const inputRenderer = useCallback(({ className: inputClassName, type, ...props }: { className?: string; type?: string } & Record<string, unknown>) => (
    <input
      type={type}
      className={cn(
        type === "checkbox" ? "mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary" : "",
        inputClassName,
      )}
      {...props}
    />
  ), []);

  const markdownComponents = useMemo(() => ({
    a: linkRenderer,
    blockquote: blockquoteRenderer,
    code: codeRenderer,
    input: inputRenderer,
    li: renderListItem,
    ol: orderedListRenderer,
    p: paragraphRenderer,
    table: tableRenderer,
    img: renderImage,
    h1: heading1Renderer,
    h2: heading2Renderer,
    h3: heading3Renderer,
    h4: heading4Renderer,
    h5: heading5Renderer,
    h6: heading6Renderer,
    ul: unorderedListRenderer,
  }), [
    blockquoteRenderer,
    codeRenderer,
    heading1Renderer,
    heading2Renderer,
    heading3Renderer,
    heading4Renderer,
    heading5Renderer,
    heading6Renderer,
    inputRenderer,
    linkRenderer,
    orderedListRenderer,
    paragraphRenderer,
    renderImage,
    renderListItem,
    tableRenderer,
    unorderedListRenderer,
  ]);

  return (
    <>
      <div className={cn("min-w-0 max-w-full", shellClassName, className)}>
        <MarkdownReact
          remarkPlugins={pluginState.remarkPlugins}
          rehypePlugins={pluginState.rehypePlugins}
          urlTransform={markdownUrlTransform}
          components={markdownComponents}
        >
          {normalizedContent}
        </MarkdownReact>
      </div>
      {previewImage?.src ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-6" onClick={() => setPreviewImage(null)}>
          <button
            type="button"
            className="absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
            aria-label={messages.common.closePreview}
            onClick={() => setPreviewImage(null)}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={previewImage.src}
            alt={previewImage.alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}

export function clearMarkdownImageCache() {
  streamingMarkdownImageNodeCache.clear();
}
