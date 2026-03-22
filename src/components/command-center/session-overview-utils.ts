import { lobsterWalkTuning, samplePufferPitchDegrees } from "@/components/command-center/lobster-walk-tuning";

const LOBSTER_WALK_MARGIN = 32;
const LOBSTER_SPEED_PX_PER_SECOND = 150;
const AQUATIC_SPEED_PX_PER_SECOND = LOBSTER_SPEED_PX_PER_SECOND * lobsterWalkTuning.aquaticSpeedMultiplier;
const PUFFER_EDGE_RESPONSE_THRESHOLD_PX = LOBSTER_WALK_MARGIN;
const PUFFER_MIN_EDGE_REROUTE_PITCH_DEGREES = 4;

type EdgeResponseOptions = {
  currentLeft?: number;
  currentTop?: number;
  dx?: number;
  dy?: number;
  height?: number;
  threshold?: number;
  viewportHeight?: number;
  viewportWidth?: number;
  width?: number;
};

type WalkerEndAtOptions = {
  currentEndAt?: number;
  fallbackDurationMs?: number;
  fallbackStartedAt?: number;
};

export function getPufferEdgeResponse({
  currentLeft = 0,
  currentTop = 0,
  dx = 0,
  dy = 0,
  height = 0,
  threshold = PUFFER_EDGE_RESPONSE_THRESHOLD_PX,
  viewportHeight = 0,
  viewportWidth = 0,
  width = 0,
}: EdgeResponseOptions = {}) {
  const safeThreshold = Math.max(0, Number(threshold || 0));
  const movingLeft = Number(dx || 0) < -0.01;
  const movingRight = Number(dx || 0) > 0.01;
  const movingUp = Number(dy || 0) < -0.01;
  const movingDown = Number(dy || 0) > 0.01;

  if (movingLeft && currentLeft <= safeThreshold) {
    return { edge: "left", type: "horizontal-flip" } as const;
  }

  if (movingRight && currentLeft + width >= viewportWidth - safeThreshold) {
    return { edge: "right", type: "horizontal-flip" } as const;
  }

  if (movingUp && currentTop <= safeThreshold) {
    return { edge: "top", type: "vertical-reroute" } as const;
  }

  if (movingDown && currentTop + height >= viewportHeight - safeThreshold) {
    return { edge: "bottom", type: "vertical-reroute" } as const;
  }

  return null;
}

export function resolvePufferPitchForVerticalEdge(edge: string, randomValue = Math.random()) {
  const sampledPitch = Math.max(
    Math.abs(samplePufferPitchDegrees(randomValue)),
    PUFFER_MIN_EDGE_REROUTE_PITCH_DEGREES,
  );

  if (edge === "top") {
    return sampledPitch;
  }

  if (edge === "bottom") {
    return -sampledPitch;
  }

  return samplePufferPitchDegrees(randomValue);
}

export function resolveWalkerEndAtAfterReroute({
  currentEndAt = 0,
  fallbackDurationMs = 0,
  fallbackStartedAt = 0,
}: WalkerEndAtOptions = {}) {
  if (Number.isFinite(currentEndAt) && currentEndAt > 0) {
    return currentEndAt;
  }

  return fallbackStartedAt + Math.max(0, Number(fallbackDurationMs || 0));
}

export function resolveAquaticWalkDurationMs(totalLengthPx = 0) {
  const normalizedLength = Math.max(0, Number(totalLengthPx || 0));
  return (normalizedLength / AQUATIC_SPEED_PX_PER_SECOND) * 1000;
}
