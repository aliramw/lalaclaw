import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "@/components/command-center/markdown-content";

describe("MarkdownContent", () => {
  it("renders headings, links, and inline code", async () => {
    render(<MarkdownContent content={`# 控制台\n\n访问 [OpenAI](https://openai.com)\n\n使用 \`npm test\``} />);

    expect(await screen.findByRole("heading", { name: "控制台" }, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "OpenAI" }, { timeout: 4000 })).toHaveAttribute("href", "https://openai.com");
    const inlineCode = await screen.findByText("npm test");
    expect(inlineCode.tagName).toBe("CODE");
    expect(inlineCode).toHaveClass("cc-inline-code", "border-0", "align-baseline", "font-mono");
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
    expect(image).toHaveAttribute("src", "https://example.com/demo.png");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image.className).toContain("max-h-[28rem]");
    expect(container.querySelector("[data-scroll-anchor-id]")).toBeTruthy();

    await user.click(image);
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();
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

  it("adds stable block-level scroll anchors for headings and paragraphs", async () => {
    const { container } = render(<MarkdownContent content={`# 标题\n\n第一段\n\n第二段`} />);

    expect(await screen.findByRole("heading", { name: "标题" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-scroll-anchor-id]").length).toBeGreaterThanOrEqual(3);
  });
});
