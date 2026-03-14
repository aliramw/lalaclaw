import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const codeTheme = themes.vsDark;

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
      className="inline-flex h-5 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 text-[9px] font-medium text-zinc-300 transition hover:bg-white/10"
      aria-label={copied ? "代码已复制" : "复制代码"}
    >
      {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
      {copied ? "已复制" : "复制"}
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

function CodeRenderer({ className, children, ...props }) {
  const match = /language-([\w-]+)/.exec(className || "");
  const code = String(children || "").replace(/\n$/, "");
  const isBlock = Boolean(match) || code.includes("\n");

  if (!isBlock) {
    return (
      <code
        className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[0.9em]"
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

export default function MarkdownRenderer({ content, className, shellClassName }) {
  return (
    <div className={cn(shellClassName, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: LinkRenderer,
          code: CodeRenderer,
          table: TableRenderer,
        }}
      >
        {String(content || "")}
      </ReactMarkdown>
    </div>
  );
}
