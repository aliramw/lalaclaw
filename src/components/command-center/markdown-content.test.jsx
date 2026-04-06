import { StrictMode, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "@/components/command-center/markdown-content";
import { contentNeedsMarkdownRenderer } from "@/components/command-center/markdown-content-utils";

const mermaidInitializeMock = vi.fn();
const mermaidRenderMock = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

describe("MarkdownContent", () => {
  it("keeps plain chat text on the lightweight rendering path", () => {
    expect(contentNeedsMarkdownRenderer("今晚帮我看一下这个问题。")).toBe(false);
    expect(contentNeedsMarkdownRenderer("第一行\n第二行")).toBe(false);
  });

  it("routes markdown-heavy content to the rich renderer path", () => {
    expect(contentNeedsMarkdownRenderer("# 控制台")).toBe(true);
    expect(contentNeedsMarkdownRenderer("访问 https://openai.com")).toBe(true);
    expect(contentNeedsMarkdownRenderer("```js\nconst answer = 42;\n```")).toBe(true);
    expect(contentNeedsMarkdownRenderer("收到，**3** 也正常。")).toBe(true);
    expect(contentNeedsMarkdownRenderer("结论：**收发正常**。")).toBe(true);
  });

  it("renders plain chat text without markdown transforms", () => {
    const { container } = render(<MarkdownContent content={"第一行\n第二行"} />);

    const text = container.querySelector(".whitespace-pre-wrap.break-all");
    expect(text?.textContent).toBe("第一行\n第二行");
    expect(text).toHaveClass("min-w-0", "max-w-full", "whitespace-pre-wrap", "break-all");
    expect(document.querySelector("h1, h2, h3, pre, code, a")).toBeNull();
  });

  it("does not add horizontal padding to annotation highlights, so highlighted text does not shift sideways", () => {
    const { container } = render(
      <MarkdownContent
        content={"第一行\n第二行"}
        highlightRanges={[{ start: 4, end: 7, tone: "selection" }]}
      />,
    );

    const highlight = container.querySelector("mark[data-markdown-annotation-highlight='true']");
    expect(highlight).toBeTruthy();
    expect(highlight).not.toHaveClass("px-px");
  });

  it("scales markdown shell line height with the selected chat font size", () => {
    const { container, rerender } = render(<MarkdownContent fontSize="small" content={"第一行\n第二行"} />);

    expect(container.firstChild).toHaveClass("text-[11px]", "leading-[1.15rem]", "[&_li]:leading-[1.15rem]");

    rerender(<MarkdownContent fontSize="large" content={"第一行\n第二行"} />);

    expect(container.firstChild).toHaveClass("text-[14px]", "leading-6", "[&_li]:leading-6");
  });

  it("allows long markdown tokens to wrap anywhere instead of forcing the shell wider", () => {
    const { container } = render(<MarkdownContent content={"- 1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz"} />);

    expect(container.firstChild).toHaveClass("min-w-0", "max-w-full", "break-words");
    expect(container.firstChild.className).toContain("overflow-wrap:anywhere");
  });

  it("renders headings, links, and inline code", async () => {
    render(<MarkdownContent content={`# 控制台\n\n访问 [OpenAI](https://openai.com)\n\n使用 \`npm test\``} />);

    expect(await screen.findByRole("heading", { name: "控制台" }, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "OpenAI" }, { timeout: 4000 })).toHaveAttribute("href", "https://openai.com");
    const inlineCode = await screen.findByText("npm test");
    expect(inlineCode.tagName).toBe("CODE");
    expect(inlineCode).toHaveClass("cc-inline-code", "border-0", "align-baseline", "font-mono");
  });

  it("renders inline bold markdown inside normal chat prose", async () => {
    render(<MarkdownContent content={"收到，**3** 也正常。\n\n结论：**收发正常**。"} />);

    const strongValues = await screen.findAllByText((_, element) => element?.tagName === "STRONG");
    expect(strongValues).toHaveLength(2);
    expect(strongValues[0]).toHaveTextContent("3");
    expect(strongValues[1]).toHaveTextContent("收发正常");
  });

  it("renders fenced code blocks and supports copying", async () => {
    const { container } = render(<MarkdownContent content={"```js\nconst answer = 42;\n```"} />);

    expect(await screen.findByText(/js/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector("pre pre")?.textContent).toBe("const answer = 42;");
    });

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "复制代码" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "代码已复制" })).toBeInTheDocument();
    });
  });

  it("renders md fenced code block titles as Markdown", async () => {
    const { container } = render(<MarkdownContent content={"```md\n# Title\n```"} />);

    expect(await screen.findByText("Markdown")).toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector("pre pre")?.textContent).toBe("# Title");
    });
  });

  it("renders mermaid fenced blocks as diagrams", async () => {
    mermaidInitializeMock.mockReset();
    mermaidRenderMock.mockReset();
    mermaidRenderMock.mockResolvedValue({
      svg: "<svg><text>Flow</text></svg>",
      bindFunctions: vi.fn(),
    });

    const { container } = render(<MarkdownContent content={"```mermaid\ngraph TD\nA-->B\n```"} />);

    await waitFor(() => {
      expect(mermaidInitializeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "default",
        }),
      );
    });
    expect(mermaidRenderMock).toHaveBeenCalledWith(expect.stringMatching(/^cc-mermaid-/), "graph TD\nA-->B");
    expect(container.querySelector("[data-mermaid-diagram] svg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "复制代码" })).toBeInTheDocument();
  });

  it("stabilizes Mermaid tooltip nodes so they do not create page-level overflow", async () => {
    mermaidInitializeMock.mockReset();
    mermaidRenderMock.mockReset();
    mermaidRenderMock.mockResolvedValue({
      svg: "<svg><text>Tooltip</text></svg>",
      bindFunctions: () => {
        const tooltip = document.createElement("div");
        tooltip.className = "mermaidTooltip";
        tooltip.style.opacity = "0";
        tooltip.style.position = "absolute";
        document.body.appendChild(tooltip);
      },
    });

    render(<MarkdownContent content={"```mermaid\ngraph TD\nA-->B\n```"} />);

    await waitFor(() => {
      const tooltip = document.querySelector(".mermaidTooltip");
      expect(tooltip).toBeTruthy();
      expect(tooltip.style.position).toBe("fixed");
      expect(tooltip.style.top).toBe("0px");
      expect(tooltip.style.left).toBe("0px");
    });
  });

  it("keeps mermaid fenced blocks as plain code while content is still streaming", async () => {
    mermaidInitializeMock.mockReset();
    mermaidRenderMock.mockReset();

    const { container } = render(<MarkdownContent streaming content={"```mermaid\ngraph TD\nA-->"} />);

    await waitFor(() => {
      expect(container.querySelector("pre pre")?.textContent).toContain("graph TD");
      expect(container.querySelector("pre pre")?.textContent).toContain("A-->");
    });
    expect(mermaidInitializeMock).not.toHaveBeenCalled();
    expect(mermaidRenderMock).not.toHaveBeenCalled();
    expect(container.querySelector("[data-mermaid-diagram]")).toBeNull();
  });

  it("keeps rendered mermaid diagrams stable across unrelated parent rerenders", async () => {
    mermaidInitializeMock.mockReset();
    mermaidRenderMock.mockReset();
    mermaidRenderMock.mockResolvedValue({
      svg: "<svg><text>Stable</text></svg>",
      bindFunctions: vi.fn(),
    });

    function Harness() {
      const [count, setCount] = useState(0);

      return (
        <div>
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            rerender
          </button>
          <span>{count}</span>
          <MarkdownContent content={"```mermaid\ngraph TD\nA-->B\n```"} />
        </div>
      );
    }

    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-diagram] svg")).toBeTruthy();
    });

    const initialSvgNode = container.querySelector("[data-mermaid-diagram] svg");
    expect(mermaidRenderMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "rerender" }));

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    expect(container.querySelector("[data-mermaid-diagram] svg")).toBe(initialSvgNode);
    expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
  });

  it("opens mermaid diagrams in the shared image preview flow", async () => {
    mermaidInitializeMock.mockReset();
    mermaidRenderMock.mockReset();
    mermaidRenderMock.mockResolvedValue({
      svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>Preview</text></svg>",
      bindFunctions: vi.fn(),
    });

    const user = userEvent.setup();
    const onOpenImagePreview = vi.fn();

    render(
      <MarkdownContent
        content={"```mermaid\ngraph TD\nA-->B\n```"}
        onOpenImagePreview={onOpenImagePreview}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "预览 Mermaid 图" }));

    expect(onOpenImagePreview).toHaveBeenCalledWith({
      src: expect.stringMatching(/^data:image\/svg\+xml;charset=utf-8,/),
      alt: "Mermaid 图",
    });
  });

  it("repairs code fences that are accidentally closed with two backticks", async () => {
    const { container } = render(<MarkdownContent content={"```js\nconst answer = 42;\n``\n后面的说明"} />);

    await waitFor(() => {
      expect(container.querySelector("pre pre")?.textContent).toBe("const answer = 42;");
    });
    expect(screen.getByText("后面的说明")).toBeInTheDocument();
    expect(container.querySelector("pre pre")?.textContent).not.toContain("后面的说明");
  });

  it("auto-closes a trailing fenced block while the closing marker is still missing", async () => {
    const { container } = render(<MarkdownContent content={"```js\nconst answer = 42;"} />);

    await waitFor(() => {
      expect(container.querySelector("pre pre")?.textContent).toBe("const answer = 42;");
    });
  });

  it("renders assistant images in large format and supports previewing", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarkdownContent content={"![示例图](https://example.com/demo.png)"} />);

    const image = await screen.findByAltText("示例图");
    const imageButton = screen.getByRole("button", { name: "示例图" });
    expect(image).toHaveAttribute("src", "https://example.com/demo.png");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image.className).toContain("max-h-[28rem]");
    expect(container.querySelector("[data-scroll-anchor-id]")).toBeTruthy();

    await user.click(imageButton);
    expect(await screen.findByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();
  });

  it("keeps the same image node mounted while streaming text continues around it", async () => {
    const { rerender } = render(
      <MarkdownContent
        streaming
        content={"![示例图](https://example.com/demo.png)\n\n正在生成中"}
      />,
    );

    const initialImage = await screen.findByAltText("示例图");

    rerender(
      <MarkdownContent
        streaming
        content={"![示例图](https://example.com/demo.png)\n\n正在生成中，补充更多说明，避免图片在流式阶段被重挂载。"}
      />,
    );

    expect(await screen.findByAltText("示例图")).toBe(initialImage);
  });

  it("routes image clicks to the shared image preview handler when provided", async () => {
    const user = userEvent.setup();
    const onOpenImagePreview = vi.fn();

    render(<MarkdownContent content={"![雪山飞狐](file:///tmp/nano-banana-1773525937.png)"} onOpenImagePreview={onOpenImagePreview} />);

    const image = await screen.findByAltText("雪山飞狐");
    await user.click(image);

    expect(onOpenImagePreview).toHaveBeenCalledWith({
      src: "/api/file-preview/content?path=%2Ftmp%2Fnano-banana-1773525937.png",
      alt: "雪山飞狐",
      path: "/tmp/nano-banana-1773525937.png",
    });
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();
  });

  it("resolves tracked relative image paths through the file preview content route", async () => {
    render(
      <MarkdownContent
        content={"![Future Hero Poster](tmp/future-hero-poster.png)"}
        files={[
          {
            path: "/Users/marila/projects/lalaclaw2/workspace/tmp/future-hero-poster.png",
            fullPath: "/Users/marila/projects/lalaclaw2/workspace/tmp/future-hero-poster.png",
          },
        ]}
      />,
    );

    const image = await screen.findByAltText("Future Hero Poster");
    expect(image).toHaveAttribute(
      "src",
      "/api/file-preview/content?path=%2FUsers%2Fmarila%2Fprojects%2Flalaclaw2%2Fworkspace%2Ftmp%2Ffuture-hero-poster.png",
    );
  });

  it("keeps tracked inline file buttons styled like inline code", async () => {
    const onOpenFilePreview = () => {};

    render(
      <MarkdownContent
        content={"查看 `sample.py`"}
        files={[{ path: "/Users/marila/projects/lalaclaw/sample.py", fullPath: "/Users/marila/projects/lalaclaw/sample.py" }]}
        onOpenFilePreview={onOpenFilePreview}
      />,
    );

    const fileButton = await screen.findByRole("button", { name: "sample.py" });
    expect(fileButton).toHaveClass("cc-inline-code", "cc-inline-code-link", "appearance-none", "align-baseline");
    expect(fileButton).toHaveClass("border-0", "font-mono");
  });

  it("keeps tracked file links reset to link-like button styling", async () => {
    const onOpenFilePreview = () => {};

    render(
      <MarkdownContent
        content={"[sample.py](/Users/marila/projects/lalaclaw/sample.py)"}
        files={[{ path: "/Users/marila/projects/lalaclaw/sample.py", fullPath: "/Users/marila/projects/lalaclaw/sample.py" }]}
        onOpenFilePreview={onOpenFilePreview}
      />,
    );

    const fileButton = await screen.findByRole("button", { name: "sample.py" });
    expect(fileButton).toHaveClass("file-link", "appearance-none", "border-0", "bg-transparent", "p-0", "leading-inherit");
    expect(fileButton).toHaveClass("min-w-0", "max-w-full", "break-all");
  });

  it("renders unordered lists and task lists with dedicated list styling", async () => {
    render(<MarkdownContent content={`- 第一项\n- 第二项\n\n普通段落\n\n- [ ] 未完成\n- [x] 已完成`} />);

    const unorderedList = (await screen.findByText("第一项")).closest("ul");
    expect(unorderedList).toHaveClass("list-disc", "pl-5");

    const checkboxes = await screen.findAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[0].closest("ul")).toHaveClass("list-none", "pl-0");
  });

  it("rewrites same-message anchor links to scoped heading ids and scrolls to them", async () => {
    const user = userEvent.setup();

    render(<MarkdownContent headingScopeId="message-1" content={`# 标题\n\n[跳到标题](#标题)`} />);

    const heading = await screen.findByRole("heading", { name: "标题" });
    heading.scrollIntoView = vi.fn();

    const anchorLink = await screen.findByRole("link", { name: "跳到标题" });
    expect(anchorLink).toHaveAttribute("href", "#message-1-标题");

    await user.click(anchorLink);
    expect(heading.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
      inline: "nearest",
    });
  });

  it("scrolls the nearest chat viewport for scoped anchor links inside a scroll area", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.fn();
    const rect = (top, height = 24) => ({
      top,
      bottom: top + height,
      left: 0,
      right: 0,
      width: 320,
      height,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });

    const { container } = render(
      <div data-radix-scroll-area-viewport="" style={{ overflowY: "auto", maxHeight: 120 }}>
        <MarkdownContent headingScopeId="message-1" content={`[跳到尾声](#尾声)\n\n${Array.from({ length: 10 }, (_, index) => `段落 ${index + 1}`).join("\n\n")}\n\n## 尾声`} />
      </div>,
    );

    const viewport = container.querySelector("[data-radix-scroll-area-viewport]");
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 120 });
    viewport.scrollTo = scrollTo;
    viewport.getBoundingClientRect = () => rect(0, 120);

    const heading = await screen.findByRole("heading", { name: "尾声" });
    heading.getBoundingClientRect = () => rect(420);

    await user.click(await screen.findByRole("link", { name: "跳到尾声" }));
    expect(scrollTo).toHaveBeenCalledWith({
      top: 408,
      behavior: "smooth",
    });
  });

  it("adds stable block-level scroll anchors for headings and paragraphs", async () => {
    const { container } = render(<MarkdownContent content={`# 标题\n\n第一段\n\n第二段`} />);

    expect(await screen.findByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-scroll-anchor-id]").length).toBeGreaterThanOrEqual(3);
  });

  it("keeps heading ids aligned with the rendered headings under StrictMode", async () => {
    render(
      <StrictMode>
        <MarkdownContent
          headingScopeId="message-1"
          content={`# 我怎么判断的：看 3 件事\n\n## 1. 规划能力\n\n## 2. 完成任务能力\n\n# 我给你的优先级建议\n\n## A档：最值得优先试`}
        />
      </StrictMode>,
    );

    expect((await screen.findByRole("heading", { name: "我怎么判断的：看 3 件事" })).id).toBe("message-1-我怎么判断的看-3-件事");
    expect((await screen.findByRole("heading", { name: "1. 规划能力" })).id).toBe("message-1-1-规划能力");
    expect((await screen.findByRole("heading", { name: "2. 完成任务能力" })).id).toBe("message-1-2-完成任务能力");
    expect((await screen.findByRole("heading", { name: "我给你的优先级建议" })).id).toBe("message-1-我给你的优先级建议");
    expect((await screen.findByRole("heading", { name: "A档：最值得优先试" })).id).toBe("message-1-a档最值得优先试");
  });
});
