import { Children, useEffect, useMemo, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { Prism } from "@/lib/prism-languages";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const codeTheme = themes.dracula;
const homePrefix = "/Users/marila";
const trackedFileLinkButtonClassName =
  "file-link inline appearance-none border-0 bg-transparent p-0 text-left align-baseline font-inherit text-inherit leading-inherit";

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

function normalizeFileToken(value = "") {
  return String(value || "")
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^\.\/+/, "")
    .replace(/\\/g, "/");
}

function resolveTrackedFile(token, files = []) {
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

function extractHeadingOutline(content = "") {
  const seen = new Map();
  return String(content || "")
    .split("\n")
    .map((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
      if (!match) {
        return null;
      }
      const text = stripInlineMarkdown(match[2].replace(/\s+#+\s*$/, ""));
      if (!text) {
        return null;
      }
      const baseSlug = slugifyHeading(text);
      const currentCount = (seen.get(baseSlug) || 0) + 1;
      seen.set(baseSlug, currentCount);
      return {
        id: currentCount === 1 ? baseSlug : `${baseSlug}-${currentCount}`,
        level: match[1].length,
        text,
      };
    })
    .filter(Boolean);
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
  const repaired = [];
  let openFence = null;

  for (const line of lines) {
    if (!openFence) {
      const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      if (match) {
        const [, indent, marker, rest] = match;
        const markerChar = marker[0];
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

function resolveMarkdownImageSource(src = "") {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) {
    return "";
  }

  if (/^file:\/\//i.test(normalizedSrc)) {
    try {
      const fileUrl = new URL(normalizedSrc);
      const filePath = decodeURIComponent(fileUrl.pathname || "");
      const normalizedPath = /^\/[A-Za-z]:\//.test(filePath) ? filePath.slice(1) : filePath;
      if (normalizedPath) {
        return `/api/file-preview/content?path=${encodeURIComponent(normalizedPath)}`;
      }
    } catch {}
  }

  if (/^\/(Users|tmp|private|var|home|mnt|opt|Volumes|Library)\b/.test(normalizedSrc)) {
    return `/api/file-preview/content?path=${encodeURIComponent(normalizedSrc)}`;
  }

  return normalizedSrc;
}

function resolveMarkdownImagePath(src = "") {
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) {
    return "";
  }

  if (/^file:\/\//i.test(normalizedSrc)) {
    try {
      const fileUrl = new URL(normalizedSrc);
      const filePath = decodeURIComponent(fileUrl.pathname || "");
      return /^\/[A-Za-z]:\//.test(filePath) ? filePath.slice(1) : filePath;
    } catch {
      return "";
    }
  }

  if (/^\/(Users|tmp|private|var|home|mnt|opt|Volumes|Library)\b/.test(normalizedSrc)) {
    return normalizedSrc;
  }

  return "";
}

function markdownUrlTransform(url = "") {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) {
    return normalizedUrl;
  }

  if (/^file:\/\//i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  if (/^\/(Users|tmp|private|var|home|mnt|opt|Volumes|Library)\b/.test(normalizedUrl)) {
    return normalizedUrl;
  }

  return defaultUrlTransform(normalizedUrl);
}

function flattenChildrenText(children) {
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

function LinkRenderer({ href, children, files, onOpenFilePreview, ...props }) {
  const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);
  const matchedFile = resolveTrackedFile(href, files) || resolveTrackedFile(flattenChildrenText(children), files);

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
      href={matchedFile ? getVsCodeHref(matchedFile.fullPath || matchedFile.path) : href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className="file-link"
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

function CopyButton({ code }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event) => {
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
      className="relative z-10 inline-flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 text-[9px] font-medium text-zinc-300 transition hover:border-white/15 hover:bg-white/10"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? messages.markdown.copiedCodeShort : messages.markdown.copyCodeShort}
    </button>
  );
}

function CodeBlock({ code, language, scrollAnchorId = "" }) {
  const normalizedLanguage = String(language || "text").toLowerCase();
  const languageLabel = normalizedLanguage
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("-");

  return (
    <div data-scroll-anchor-id={scrollAnchorId || undefined} className="my-2 overflow-hidden rounded-[5px] border border-zinc-700 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-800/90 px-2 py-1">
        <span className="text-[9px] font-medium tracking-[0.06em] text-zinc-100">
          {languageLabel}
        </span>
        <CopyButton code={code} />
      </div>
      <Highlight prism={Prism} theme={codeTheme} code={code} language={normalizedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto px-0 py-1.5 text-[12px] leading-5 text-zinc-50">
            {tokens.map((line, lineIndex) => (
              <div
                key={lineIndex}
                {...getLineProps({ line })}
                className="min-h-5 px-2.5 font-mono"
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

function CodeRenderer({ className, children, files, onOpenFilePreview, scrollAnchorId = "", ...props }) {
  const match = /language-([\w-]+)/.exec(className || "");
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

  return <CodeBlock code={code} language={match?.[1] || "text"} scrollAnchorId={scrollAnchorId} />;
}

function TableRenderer({ children, scrollAnchorId = "" }) {
  return (
    <div data-scroll-anchor-id={scrollAnchorId || undefined} className="my-2 overflow-hidden rounded-[5px] border border-border bg-background">
      <table className="my-0 w-full border-collapse">{children}</table>
    </div>
  );
}

export default function MarkdownRenderer({ content, files, headingScopeId = "message", resolvedTheme = "light", className, shellClassName, onOpenFilePreview, onOpenImagePreview }) {
  const { messages } = useI18n();
  const [previewImage, setPreviewImage] = useState(null);
  const normalizedContent = useMemo(
    () => repairFencedCodeBlocks(normalizeMathDelimiters(promoteStandaloneImageLinks(content))),
    [content],
  );
  const outlineItems = useMemo(
    () => extractHeadingOutline(normalizedContent),
    [normalizedContent],
  );
  let headingRenderIndex = 0;
  let blockRenderIndex = 0;

  useEffect(() => {
    if (!previewImage?.src) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setPreviewImage(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewImage]);

  const nextScrollAnchorId = () => `${headingScopeId}-block-${blockRenderIndex++}`;

  const renderBlock = (Tag, classNameValue = "") => ({ children, className: blockClassName, ...props }) => (
    <Tag
      data-scroll-anchor-id={nextScrollAnchorId()}
      className={cn(classNameValue, blockClassName)}
      {...props}
    >
      {children}
    </Tag>
  );

  const renderHeading = (Tag) => ({ children, ...props }) => {
    const current = outlineItems[headingRenderIndex++];
    const anchorId = current?.id ? `${headingScopeId}-${current.id}` : undefined;
    return (
      <Tag id={anchorId} data-heading-anchor={anchorId} data-scroll-anchor-id={nextScrollAnchorId()} className="scroll-mt-3" {...props}>
        {children}
      </Tag>
    );
  };

  return (
    <>
      <div className={cn(shellClassName, className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          urlTransform={markdownUrlTransform}
          components={{
            a: (props) => <LinkRenderer {...props} files={files} onOpenFilePreview={onOpenFilePreview} />,
            blockquote: renderBlock("blockquote"),
            code: (props) => (
              <CodeRenderer
                {...props}
                files={files}
                resolvedTheme={resolvedTheme}
                onOpenFilePreview={onOpenFilePreview}
                scrollAnchorId={nextScrollAnchorId()}
              />
            ),
            li: renderBlock("li"),
            ol: renderBlock("ol"),
            p: renderBlock("p"),
            table: (props) => <TableRenderer {...props} scrollAnchorId={nextScrollAnchorId()} />,
            img: ({ alt, src = "" }) => {
              const resolvedSrc = resolveMarkdownImageSource(src);
              const resolvedPath = resolveMarkdownImagePath(src);
              return (
                <button
                  type="button"
                  data-scroll-anchor-id={nextScrollAnchorId()}
                  className="my-2 block overflow-hidden rounded-md border border-border/70 bg-background/40"
                  onClick={() => {
                    if (onOpenImagePreview) {
                      onOpenImagePreview({
                        src: resolvedSrc,
                        alt: alt || "",
                        path: resolvedPath,
                      });
                      return;
                    }
                    setPreviewImage({ src: resolvedSrc, alt: alt || "" });
                  }}
                >
                  <img
                    src={resolvedSrc}
                    alt={alt || ""}
                    className="block max-h-[28rem] w-auto max-w-full object-contain"
                    loading="eager"
                    decoding="async"
                  />
                </button>
              );
            },
            h1: renderHeading("h1"),
            h2: renderHeading("h2"),
            h3: renderHeading("h3"),
            h4: renderHeading("h4"),
            h5: renderHeading("h5"),
            h6: renderHeading("h6"),
            ul: renderBlock("ul"),
          }}
        >
          {normalizedContent}
        </ReactMarkdown>
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
