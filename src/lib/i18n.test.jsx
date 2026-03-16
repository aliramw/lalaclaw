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
      <button type="button" onClick={() => setLocale("es")}>
        Spanish
      </button>
      <button type="button" onClick={() => setLocale("pt")}>
        Portuguese
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
    expect(document.title).toBe("LalaClaw | OpenClaw Command Center");
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

    expect(document.title).toBe("LalaClaw | OpenClaw Command Center");
    expect(document.documentElement.lang).toBe("en-US");

    await user.click(screen.getByRole("button", { name: "Chinese" }));

    expect(document.title).toBe("LalaClaw | 龙虾指挥中心");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("supports spanish as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "es");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    expect(document.title).toBe("LalaClaw | Centro de Comando OpenClaw");
    expect(document.documentElement.lang).toBe("es-ES");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Spanish" }));

    expect(document.title).toBe("LalaClaw | Centro de Comando OpenClaw");
    expect(document.documentElement.lang).toBe("es-ES");
  });

  it("supports portuguese as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "pt");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("pt");
    expect(document.title).toBe("LalaClaw | Central de Comando OpenClaw");
    expect(document.documentElement.lang).toBe("pt-BR");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Portuguese" }));

    expect(document.title).toBe("LalaClaw | Central de Comando OpenClaw");
    expect(document.documentElement.lang).toBe("pt-BR");
  });
});
