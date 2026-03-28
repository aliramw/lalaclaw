// Scroll calculation utilities

export function calculatePinnedLatestBubbleScrollTop(viewport, bubble, ratio = 0.2) {
  if (!viewport || !bubble) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleTop = viewport.scrollTop + (bubbleRect.top - viewportRect.top);
  const targetTop = bubbleTop - viewport.clientHeight * ratio;

  return Math.max(0, Math.min(targetTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
}

export function calculateBubbleTopFocusScrollTop(viewport, bubble) {
  if (!viewport || !bubble) {
    return 0;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  const bubbleTop = viewport.scrollTop + (bubbleRect.top - viewportRect.top);
  const targetTop = bubbleTop - viewport.clientHeight * 0.3;

  return Math.max(0, Math.min(targetTop, Math.max(0, viewport.scrollHeight - viewport.clientHeight)));
}
