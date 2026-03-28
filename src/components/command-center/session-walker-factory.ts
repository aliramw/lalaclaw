import { randomBetween } from "./session-math-utils";
import { buildPrimaryLobsterWalkPath, buildCompanionLobsterWalkPath } from "./session-path-builder";
import { pickRandomEdgeStart, pickRandomInteriorPoint } from "./session-viewport-utils";

type SessionOverviewPoint = { x: number; y: number };
type SessionOverviewRect = { width: number; height: number };

let walkerIdCounter = 0;

export function createWalkerId(prefix) {
  walkerIdCounter += 1;
  return `${prefix}-${walkerIdCounter}`;
}
