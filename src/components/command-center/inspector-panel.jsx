import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Copy, Eye, FileText, FolderOpen, Hammer, Monitor, Pencil, RotateCcw, X } from "lucide-react";
import { Highlight, themes } from "prism-react-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilePreview } from "@/components/command-center/use-file-preview";
import { getLocalizedStatusLabel, getRelationshipStatusBadgeProps, localizeStatusSummary, normalizeStatusKey } from "@/features/session/status-display";
import { Prism, usePrismLanguage } from "@/lib/prism-languages";
import { cn, stripMarkdownForDisplay } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const LazyFilePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.FilePreviewOverlay })),
);
const LazyImagePreviewOverlay = lazy(() =>
  import("@/components/command-center/file-preview-overlay").then((module) => ({ default: module.ImagePreviewOverlay })),
);

const homePrefix = "/Users/marila";
const darkToolIoTheme = themes.dracula;
const lightToolIoTheme = themes.vsLight;
const inspectorTabKeys = ["files", "artifacts", "timeline", "environment"];
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

function getItemKey(item, index) {
  return item.id || item.path || item.title || `${item.label || "item"}-${index}`;
}

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

function localizeArtifactTitle(title = "", messages) {
  const value = String(title || "").trim();
  if (!value) {
    return "";
  }

  return value.replace(/^(回复|reply)\s*/i, `${messages.inspector.artifactReplyPrefix} `).trim();
}

