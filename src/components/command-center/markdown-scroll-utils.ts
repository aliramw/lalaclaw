export function findScrollableContainer(element: HTMLElement | null) {
  let current = element?.parentElement || null;

  while (current) {
    if (current.hasAttribute("data-radix-scroll-area-viewport")) {
      return current;
    }

    if (typeof window !== "undefined") {
      const computedStyle = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll)/.test(computedStyle.overflowY || "")
        && current.scrollHeight > current.clientHeight;
      if (canScrollY) {
        return current;
      }
    }

    current = current.parentElement;
  }

  return null;
}

export function scrollElementIntoNearestContainer(
  element: HTMLElement | null,
  {
    behavior = "smooth",
    topOffset = 12,
  }: {
    behavior?: ScrollBehavior;
    topOffset?: number;
  } = {},
) {
  if (!element) {
    return false;
  }

  const scrollContainer = findScrollableContainer(element);
  if (scrollContainer && typeof scrollContainer.scrollTo === "function") {
    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const targetTop = scrollContainer.scrollTop + (elementRect.top - containerRect.top) - topOffset;
    scrollContainer.scrollTo({
      top: Math.max(targetTop, 0),
      behavior,
    });
    return true;
  }

  element.scrollIntoView({
    behavior,
    block: "start",
    inline: "nearest",
  });
  return true;
}
