export const defaultTab = "timeline";
export const defaultChatFontSize = "small";
export const defaultComposerSendMode = "enter-send";
export const minInspectorPanelWidth = 300;
export const maxInspectorPanelWidth = 720;
export const defaultInspectorPanelWidth = 380;

const maxUserLabelLength = 40;

export function sanitizeUserLabel(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxUserLabelLength);
}

export function sanitizeInspectorPanelWidth(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return defaultInspectorPanelWidth;
  }

  return Math.min(maxInspectorPanelWidth, Math.max(minInspectorPanelWidth, Math.round(numericValue)));
}
