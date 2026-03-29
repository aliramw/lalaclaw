import { randomBetween } from "./session-math-utils";
import { clamp } from "./session-math-utils";

type SessionOverviewRect = { width: number; height: number };
type SessionOverviewPoint = { x: number; y: number };

const LOBSTER_WALK_MARGIN = 48;
const LOBSTER_OFFSCREEN_PADDING = 24;

export function createViewportBounds(originRect: SessionOverviewRect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minLeft = LOBSTER_WALK_MARGIN;
  const maxLeft = Math.max(minLeft, viewportWidth - originRect.width - LOBSTER_WALK_MARGIN);
  const minTop = LOBSTER_WALK_MARGIN;
  const maxTop = Math.max(minTop, viewportHeight - originRect.height - LOBSTER_WALK_MARGIN);

  return {
    maxLeft,
    maxTop,
    minLeft,
    minTop,
  };
}

export function pickRandomEdgeStart(originRect: SessionOverviewRect): SessionOverviewPoint {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const side = Math.floor(Math.random() * 4);

  if (side === 0) {
    return {
      x: randomBetween(LOBSTER_WALK_MARGIN, viewportWidth - originRect.width - LOBSTER_WALK_MARGIN),
      y: -originRect.height - LOBSTER_OFFSCREEN_PADDING,
    };
  }

  if (side === 1) {
    return {
      x: viewportWidth + LOBSTER_OFFSCREEN_PADDING,
      y: randomBetween(LOBSTER_WALK_MARGIN, viewportHeight - originRect.height - LOBSTER_WALK_MARGIN),
    };
  }

  if (side === 2) {
    return {
      x: randomBetween(LOBSTER_WALK_MARGIN, viewportWidth - originRect.width - LOBSTER_WALK_MARGIN),
      y: viewportHeight + LOBSTER_OFFSCREEN_PADDING,
    };
  }

  return {
    x: -originRect.width - LOBSTER_OFFSCREEN_PADDING,
    y: randomBetween(LOBSTER_WALK_MARGIN, viewportHeight - originRect.height - LOBSTER_WALK_MARGIN),
  };
}

export function getNearestEdgeExitPoint(point: SessionOverviewPoint, originRect: SessionOverviewRect): SessionOverviewPoint {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const candidates = [
    { distance: point.x, point: { x: -originRect.width - LOBSTER_OFFSCREEN_PADDING, y: clamp(point.y, LOBSTER_WALK_MARGIN, viewportHeight - originRect.height - LOBSTER_WALK_MARGIN) } },
    { distance: viewportWidth - point.x, point: { x: viewportWidth + LOBSTER_OFFSCREEN_PADDING, y: clamp(point.y, LOBSTER_WALK_MARGIN, viewportHeight - originRect.height - LOBSTER_WALK_MARGIN) } },
    { distance: point.y, point: { x: clamp(point.x, LOBSTER_WALK_MARGIN, viewportWidth - originRect.width - LOBSTER_WALK_MARGIN), y: -originRect.height - LOBSTER_OFFSCREEN_PADDING } },
    { distance: viewportHeight - point.y, point: { x: clamp(point.x, LOBSTER_WALK_MARGIN, viewportWidth - originRect.width - LOBSTER_WALK_MARGIN), y: viewportHeight + LOBSTER_OFFSCREEN_PADDING } },
  ];

  return candidates.sort((a, b) => a.distance - b.distance)[0]?.point || {
    x: point.x,
    y: point.y,
  };
}

export function pickRandomInteriorPoint(originRect: SessionOverviewRect): SessionOverviewPoint {
  const bounds = createViewportBounds(originRect);
  return {
    x: randomBetween(bounds.minLeft, bounds.maxLeft),
    y: randomBetween(bounds.minTop, bounds.maxTop),
  };
}

export function pickDiagonalInteriorPoint(startPoint: SessionOverviewPoint, originRect: SessionOverviewRect): SessionOverviewPoint {
  const bounds = createViewportBounds(originRect);
  const horizontalDirection = Math.random() < 0.5 ? -1 : 1;
  const verticalDirection = Math.random() < 0.5 ? -1 : 1;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    x: clamp(
      startPoint.x + (horizontalDirection * randomBetween(viewportWidth * 0.16, viewportWidth * 0.34)),
      bounds.minLeft,
      bounds.maxLeft,
    ),
    y: clamp(
      startPoint.y + (verticalDirection * randomBetween(viewportHeight * 0.16, viewportHeight * 0.34)),
      bounds.minTop,
      bounds.maxTop,
    ),
  };
}
