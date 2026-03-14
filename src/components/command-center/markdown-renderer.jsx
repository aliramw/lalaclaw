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
      className="inline-flex h-6 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 text-[10px] font-medium text-zinc-300 transition hover:bg-white/10"
      aria-label={copied ? "代码已复制" : "复制代码"}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function CodeBlock({ code, language }) {
  const normalizedLanguage = String(language || "text").toLowerCase();

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-white/10 bg-zinc-800/90 px-2.5 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {normalizedLanguage}
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

function CodeRenderer({ inline, className, children, ...props }) {
  const match = /language-([\w-]+)/.exec(className || "");
  const code = String(children || "").replace(/\n$/, "");

  if (inline) {
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

export default function MarkdownRenderer({ content, className, shellClassName }) {
  return (
    <div className={cn(shellClassName, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: LinkRenderer,
          code: CodeRenderer,
        }}
      >
        {String(content || "")}
      </ReactMarkdown>
    </div>
  );
}
