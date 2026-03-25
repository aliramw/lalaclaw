import {
  joinPathSegments,
  doesFileExtensionChange,
  formatDisplayPath,
  getPathExtension,
  getPathName,
  mergeWorkspaceNodes,
  normalizeWorkspaceNodes,
  renameSessionItems,
  renameWorkspaceNodes,
  replacePathPrefix,
  resolveItemPath,
  updateWorkspaceNode,
} from "@/components/command-center/inspector-files-panel-utils";
import {
  compactHomePath,
  findWorkspaceNodeByPath,
  buildUserSessionItemsFromPaths,
  mergeSessionFileItems,
} from "@/components/command-center/inspector-panel-utils";
import {
  buildClipboardPasteRequestEntries,
  createClipboardUploadEntriesFromFiles,
  readClipboardFileEntries,
} from "@/components/command-center/clipboard-utils";
import { apiFetch } from "@/lib/api-client";

export type InspectorRewrite = {
  previousPath: string;
  nextPath: string;
};

export type InspectorRenameState = {
  source: string;
  item: any;
  value: string;
  submitting: boolean;
  error: string;
} | null;

export type InspectorRenameExtensionState = {
  fromExtension: string;
  toExtension: string;
} | null;

export async function requestWorkspaceTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  errorMessage = "",
  filter = "",
  targetPath = "",
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  errorMessage?: string;
  filter?: string;
  targetPath?: string;
}) {
  const params = new URLSearchParams();
  if (currentSessionUser) {
    params.set("sessionUser", currentSessionUser);
  }
  if (currentAgentId) {
    params.set("agentId", currentAgentId);
  }
  if (targetPath) {
    params.set("path", targetPath);
  }
  if (filter && !targetPath) {
    params.set("filter", filter);
  }

  const response = await apiFetch(`/api/workspace-tree?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || errorMessage);
  }
  return normalizeWorkspaceNodes(payload.items || [], currentWorkspaceRoot);
}

async function loadWorkspaceTreeSnapshot({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  filter = "",
  clearNodesOnError = false,
  loadFailedMessage,
  setWorkspaceNodes,
  setWorkspaceState,
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  filter?: string;
  clearNodesOnError?: boolean;
  loadFailedMessage: string;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
}) {
  try {
    const nextNodes = await requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      filter,
    });
    setWorkspaceNodes(nextNodes);
    setWorkspaceState({ loaded: true, loading: false, error: "" });
  } catch (error) {
    console.error(error);
    if (clearNodesOnError) {
      setWorkspaceNodes([]);
    }
    setWorkspaceState({
      loaded: false,
      loading: false,
      error: loadFailedMessage,
    });
  }
}

async function loadWorkspaceDirectoryChildren({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  targetPath = "",
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  targetPath?: string;
}) {
  const directChildren = await requestWorkspaceTree({
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    targetPath,
  });

  if (directChildren.length === 1 && directChildren[0]?.kind === "目录" && directChildren[0].hasChildren) {
    const onlyChild = directChildren[0];
    const nestedChildren = await loadWorkspaceDirectoryChildren({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      targetPath: resolveItemPath(onlyChild),
    });
    return [
      {
        ...onlyChild,
        children: nestedChildren,
        loaded: true,
        expanded: true,
        loading: false,
        error: "",
        hasChildren: nestedChildren.length > 0,
      },
    ];
  }

  return directChildren;
}

export async function fetchWorkspaceDirectoryContents({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  loadFailedMessage,
  node,
  preserveExpanded,
  setWorkspaceNodes,
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  loadFailedMessage: string;
  node: any;
  preserveExpanded?: boolean;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
}) {
  const nodePath = resolveItemPath(node);
  if (!nodePath) {
    return;
  }

  setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
    ...currentNode,
    expanded: preserveExpanded ?? currentNode.expanded,
    loading: true,
    error: "",
  })));

  try {
    const children = await loadWorkspaceDirectoryChildren({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      targetPath: nodePath,
    });
    setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
      ...currentNode,
      children,
      expanded: preserveExpanded ?? currentNode.expanded,
      loaded: true,
      loading: false,
      error: "",
      hasChildren: children.length > 0,
    })));
  } catch (error) {
    console.error(error);
    setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({
      ...currentNode,
      expanded: preserveExpanded ?? currentNode.expanded,
      loading: false,
      error: loadFailedMessage,
    })));
  }
}

export async function loadWorkspaceRootTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  hasWorkspaceFilter = false,
  loadFailedMessage,
  setWorkspaceNodes,
  setWorkspaceState,
  workspaceFilter = "",
  workspaceState,
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  hasWorkspaceFilter?: boolean;
  loadFailedMessage: string;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
  workspaceFilter?: string;
  workspaceState: { loaded?: boolean; loading?: boolean };
}) {
  if (workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
    return;
  }

  setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
  await loadWorkspaceTreeSnapshot({
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    filter: hasWorkspaceFilter ? workspaceFilter.trim() : "",
    loadFailedMessage,
    setWorkspaceNodes,
    setWorkspaceState,
  });
}

export async function toggleWorkspaceDirectoryOpen({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  loadFailedMessage,
  node,
  setWorkspaceNodes,
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  loadFailedMessage: string;
  node: any;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
}) {
  const nodePath = resolveItemPath(node);

  if (!nodePath || node.loading) {
    return;
  }

  if (node.expanded) {
    setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({ ...currentNode, expanded: false })));
    return;
  }

  if (node.loaded) {
    setWorkspaceNodes((current) => updateWorkspaceNode(current, nodePath, (currentNode) => ({ ...currentNode, expanded: true })));
    return;
  }

  await fetchWorkspaceDirectoryContents({
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    loadFailedMessage,
    node,
    preserveExpanded: true,
    setWorkspaceNodes,
  });
}

export function buildRenameDialogState(item: any, source = "session"): InspectorRenameState {
  const resolvedPath = resolveItemPath(item);
  const fallbackName = String(item?.name || getPathName(resolvedPath) || "").trim();
  if (!fallbackName) {
    return null;
  }

  return {
    source,
    item,
    value: fallbackName,
    submitting: false,
    error: "",
  };
}

export async function submitRenameChange({
  commitRename,
  forceExtensionChange = false,
  loadFailedMessage,
  renameState,
  setRenameExtensionState,
  setRenameState,
}: {
  commitRename: (payload: { item: any; nextName: string }) => Promise<void>;
  forceExtensionChange?: boolean;
  loadFailedMessage: string;
  renameState: InspectorRenameState;
  setRenameExtensionState: (value: InspectorRenameExtensionState | ((current: InspectorRenameExtensionState) => InspectorRenameExtensionState)) => void;
  setRenameState: (value: InspectorRenameState | ((current: InspectorRenameState) => InspectorRenameState)) => void;
}) {
  if (!renameState) {
    return;
  }

  const nextName = String(renameState.value || "").trim();
  const currentName = String(renameState.item?.name || getPathName(resolveItemPath(renameState.item)) || "").trim();
  if (!nextName) {
    setRenameState((current) => current ? { ...current, error: loadFailedMessage } : current);
    return;
  }

  if (!forceExtensionChange && doesFileExtensionChange(renameState.item, nextName)) {
    setRenameExtensionState({
      fromExtension: getPathExtension(currentName).replace(/^\./, ""),
      toExtension: getPathExtension(nextName).replace(/^\./, ""),
    });
    return;
  }

  setRenameState((current) => current ? { ...current, submitting: true, error: "" } : current);

  try {
    await commitRename({ item: renameState.item, nextName });
    setRenameState(null);
    setRenameExtensionState(null);
  } catch (error: any) {
    console.error(error);
    setRenameState((current) => current ? { ...current, submitting: false, error: error?.message || loadFailedMessage } : current);
    setRenameExtensionState(null);
  }
}

export async function commitRenameChange({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  hasWorkspaceFilter = false,
  item,
  loadFailedMessage,
  nextName,
  onTrackSessionFiles,
  renameFailedMessage,
  setLocalSessionItems,
  setSelectedDirectoryPath,
  setSessionPathRewrites,
  setWorkspaceNodes,
  setWorkspaceState,
  workspaceFilter = "",
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  hasWorkspaceFilter?: boolean;
  item: any;
  loadFailedMessage: string;
  nextName: string;
  onTrackSessionFiles?: (payload: { files: any[]; rewrites?: InspectorRewrite[] }) => void;
  renameFailedMessage: (name: string, error: string) => string;
  setLocalSessionItems: (value: any[] | ((current: any[]) => any[])) => void;
  setSelectedDirectoryPath: (value: string | ((current: string) => string)) => void;
  setSessionPathRewrites: (value: InspectorRewrite[] | ((current: InspectorRewrite[]) => InspectorRewrite[])) => void;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
  workspaceFilter?: string;
}) {
  const currentPath = resolveItemPath(item);
  if (!currentPath) {
    return;
  }

  const response = await apiFetch("/api/file-manager/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: currentPath, nextName }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(renameFailedMessage(item.name || getPathName(currentPath), payload.error || "Rename failed"));
  }

  const nextPath = String(payload.nextPath || "").trim() || replacePathPrefix(currentPath, currentPath, currentPath);
  onTrackSessionFiles?.({
    files: item?.kind === "目录" ? [] : buildUserSessionItemsFromPaths([nextPath], "modified"),
    rewrites: [{ previousPath: currentPath, nextPath }],
  });
  setSessionPathRewrites((current) => [...current, { previousPath: currentPath, nextPath }]);
  setLocalSessionItems((current) => {
    const renamedItems = renameSessionItems(current, currentPath, nextPath);
    if (item?.kind === "目录") {
      return renamedItems;
    }
    return mergeSessionFileItems(
      renamedItems,
      buildUserSessionItemsFromPaths([nextPath], "modified"),
    );
  });
  setSelectedDirectoryPath((current) => replacePathPrefix(current, currentPath, nextPath));

  if (hasWorkspaceFilter && currentWorkspaceRoot) {
    try {
      const nextNodes = await requestWorkspaceTree({
        currentAgentId,
        currentSessionUser,
        currentWorkspaceRoot,
        filter: workspaceFilter.trim(),
      });
      setWorkspaceNodes(nextNodes);
      setWorkspaceState({ loaded: true, loading: false, error: "" });
    } catch (error) {
      console.error(error);
      setWorkspaceState((current) => ({
        ...current,
        loading: false,
        error: loadFailedMessage,
      }));
    }
  } else {
    setWorkspaceNodes((current) => renameWorkspaceNodes(current, currentPath, nextPath));
  }
}

function getPasteTargetLabel(targetPath = "", currentWorkspaceRoot = "") {
  const displayPath = formatDisplayPath({ path: targetPath, fullPath: targetPath }, currentWorkspaceRoot);
  return displayPath || compactHomePath(targetPath) || targetPath;
}

export async function refreshWorkspaceAfterPaste({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  fetchWorkspaceDirectory,
  hasWorkspaceFilter = false,
  loadFailedMessage,
  setWorkspaceNodes,
  setWorkspaceState,
  targetPath,
  workspaceFilter = "",
  workspaceNodes = [],
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  fetchWorkspaceDirectory: (node: any, options?: { preserveExpanded?: boolean }) => Promise<void>;
  hasWorkspaceFilter?: boolean;
  loadFailedMessage: string;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
  targetPath: string;
  workspaceFilter?: string;
  workspaceNodes?: any[];
}) {
  if (!targetPath || !currentWorkspaceRoot) {
    return;
  }

  if (hasWorkspaceFilter) {
    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const nextNodes = await requestWorkspaceTree({
        currentAgentId,
        currentSessionUser,
        currentWorkspaceRoot,
        filter: workspaceFilter.trim(),
      });
      setWorkspaceNodes(nextNodes);
      setWorkspaceState({ loaded: true, loading: false, error: "" });
    } catch (error) {
      console.error(error);
      setWorkspaceState((current) => ({
        ...current,
        loading: false,
        error: loadFailedMessage,
      }));
    }
    return;
  }

  const targetNode = findWorkspaceNodeByPath(workspaceNodes, targetPath);
  if (targetNode) {
    await fetchWorkspaceDirectory(targetNode, { preserveExpanded: targetNode.expanded });
    return;
  }

  if (targetPath === currentWorkspaceRoot) {
    try {
      const nextNodes = await requestWorkspaceTree({
        currentAgentId,
        currentSessionUser,
        currentWorkspaceRoot,
      });
      setWorkspaceNodes(nextNodes);
      setWorkspaceState({ loaded: true, loading: false, error: "" });
    } catch (error) {
      console.error(error);
      setWorkspaceState((current) => ({
        ...current,
        loading: false,
        error: loadFailedMessage,
      }));
    }
  }
}

export async function pasteClipboardEntriesIntoDirectory({
  clipboardEntries,
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  directoryItem,
  fetchWorkspaceDirectory,
  hasWorkspaceFilter = false,
  loadFailedMessage,
  onTrackSessionFiles,
  pasteFailedMessage,
  pasteSucceededMessage,
  pasteUnavailableMessage,
  setLocalSessionItems,
  setPasteFeedback,
  setSelectedDirectoryPath,
  setWorkspaceNodes,
  setWorkspaceState,
  workspaceFilter = "",
  workspaceNodes = [],
}: {
  clipboardEntries: any[];
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  directoryItem: any;
  fetchWorkspaceDirectory: (node: any, options?: { preserveExpanded?: boolean }) => Promise<void>;
  hasWorkspaceFilter?: boolean;
  loadFailedMessage: string;
  onTrackSessionFiles?: (payload: { files: any[]; rewrites?: InspectorRewrite[] }) => void;
  pasteFailedMessage: (targetLabel: string, error: string) => string;
  pasteSucceededMessage: (savedCount: number, targetLabel: string) => string;
  pasteUnavailableMessage: string;
  setLocalSessionItems: (value: any[] | ((current: any[]) => any[])) => void;
  setPasteFeedback: (value: any | ((current: any) => any)) => void;
  setSelectedDirectoryPath: (value: string | ((current: string) => string)) => void;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
  workspaceFilter?: string;
  workspaceNodes?: any[];
}) {
  const targetPath = resolveItemPath(directoryItem);
  if (!targetPath) {
    return;
  }

  const targetLabel = getPasteTargetLabel(targetPath, currentWorkspaceRoot);

  try {
    const requestEntries = await buildClipboardPasteRequestEntries(clipboardEntries);
    if (!requestEntries.length) {
      throw new Error(pasteUnavailableMessage);
    }

    const response = await apiFetch("/api/file-manager/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directoryPath: targetPath,
        entries: requestEntries,
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || pasteUnavailableMessage);
    }

    setSelectedDirectoryPath(targetPath);
    const savedPaths = Array.isArray(payload.items)
      ? payload.items
          .map((item) => String(item?.fullPath || item?.path || "").trim())
          .filter(Boolean)
      : [];
    const fallbackPaths = requestEntries
      .map((entry) => String(entry?.name || "").trim())
      .filter(Boolean)
      .map((name) => joinPathSegments(targetPath, [name]));
    onTrackSessionFiles?.({
      files: buildUserSessionItemsFromPaths(savedPaths.length ? savedPaths : fallbackPaths, "created"),
    });
    setLocalSessionItems((current) =>
      mergeSessionFileItems(
        current,
        buildUserSessionItemsFromPaths(savedPaths.length ? savedPaths : fallbackPaths, "created"),
      )
    );
    await refreshWorkspaceAfterPaste({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      fetchWorkspaceDirectory,
      hasWorkspaceFilter,
      loadFailedMessage,
      setWorkspaceNodes,
      setWorkspaceState,
      targetPath,
      workspaceFilter,
      workspaceNodes,
    });

    const savedCount = Array.isArray(payload.items) && payload.items.length
      ? payload.items.length
      : requestEntries.length;
    setPasteFeedback({
      kind: "success",
      text: pasteSucceededMessage(savedCount, targetLabel),
    });
  } catch (error: any) {
    console.error(error);
    setPasteFeedback({
      kind: "error",
      text: pasteFailedMessage(targetLabel, error?.message || pasteUnavailableMessage),
    });
  }
}

export function resetFilesTabStateForWorkspaceRootChange({
  currentWorkspaceRoot = "",
  setContextMenu,
  setExpandedSessionDirectories,
  setLocalSessionItems,
  setPasteFeedback,
  setRenameExtensionState,
  setRenameState,
  setSelectedDirectoryPath,
  setSessionFilterInput,
  setSessionPathRewrites,
  setWorkspaceFilter,
  setWorkspaceFilterInput,
  setWorkspaceNodes,
  setWorkspaceState,
  workspaceItems = [],
  workspaceLoaded = false,
}: {
  currentWorkspaceRoot?: string;
  setContextMenu: (value: any) => void;
  setExpandedSessionDirectories: (value: Record<string, boolean>) => void;
  setLocalSessionItems: (value: any[]) => void;
  setPasteFeedback: (value: any) => void;
  setRenameExtensionState: (value: any) => void;
  setRenameState: (value: any) => void;
  setSelectedDirectoryPath: (value: string) => void;
  setSessionFilterInput: (value: string) => void;
  setSessionPathRewrites: (value: InspectorRewrite[]) => void;
  setWorkspaceFilter: (value: string) => void;
  setWorkspaceFilterInput: (value: string) => void;
  setWorkspaceNodes: (value: any[]) => void;
  setWorkspaceState: (value: any) => void;
  workspaceItems?: any[];
  workspaceLoaded?: boolean;
}) {
  setContextMenu(null);
  setSelectedDirectoryPath("");
  setPasteFeedback(null);
  setRenameState(null);
  setRenameExtensionState(null);
  setExpandedSessionDirectories({});
  setSessionFilterInput("");
  setWorkspaceFilterInput("");
  setWorkspaceFilter("");
  setLocalSessionItems([]);
  setSessionPathRewrites([]);
  setWorkspaceNodes(normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
  setWorkspaceState({
    loaded: workspaceLoaded,
    loading: false,
    error: "",
  });
}

export function syncWorkspaceNodesFromIncomingSnapshot({
  currentWorkspaceRoot = "",
  hasWorkspaceFilter = false,
  setWorkspaceNodes,
  setWorkspaceState,
  workspaceItems = [],
  workspaceLoaded = false,
}: {
  currentWorkspaceRoot?: string;
  hasWorkspaceFilter?: boolean;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
  workspaceItems?: any[];
  workspaceLoaded?: boolean;
}) {
  if (hasWorkspaceFilter) {
    return;
  }

  const nextNodes = normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot);
  const hasFreshWorkspaceSnapshot = workspaceLoaded || nextNodes.length > 0;

  if (!hasFreshWorkspaceSnapshot) {
    return;
  }

  setWorkspaceNodes((current) => (workspaceLoaded ? mergeWorkspaceNodes(current, nextNodes) : nextNodes));
  setWorkspaceState((current) => ({
    ...current,
    loaded: workspaceLoaded,
    loading: false,
    error: "",
  }));
}

export async function reloadFilteredWorkspaceTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  loadFailedMessage,
  setWorkspaceNodes,
  setWorkspaceState,
  workspaceFilter = "",
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  loadFailedMessage: string;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
  workspaceFilter?: string;
}) {
  setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
  await loadWorkspaceTreeSnapshot({
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    filter: workspaceFilter.trim(),
    clearNodesOnError: true,
    loadFailedMessage,
    setWorkspaceNodes,
    setWorkspaceState,
  });
}

export async function bootstrapWorkspaceTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  loadFailedMessage,
  setWorkspaceNodes,
  setWorkspaceState,
}: {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  loadFailedMessage: string;
  setWorkspaceNodes: (value: any[] | ((current: any[]) => any[])) => void;
  setWorkspaceState: (value: any | ((current: any) => any)) => void;
}) {
  setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
  await loadWorkspaceTreeSnapshot({
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    loadFailedMessage,
    setWorkspaceNodes,
    setWorkspaceState,
  });
}

export async function pasteClipboardEntriesFromMenu({
  directoryItem,
  pasteClipboardEntries,
}: {
  directoryItem: any;
  pasteClipboardEntries: (directoryItem: any, clipboardEntries: any[]) => Promise<void>;
}) {
  const clipboardEntries = await readClipboardFileEntries();
  await pasteClipboardEntries(directoryItem, clipboardEntries);
}

export function handleSelectedDirectoryPaste({
  event,
  selectedDirectoryPath = "",
  pasteClipboardEntries,
}: {
  event: ClipboardEvent;
  selectedDirectoryPath?: string;
  pasteClipboardEntries: (directoryItem: any, clipboardEntries: any[]) => Promise<void>;
}) {
  const pastedFiles = Array.from(event.clipboardData?.files || []).filter(Boolean);
  if (!pastedFiles.length || !selectedDirectoryPath) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  pasteClipboardEntries(
    { path: selectedDirectoryPath, fullPath: selectedDirectoryPath, kind: "目录" },
    createClipboardUploadEntriesFromFiles(pastedFiles as File[]),
  ).catch((error) => {
    console.error(error);
  });
}
