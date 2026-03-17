const markdownFeaturePatterns = [
  /(^|\n)#{1,6}\s+\S/,
  /(^|\n)>\s+\S/,
  /(^|\n)([-*+]\s+|\d+\.\s+)\S/,
  /(^|\n)```/,
  /(^|\n)~~~+/,
  /`[^`\n]+`/,
  /!\[[^\]]*\]\([^)]+\)/,
  /\[[^\]]+\]\([^)]+\)/,
  /(^|\n)\|.+\|/,
  /(^|\n)(-{3,}|\*{3,}|_{3,})\s*$/,
  /https?:\/\/\S+/i,
  /file:\/\/\S+/i,
  /vscode:\/\/\S+/i,
  /<([A-Za-z][\w:-]*)(\s[^>]*)?>/,
  /(^|\n)\s*[-*]\s+\[[ xX]\]\s+/,
  /\$\$[\s\S]+?\$\$/,
  /\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]/,
];

export function contentNeedsMarkdownRenderer(content = "") {
  const text = String(content || "");

  if (!text.trim()) {
    return false;
  }

  return markdownFeaturePatterns.some((pattern) => pattern.test(text));
}
