type LobsterWalker = {
  id?: string;
  type?: string;
  lastRerouteAt?: number;
};

type LobsterPosition = {
  centerX?: number;
  centerY?: number;
  fontSize?: number;
  walker?: LobsterWalker;
};

function getCellKey(column, row) {
  return `${column}:${row}`;
}

function isEligibleForReroute(position: LobsterPosition | null | undefined, now: number, cooldownMs: number, reroutedWalkerIds: Set<string>) {
  const walkerId = String(position?.walker?.id || "").trim();
  if (!walkerId || reroutedWalkerIds.has(walkerId)) {
    return false;
  }

  return now - Number(position?.walker?.lastRerouteAt || 0) >= cooldownMs;
}

export function findNearbyCollisionPairs(positions: LobsterPosition[] = [], {
  baseCollisionDistance = 0,
}: {
  baseCollisionDistance?: number;
} = {}) {
  if (!Array.isArray(positions) || positions.length < 2) {
    return [];
  }

  const maxFontSize = positions.reduce(
    (currentMax, position) => Math.max(currentMax, Number(position?.fontSize || 0)),
    0,
  );
  const cellSize = Math.max(baseCollisionDistance, maxFontSize * 0.84, 1);
  const occupiedCells = new Map();
  const pairs: Array<[number, number]> = [];

  positions.forEach((position, index) => {
    const column = Math.floor(Number(position?.centerX || 0) / cellSize);
    const row = Math.floor(Number(position?.centerY || 0) / cellSize);

    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        const neighborKey = getCellKey(column + columnOffset, row + rowOffset);
        const neighborIndices = occupiedCells.get(neighborKey) || [];
        neighborIndices.forEach((otherIndex) => {
          pairs.push([otherIndex, index]);
        });
      }
    }

    const cellKey = getCellKey(column, row);
    const existingIndices = occupiedCells.get(cellKey) || [];
    existingIndices.push(index);
    occupiedCells.set(cellKey, existingIndices);
  });

  return pairs;
}

export function chooseCollisionRerouteTarget(current: LobsterPosition, other: LobsterPosition, {
  now = 0,
  cooldownMs = 0,
  reroutedWalkerIds = new Set(),
}: {
  now?: number;
  cooldownMs?: number;
  reroutedWalkerIds?: Set<string>;
} = {}) {
  const candidates = [current, other].filter((position) =>
    isEligibleForReroute(position, now, cooldownMs, reroutedWalkerIds),
  );

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftIsPrimary = left?.walker?.type === "primary";
    const rightIsPrimary = right?.walker?.type === "primary";
    if (leftIsPrimary !== rightIsPrimary) {
      return leftIsPrimary ? 1 : -1;
    }

    const leftLastRerouteAt = Number(left?.walker?.lastRerouteAt || 0);
    const rightLastRerouteAt = Number(right?.walker?.lastRerouteAt || 0);
    if (leftLastRerouteAt !== rightLastRerouteAt) {
      return leftLastRerouteAt - rightLastRerouteAt;
    }

    return Number(left?.fontSize || 0) - Number(right?.fontSize || 0);
  });

  return candidates[0] || null;
}
