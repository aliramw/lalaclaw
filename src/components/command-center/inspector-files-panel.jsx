import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Eye, FolderOpen, Pencil, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const homePrefix = "/Users/marila";
const WORKSPACE_FILTER_DEBOUNCE_MS = 150;
const contextMenuViewportPadding = 8;
const previewableExtensions = new Set([
  "txt", "text", "log", "md", "markdown", "json", "csv", "xls", "xlsx", "xlsm", "pdf", "doc", "docx", "ppt", "pptx",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "heif",
  "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts",
  "lua", "m", "mm", "scala", "dart", "ex", "exs", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "html", "xml", "yml", "yaml", "toml", "ini", "conf", "env",
]);
const editableExtensions = new Set([
  "txt", "text", "log", "md", "markdown", "json",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "c", "cc", "cpp", "cxx", "h", "hpp", "cs", "php", "swift", "kt", "kts",
  "lua", "m", "mm", "scala", "dart", "ex", "exs", "pl", "pm", "r",
  "sh", "bash", "zsh", "fish", "ps1", "sql", "css", "scss", "sass", "less",
  "html", "xml", "yml", "yaml", "toml", "ini", "conf", "env",
]);

function compactHomePath(filePath = "") {
  if (!filePath) {
    return "";
  }
  return filePath.startsWith(homePrefix) ? `~${filePath.slice(homePrefix.length)}` : filePath;
}

function formatDisplayPath(item, currentWorkspaceRoot = "") {
  const sourcePath = String(item.fullPath || item.path || "");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\/+$/, "");
  if (!sourcePath) {
    return "";
  }
  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return relativePath || sourcePath.split("/").pop() || "";
  }
  return compactHomePath(sourcePath);
}

