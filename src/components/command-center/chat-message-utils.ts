// Message content analysis utilities

export type MessageOutlineItem = {
  id: string;
  line: number;
  level: number;
  text: string;
};

export function slugifyHeading(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

export function stripInlineMarkdown(value = "") {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim();
}

export function extractHeadingOutline(content = ""): MessageOutlineItem[] {
  const seen = new Map();
  return String(content || "")
    .split("\n")
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line.trim());
      if (!match) {
        return null;
      }
      const text = stripInlineMarkdown(String(match[2] || "").replace(/\s+#+\s*$/, ""));
      if (!text) {
        return null;
      }
      const baseSlug = slugifyHeading(text);
      const currentCount = (seen.get(baseSlug) || 0) + 1;
      seen.set(baseSlug, currentCount);
      return {
        id: currentCount === 1 ? baseSlug : `${baseSlug}-${currentCount}`,
        line: index + 1,
        level: String(match[1] || "").length,
        text,
      };
    })
    .filter((item): item is MessageOutlineItem => Boolean(item));
}

export function measureMessageDensity(content = "") {
  return Array.from(content).reduce((total, char) => {
    if (/\p{Script=Han}/u.test(char)) {
      return total + 1.7;
    }
    if (/\s/.test(char)) {
      return total + 0.35;
    }
    return total + 1;
  }, 0);
}

const assistantCompactThreshold = 80;

export function shouldUseCompactAssistantBubble(content = "") {
  const text = String(content || "").trim();

  if (!text) {
    return true;
  }

  const hasBlockStructure =
    text.includes("\n\n") ||
    /```/.test(text) ||
    /(^|\s)([-*+]|\d+\.)\s/.test(text) ||
    /^#{1,6}\s/m.test(text) ||
    /^\|.*\|$/m.test(text) ||
    /^>\s/m.test(text);
  const hasLongLink = /https?:\/\/\S{24,}/i.test(text);
  const normalized = text.replace(/[*_`~[\]()#>|-]/g, " ").replace(/\s+/g, " ").trim();

  return !hasBlockStructure && !hasLongLink && measureMessageDensity(normalized) <= assistantCompactThreshold;
}
