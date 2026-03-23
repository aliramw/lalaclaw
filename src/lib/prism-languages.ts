import { Prism } from "prism-react-renderer";

const builtInLanguages = new Set([
  "text",
  "plain",
  "plaintext",
  "none",
  "markup",
  "html",
  "xml",
  "svg",
  "mathml",
  "ssml",
  "atom",
  "rss",
  "css",
  "clike",
  "javascript",
  "js",
  "jsx",
  "typescript",
  "ts",
  "tsx",
  "json",
  "markdown",
  "md",
  "yaml",
  "yml",
  "python",
  "py",
  "sql",
  "go",
  "rust",
  "rs",
  "swift",
  "kotlin",
  "kt",
  "kts",
  "objectivec",
  "m",
  "mm",
  "c",
  "cpp",
]);

const languageAliases: Record<string, string> = {
  cxx: "cpp",
  cc: "cpp",
  cs: "text",
  bat: "text",
  dockerfile: "text",
  ex: "text",
  exs: "text",
  fish: "text",
  htm: "markup",
  ini: "text",
  js: "javascript",
  json5: "json",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mm: "objectivec",
  m: "objectivec",
  pl: "text",
  pm: "text",
  ps1: "text",
  py: "python",
  rb: "text",
  rs: "rust",
  sh: "text",
  shell: "text",
  text: "text",
  toml: "text",
  ts: "typescript",
  yml: "yaml",
  zsh: "text",
};

export function normalizePrismLanguage(language = "text") {
  const normalized = String(language || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return "text";
  }

  return languageAliases[normalized] || normalized;
}

export async function ensurePrismLanguage(language = "text") {
  const normalized = normalizePrismLanguage(language);
  return builtInLanguages.has(normalized) || Prism.languages[normalized] ? normalized : "text";
}

export function usePrismLanguage(language = "text") {
  const normalized = normalizePrismLanguage(language);
  return builtInLanguages.has(normalized) || Prism.languages[normalized] ? normalized : "text";
}

export { Prism };
