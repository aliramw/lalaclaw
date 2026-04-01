// React utilities
import type { RefObject } from "react";

export type NodeRefTarget<T> =
  | RefObject<T | null>
  | { current: T | null }
  | ((instance: T | null) => void)
  | null;

export function getRefCurrent<T>(
  ref:
    | NodeRefTarget<T>
    | undefined,
): T | null {
  if (!ref || typeof ref === "function") {
    return null;
  }
  return ref.current;
}
