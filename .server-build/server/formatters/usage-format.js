"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clip = clip;
exports.parseCompactNumber = parseCompactNumber;
exports.parseTokenDisplay = parseTokenDisplay;
exports.formatTokenBadge = formatTokenBadge;
exports.collectLatestRunUsage = collectLatestRunUsage;
exports.formatTimestamp = formatTimestamp;
exports.tailLines = tailLines;
function clip(text, maxLength = 140) {
    if (!text) {
        return '';
    }
    const normalized = typeof text === 'string'
        ? text
        : (() => {
            try {
                return JSON.stringify(text, null, 2);
            }
            catch {
                return String(text);
            }
        })();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}
function parseCompactNumber(raw) {
    if (!raw) {
        return null;
    }
    const value = String(raw).trim().toLowerCase();
    if (!value) {
        return null;
    }
    if (value.endsWith('k')) {
        return Math.round(Number.parseFloat(value.slice(0, -1)) * 1000);
    }
    if (value.endsWith('m')) {
        return Math.round(Number.parseFloat(value.slice(0, -1)) * 1_000_000);
    }
    const numeric = Number.parseInt(value.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(numeric) ? numeric : null;
}
function formatCompactTokenCount(value) {
    const numeric = Number(value) || 0;
    if (numeric <= 0) {
        return '';
    }
    if (numeric >= 1_000_000) {
        return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
    }
    if (numeric >= 1_000) {
        return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(Math.round(numeric));
}
function parseTokenDisplay(tokenDisplay = '') {
    const match = String(tokenDisplay || '').match(/([0-9.]+[km]?)\s+in\s*\/\s*([0-9.]+[km]?)\s+out/i);
    if (!match) {
        return null;
    }
    return {
        input: parseCompactNumber(match[1]) || 0,
        output: parseCompactNumber(match[2]) || 0,
        cacheRead: 0,
        cacheWrite: 0,
    };
}
function formatTokenBadge(usage) {
    if (!usage) {
        return '';
    }
    const parts = [];
    if (usage.input) {
        parts.push(`↑${formatCompactTokenCount(usage.input)}`);
    }
    if (usage.output) {
        parts.push(`↓${formatCompactTokenCount(usage.output)}`);
    }
    if (usage.cacheRead) {
        parts.push(`R${formatCompactTokenCount(usage.cacheRead)}`);
    }
    if (usage.cacheWrite) {
        parts.push(`W${formatCompactTokenCount(usage.cacheWrite)}`);
    }
    return parts.join(' ');
}
function collectLatestRunUsage(entries = []) {
    if (!Array.isArray(entries) || !entries.length) {
        return null;
    }
    let latestUserIndex = -1;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        if (entries[index]?.message?.role === 'user') {
            latestUserIndex = index;
            break;
        }
    }
    const scope = latestUserIndex >= 0 ? entries.slice(latestUserIndex + 1) : entries;
    const totals = scope.reduce((acc, entry) => {
        const message = entry?.message || {};
        const usage = message.usage;
        if (message.role !== 'assistant' || !usage) {
            return acc;
        }
        acc.input += Number(usage.input || 0);
        acc.output += Number(usage.output || 0);
        acc.cacheRead += Number(usage.cacheRead || 0);
        acc.cacheWrite += Number(usage.cacheWrite || 0);
        acc.count += 1;
        return acc;
    }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, count: 0 });
    if (!totals.count) {
        return null;
    }
    return totals;
}
function formatTimestamp(timestamp) {
    if (!timestamp) {
        return '';
    }
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
}
function tailLines(text, maxLines = 6) {
    if (!text) {
        return [];
    }
    return String(text)
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-maxLines);
}
