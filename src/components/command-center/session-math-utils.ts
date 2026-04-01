export function randomBetween(min, max) {
  return min + (Math.random() * (max - min));
}

export function normalizeAngleDelta(delta) {
  let normalized = delta;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

export function stepAngleDegrees(current, target, maxStep) {
  if (!Number.isFinite(current)) {
    return target;
  }

  const delta = normalizeAngleDelta(target - current);
  if (Math.abs(delta) <= maxStep) {
    return target;
  }

  return current + (Math.sign(delta) * maxStep);
}

export function randomNormal(mean, standardDeviation) {
  const u1 = Math.max(Math.random(), Number.EPSILON);
  const u2 = Math.random();
  const magnitude = Math.sqrt(-2 * Math.log(u1));
  const z0 = magnitude * Math.cos(2 * Math.PI * u2);
  return mean + (z0 * standardDeviation);
}

export function distanceBetween(a, b) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
