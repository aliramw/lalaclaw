import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextPreviewDialog } from "@/components/command-center/context-preview-dialog";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

function renderDialog(props = {}) {
  return render(
    <I18nProvider>
      <ContextPreviewDialog open onClose={() => {}} sessionUser="command-center" {...props} />
    </I18nProvider>,
  );
}

describe("ContextPreviewDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders localized English copy for context controls and message metadata", async () => {
    window.localStorage.setItem(localeStorageKey, "en");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sessionKey: "agent:main:command-center",
        thinkingLevel: "high",
        fastMode: true,
        messages: [{
          role: "assistant",
          content: "A".repeat(2005),
          timestamp: "2026-03-21T10:00:00.000Z",
          usage: {
            input_tokens: 4,
            output_tokens: 7,
          },
        }],
      }),
    });

    renderDialog();

    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(screen.getByText("Tokens: ↑4 ↓7")).toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "Show all (2005 chars)" });
    await userEvent.setup().click(expandButton);

    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
  });

  it("normalizes wrapped gateway messages, tool roles, compact token shapes, and keeps the scroll container bounded", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        sessionKey: "agent:main:command-center",
        thinkingLevel: "low",
        messages: [
          {
            message: {
              role: "assistant",
              content: [{ type: "output_text", text: "实际助手回复" }],
              usage: { output: 7 },
              timestamp: "2026-03-21T10:00:00.000Z",
            },
          },
          {
            message: {
              role: "tool",
              content: [{ type: "tool_result", content: "Projects:\n- demo.md" }],
              timestamp: "2026-03-21T10:00:01.000Z",
            },
          },
          {
            message: {
              role: "assistant",
              content: [],
              timestamp: "2026-03-21T10:00:02.000Z",
            },
          },
        ],
      }),
    });

    renderDialog();

    expect(await screen.findByText("实际助手回复")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("Projects:") && content.includes("- demo.md"))).toBeInTheDocument();
    expect(screen.getByText("工具")).toBeInTheDocument();
    expect(screen.getByText("Token: ↓7")).toBeInTheDocument();
    expect(screen.queryByText("未知")).not.toBeInTheDocument();

    const scrollArea = screen.getByTestId("context-preview-scroll-area");
    expect(scrollArea.className).toContain("min-h-0");
    expect(scrollArea.className).toContain("flex-1");
    expect(scrollArea.className).toContain("overflow-y-auto");

    expect(screen.queryAllByText("助手")).toHaveLength(1);
  });

  it("shows a debuggable label when the message role is still unknown", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          {
            message: {
              role: "unknown-role",
              content: "raw payload",
              timestamp: "2026-03-21T10:00:03.000Z",
            },
          },
        ],
      }),
    });

    renderDialog();

    expect(await screen.findByText("未知角色 (unknown-role)")).toBeInTheDocument();
    expect(screen.getByText("raw payload")).toBeInTheDocument();
  });

  it("renders toolResult as 工具返回结果", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          {
            message: {
              role: "toolResult",
              content: "执行完成",
              timestamp: "2026-03-21T10:00:04.000Z",
            },
          },
        ],
      }),
    });

    renderDialog();

    expect(await screen.findByText("工具返回结果")).toBeInTheDocument();
    expect(screen.getByText("执行完成")).toBeInTheDocument();
  });

  it("renders toolUse as 工具调用", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          {
            message: {
              role: "toolUse",
              content: [{ type: "tool_use", name: "list_files" }],
              timestamp: "2026-03-21T10:00:05.000Z",
            },
          },
        ],
      }),
    });

    renderDialog();

    expect(await screen.findByText("工具调用")).toBeInTheDocument();
    expect(screen.getByText("[tool_use: list_files]")).toBeInTheDocument();
  });
});
