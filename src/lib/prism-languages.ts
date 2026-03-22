import { useEffect, useState } from "react";
import Prism from "prismjs";

type PrismLanguageModuleDefinition = {
  deps?: string[];
  load: () => Promise<unknown>;
};

const prismGlobal = typeof globalThis !== "undefined" ? globalThis : window;
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
]);
const languageAliases: Record<string, string> = {
  bat: "powershell",
  cxx: "cpp",
  cc: "cpp",
  cs: "csharp",
  dockerfile: "docker",
  ex: "elixir",
  exs: "elixir",
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
  pl: "perl",
  pm: "perl",
  ps1: "powershell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  text: "text",
  toml: "toml",
  ts: "typescript",
  yml: "yaml",
  zsh: "bash",
};
const pendingLanguageLoads = new Map<string, Promise<void>>();
const prismLanguageModules: Record<string, PrismLanguageModuleDefinition> = {
  c: {
    load: () => import("prismjs/components/prism-c.js"),
  },
  cpp: {
    deps: ["c"],
    load: () => import("prismjs/components/prism-cpp.js"),
  },
  csharp: {
    load: () => import("prismjs/components/prism-csharp.js"),
  },
  python: {
    load: () => import("prismjs/components/prism-python.js"),
  },
  go: {
    load: () => import("prismjs/components/prism-go.js"),
  },
  rust: {
    load: () => import("prismjs/components/prism-rust.js"),
  },
  sql: {
    load: () => import("prismjs/components/prism-sql.js"),
  },
  swift: {
    load: () => import("prismjs/components/prism-swift.js"),
  },
  kotlin: {
    load: () => import("prismjs/components/prism-kotlin.js"),
  },
  objectivec: {
    load: () => import("prismjs/components/prism-objectivec.js"),
  },
  typescript: {
    load: () => import("prismjs/components/prism-typescript.js"),
  },
  "markup-templating": {
    load: () => import("prismjs/components/prism-markup-templating.js"),
  },
  jsx: {
    deps: ["markup-templating"],
    load: () => import("prismjs/components/prism-jsx.js"),
  },
  tsx: {
    deps: ["jsx", "typescript"],
    load: () => import("prismjs/components/prism-tsx.js"),
  },
  json: {
    load: () => import("prismjs/components/prism-json.js"),
  },
  markdown: {
    load: () => import("prismjs/components/prism-markdown.js"),
  },
  yaml: {
    load: () => import("prismjs/components/prism-yaml.js"),
  },
  bash: {
    load: () => import("prismjs/components/prism-bash.js"),
  },
  docker: {
    deps: ["bash"],
    load: () => import("prismjs/components/prism-docker.js"),
  },
  makefile: {
    load: () => import("prismjs/components/prism-makefile.js"),
  },
  php: {
    deps: ["markup-templating"],
    load: () => import("prismjs/components/prism-php.js"),
  },
  ruby: {
    load: () => import("prismjs/components/prism-ruby.js"),
  },
  powershell: {
    load: () => import("prismjs/components/prism-powershell.js"),
  },
  toml: {
    load: () => import("prismjs/components/prism-toml.js"),
  },
  ini: {
    load: () => import("prismjs/components/prism-ini.js"),
  },
  groovy: {
    load: () => import("prismjs/components/prism-groovy.js"),
  },
  gradle: {
    deps: ["groovy"],
    load: () => import("prismjs/components/prism-gradle.js"),
  },
  java: {
    load: () => import("prismjs/components/prism-java.js"),
  },
  scala: {
    deps: ["java"],
    load: () => import("prismjs/components/prism-scala.js"),
  },
  lua: {
    load: () => import("prismjs/components/prism-lua.js"),
  },
  perl: {
    load: () => import("prismjs/components/prism-perl.js"),
  },
  r: {
    load: () => import("prismjs/components/prism-r.js"),
  },
  dart: {
    load: () => import("prismjs/components/prism-dart.js"),
  },
  elixir: {
    load: () => import("prismjs/components/prism-elixir.js"),
  },
};

if (!prismGlobal.Prism) {
  prismGlobal.Prism = Prism;
}

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

  if (builtInLanguages.has(normalized) || Prism.languages[normalized]) {
    return normalized;
  }

  const definition = prismLanguageModules[normalized];
  if (!definition) {
    return "text";
  }

  if (!pendingLanguageLoads.has(normalized)) {
    pendingLanguageLoads.set(normalized, (async () => {
      for (const dependency of definition.deps || []) {
        await ensurePrismLanguage(dependency);
      }

      await definition.load();
    })().catch((error) => {
      pendingLanguageLoads.delete(normalized);
      throw error;
    }));
  }

  try {
    await pendingLanguageLoads.get(normalized);
  } catch {
    return "text";
  }

  return Prism.languages[normalized] ? normalized : "text";
}

export function usePrismLanguage(language = "text") {
  const normalized = normalizePrismLanguage(language);
  const [resolvedLanguage, setResolvedLanguage] = useState(() => (
    builtInLanguages.has(normalized) || Prism.languages[normalized] ? normalized : "text"
  ));

  useEffect(() => {
    let cancelled = false;
    const nextLanguage = normalizePrismLanguage(language);

    setResolvedLanguage(builtInLanguages.has(nextLanguage) || Prism.languages[nextLanguage] ? nextLanguage : "text");

    void ensurePrismLanguage(nextLanguage).then((loadedLanguage) => {
      if (!cancelled) {
        setResolvedLanguage(loadedLanguage);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  return resolvedLanguage;
}

export { Prism };
