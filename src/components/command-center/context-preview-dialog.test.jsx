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
    expect(screen.getByText("Tokens: 4/7")).toBeInTheDocument();

    const expandButton = screen.getByRole("button", { name: "Show all (2005 chars)" });
    await userEvent.setup().click(expandButton);

    expect(screen.getByRole("button", { name: "Collapse" })).toBeInTheDocument();
  });
});
