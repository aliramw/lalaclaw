import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessGate } from "@/features/auth/access-gate";
import { I18nProvider, localeStorageKey } from "@/lib/i18n";

function mockJsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return Promise.resolve({
    ok,
    status,
    json: async () => payload,
  });
}

function renderAccessGate() {
  return render(
    <I18nProvider>
      <AccessGate>
        <div>workspace unlocked</div>
      </AccessGate>
    </I18nProvider>,
  );
}

describe("AccessGate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children immediately when token access mode is disabled", async () => {
    global.fetch.mockImplementation((input) => {
      if (String(input) === "/api/auth/state") {
        return mockJsonResponse({
          ok: true,
          accessMode: "off",
          authenticated: true,
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderAccessGate();

    expect(await screen.findByText("workspace unlocked")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Private workspace" })).not.toBeInTheDocument();
  });

  it("shows the token form and unlocks after a successful login", async () => {
    window.localStorage.setItem(localeStorageKey, "en");
    const fetchMock = global.fetch;
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url === "/api/auth/state") {
        return mockJsonResponse({
          ok: true,
          accessMode: "token",
          authenticated: false,
        });
      }

      if (url === "/api/auth/token" && init?.method === "POST") {
        expect(JSON.parse(init.body)).toEqual({ token: "demo-token" });
        return mockJsonResponse({
          ok: true,
          accessMode: "token",
          authenticated: true,
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    renderAccessGate();

    expect(await screen.findByRole("heading", { name: "Private workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("🦞 LalaClaw")).toBeInTheDocument();
    const helpLink = screen.getByRole("link", { name: "How to find the access token" });
    expect(helpLink).toHaveAttribute(
      "href",
      "https://github.com/aliramw/lalaclaw/blob/main/docs/en/documentation-quick-start.md#browser-access-tokens",
    );
    await userEvent.type(screen.getByLabelText("Access token"), "demo-token");
    await userEvent.click(screen.getByRole("button", { name: "Unlock workspace" }));

    await waitFor(() => {
      expect(screen.getByText("workspace unlocked")).toBeInTheDocument();
    });
  });

  it("links Chinese UI users to the Chinese token guide", async () => {
    window.localStorage.setItem(localeStorageKey, "zh");
    global.fetch.mockImplementation((input) => {
      if (String(input) === "/api/auth/state") {
        return mockJsonResponse({
          ok: true,
          accessMode: "token",
          authenticated: false,
        });
      }

      throw new Error(`Unexpected fetch: ${input}`);
    });

    renderAccessGate();

    expect(await screen.findByRole("heading", { name: "受保护的工作台" })).toBeInTheDocument();
    const helpLink = screen.getByRole("link", { name: "如何找到访问 token" });
    expect(helpLink).toHaveAttribute(
      "href",
      "https://github.com/aliramw/lalaclaw/blob/main/docs/zh/documentation-quick-start.md#browser-access-tokens",
    );
  });
});
