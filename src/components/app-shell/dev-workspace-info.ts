export function getDevWorkspaceInfo() {
  const info = globalThis.__LALACLAW_DEV_INFO__;
  return info && typeof info === "object" ? info : null;
}