function FileLink({ item, compact = false, currentWorkspaceRoot = "", label, onOpenPreview, onOpenContextMenu }) {
  const canOpen = Boolean((item.fullPath || item.path) && item.kind !== "目录");
  const displayPath = label || formatDisplayPath(item, currentWorkspaceRoot);

  return (
    <button
      type="button"
      onContextMenu={(event) => {
        if (!canOpen) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu?.(event, item);
      }}
      onClick={() => {
        if (canOpen) {
          onOpenPreview?.(item);
        }
      }}
      className={cn(
        "block w-full appearance-none rounded-sm border-0 bg-transparent px-1.5 text-left shadow-none transition-[background-color,color,box-shadow] focus:outline-none focus-visible:outline-none",
        canOpen ? "cursor-pointer hover:bg-accent/25 focus-visible:bg-accent/15 focus-visible:ring-1 focus-visible:ring-border/35" : "",
        compact ? "px-0 py-px" : "px-2 py-1",
      )}
      title={item.fullPath || item.path}
      disabled={!canOpen}
    >
      <div
        className={cn(
          "file-link break-all font-mono transition-colors",
          compact ? "text-[11px] leading-[1.35]" : "text-sm",
          canOpen ? "" : "no-underline",
        )}
      >
        {displayPath}
      </div>
    </button>
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

function WorkspaceTreeNode({ currentWorkspaceRoot = "", depth = 0, messages, node, onOpenContextMenu, onOpenDirectory, onOpenPreview }) {
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
        {action ? <div className="min-w-0 w-[10.5rem] max-w-[44%] shrink">{action}</div> : null}
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

function FileFilterInput({ filterInput, messages, onChange, onClear }) {
  return (
    <label className="relative block w-full">
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

function FilesTab({
  currentAgentId = "",
  currentWorkspaceRoot = "",
  currentSessionUser = "",
  items,
  messages,
  onOpenEdit,
  onOpenPreview,
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
  const visibleWorkspaceCount = hasWorkspaceFilter
    ? countWorkspaceFiles(workspaceNodes)
    : (Number.isFinite(workspaceCount) ? workspaceCount : workspaceNodes.length);

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
          <InspectorHint text={messages.inspector.filesHint} />
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
                              expandedDirectories={expandedSessionDirectories}
                              messages={messages}
                              node={node}
                              onOpenPreview={onOpenPreview}
                              onOpenContextMenu={(event, nextItem) => {
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
                    messages={messages}
                    node={node}
                    onOpenPreview={onOpenPreview}
                    onOpenDirectory={handleWorkspaceDirectoryOpen}
                    onOpenContextMenu={(event, nextItem) => {
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

function TabCountBadge({ count, active = false }) {
  if (!count) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        active ? "bg-black/14 text-white" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

function DataList({ empty, getItemActionLabel, hint, items, onSelect, render }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="space-y-2 py-1 pr-4">
        <InspectorHint text={hint} />
        {items.length ? (
          <div className="grid gap-3">
            {items.map((item, index) => (
              <Card key={getItemKey(item, index)}>
                <CardContent className={cn(onSelect ? "p-0" : "py-4")}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      aria-label={getItemActionLabel?.(item) || item.title || item.label || "item"}
                      className="block w-full rounded-[inherit] px-6 py-4 text-left transition hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {render(item)}
                    </button>
                  ) : render(item)}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <PanelEmpty text={empty} />}
      </div>
    </ScrollArea>
  );
}

function TimelineDetailCard({ title, children, emptyText }) {
  return (
    <section className="space-y-1.5">
      <div className="text-left text-xs font-medium text-muted-foreground">{title}</div>
      {children || <PanelEmpty text={emptyText} compact />}
    </section>
  );
}

function looksLikeJson(value = "") {
  const trimmed = String(value || "").trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function CopyCodeButton({ content }) {
  const { messages } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText?.(String(content || ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground/75 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      aria-label={copied ? messages.markdown.copiedCode : messages.markdown.copyCode}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function ToolIoCodeBlock({ emptyText, label, resolvedTheme = "light", value }) {
  const content = String(value || emptyText || "").trim() || String(emptyText || "");
  const language = looksLikeJson(content) ? "json" : "text";
  const toolIoTheme = resolvedTheme === "dark" ? darkToolIoTheme : lightToolIoTheme;
  const highlightedLanguage = usePrismLanguage(language);

  return (
    <div
      className={cn(
        "rounded-lg border",
        resolvedTheme === "dark" ? "border-border bg-background/90" : "border-slate-200 bg-[#fbfcfe]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5 text-[11px] font-medium",
          resolvedTheme === "dark" ? "border-border/70 text-muted-foreground" : "border-slate-200 text-slate-500",
        )}
      >
        <span>{label}</span>
        <CopyCodeButton content={content} />
      </div>
      <Highlight prism={Prism} theme={toolIoTheme} code={content} language={highlightedLanguage}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            className={cn(
              "tool-io-code overflow-x-auto px-0 py-2 whitespace-pre-wrap",
              resolvedTheme === "dark" ? "text-zinc-50" : "text-slate-800",
            )}
          >
            {tokens.map((line, lineIndex) => (
              <div key={lineIndex} {...getLineProps({ line })} className="min-h-5 px-3">
                {line.length ? line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />) : <span>&nbsp;</span>}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}

function ToolCallCard({ isFirst = false, isLast = false, messages, resolvedTheme = "light", tool }) {
  const [open, setOpen] = useState(true);
  const normalizedStatus = normalizeStatusKey(tool.status);
  const localizedStatus = getLocalizedStatusLabel(tool.status, messages);

  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <div className="relative flex justify-center">
        {!isFirst ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-0 h-[0.625rem] w-px bg-border/70" /> : null}
        <div
          aria-hidden="true"
          className={cn(
            "relative mt-[0.625rem] h-2.5 w-2.5 rounded-full border",
            normalizedStatus === "failed"
              ? "border-rose-400/60 bg-rose-400/20"
              : resolvedTheme === "dark"
                ? "border-emerald-400/50 bg-emerald-400/20"
                : "border-emerald-500/50 bg-emerald-500/15",
          )}
        />
        {!isLast ? <div aria-hidden="true" className="absolute left-[calc(50%-0.5px)] top-[calc(0.625rem+0.625rem)] bottom-0 w-px bg-border/70" /> : null}
      </div>
      <div className={cn("min-w-0 space-y-3", !isLast && "pb-4")}>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`${tool.name} ${open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
          className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-muted/20"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="truncate text-sm font-medium">{tool.name}</div>
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open ? "rotate-0" : "-rotate-90")} />
          </div>
          <Badge variant={normalizedStatus === "failed" ? "default" : "success"} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
            {localizedStatus}
          </Badge>
        </button>

        {open ? (
          <div className="space-y-2 text-xs leading-6">
            <ToolIoCodeBlock label={messages.inspector.timeline.input} value={tool.input} emptyText={messages.inspector.timeline.none} resolvedTheme={resolvedTheme} />
            <ToolIoCodeBlock label={messages.inspector.timeline.output} value={tool.output || tool.detail} emptyText={messages.inspector.timeline.noOutput} resolvedTheme={resolvedTheme} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallTimeline({ messages, resolvedTheme = "light", tools }) {
  if (!tools?.length) {
    return null;
  }

  const orderedTools = tools
    .map((tool, index) => ({ tool, index }))
    .sort((left, right) => {
      const leftTimestamp = Number(left.tool?.timestamp || 0);
      const rightTimestamp = Number(right.tool?.timestamp || 0);
      const leftHasTimestamp = Number.isFinite(leftTimestamp) && leftTimestamp > 0;
      const rightHasTimestamp = Number.isFinite(rightTimestamp) && rightTimestamp > 0;

      if (leftHasTimestamp && rightHasTimestamp && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      if (leftHasTimestamp !== rightHasTimestamp) {
        return rightHasTimestamp ? 1 : -1;
      }

      return left.index - right.index;
    })
    .map(({ tool }) => tool);

  return (
    <div className="space-y-0">
      {orderedTools.map((tool, toolIndex) => (
        <ToolCallCard
          key={tool.id || `${tool.name}-${tool.timestamp}`}
          isFirst={toolIndex === 0}
          isLast={toolIndex === orderedTools.length - 1}
          tool={tool}
          messages={messages}
          resolvedTheme={resolvedTheme}
        />
      ))}
    </div>
  );
}

function getRelationshipDisplay(relationship, messages) {
  const fallbackLabel =
    relationship?.type === "session_spawn"
      ? messages.inspector.relationships.sessionSpawn
      : relationship?.targetAgentId || messages.inspector.relationships.childAgent;
  const primaryLabel = relationship?.detail || fallbackLabel;
  const secondaryLabel = relationship?.detail && relationship?.detail !== fallbackLabel ? fallbackLabel : "";

  return {
    primaryLabel,
    secondaryLabel,
  };
}

function RelationshipCard({ relationship, sessionAgentId = "main", messages }) {
  const { primaryLabel, secondaryLabel } = getRelationshipDisplay(relationship, messages);
  const statusLabel = getLocalizedStatusLabel(relationship.status, messages);
  const statusBadgeProps = getRelationshipStatusBadgeProps(relationship.status);

  return (
    <Card className="border-border/70 bg-muted/15">
      <CardContent className="py-4">
        <div className="grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-center gap-3">
          <Badge variant="secondary" className="h-7 justify-center rounded-full px-2.5 text-[11px] font-medium">
            {relationship.sourceAgentId || sessionAgentId}
          </Badge>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-px flex-1 bg-border/70" />
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 text-left">
              <div className="truncate text-sm font-medium text-foreground">{primaryLabel}</div>
              {secondaryLabel ? <div className="truncate text-[11px] text-muted-foreground">{secondaryLabel}</div> : null}
            </div>
            {statusLabel ? (
              <Badge
                variant={statusBadgeProps.variant}
                className={`shrink-0 self-center whitespace-nowrap px-2 py-0.5 text-[11px] leading-5 ${statusBadgeProps.className}`}
              >
                {statusLabel}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineItemCard({ currentWorkspaceRoot = "", defaultOpen = false, item, messages, onOpenPreview, resolvedTheme = "light" }) {
  const { intlLocale } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const normalizedStatus = normalizeStatusKey(item.status);
  const localizedStatus = getLocalizedStatusLabel(item.status, messages);

  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  const badgeVariant =
    normalizedStatus === "failed"
      ? "default"
      : normalizedStatus === "running" || normalizedStatus === "dispatching"
        ? "success"
        : "active";
  const displayTime = item.timestamp
    ? new Intl.DateTimeFormat(intlLocale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(item.timestamp))
    : "";

  return (
    <Card>
      <CardContent className="py-4">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                <span>{item.timestamp ? messages.inspector.timeline.runTitle : item.title}</span>
                {displayTime ? <span className="text-muted-foreground"> {displayTime}</span> : null}
              </div>
              <div className="text-sm text-muted-foreground">{item.prompt}</div>
            </div>
            <Badge variant={badgeVariant} className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] leading-5">
              {localizedStatus}
            </Badge>
          </div>

          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>{messages.inspector.timeline.tool}: {localizeStatusSummary(item.toolsSummary, messages) || messages.inspector.timeline.noToolCalls}</div>
            <div>{messages.inspector.timeline.result}: {item.outcome}</div>
          </div>
        </div>

        <Separator className="mt-4" />

        <div className="mt-2 space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="relative h-7 justify-start rounded-md px-0 text-left text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setOpen((current) => !current)}
          >
            <ChevronDown
              className={cn(
                "absolute -left-4 h-3.5 w-3.5 transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
            <span>{open ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}</span>
          </Button>

          {open ? (
            <div className="space-y-3">
              <TimelineDetailCard title={messages.inspector.timeline.toolIo} emptyText={messages.inspector.empty.noTools}>
                {item.tools?.length ? <ToolCallTimeline tools={item.tools} messages={messages} resolvedTheme={resolvedTheme} /> : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.relationships.title} emptyText={messages.inspector.empty.agents}>
                {item.relationships?.length
                  ? item.relationships.map((relationship) => (
                      <RelationshipCard key={relationship.id} relationship={relationship} sessionAgentId={item.sessionAgentId || "main"} messages={messages} />
                    ))
                  : null}
              </TimelineDetailCard>

              <TimelineDetailCard title={messages.inspector.timeline.fileChanges} emptyText={messages.inspector.empty.noFiles}>
                {item.files?.length
                  ? item.files.map((file) => (
                      <Card key={file.path} className="border-border/70 bg-muted/15">
                        <CardContent className="py-4">
                          <FileLink item={file} currentWorkspaceRoot={currentWorkspaceRoot} onOpenPreview={onOpenPreview} />
                        </CardContent>
                      </Card>
                    ))
                  : null}
              </TimelineDetailCard>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineTab({ currentWorkspaceRoot = "", items, messages, onOpenPreview, resolvedTheme }) {
  return (
    <div
      data-testid="timeline-scroll-region"
      className="cc-scroll-region min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-2"
    >
      <div className="space-y-2 py-1">
        <InspectorHint text={messages.inspector.timelineHint} />
        {items.length
          ? (
            <div className="grid gap-3">
              {items.map((item, index) => (
                <TimelineItemCard
                  key={getItemKey(item, index)}
                  item={item}
                  defaultOpen={index === 0}
                  messages={messages}
                  onOpenPreview={onOpenPreview}
                  resolvedTheme={resolvedTheme}
                  currentWorkspaceRoot={currentWorkspaceRoot}
                />
              ))}
            </div>
          )
          : <PanelEmpty text={messages.inspector.empty.timeline} />}
      </div>
    </div>
  );
}

function EnvironmentTab({ section, messages }) {
  if (!section?.items?.length) {
    return <PanelEmpty text={messages.inspector.empty.noEnvironment} />;
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="min-w-0">
      <div className="min-w-0 max-w-full space-y-2 overflow-hidden py-1 pr-4">
        <InspectorHint text={messages.inspector.empty.environment} />
        {section.items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="w-full min-w-0 max-w-full border-b border-border/55 pb-3 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0 space-y-1 overflow-hidden">
              <div className="w-full min-w-0 max-w-full whitespace-normal break-all [overflow-wrap:anywhere] text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </div>
              <div className="w-full min-w-0 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-[13px] text-foreground">
                {item.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

export function InspectorPanel({
  activeTab,
  artifacts,
  compact = false,
  currentAgentId = "",
  currentSessionUser = "",
  currentWorkspaceRoot = "",
  files,
  onSelectArtifact,
  peeks,
  resolvedTheme = "light",
  setActiveTab,
  taskTimeline,
}) {
  const { messages } = useI18n();
  const { filePreview, imagePreview, handleOpenPreview, closeFilePreview, closeImagePreview } = useFilePreview();
  const tabsListRef = useRef(null);
  const [showTabLabels, setShowTabLabels] = useState(true);
  const [tooltipTabKey, setTooltipTabKey] = useState("");
  const [compactSheetOpen, setCompactSheetOpen] = useState(false);
  const workspaceFiles = peeks?.workspace?.entries || [];
  const workspaceCount = Number(peeks?.workspace?.totalCount);
  const workspaceLoaded = Array.isArray(peeks?.workspace?.entries);
  const previewFiles = [...files, ...workspaceFiles].filter((item, index, collection) => {
    const itemKey = item?.fullPath || item?.path;
    if (!itemKey || item?.kind === "目录") {
      return false;
    }
    return collection.findIndex((candidate) => (candidate?.fullPath || candidate?.path) === itemKey) === index;
  });
  const tabDefinitions = [
    { key: "files", icon: FolderOpen, label: messages.inspector.tabs.files, count: files.length },
    { key: "artifacts", icon: FileText, label: messages.inspector.tabs.artifacts },
    { key: "timeline", icon: Hammer, label: messages.inspector.tabs.timeline },
    { key: "environment", icon: Monitor, label: messages.inspector.tabs.environment },
  ];
  const resolvedActiveTab = inspectorTabKeys.includes(activeTab) ? activeTab : "files";

  useEffect(() => {
    if (activeTab && !inspectorTabKeys.includes(activeTab)) {
      setActiveTab("files");
    }
  }, [activeTab, setActiveTab]);

  useEffect(() => {
    const node = tabsListRef.current;
    if (!node || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const updateLayout = (width) => {
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }
      setShowTabLabels(width >= 430);
    };

    updateLayout(node.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateLayout(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (showTabLabels && tooltipTabKey) {
      setTooltipTabKey("");
    }
  }, [showTabLabels, tooltipTabKey]);

  useEffect(() => {
    if (!compact && compactSheetOpen) {
      setCompactSheetOpen(false);
    }
  }, [compact, compactSheetOpen]);

  useEffect(() => {
    if ((filePreview || imagePreview) && compactSheetOpen) {
      setCompactSheetOpen(false);
    }
  }, [compactSheetOpen, filePreview, imagePreview]);

  useEffect(() => {
    if (!compactSheetOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setCompactSheetOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [compactSheetOpen]);

  const filesTabContent = (
    <FilesTab
      currentAgentId={currentAgentId}
      currentSessionUser={currentSessionUser}
      items={files}
      messages={messages}
      onOpenEdit={(item) => handleOpenPreview(item, { startInEditMode: true })}
      onOpenPreview={handleOpenPreview}
      currentWorkspaceRoot={currentWorkspaceRoot}
      workspaceCount={workspaceCount}
      workspaceItems={workspaceFiles}
      workspaceLoaded={workspaceLoaded}
    />
  );
  const artifactsTabContent = (
    <DataList
      items={artifacts}
      hint={messages.inspector.artifactsHint}
      empty={messages.inspector.empty.artifacts}
      getItemActionLabel={(item) => `${messages.inspector.artifactJumpTo} ${localizeArtifactTitle(item.title || messages.inspector.tabs.artifacts, messages)}`}
      onSelect={onSelectArtifact}
      render={(item) => (
        <>
          <div className="text-sm font-medium">{localizeArtifactTitle(item.title, messages)}</div>
          <div className="text-xs text-muted-foreground">{stripMarkdownForDisplay(item.detail)}</div>
        </>
      )}
    />
  );
  const timelineTabContent = (
    <TimelineTab items={taskTimeline} messages={messages} onOpenPreview={handleOpenPreview} resolvedTheme={resolvedTheme} currentWorkspaceRoot={currentWorkspaceRoot} />
  );
  const environmentTabContent = <EnvironmentTab section={peeks?.environment} messages={messages} />;
  const tabContentByKey = {
    files: filesTabContent,
    artifacts: artifactsTabContent,
    timeline: timelineTabContent,
    environment: environmentTabContent,
  };
  const activeCompactTab = tabDefinitions.find((tab) => tab.key === resolvedActiveTab) || tabDefinitions[0];

  if (compact) {
    return (
      <>
        <div className="flex h-full min-h-0 min-w-0 flex-col items-center gap-2 rounded-[18px] border border-border/70 bg-card/80 px-1.5 py-2 backdrop-blur">
          {tabDefinitions.map((tab) => {
            const Icon = tab.icon;
            const isActive = compactSheetOpen && resolvedActiveTab === tab.key;
            return (
              <Tooltip key={tab.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={tab.label}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setCompactSheetOpen(true);
                    }}
                    className={cn(
                      "relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                      isActive
                        ? resolvedTheme === "dark"
                          ? "border-[#0f3e6a] bg-[#0f3e6a] text-white"
                          : "border-[#1677eb] bg-[#1677eb] text-white"
                        : "border-transparent bg-background/75 text-muted-foreground hover:border-border/70 hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5 shrink-0 stroke-[1.9]" />
                    {tab.count ? (
                      <span
                        className={cn(
                          "absolute -right-1 -top-1 min-w-[1.15rem] rounded-full px-1 py-[1px] text-center text-[10px] font-semibold leading-none",
                          isActive ? "bg-white/22 text-white" : "bg-muted text-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">{tab.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {compactSheetOpen ? (
          <>
            <button
              type="button"
              aria-label={messages.inspector.compact.closeSheet}
              className="fixed inset-0 z-40 bg-background/42 backdrop-blur-[1px]"
              onClick={() => setCompactSheetOpen(false)}
            />
            <div className="fixed inset-y-0 right-0 z-[41] w-[min(28rem,calc(100vw-5.5rem))] min-w-[18rem] max-w-[30rem] pl-3">
              <Card
                role="dialog"
                aria-modal="true"
                aria-label={`${messages.inspector.title} - ${activeCompactTab.label}`}
                className="flex h-full min-h-0 flex-col overflow-hidden rounded-none rounded-l-[1.5rem] border-y-0 border-r-0 shadow-[0_18px_55px_rgba(15,23,42,0.18)]"
              >
                <CardHeader className="flex min-h-12 flex-row items-start justify-between gap-3 border-b border-border/70 bg-card/92 px-4 py-3 text-left backdrop-blur">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm leading-[1.15]">{activeCompactTab.label}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2 text-[11px] leading-4">
                      {messages.inspector.subtitle}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={messages.inspector.compact.closeSheet}
                    className="h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={() => setCompactSheetOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </CardHeader>
                <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
                  {tabContentByKey[resolvedActiveTab]}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
        {filePreview ? (
          <Suspense fallback={null}>
            <LazyFilePreviewOverlay
              currentAgentId={currentAgentId}
              currentSessionUser={currentSessionUser}
              currentWorkspaceRoot={currentWorkspaceRoot}
              files={previewFiles}
              preview={filePreview}
              resolvedTheme={resolvedTheme}
              sessionFiles={files}
              onClose={closeFilePreview}
              onOpenFilePreview={handleOpenPreview}
              workspaceCount={workspaceCount}
              workspaceFiles={workspaceFiles}
              workspaceLoaded={workspaceLoaded}
            />
          </Suspense>
        ) : null}
        {imagePreview ? (
          <Suspense fallback={null}>
            <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
          </Suspense>
        ) : null}
      </>
    );
  }

  return (
    <>
      <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <CardHeader className="flex min-h-12 flex-row items-center justify-start border-b border-border/70 bg-card/80 px-3 py-2 text-left backdrop-blur">
          <div className="flex min-w-0 flex-1 items-baseline justify-start gap-2 text-left">
            <CardTitle className="truncate text-sm leading-[1.15]">{messages.inspector.title}</CardTitle>
            <CardDescription className="truncate text-[11px] leading-4">{messages.inspector.subtitle}</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
          <Tabs value={resolvedActiveTab} onValueChange={setActiveTab} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <TabsList ref={tabsListRef} className="grid h-auto w-full shrink-0 grid-cols-2 gap-1 p-1 md:grid-cols-4">
              {tabDefinitions.map((tab) => {
                const Icon = tab.icon;
                const isActive = resolvedActiveTab === tab.key;
                const showCountBadge = Boolean(tab.count) && (showTabLabels || tab.key === "files");
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    aria-label={tab.label}
                    onPointerEnter={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onPointerLeave={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    onFocus={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey(tab.key);
                      }
                    }}
                    onBlur={() => {
                      if (!showTabLabels) {
                        setTooltipTabKey((current) => (current === tab.key ? "" : current));
                      }
                    }}
                    className={cn(
                      "group/tab relative text-[13px] data-[state=active]:text-white data-[state=active]:shadow-sm",
                      showTabLabels ? "px-3" : "px-2",
                      isActive ? "text-white shadow-sm" : "",
                      resolvedTheme === "dark"
                        ? cn(
                            "data-[state=active]:bg-[#0f3e6a] data-[state=active]:hover:bg-[#0f3e6a]",
                            isActive ? "bg-[#0f3e6a] hover:bg-[#0f3e6a]" : "",
                          )
                        : cn(
                            "data-[state=active]:bg-[#1677eb] data-[state=active]:hover:bg-[#0f6fe0]",
                            isActive ? "bg-[#1677eb] hover:bg-[#0f6fe0]" : "",
                          ),
                    )}
                  >
                    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                      <Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.9]" />
                    </span>
                    {showTabLabels ? <span className="truncate">{tab.label}</span> : null}
                    {showCountBadge ? <TabCountBadge count={tab.count} active={resolvedActiveTab === tab.key} /> : null}
                    {!showTabLabels && tooltipTabKey === tab.key ? (
                      <span
                        aria-hidden="true"
                        data-testid={`inspector-tab-tooltip-${tab.key}`}
                        className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-md bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background shadow-md"
                      >
                        {tab.label}
                      </span>
                    ) : null}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <TabsContent value="files" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {filesTabContent}
            </TabsContent>

            <TabsContent value="artifacts" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {artifactsTabContent}
            </TabsContent>

            <TabsContent value="timeline" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {timelineTabContent}
            </TabsContent>

            <TabsContent value="environment" className="mt-1 min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
              {environmentTabContent}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      {filePreview ? (
        <Suspense fallback={null}>
          <LazyFilePreviewOverlay
            currentAgentId={currentAgentId}
            currentSessionUser={currentSessionUser}
            currentWorkspaceRoot={currentWorkspaceRoot}
            files={previewFiles}
            preview={filePreview}
            resolvedTheme={resolvedTheme}
            sessionFiles={files}
            onClose={closeFilePreview}
            onOpenFilePreview={handleOpenPreview}
            workspaceCount={workspaceCount}
            workspaceFiles={workspaceFiles}
            workspaceLoaded={workspaceLoaded}
          />
        </Suspense>
      ) : null}
      {imagePreview ? (
        <Suspense fallback={null}>
          <LazyImagePreviewOverlay image={imagePreview} onClose={closeImagePreview} />
        </Suspense>
      ) : null}
    </>
  );
}