function compareFileItemsByPath(left, right, currentWorkspaceRoot = "") {
  return formatDisplayPath(left, currentWorkspaceRoot).localeCompare(
    formatDisplayPath(right, currentWorkspaceRoot),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

function resolveItemPath(item) {
  return String(item?.fullPath || item?.path || "").trim();
}

function canPreviewFileItem(item) {
  if (!item || item.kind === "目录") {
    return false;
  }

  const targetPath = resolveItemPath(item).toLowerCase();
  if (!targetPath) {
    return false;
  }

  const fileName = targetPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && previewableExtensions.has(extension);
}

function canEditFileItem(item) {
  if (!item || item.kind === "目录") {
    return false;
  }

  const targetPath = resolveItemPath(item).toLowerCase();
  if (!targetPath) {
    return false;
  }

  const fileName = targetPath.split("/").pop() || "";
  if (fileName === "dockerfile" || fileName === "makefile") {
    return true;
  }

  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  return Boolean(extension) && editableExtensions.has(extension);
}

function countWorkspaceFiles(nodes = []) {
  return nodes.reduce((total, node) => {
    if (node.kind === "目录") {
      return total + countWorkspaceFiles(node.children || []);
    }
    return total + 1;
  }, 0);
}

function escapeRegexCharacters(value = "") {
  return String(value || "").replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

function buildFileFilterMatcher(rawFilter = "") {
  const filters = String(rawFilter || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!filters.length) {
    return null;
  }

  const compiledFilters = filters.map((filter) => {
    if (filter.includes("*") || filter.includes("?")) {
      const expression = `^${escapeRegexCharacters(filter).replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`;
      return { type: "glob", regex: new RegExp(expression, "i") };
    }

    return { type: "text", value: filter.toLocaleLowerCase() };
  });

  return (item, currentWorkspaceRoot = "") => {
    const resolvedPath = resolveItemPath(item).replace(/\\/g, "/");
    const displayPath = String(formatDisplayPath(item, currentWorkspaceRoot) || item?.path || "").replace(/\\/g, "/").replace(/^~\//, "");
    const fileName = displayPath.split("/").filter(Boolean).pop() || resolvedPath.split("/").filter(Boolean).pop() || "";
    const candidates = [fileName, displayPath].filter(Boolean);

    return compiledFilters.some((filter) => {
      if (filter.type === "glob") {
        return candidates.some((candidate) => filter.regex.test(candidate));
      }
      return candidates.some((candidate) => candidate.toLocaleLowerCase().includes(filter.value));
    });
  };
}

async function requestWorkspaceTree({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  filter = "",
  targetPath = "",
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

  const response = await fetch(`/api/workspace-tree?${params.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "Workspace tree failed");
  }
  return normalizeWorkspaceNodes(payload.items || [], currentWorkspaceRoot);
}

export function FileLink({
  item,
  compact = false,
  currentWorkspaceRoot = "",
  disabledReason = "",
  label,
  onOpenPreview,
  onOpenContextMenu,
}) {
  const canOpen = Boolean((item.fullPath || item.path) && item.kind !== "目录");
  const isInteractive = canOpen && !disabledReason;
  const displayPath = label || formatDisplayPath(item, currentWorkspaceRoot);

  const button = (
    <button
      type="button"
      onContextMenu={(event) => {
        if (!isInteractive) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu?.(event, item);
      }}
      onClick={() => {
        if (isInteractive) {
          onOpenPreview?.(item);
        }
      }}
      aria-disabled={!isInteractive}
      className={cn(
        "block w-full appearance-none rounded-sm border-0 bg-transparent px-1.5 text-left shadow-none transition-[background-color,color,box-shadow] focus:outline-none focus-visible:outline-none",
        isInteractive ? "cursor-pointer hover:bg-accent/25 focus-visible:bg-accent/15 focus-visible:ring-1 focus-visible:ring-border/35" : "cursor-not-allowed opacity-55",
        compact ? "px-0 py-px" : "px-2 py-1",
      )}
      title={item.fullPath || item.path}
    >
      <div
        className={cn(
          "file-link break-all font-mono transition-colors",
          compact ? "text-[11px] leading-[1.35]" : "text-sm",
          isInteractive ? "" : "no-underline",
        )}
      >
        {displayPath}
      </div>
    </button>
  );

  if (!disabledReason) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function normalizeWorkspaceNodes(items = [], currentWorkspaceRoot = "") {
  return items.map((item) => {
    const resolvedPath = resolveItemPath(item);
    const displayPath = formatDisplayPath(item, currentWorkspaceRoot);
    const normalizedChildren = Array.isArray(item?.children)
      ? normalizeWorkspaceNodes(item.children, currentWorkspaceRoot)
      : [];
    const fallbackName =
      item?.name
      || displayPath.split("/").filter(Boolean).pop()
      || resolvedPath.split("/").filter(Boolean).pop()
      || "";

    return {
      ...item,
      key: resolvedPath || `${item.kind || "item"}:${fallbackName}`,
      name: fallbackName,
      path: item?.path || resolvedPath,
      fullPath: item?.fullPath || resolvedPath,
      hasChildren: Boolean(item?.hasChildren) || normalizedChildren.length > 0,
      loaded: item?.kind !== "目录" || item?.hasChildren === false || normalizedChildren.length > 0,
      loading: false,
      expanded: Boolean(item?.expanded) || normalizedChildren.length > 0,
      error: "",
      children: normalizedChildren,
    };
  });
}

function joinPathSegments(basePath = "", segments = []) {
  if (!segments.length) {
    return basePath || "";
  }

  if (basePath === "/") {
    return `/${segments.join("/")}`;
  }

  const normalizedBase = String(basePath || "").replace(/\/+$/, "");
  return normalizedBase ? `${normalizedBase}/${segments.join("/")}` : segments.join("/");
}

function getSessionTreeLocation(item, currentWorkspaceRoot = "") {
  const sourcePath = resolveItemPath(item).replace(/\\/g, "/");
  const workspaceRoot = String(currentWorkspaceRoot || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");

  if (!sourcePath) {
    return { basePath: "", segments: [] };
  }

  if (workspaceRoot && (sourcePath === workspaceRoot || sourcePath.startsWith(`${workspaceRoot}/`))) {
    const relativePath = sourcePath.slice(workspaceRoot.length).replace(/^\/+/, "");
    return {
      basePath: workspaceRoot,
      segments: relativePath.split("/").filter(Boolean),
    };
  }

  if (sourcePath.startsWith(`${homePrefix}/`)) {
    return {
      basePath: homePrefix,
      segments: sourcePath.slice(homePrefix.length).replace(/^\/+/, "").split("/").filter(Boolean),
    };
  }

  return {
    basePath: sourcePath.startsWith("/") ? "/" : "",
    segments: sourcePath.replace(/^\/+/, "").split("/").filter(Boolean),
  };
}

function sortTreeNodes(nodes = []) {
  return [...nodes]
    .map((node) => (
      node.kind === "目录"
        ? { ...node, children: sortTreeNodes(node.children || []) }
        : node
    ))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "目录" ? -1 : 1;
      }
      return String(left.name || "").localeCompare(String(right.name || ""), undefined, { numeric: true, sensitivity: "base" });
    });
}

function buildSessionTreeNodes(items = [], currentWorkspaceRoot = "") {
  const rootNodes = [];

  [...items]
    .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot))
    .forEach((item) => {
      const sourcePath = resolveItemPath(item);
      const { basePath, segments } = getSessionTreeLocation(item, currentWorkspaceRoot);
      if (!sourcePath || !segments.length) {
        return;
      }

      let currentLevel = rootNodes;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const name = segments[index];
        const fullPath = joinPathSegments(basePath, segments.slice(0, index + 1));
        let node = currentLevel.find((candidate) => candidate.kind === "目录" && candidate.fullPath === fullPath);
        if (!node) {
          node = {
            key: `session-dir:${fullPath}`,
            name,
            path: fullPath,
            fullPath,
            kind: "目录",
            loaded: true,
            children: [],
          };
          currentLevel.push(node);
        }
        currentLevel = node.children;
      }

      currentLevel.push({
        ...item,
        key: sourcePath,
        name: segments.at(-1) || sourcePath.split("/").pop() || "",
        path: sourcePath,
        fullPath: sourcePath,
        kind: "文件",
      });
    });

  return sortTreeNodes(rootNodes);
}

function getCompactDirectoryChain(node) {
  const chain = [node];
  let currentNode = node;

  while (
    currentNode?.kind === "目录"
    && currentNode.loaded
    && !currentNode.loading
    && !currentNode.error
    && Array.isArray(currentNode.children)
    && currentNode.children.length === 1
    && currentNode.children[0]?.kind === "目录"
  ) {
    currentNode = currentNode.children[0];
    chain.push(currentNode);
  }

  return chain;
}

function formatCompactDirectoryLabel(chain = []) {
  return chain.map((node) => node.name).filter(Boolean).join(" / ");
}

function renderCompactDirectoryLabel(chain = []) {
  const names = chain.map((node) => node.name).filter(Boolean);
  if (!names.length) {
    return null;
  }

  if (names.length === 1) {
    return <span className="truncate">{names[0]}</span>;
  }

  const parts = [];
  names.forEach((name, index) => {
    if (index > 0) {
      parts.push(
        <span
          key={`separator-${index}`}
          aria-hidden="true"
          className="shrink-0 text-[10px] font-normal text-muted-foreground/45"
        >
          /
        </span>,
      );
    }

    parts.push(
      <span
        key={`segment-${index}`}
        className={cn(index === names.length - 1 ? "truncate" : "shrink-0")}
      >
        {name}
      </span>,
    );
  });

  return (
    <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
      {parts}
    </span>
  );
}

function mergeWorkspaceNodes(previousNodes = [], nextNodes = []) {
  const previousByPath = new Map(
    previousNodes
      .map((node) => [resolveItemPath(node), node])
      .filter(([nodePath]) => Boolean(nodePath)),
  );

  return nextNodes.map((node) => {
    const nodePath = resolveItemPath(node);
    const previousNode = previousByPath.get(nodePath);

    if (!previousNode || node.kind !== "目录") {
      return previousNode && node.kind !== "目录"
        ? { ...node, expanded: previousNode.expanded, loaded: previousNode.loaded, loading: previousNode.loading, error: previousNode.error }
        : node;
    }

    return {
      ...node,
      expanded: previousNode.expanded,
      loaded: previousNode.loaded || node.loaded,
      loading: previousNode.loading,
      error: previousNode.error,
      children: previousNode.children || [],
      hasChildren: previousNode.hasChildren || node.hasChildren,
    };
  });
}

function updateWorkspaceNode(nodes = [], targetPath = "", updater) {
  return nodes.map((node) => {
    const nodePath = resolveItemPath(node);
    if (nodePath === targetPath) {
      return updater(node);
    }
    if (node.kind === "目录" && node.children?.length) {
      return {
        ...node,
        children: updateWorkspaceNode(node.children, targetPath, updater),
      };
    }
    return node;
  });
}

function WorkspaceTreeNode({
  currentWorkspaceRoot = "",
  depth = 0,
  getDisabledFileSelectionReason = () => "",
  messages,
  node,
  onOpenContextMenu,
  onOpenDirectory,
  onOpenPreview,
}) {
  const isDirectory = node.kind === "目录";
  const compactChain = isDirectory ? getCompactDirectoryChain(node) : [];
  const visibleNode = compactChain.at(-1) || node;
  const displayName = compactChain.length ? formatCompactDirectoryLabel(compactChain) : node.name;
  const isExpandable = isDirectory && (visibleNode.hasChildren || visibleNode.children?.length || visibleNode.loading || visibleNode.error);

  if (!isDirectory) {
    return (
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <FileLink
          item={node}
          label={node.name}
          compact
          currentWorkspaceRoot={currentWorkspaceRoot}
          disabledReason={getDisabledFileSelectionReason(node)}
          onOpenPreview={onOpenPreview}
          onOpenContextMenu={onOpenContextMenu}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm py-0.5 text-left text-[11px] font-medium text-muted-foreground transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/35",
          !isExpandable && "cursor-default hover:bg-transparent",
        )}
        aria-expanded={isExpandable ? node.expanded : undefined}
        aria-label={`${displayName} ${node.expanded ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenContextMenu?.(event, node);
        }}
        onClick={() => {
          if (isExpandable || !node.loaded) {
            onOpenDirectory?.(node);
          }
        }}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpandable ? (node.expanded ? "rotate-0" : "-rotate-90") : "opacity-0")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        {compactChain.length ? renderCompactDirectoryLabel(compactChain) : <span className="truncate">{displayName}</span>}
      </button>
      {node.expanded ? (
        <div className="space-y-1">
          {visibleNode.loading ? (
            <div className="px-1 py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              {messages.inspector.workspaceTree.loadingFolder}
            </div>
          ) : null}
          {!visibleNode.loading && visibleNode.error ? (
            <div className="px-1 py-1 text-[11px] text-rose-500" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              {visibleNode.error}
            </div>
          ) : null}
          {!visibleNode.loading && !visibleNode.error && visibleNode.loaded && !visibleNode.children.length ? (
            <div className="px-1 py-1 text-[11px] text-muted-foreground" style={{ paddingLeft: `${(depth + 1) * 14}px` }}>
              {messages.inspector.workspaceTree.emptyFolder}
            </div>
          ) : null}
          {!visibleNode.loading && !visibleNode.error ? visibleNode.children.map((child) => (
            <WorkspaceTreeNode
              key={child.key}
              currentWorkspaceRoot={currentWorkspaceRoot}
              depth={depth + 1}
              getDisabledFileSelectionReason={getDisabledFileSelectionReason}
              messages={messages}
              node={child}
              onOpenPreview={onOpenPreview}
              onOpenContextMenu={onOpenContextMenu}
              onOpenDirectory={onOpenDirectory}
            />
          )) : null}
        </div>
      ) : null}
    </div>
  );
}

function SessionTreeNode({
  currentWorkspaceRoot = "",
  depth = 0,
  getDisabledFileSelectionReason = () => "",
  expandedDirectories = {},
  messages,
  node,
  onOpenContextMenu,
  onOpenPreview,
  onToggleDirectory,
}) {
  const isDirectory = node.kind === "目录";
  const compactChain = isDirectory ? getCompactDirectoryChain(node) : [];
  const visibleNode = compactChain.at(-1) || node;
  const displayName = compactChain.length ? formatCompactDirectoryLabel(compactChain) : node.name;

  if (!isDirectory) {
    return (
      <div style={{ paddingLeft: `${depth * 14}px` }}>
        <FileLink
          item={node}
          label={node.name}
          compact
          currentWorkspaceRoot={currentWorkspaceRoot}
          disabledReason={getDisabledFileSelectionReason(node)}
          onOpenPreview={onOpenPreview}
          onOpenContextMenu={onOpenContextMenu}
        />
      </div>
    );
  }

  const isExpanded = expandedDirectories[node.fullPath] ?? true;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded-sm py-0.5 text-left text-[11px] font-medium text-muted-foreground transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/35"
        aria-expanded={isExpanded}
        aria-label={`${displayName} ${isExpanded ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onClick={() => {
          onToggleDirectory?.(node.fullPath);
        }}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        {compactChain.length ? renderCompactDirectoryLabel(compactChain) : <span className="truncate">{displayName}</span>}
      </button>
      {isExpanded ? (
        <div className="space-y-1">
          {visibleNode.children.map((child) => (
            <SessionTreeNode
              key={child.key}
              currentWorkspaceRoot={currentWorkspaceRoot}
              depth={depth + 1}
              getDisabledFileSelectionReason={getDisabledFileSelectionReason}
              expandedDirectories={expandedDirectories}
              messages={messages}
              node={child}
              onOpenPreview={onOpenPreview}
              onOpenContextMenu={onOpenContextMenu}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileContextMenu({ menu, messages, onClose, onOpenEdit, onOpenPreview, onRefreshDirectory }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu) {
      return;
    }

    const menuNode = menuRef.current;
    if (!menuNode) {
      setPosition({ left: menu.x, top: menu.y });
      return;
    }

    const rect = menuNode.getBoundingClientRect();
    const maxLeft = Math.max(contextMenuViewportPadding, window.innerWidth - rect.width - contextMenuViewportPadding);
    const maxTop = Math.max(contextMenuViewportPadding, window.innerHeight - rect.height - contextMenuViewportPadding);

    setPosition({
      left: Math.min(Math.max(contextMenuViewportPadding, menu.x), maxLeft),
      top: Math.min(Math.max(contextMenuViewportPadding, menu.y), maxTop),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleViewportChange = () => onClose();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard?.writeText?.(resolveItemPath(menu.item));
    } finally {
      onClose();
    }
  };
  const canPreview = canPreviewFileItem(menu.item);
  const canEdit = canEditFileItem(menu.item);
  const canRefreshDirectory = menu.item?.kind === "目录" && typeof onRefreshDirectory === "function";

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={messages.inspector.fileMenu.label}
      className="fixed z-50 min-w-40 rounded-md border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: position.left, top: position.top }}
    >
      {canRefreshDirectory ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onRefreshDirectory(menu.item).catch(() => {});
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
        >
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{messages.inspector.fileMenu.refresh}</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={!canPreview}
            onClick={() => {
              if (!canPreview) {
                return;
              }
              onOpenPreview?.(menu.item);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.fileMenu.preview}</span>
          </button>
          {canEdit ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenEdit?.(menu.item);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{messages.inspector.fileMenu.edit}</span>
            </button>
          ) : null}
        </>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          handleCopyPath().catch(() => {});
        }}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
      >
        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        <span>{messages.inspector.fileMenu.copyPath}</span>
      </button>
    </div>
  );
}

function FileGroupSection({ children, count = 0, defaultOpen = true, label, messages, onToggle, action, spacingClassName = "space-y-2" }) {
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  return (
    <section className={cn(spacingClassName)}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="grid min-w-0 flex-1 grid-cols-[1rem_auto_auto_1fr] items-center gap-2 rounded-md py-0.5 text-left transition hover:bg-muted/20"
          aria-expanded={!collapsed}
          aria-label={`${label} ${collapsed ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
          onClick={() => setCollapsed((current) => {
            const nextCollapsed = !current;
            onToggle?.(!nextCollapsed);
            return nextCollapsed;
          })}
        >
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsed ? "-rotate-90" : "rotate-0")} />
          <div className="truncate text-[11px] font-medium uppercase text-muted-foreground">{label}</div>
          <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
            {count}
          </Badge>
        </button>
        {action ? <div className="min-w-0 shrink-0">{action}</div> : null}
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

function FileFilterInput({ filterInput, messages, onChange, onClear }) {
  return (
    <label className="relative block w-[10.5rem]">
      <span className="sr-only">{messages.label}</span>
      <input
        type="text"
        value={filterInput}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={messages.placeholder}
        aria-label={messages.label}
        className="flex h-7 w-full rounded-md border border-input bg-background px-2.5 py-1 pr-8 text-[12px] leading-none shadow-xs transition-[color,box-shadow] outline-none placeholder:text-[12px] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
      />
      {filterInput ? (
        <button
          type="button"
          aria-label={messages.clear}
          onClick={onClear}
          className="absolute inset-y-0 right-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

function PanelEmpty({ compact = false, text }) {
  return (
    <div className={cn(compact && "rounded-[16px]")}>
      <div className={cn("flex items-center justify-center text-center text-sm text-muted-foreground", compact ? "px-5 py-5" : "py-8")}>
        {text}
      </div>
    </div>
  );
}

function InspectorHint({ text }) {
  if (!text) {
    return null;
  }

  return (
    <p className="pr-6 text-[11px] leading-5 text-muted-foreground/80">
      {text}
    </p>
  );
}

export function InspectorFilesPanel({
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  fileSelectionMode = "preview",
  items,
  messages,
  onOpenEdit,
  onOpenPreview,
  showHint = true,
  workspaceCount,
  workspaceItems = [],
  workspaceLoaded = false,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [sessionFilterInput, setSessionFilterInput] = useState("");
  const [workspaceFilterInput, setWorkspaceFilterInput] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const fileActionSections = [
    { key: "created", label: messages.inspector.fileActions.created },
    { key: "modified", label: messages.inspector.fileActions.modified },
    { key: "viewed", label: messages.inspector.fileActions.viewed },
  ];
  const sessionFilterMatcher = buildFileFilterMatcher(sessionFilterInput);
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: items
        .filter((item) => item.primaryAction === section.key)
        .filter((item) => (sessionFilterMatcher ? sessionFilterMatcher(item, currentWorkspaceRoot) : true))
        .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot)),
    }))
    .filter((section) => section.items.length);
  const [workspaceNodes, setWorkspaceNodes] = useState(() => normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
  const [workspaceState, setWorkspaceState] = useState({
    loaded: workspaceLoaded,
    loading: false,
    error: "",
  });
  const previousWorkspaceRootRef = useRef(currentWorkspaceRoot);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [expandedSessionDirectories, setExpandedSessionDirectories] = useState({});
  const hasSessionFiles = items.length > 0;
  const hasSessionFilter = Boolean(String(sessionFilterInput || "").trim());
  const visibleSessionCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hasWorkspaceFilter = Boolean(String(workspaceFilter || "").trim());
  const isEditSelectionMode = fileSelectionMode === "edit";
  const visibleWorkspaceCount = hasWorkspaceFilter
    ? countWorkspaceFiles(workspaceNodes)
    : (Number.isFinite(workspaceCount) ? workspaceCount : workspaceNodes.length);
  const getDisabledFileSelectionReason = useCallback((item) => {
    if (!isEditSelectionMode || item?.kind === "目录" || canEditFileItem(item)) {
      return "";
    }
    return messages.inspector.previewActions.editSelectionUnavailable;
  }, [isEditSelectionMode, messages.inspector.previewActions.editSelectionUnavailable]);
  const handleOpenFile = useCallback((item) => {
    if (item?.kind === "目录") {
      return;
    }

    if (isEditSelectionMode) {
      if (!canEditFileItem(item)) {
        return;
      }
      onOpenEdit?.(item);
      return;
    }

    onOpenPreview?.(item);
  }, [isEditSelectionMode, onOpenEdit, onOpenPreview]);

  const loadWorkspaceDirectoryChildren = useCallback(async (targetPath) => {
    const directChildren = await requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      targetPath,
    });

    if (directChildren.length === 1 && directChildren[0]?.kind === "目录" && directChildren[0].hasChildren) {
      const onlyChild = directChildren[0];
      const nestedChildren = await loadWorkspaceDirectoryChildren(resolveItemPath(onlyChild));
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
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot]);

  const fetchWorkspaceDirectory = useCallback(async (node, { preserveExpanded } = {}) => {
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
      const children = await loadWorkspaceDirectoryChildren(nodePath);
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
        error: messages.inspector.workspaceTree.loadFailed,
      })));
    }
  }, [loadWorkspaceDirectoryChildren, messages.inspector.workspaceTree.loadFailed]);

  useEffect(() => {
    const workspaceRootChanged = previousWorkspaceRootRef.current !== currentWorkspaceRoot;
    previousWorkspaceRootRef.current = currentWorkspaceRoot;

    if (workspaceRootChanged) {
      setExpandedSessionDirectories({});
      setSessionFilterInput("");
      setWorkspaceFilterInput("");
      setWorkspaceFilter("");
      setWorkspaceNodes(normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
      setWorkspaceState({
        loaded: workspaceLoaded,
        loading: false,
        error: "",
      });
      return;
    }

    if (!hasWorkspaceFilter) {
      const nextNodes = normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot);
      setWorkspaceNodes((current) => (workspaceLoaded ? mergeWorkspaceNodes(current, nextNodes) : nextNodes));
      setWorkspaceState((current) => ({
        ...current,
        loaded: workspaceLoaded,
        loading: false,
        error: "",
      }));
    }
  }, [currentWorkspaceRoot, hasWorkspaceFilter, workspaceItems, workspaceLoaded]);

  useEffect(() => {
    const nextFilter = String(workspaceFilterInput || "");
    if (!nextFilter.trim()) {
      setWorkspaceFilter("");
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setWorkspaceFilter(nextFilter);
    }, WORKSPACE_FILTER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workspaceFilterInput]);

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next = {};
      let changed = false;

      for (const group of groups) {
        if (Object.prototype.hasOwnProperty.call(current, group.key)) {
          next[group.key] = current[group.key];
        } else {
          next[group.key] = false;
          changed = true;
        }
      }

      if (!changed && Object.keys(current).length === Object.keys(next).length) {
        return current;
      }

      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!hasWorkspaceFilter || !currentWorkspaceRoot) {
      return undefined;
    }

    let cancelled = false;
    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));

    requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
      filter: workspaceFilter.trim(),
    })
      .then((nextNodes) => {
        if (cancelled) {
          return;
        }
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error(error);
        setWorkspaceNodes([]);
        setWorkspaceState({
          loaded: false,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [currentAgentId, currentSessionUser, currentWorkspaceRoot, hasWorkspaceFilter, messages.inspector.workspaceTree.loadFailed, workspaceFilter]);

  const loadWorkspaceRoot = async () => {
    if (workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const nextNodes = await requestWorkspaceTree({
        currentAgentId,
        currentSessionUser,
        currentWorkspaceRoot,
        filter: hasWorkspaceFilter ? workspaceFilter.trim() : "",
      });
      setWorkspaceNodes(nextNodes);
      setWorkspaceState({ loaded: true, loading: false, error: "" });
    } catch (error) {
      console.error(error);
      setWorkspaceState({
        loaded: false,
        loading: false,
        error: messages.inspector.workspaceTree.loadFailed,
      });
    }
  };

  useEffect(() => {
    if (hasWorkspaceFilter || workspaceLoaded || workspaceState.loaded || workspaceState.loading || !currentWorkspaceRoot) {
      return;
    }

    setWorkspaceState((current) => ({ ...current, loading: true, error: "" }));
    requestWorkspaceTree({
      currentAgentId,
      currentSessionUser,
      currentWorkspaceRoot,
    })
      .then((nextNodes) => {
        setWorkspaceNodes(nextNodes);
        setWorkspaceState({ loaded: true, loading: false, error: "" });
      })
      .catch((error) => {
        console.error(error);
        setWorkspaceState({
          loaded: false,
          loading: false,
          error: messages.inspector.workspaceTree.loadFailed,
        });
      });
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree.loadFailed,
    workspaceLoaded,
    workspaceState.loaded,
    workspaceState.loading,
  ]);

  const handleWorkspaceDirectoryOpen = async (node) => {
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

    await fetchWorkspaceDirectory(node, { preserveExpanded: true });
  };

  const handleRefreshWorkspaceDirectory = useCallback(async (node) => {
    await fetchWorkspaceDirectory(node);
  }, [fetchWorkspaceDirectory]);

  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 py-1 pr-4">
          {showHint ? <InspectorHint text={messages.inspector.filesHint} /> : null}
          {hasSessionFiles ? (
            <FileGroupSection
              count={hasSessionFilter ? visibleSessionCount : items.length}
              defaultOpen
              label={messages.inspector.fileCollections.session}
              messages={messages}
              spacingClassName="space-y-1"
              action={(
                <FileFilterInput
                  filterInput={sessionFilterInput}
                  messages={messages.inspector.sessionFilter}
                  onChange={setSessionFilterInput}
                  onClear={() => {
                    setSessionFilterInput("");
                  }}
                />
              )}
            >
              {groups.length ? (
                <div className="space-y-1 pl-2">
                  {groups.map((group) => (
                    <section key={group.key} className="space-y-1">
                      <button
                        type="button"
                        className="grid w-full grid-cols-[1rem_auto_auto_1fr] items-center gap-2 rounded-md py-0.5 text-left transition hover:bg-muted/20"
                        aria-expanded={!collapsedGroups[group.key]}
                        aria-label={`${group.label} ${collapsedGroups[group.key] ? messages.inspector.timeline.expand : messages.inspector.timeline.collapse}`}
                        onClick={() => {
                          setCollapsedGroups((current) => ({
                            ...current,
                            [group.key]: !current[group.key],
                          }));
                        }}
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsedGroups[group.key] ? "-rotate-90" : "rotate-0")} />
                        <div className="text-[11px] font-medium uppercase text-muted-foreground">{group.label}</div>
                        <Badge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
                          {group.items.length}
                        </Badge>
                      </button>
                      {!collapsedGroups[group.key] ? (
                        <div className="space-y-1 pl-2">
                          {buildSessionTreeNodes(group.items, currentWorkspaceRoot).map((node) => (
                            <SessionTreeNode
                              key={`${group.key}-${node.key}`}
                              currentWorkspaceRoot={currentWorkspaceRoot}
                              getDisabledFileSelectionReason={getDisabledFileSelectionReason}
                              expandedDirectories={expandedSessionDirectories}
                              messages={messages}
                              node={node}
                              onOpenPreview={handleOpenFile}
                              onOpenContextMenu={(event, nextItem) => {
                                if (getDisabledFileSelectionReason(nextItem)) {
                                  return;
                                }
                                setContextMenu({
                                  item: nextItem,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              onToggleDirectory={(directoryPath) => {
                                setExpandedSessionDirectories((current) => ({
                                  ...current,
                                  [directoryPath]: !(current[directoryPath] ?? true),
                                }));
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              ) : <PanelEmpty compact text={hasSessionFilter ? messages.inspector.sessionFilter.empty(sessionFilterInput.trim()) : messages.inspector.empty.files} />}
            </FileGroupSection>
          ) : null}

          <FileGroupSection
            count={visibleWorkspaceCount}
            defaultOpen
            label={messages.inspector.fileCollections.workspace}
            messages={messages}
            action={(
              <FileFilterInput
                filterInput={workspaceFilterInput}
                messages={messages.inspector.workspaceFilter}
                onChange={setWorkspaceFilterInput}
                onClear={() => {
                  setWorkspaceFilterInput("");
                  setWorkspaceFilter("");
                }}
              />
            )}
            onToggle={(expanded) => {
              if (expanded) {
                loadWorkspaceRoot().catch(() => {});
              }
            }}
          >
            {workspaceState.loading ? (
              <PanelEmpty compact text={messages.inspector.workspaceTree.loading} />
            ) : workspaceState.error ? (
              <PanelEmpty compact text={workspaceState.error} />
            ) : workspaceNodes.length ? (
              <div className="space-y-1 pl-2">
                {workspaceNodes.map((node) => (
                  <WorkspaceTreeNode
                    key={node.key}
                    currentWorkspaceRoot={currentWorkspaceRoot}
                    getDisabledFileSelectionReason={getDisabledFileSelectionReason}
                    messages={messages}
                    node={node}
                    onOpenPreview={handleOpenFile}
                    onOpenDirectory={handleWorkspaceDirectoryOpen}
                    onOpenContextMenu={(event, nextItem) => {
                      if (getDisabledFileSelectionReason(nextItem)) {
                        return;
                      }
                      setContextMenu({
                        item: nextItem,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  />
                ))}
              </div>
            ) : <PanelEmpty compact text={hasWorkspaceFilter ? messages.inspector.workspaceFilter.empty(workspaceFilter.trim()) : messages.inspector.empty.workspaceFiles} />}
          </FileGroupSection>
        </div>
      </ScrollArea>
      <FileContextMenu
        menu={contextMenu}
        messages={messages}
        onClose={() => setContextMenu(null)}
        onOpenEdit={onOpenEdit}
        onOpenPreview={onOpenPreview}
        onRefreshDirectory={!hasWorkspaceFilter ? handleRefreshWorkspaceDirectory : undefined}
      />
    </>
  );
}
