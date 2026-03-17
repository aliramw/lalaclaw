import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

const localeStorageKey = "command-center-locale";
const supportedLocales = ["zh", "zh-hk", "en", "ja", "ko", "fr", "es", "pt", "de", "ms", "ta"];
const intlLocaleMap = {
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
const localeOptionLabels = {
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
const dictionaries = {
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

function normalizeLocale(rawLocale = "") {
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

function loadStoredLocale() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(localeStorageKey);
    return supportedLocales.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

function getLocaleDictionary(locale) {
  const normalizedLocale = supportedLocales.includes(locale) ? locale : "zh";
  return dictionaries[normalizedLocale] || zh;
}

const I18nContext = createContext({
  locale: "zh",
  setLocale: () => {},
  localeOptions,
  messages: zh,
  intlLocale: "zh-CN",
});

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => loadStoredLocale() || detectSystemLocale());
  const [messages, setMessages] = useState(() => getLocaleDictionary(loadStoredLocale() || detectSystemLocale()));

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
