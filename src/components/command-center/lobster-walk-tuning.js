export const lobsterWalkTuning = {
  companionSpawnProbability: 0.5,
  companionMinCount: 1,
  companionMaxCount: 10,
  rerouteCooldownMs: 900,
  primaryFontSizePx: 48,
};

export function shouldSpawnLobsterCompanions(randomValue = Math.random()) {
  return randomValue <= lobsterWalkTuning.companionSpawnProbability;
}

export function sampleLobsterCompanionCount(randomValue = Math.random()) {
  const min = lobsterWalkTuning.companionMinCount;
  const max = lobsterWalkTuning.companionMaxCount;
  const clamped = Math.min(Math.max(randomValue, 0), 0.999999999999);
  return min + Math.floor(clamped * ((max - min) + 1));
}
