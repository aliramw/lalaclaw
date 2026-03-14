import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, localeStorageKey, useI18n } from "@/lib/i18n";

function LocaleProbe() {
  const { locale, setLocale } = useI18n();

  return (
    <div>
      <div data-testid="locale">{locale}</div>
      <button type="button" onClick={() => setLocale("en")}>
        English
      </button>
      <button type="button" onClick={() => setLocale("zh")}>
        Chinese
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.title = "";
    document.documentElement.lang = "";
  });

  it("syncs document title and html lang with the stored locale", () => {
    window.localStorage.setItem(localeStorageKey, "en");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.title).toBe("LalaClaw.ai | OpenClaw Command Center");
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("updates document metadata when the locale changes", async () => {
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));

    expect(document.title).toBe("LalaClaw.ai | OpenClaw Command Center");
    expect(document.documentElement.lang).toBe("en-US");

    await user.click(screen.getByRole("button", { name: "Chinese" }));

    expect(document.title).toBe("LalaClaw.ai | 龙虾指挥中心");
    expect(document.documentElement.lang).toBe("zh-CN");
  });
});
