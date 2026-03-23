export function buildDevWorkspaceLabel(info, port = "") {
  return [info?.branch || info?.commit || "", info?.worktree || "", port ? `${port}` : ""].filter(Boolean).join(" · ");
}
