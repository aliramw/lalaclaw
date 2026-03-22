import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import de from "@/locales/de";
import en from "@/locales/en";
import es from "@/locales/es";
import fr from "@/locales/fr";
import ja from "@/locales/ja";
import ko from "@/locales/ko";
import ms from "@/locales/ms";
import pt from "@/locales/pt";
import ta from "@/locales/ta";
import zh from "@/locales/zh";
import zhHk from "@/locales/zh-hk";

type Locale = "zh" | "zh-hk" | "en" | "ja" | "ko" | "fr" | "es" | "pt" | "de" | "ms" | "ta";
type LocaleMessages = typeof zh;
type I18nContextValue = {
  intlLocale: string;
  locale: Locale;
  localeOptions: Array<{ label: string; value: Locale }>;
  messages: LocaleMessages;
  setLocale: (locale: string) => void;
};

const localeStorageKey = "command-center-locale";
const supportedLocales: Locale[] = ["zh", "zh-hk", "en", "ja", "ko", "fr", "es", "pt", "de", "ms", "ta"];
const intlLocaleMap: Record<Locale, string> = {
  zh: "zh-CN",
  "zh-hk": "zh-HK",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
  fr: "fr-FR",
  es: "es-ES",
  pt: "pt-BR",
  de: "de-DE",
  ms: "ms-MY",
  ta: "ta-IN",
};
const localeOptionLabels: Record<Locale, string> = {
  zh: "中文",
  "zh-hk": "繁體中文（香港）",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
  ms: "Bahasa Melayu",
  ta: "தமிழ்",
};
const localeOptions = supportedLocales.map((locale) => ({
  value: locale,
  label: localeOptionLabels[locale] || locale,
}));
const dictionaries: Record<Locale, any> = {
  de,
  en,
  es,
  fr,
  ja,
  ko,
  ms,
  pt,
  ta,
  zh,
  "zh-hk": zhHk,
};

function isSupportedLocale(locale: unknown): locale is Locale {
  return typeof locale === "string" && supportedLocales.includes(locale as Locale);
}

function normalizeLocale(rawLocale: unknown = ""): Locale | null {
  const normalized = String(rawLocale || "").toLowerCase();
  if (
    normalized.startsWith("zh-hk")
    || normalized.startsWith("zh-mo")
    || normalized.startsWith("zh-tw")
    || normalized.startsWith("zh-hant")
  ) return "zh-hk";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ms")) return "ms";
  if (normalized.startsWith("ta")) return "ta";
  if (normalized.startsWith("en")) return "en";
  return null;
}

function detectSystemLocale() {
  if (typeof navigator === "undefined") {
    return "zh";
  }

  const candidates = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  return candidates.map(normalizeLocale).find(Boolean) || "zh";
}

function loadStoredLocale(): Locale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(localeStorageKey);
    return isSupportedLocale(raw) ? raw : null;
  } catch {
    return null;
  }
}

function deepMerge(base: any, override: any): LocaleMessages {
  if (!override) return base;
  if (!base) return override;
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const bv = base[key];
    const ov = override[key];
    if (ov != null && typeof ov === "object" && !Array.isArray(ov) && typeof bv === "object" && !Array.isArray(bv) && typeof bv !== "function") {
      result[key] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      result[key] = ov;
    }
  }
  return result;
}

function getLocaleDictionary(locale: string | null | undefined): LocaleMessages {
  const normalizedLocale = isSupportedLocale(locale) ? locale : "zh";
  const dictionary = dictionaries[normalizedLocale] || zh;
  if (normalizedLocale === "en" || normalizedLocale === "zh") return dictionary;
  const fallback = normalizedLocale === "zh-hk" ? zh : en;
  return deepMerge(fallback, dictionary);
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh",
  setLocale: () => {},
  localeOptions,
  messages: zh,
  intlLocale: "zh-CN",
});

export function I18nProvider({ children }: { children?: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => loadStoredLocale() || detectSystemLocale());
  const [messages, setMessages] = useState<LocaleMessages>(() => getLocaleDictionary(loadStoredLocale() || detectSystemLocale()));

  const setLocale = (nextLocale: string) => {
    setLocaleState(isSupportedLocale(nextLocale) ? nextLocale : "zh");
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {}
  }, [locale]);

  useEffect(() => {
    const dictionary = getLocaleDictionary(locale);

    if (typeof document !== "undefined") {
      document.documentElement.lang = intlLocaleMap[locale] || "zh-CN";
      document.title = dictionary?.app?.documentTitle || dictionary?.app?.title || document.title;
    }

    setMessages(dictionary);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      localeOptions,
      messages,
      intlLocale: intlLocaleMap[locale] || "zh-CN",
    }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export { localeStorageKey, supportedLocales };
