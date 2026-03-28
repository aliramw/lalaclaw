import { randomBetween, distanceBetween, clamp } from "./session-math-utils";
import { getWalkerForwardVector, chaikinSmooth, buildSamplesFromAbsolutePoints, buildBezierSamplesFromAbsolutePoints } from "./session-walker-utils";
import { createViewportBounds } from "./session-viewport-utils";

type SessionOverviewPoint = { x: number; y: number };
type SessionOverviewRect = { width: number; height: number };
type SessionOverviewSample = { length: number; x: number; y: number };
type SessionOverviewWalkPath = {
  durationMs: number;
  samples: SessionOverviewSample[];
  totalLength: number;
};

const LOBSTER_SPEED_PX_PER_SECOND = 150;
const LOBSTER_MIN_DURATION_MS = 5000;
const LOBSTER_MAX_DURATION_MS = 15000;
const LOBSTER_MIN_RANDOM_POINT_COUNT = 5;
const LOBSTER_MAX_RANDOM_POINT_COUNT = 10;

export function getRandomTargetDurationMs() {
  return randomBetween(LOBSTER_MIN_DURATION_MS, LOBSTER_MAX_DURATION_MS);
}

export function isSeparatedFromPoints(candidate: SessionOverviewPoint, avoidPoints: SessionOverviewPoint[], minimumDistance: number) {
  return avoidPoints.every((point) => distanceBetween(candidate, point) >= minimumDistance);
}

export function createBreakoutAnchor({
  avoidPoints,
  bounds,
  originRect,
  startPoint,
}: {
  avoidPoints: SessionOverviewPoint[];
  bounds: ReturnType<typeof createViewportBounds>;
  originRect: SessionOverviewRect;
  startPoint: SessionOverviewPoint;
}): SessionOverviewPoint | null {
  if (!avoidPoints.length) {
    return null;
  }

  const nearest = avoidPoints.reduce<{ distance: number; point: SessionOverviewPoint } | null>((best, point) => {
    const distance = distanceBetween(startPoint, point);
    if (!best || distance < best.distance) {
      return { distance, point };
    }
    return best;
  }, null);

  if (!nearest || nearest.distance > (originRect.width || 40) * 1.8) {
    return null;
  }

  const dx = startPoint.x - nearest.point.x;
  const dy = startPoint.y - nearest.point.y;
  const magnitude = Math.hypot(dx, dy) || 1;

  return {
    x: clamp(startPoint.x + ((dx / magnitude) * 96), bounds.minLeft, bounds.maxLeft),
    y: clamp(startPoint.y + ((dy / magnitude) * 96), bounds.minTop, bounds.maxTop),
  };
}

export function buildRandomWalkPath({
  avoidPoints = [],
  initialMotionAngle = null,
  originRect,
  resolveEndPoint,
  species = "lobster",
  startPoint,
  targetDurationMs = null,
}: {
  avoidPoints?: SessionOverviewPoint[];
  initialMotionAngle?: number | null;
  originRect: SessionOverviewRect;
  resolveEndPoint: (point: SessionOverviewPoint) => SessionOverviewPoint;
  species?: string;
  startPoint: SessionOverviewPoint;
  targetDurationMs?: number | null;
}): SessionOverviewWalkPath {
  const bounds = createViewportBounds(originRect);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minStep = Math.max(72, Math.min(viewportWidth, viewportHeight) * 0.1);
  const desiredDurationMs = targetDurationMs ?? getRandomTargetDurationMs();
  const targetDistance = (LOBSTER_SPEED_PX_PER_SECOND * desiredDurationMs) / 1000;
  const desiredPointCount = clamp(
    Math.round(desiredDurationMs / 1800) + 2,
    LOBSTER_MIN_RANDOM_POINT_COUNT,
    LOBSTER_MAX_RANDOM_POINT_COUNT,
  );
  const minimumClearance = Math.max(originRect.width, originRect.height) * 1.4;

  let bestPath: SessionOverviewWalkPath | null = null;

  for (let attempt = 0; attempt < 18; attempt += 1) {
    const anchors: SessionOverviewPoint[] = [startPoint];
    const breakoutAnchor = createBreakoutAnchor({ avoidPoints, bounds, originRect, startPoint });
    let previous = startPoint;

    if (Number.isFinite(initialMotionAngle)) {
      const forward = getWalkerForwardVector(species, initialMotionAngle);
      const headingAnchor = {
        x: clamp(startPoint.x + (forward.x * (minStep * 0.9)), bounds.minLeft, bounds.maxLeft),
        y: clamp(startPoint.y + (forward.y * (minStep * 0.9)), bounds.minTop, bounds.maxTop),
      };

      if (
        distanceBetween(startPoint, headingAnchor) >= minStep * 0.45 &&
        isSeparatedFromPoints(headingAnchor, avoidPoints, minimumClearance * 0.8)
      ) {
        anchors.push(headingAnchor);
        previous = headingAnchor;
      }
    }

    if (breakoutAnchor && distanceBetween(startPoint, breakoutAnchor) >= minStep * 0.6) {
      anchors.push(breakoutAnchor);
      previous = breakoutAnchor;
    }

    while (anchors.length < desiredPointCount + 1) {
      const candidate = {
        x: randomBetween(bounds.minLeft, bounds.maxLeft),
        y: randomBetween(bounds.minTop, bounds.maxTop),
      };
      const farEnough = distanceBetween(previous, candidate) >= minStep;
      if (!farEnough || !isSeparatedFromPoints(candidate, avoidPoints, minimumClearance)) {
        continue;
      }

      anchors.push(candidate);
      previous = candidate;
    }

    anchors.push(resolveEndPoint(previous));
    const smoothedPoints = chaikinSmooth(anchors, 3);
    const samples = buildSamplesFromAbsolutePoints(smoothedPoints, startPoint);
    const totalLength = samples.at(-1)?.length || 0;
    const candidatePath = {
      durationMs: (totalLength / LOBSTER_SPEED_PX_PER_SECOND) * 1000,
      samples,
      totalLength,
    };

    if (!bestPath || Math.abs(candidatePath.totalLength - targetDistance) < Math.abs(bestPath.totalLength - targetDistance)) {
      bestPath = candidatePath;
    }
  }

  if (bestPath) {
    return bestPath;
  }

  const fallbackEndPoint = resolveEndPoint(startPoint);
  const fallbackSamples = buildSamplesFromAbsolutePoints([startPoint, fallbackEndPoint], startPoint);
  const fallbackLength = fallbackSamples.at(-1)?.length || 0;
  return {
    durationMs: (fallbackLength / LOBSTER_SPEED_PX_PER_SECOND) * 1000,
    samples: fallbackSamples,
    totalLength: fallbackLength,
  };
}
