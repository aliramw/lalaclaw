export type MarkdownAnnotationMenuRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export type MarkdownAnnotationMenuViewport = {
  height: number;
  width: number;
};

export type MarkdownAnnotationMenuPosition = {
  left: number;
  top: number;
};

type ResolveMarkdownAnnotationMenuPositionOptions = {
  gap?: number;
  menuHeight?: number;
  menuWidth?: number;
  rect: MarkdownAnnotationMenuRect;
  scrollLeft?: number;
  scrollTop?: number;
  viewport: MarkdownAnnotationMenuViewport;
  viewportPadding?: number;
};

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function resolveMarkdownAnnotationMenuPosition({
  gap = 10,
  menuHeight = 124,
  menuWidth = 160,
  rect,
  scrollLeft = 0,
  scrollTop = 0,
  viewport,
  viewportPadding = 8,
}: ResolveMarkdownAnnotationMenuPositionOptions): MarkdownAnnotationMenuPosition {
  const fitsBelow = rect.bottom + gap + menuHeight <= viewport.height - viewportPadding;
  const fitsAbove = rect.top - gap - menuHeight >= viewportPadding;
  const idealTop = fitsBelow
    ? rect.bottom + gap
    : fitsAbove
      ? rect.top - menuHeight - gap
      : rect.bottom + gap;
  const idealLeft = rect.left;

  return {
    left: clampNumber(idealLeft, viewportPadding, viewport.width - menuWidth - viewportPadding) + scrollLeft,
    top: clampNumber(idealTop, viewportPadding, viewport.height - menuHeight - viewportPadding) + scrollTop,
  };
}
