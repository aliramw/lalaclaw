import { distanceBetween } from "./session-math-utils";

type SessionOverviewPoint = { x: number; y: number };
type SessionOverviewSample = { length: number; x: number; y: number };

export function getWalkerForwardVector(species = "", motionAngle: number | null = 0) {
  const normalizedMotionAngle = Number.isFinite(motionAngle) ? Number(motionAngle) : 0;
  const radians = ((species === "crab" ? normalizedMotionAngle : normalizedMotionAngle - 90) * Math.PI) / 180;
  return {
    x: Math.cos(radians),
    y: Math.sin(radians),
  };
}

export function isAquaticWalkerSpecies(species = "") {
  return species === "puffer" || species === "fish" || species === "tropical-fish";
}

export function chaikinSmooth(points, iterations = 3) {
  let smoothed = points;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next = [smoothed[0]];
    for (let index = 0; index < smoothed.length - 1; index += 1) {
      const current = smoothed[index];
      const following = smoothed[index + 1];
      next.push({
        x: (0.75 * current.x) + (0.25 * following.x),
        y: (0.75 * current.y) + (0.25 * following.y),
      });
      next.push({
        x: (0.25 * current.x) + (0.75 * following.x),
        y: (0.25 * current.y) + (0.75 * following.y),
      });
    }
    next.push(smoothed.at(-1));
    smoothed = next;
  }

  return smoothed;
}

export function buildSamplesFromAbsolutePoints(points: SessionOverviewPoint[], startPoint: SessionOverviewPoint): SessionOverviewSample[] {
  let totalLength = 0;
  return points.map((point, index) => {
    if (index > 0) {
      totalLength += distanceBetween(points[index - 1], point);
    }

    return {
      length: totalLength,
      x: point.x - startPoint.x,
      y: point.y - startPoint.y,
    };
  });
}

export function buildBezierSamplesFromAbsolutePoints(
  startPoint: SessionOverviewPoint,
  controlPoint: SessionOverviewPoint,
  endPoint: SessionOverviewPoint,
  sampleCount = 64,
): SessionOverviewSample[] {
  const points: SessionOverviewPoint[] = [];
  for (let index = 0; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const inverse = 1 - t;
    points.push({
      x: (inverse * inverse * startPoint.x) + (2 * inverse * t * controlPoint.x) + (t * t * endPoint.x),
      y: (inverse * inverse * startPoint.y) + (2 * inverse * t * controlPoint.y) + (t * t * endPoint.y),
    });
  }

  return buildSamplesFromAbsolutePoints(points, startPoint);
}
