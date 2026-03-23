"use strict";
function stripMarkdownForDisplay(value = "") {
    const normalized = String(value || "").replace(/\r\n?/g, "\n");
    if (!normalized.trim()) {
        return "";
    }
    let text = normalized
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/```([\s\S]*?)```/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/(^|[\s([{'"`“‘])#{1,6}\s+/g, "$1")
        .replace(/^\s{0,3}>\s?/gm, "")
        .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/gm, "")
        .replace(/(^|[\s:：])[-+*]\s+(?=\S)/g, "$1")
        .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, " ")
        .replace(/(^|\s)(?:[-*_]\s*){3,}(?=\s|$)/g, " ");
    const wrapperPatterns = [
        /(?:\*\*|__)(?=\S)([\s\S]*?\S)(?:\*\*|__)/g,
        /(?:\*|_)(?=\S)([\s\S]*?\S)(?:\*|_)/g,
        /~~(?=\S)([\s\S]*?\S)~~/g,
    ];
    for (const pattern of wrapperPatterns) {
        let previous = "";
        while (previous !== text) {
            previous = text;
            text = text.replace(pattern, (_, content) => content);
        }
    }
    text = text
        .replace(/(\*\*|__|~~)/g, "")
        .replace(/\s+/g, " ")
        .trim();
    return text;
}
module.exports = { stripMarkdownForDisplay };
