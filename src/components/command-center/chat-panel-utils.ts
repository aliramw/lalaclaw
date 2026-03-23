type RectLike = {
  top?: number;
  bottom?: number;
  height?: number;
};

export function shouldShowBubbleTopJumpButton({
  viewportRect,
  bubbleRect,
  viewportClientHeight = 0,
}: {
  viewportRect?: RectLike | null;
  bubbleRect?: RectLike | null;
  viewportClientHeight?: number;
}) {
  if (!viewportRect || !bubbleRect) {
    return false;
  }

  const bubbleTop = Number(bubbleRect.top) || 0;
  const bubbleBottom = Number(bubbleRect.bottom) || 0;
  const viewportTop = Number(viewportRect.top) || 0;
  const viewportBottom = Number(viewportRect.bottom) || viewportTop;
  const bubbleHeight = Number(bubbleRect.height) || Math.max(0, bubbleBottom - bubbleTop);
  const minTallHeight = Math.min(96, Math.max(56, viewportClientHeight * 0.18));
  const bubbleTallEnough = bubbleHeight >= minTallHeight;
  const bubbleTopHidden = bubbleTop <= viewportTop - 8;
  const bubbleNotFullyVisible = bubbleTopHidden || bubbleBottom >= viewportBottom - 8;
  const bubbleStillVisible = bubbleBottom > viewportTop + 24;

  return bubbleTallEnough && bubbleTopHidden && bubbleNotFullyVisible && bubbleStillVisible;
}

export function shouldSuppressComposerReplay({
  armed = false,
  armedAt = 0,
  eventType = "",
  inputType = "",
  isNativeComposing = false,
  nextPrompt = "",
  replaySource = "",
  now = Date.now(),
}: {
  armed?: boolean;
  armedAt?: number;
  eventType?: string;
  inputType?: string;
  isNativeComposing?: boolean;
  nextPrompt?: string;
  replaySource?: string;
  now?: number;
} = {}) {
  const normalizedNextPrompt = String(nextPrompt || "").trim();
  if (!armed || !normalizedNextPrompt) {
    return false;
  }

  const normalizedReplaySource = String(replaySource || "").trim();
  const resemblesSentSuffix = Boolean(normalizedReplaySource) && normalizedReplaySource.includes(normalizedNextPrompt);
  if (!resemblesSentSuffix) {
    return false;
  }

  if (eventType === "compositionend") {
    return true;
  }

  const normalizedInputType = String(inputType || "").toLowerCase();
  const withinImmediateReplayWindow = armedAt > 0 && now - armedAt <= 180;
  return Boolean(isNativeComposing) || normalizedInputType.includes("composition") || withinImmediateReplayWindow;
}
