import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "@/components/command-center/markdown-content";

describe("MarkdownContent", () => {
  it("renders headings, links, and inline code", async () => {
    render(<MarkdownContent content={`# 控制台\n\n访问 [OpenAI](https://openai.com)\n\n使用 \`npm test\``} />);

    expect(await screen.findByRole("heading", { name: "控制台" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "OpenAI" })).toHaveAttribute("href", "https://openai.com");
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
    expect(image.className).toContain("h-[400px]");

    await user.click(image);
    expect(screen.getByRole("button", { name: "关闭预览" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "关闭预览" })).not.toBeInTheDocument();
  });
});
