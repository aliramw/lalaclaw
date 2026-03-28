// React utilities

type NodeRefTarget<T> = { current: T | null } | ((instance: T | null) => void);

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
