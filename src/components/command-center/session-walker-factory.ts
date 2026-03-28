let walkerIdCounter = 0;

export function createWalkerId(prefix) {
  walkerIdCounter += 1;
  return `${prefix}-${walkerIdCounter}`;
}
