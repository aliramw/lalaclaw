export function shouldShowBubbleTopJumpButton({ viewportRect, bubbleRect, viewportClientHeight = 0 }) {
  if (!viewportRect || !bubbleRect) {
    return false;
  }

  const bubbleHeight = Number(bubbleRect.height) || Math.max(0, Number(bubbleRect.bottom || 0) - Number(bubbleRect.top || 0));
  const minTallHeight = Math.min(96, Math.max(56, viewportClientHeight * 0.18));
  const bubbleTallEnough = bubbleHeight >= minTallHeight;
  const bubbleTopHidden = bubbleRect.top <= viewportRect.top - 8;
  const bubbleNotFullyVisible = bubbleTopHidden || bubbleRect.bottom >= viewportRect.bottom - 8;
  const bubbleStillVisible = bubbleRect.bottom > viewportRect.top + 24;

  return bubbleTallEnough && bubbleTopHidden && bubbleNotFullyVisible && bubbleStillVisible;
}
