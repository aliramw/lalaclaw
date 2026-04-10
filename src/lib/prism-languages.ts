import { Prism } from "prism-react-renderer";

const prismGlobal = globalThis as typeof globalThis & { Prism?: typeof Prism };

prismGlobal.Prism = Prism;
await import("prismjs/components/prism-bash.js");
await import("prismjs/components/prism-ini.js");
await import("prismjs/components/prism-log.js");
await import("prismjs/components/prism-powershell.js");
await import("prismjs/components/prism-toml.js");
if (prismGlobal.Prism === Prism) {
  delete prismGlobal.Prism;
}

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
  "bash",
  "ini",
  "log",
  "powershell",
  "toml",
]);

const languageAliases: Record<string, string> = {
  cxx: "cpp",
  cc: "cpp",
  cs: "text",
  bat: "text",
  dockerfile: "text",
  ex: "text",
  exs: "text",
  fish: "bash",
  htm: "markup",
  ini: "ini",
  js: "javascript",
  json5: "json",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mm: "objectivec",
  m: "objectivec",
  pl: "text",
  pm: "text",
  ps1: "powershell",
  py: "python",
  rb: "text",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  log: "log",
  text: "text",
  toml: "toml",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
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
