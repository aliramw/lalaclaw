import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@/components/command-center/markdown-content";

describe("MarkdownContent", () => {
  it("renders headings, links, and inline code", async () => {
    render(<MarkdownContent content={`# 控制台\n\n访问 [OpenAI](https://openai.com)\n\n使用 \`npm test\``} />);

    expect(await screen.findByRole("heading", { name: "控制台" }, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "OpenAI" }, { timeout: 4000 })).toHaveAttribute("href", "https://openai.com");
    expect(await screen.findByText("npm test")).toBeInTheDocument();
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

  it("renders assistant images in large format and supports previewing", async () => {
    const user = userEvent.setup();
    render(<MarkdownContent content={"![示例图](https://example.com/demo.png)"} />);

    const image = await screen.findByAltText("示例图");
    expect(image).toHaveAttribute("src", "https://example.com/demo.png");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image.className).toContain("max-h-[28rem]");

    await user.click(image);
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
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
    expect(fileButton).toHaveClass("cc-inline-code", "cc-inline-code-link", "appearance-none", "bg-transparent", "align-baseline", "leading-tight");
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
});
