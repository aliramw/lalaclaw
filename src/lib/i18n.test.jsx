import { render, screen, waitFor } from "@testing-library/react";
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
      <button type="button" onClick={() => setLocale("zh-hk")}>
        Chinese Hong Kong
      </button>
      <button type="button" onClick={() => setLocale("es")}>
        Spanish
      </button>
      <button type="button" onClick={() => setLocale("ko")}>
        Korean
      </button>
      <button type="button" onClick={() => setLocale("pt")}>
        Portuguese
      </button>
      <button type="button" onClick={() => setLocale("de")}>
        German
      </button>
      <button type="button" onClick={() => setLocale("ms")}>
        Malay
      </button>
      <button type="button" onClick={() => setLocale("ta")}>
        Tamil
      </button>
    </div>
  );
}

async function expectLocaleMetadata(title, lang) {
  await waitFor(() => {
    expect(document.title).toBe(title);
    expect(document.documentElement.lang).toBe(lang);
  });
}

describe("I18nProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.title = "";
    document.documentElement.lang = "";
  });

  it("syncs document title and html lang with the stored locale", async () => {
    window.localStorage.setItem(localeStorageKey, "en");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    await expectLocaleMetadata("LalaClaw | OpenClaw Command Center", "en-US");
  });

  it("updates document metadata when the locale changes", async () => {
    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));

    await expectLocaleMetadata("LalaClaw | OpenClaw Command Center", "en-US");

    await user.click(screen.getByRole("button", { name: "Chinese" }));

    await expectLocaleMetadata("LalaClaw | 龙虾指挥中心", "zh-CN");
  });

  it("supports traditional chinese (hong kong) as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "zh-hk");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("zh-hk");
    await expectLocaleMetadata("LalaClaw | OpenClaw 指揮中心", "zh-HK");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Chinese Hong Kong" }));

    await expectLocaleMetadata("LalaClaw | OpenClaw 指揮中心", "zh-HK");
  });

  it("supports spanish as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "es");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("es");
    await expectLocaleMetadata("LalaClaw | Centro de Comando OpenClaw", "es-ES");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Spanish" }));

    await expectLocaleMetadata("LalaClaw | Centro de Comando OpenClaw", "es-ES");
  });

  it("supports portuguese as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "pt");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("pt");
    await expectLocaleMetadata("LalaClaw | Central de Comando OpenClaw", "pt-BR");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Portuguese" }));

    await expectLocaleMetadata("LalaClaw | Central de Comando OpenClaw", "pt-BR");
  });

  it("supports german as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "de");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("de");
    await expectLocaleMetadata("LalaClaw | OpenClaw-Kommandozentrale", "de-DE");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "German" }));

    await expectLocaleMetadata("LalaClaw | OpenClaw-Kommandozentrale", "de-DE");
  });

  it("supports korean as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "ko");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("ko");
    await expectLocaleMetadata("LalaClaw | OpenClaw 커맨드 센터", "ko-KR");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Korean" }));

    await expectLocaleMetadata("LalaClaw | OpenClaw 커맨드 센터", "ko-KR");
  });

  it("supports malay as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "ms");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("ms");
    await expectLocaleMetadata("LalaClaw | Pusat Arahan OpenClaw", "ms-MY");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Malay" }));

    await expectLocaleMetadata("LalaClaw | Pusat Arahan OpenClaw", "ms-MY");
  });

  it("supports tamil as a stored and interactive locale", async () => {
    window.localStorage.setItem(localeStorageKey, "ta");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("ta");
    await expectLocaleMetadata("LalaClaw | OpenClaw கட்டளை மையம்", "ta-IN");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "English" }));
    await user.click(screen.getByRole("button", { name: "Tamil" }));

    await expectLocaleMetadata("LalaClaw | OpenClaw கட்டளை மையம்", "ta-IN");
  });
});
