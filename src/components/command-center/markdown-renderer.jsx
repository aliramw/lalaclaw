import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const codeTheme = themes.vsDark;
const homePrefix = "/Users/marila";

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

function LinkRenderer({ href, children, ...props }) {
  const isExternal = typeof href === "string" && /^https?:\/\//i.test(href);

  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
      className="file-link"
      {...props}
    >
      {children}
    </a>
  );
}

function CopyButton({ code }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-5 cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 text-[9px] font-medium text-zinc-300 transition hover:bg-white/10"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? messages.markdown.copiedCodeShort : messages.markdown.copyCodeShort}
    </button>
  );
}

function CodeBlock({ code, language }) {
  const normalizedLanguage = String(language || "text").toLowerCase();
  const languageLabel = normalizedLanguage
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("-");

  return (
    <div className="my-2 overflow-hidden rounded-[5px] border border-zinc-700 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-800/90 px-2 py-1">
        <span className="text-[9px] font-medium tracking-[0.06em] text-zinc-100">
          {languageLabel}
        </span>
        <CopyButton code={code} />
      </div>
      <Highlight theme={codeTheme} code={code} language={normalizedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto px-0 py-1.5 text-[12px] leading-5">
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

function CodeRenderer({ className, children, files, ...props }) {
  const match = /language-([\w-]+)/.exec(className || "");
  const code = String(children || "").replace(/\n$/, "");
  const isBlock = Boolean(match) || code.includes("\n");

  if (!isBlock) {
    const matchedFile = resolveTrackedFile(code, files);

    if (matchedFile) {
      return (
        <a
          href={getVsCodeHref(matchedFile.fullPath || matchedFile.path)}
          title={matchedFile.fullPath || matchedFile.path}
          className="cc-inline-code cc-inline-code-link inline cursor-pointer rounded-[5px] border px-1.5 py-0.5 font-mono text-[0.9em] no-underline"
        >
          {children}
        </a>
      );
    }

    return (
      <code
        className="cc-inline-code rounded-[5px] border px-1.5 py-0.5 font-mono text-[0.9em]"
        {...props}
      >
        {children}
      </code>
    );
  }

  return <CodeBlock code={code} language={match?.[1] || "text"} />;
}

function TableRenderer({ children }) {
  return (
    <div className="my-2 overflow-hidden rounded-[5px] border border-border bg-background">
      <table className="my-0 w-full border-collapse">{children}</table>
    </div>
  );
}

export default function MarkdownRenderer({ content, files, headingScopeId = "message", className, shellClassName }) {
  const { messages } = useI18n();
  const [previewImage, setPreviewImage] = useState(null);
  const normalizedContent = promoteStandaloneImageLinks(content);
  const outlineItems = extractHeadingOutline(normalizedContent);
  let headingRenderIndex = 0;

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

  const renderHeading = (Tag) => ({ children, ...props }) => {
    const current = outlineItems[headingRenderIndex++];
    const anchorId = current?.id ? `${headingScopeId}-${current.id}` : undefined;
    return (
      <Tag id={anchorId} data-heading-anchor={anchorId} className="scroll-mt-3" {...props}>
        {children}
      </Tag>
    );
  };

  return (
    <>
      <div className={cn(shellClassName, className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: LinkRenderer,
            code: (props) => <CodeRenderer {...props} files={files} />,
            table: TableRenderer,
            img: ({ alt, src = "" }) => (
              <button
                type="button"
                className="my-2 block overflow-hidden rounded-md border border-border/70 bg-background/60"
                onClick={() => setPreviewImage({ src, alt: alt || "" })}
              >
                <img src={src} alt={alt || ""} className="h-[400px] w-[400px] max-w-full object-cover" loading="lazy" />
              </button>
            ),
            h1: renderHeading("h1"),
            h2: renderHeading("h2"),
            h3: renderHeading("h3"),
            h4: renderHeading("h4"),
            h5: renderHeading("h5"),
            h6: renderHeading("h6"),
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
