import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Copy, Eye, FolderOpen, Pencil, RotateCcw, SquareArrowOutUpRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildFileFilterMatcher,
  buildSessionTreeNodes,
  canEditFileItem,
  canPreviewFileItem,
  compareFileItemsByPath,
  countWorkspaceFiles,
  doesFileExtensionChange,
  formatCompactDirectoryLabel,
  formatDisplayPath,
  getCompactDirectoryChain,
  getPathExtension,
  getPathName,
  getVsCodeHref,
  mergeWorkspaceNodes,
  normalizeWorkspaceNodes,
  renameSessionItems,
  renameWorkspaceNodes,
  resolveItemPath,
  updateWorkspaceNode,
} from "@/components/command-center/inspector-files-panel-utils";
import type { InspectorFileItem, InspectorFileNode } from "@/components/command-center/inspector-files-panel-utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api-client";
import { cn, isApplePlatform } from "@/lib/utils";

const WORKSPACE_FILTER_DEBOUNCE_MS = 150;
const contextMenuViewportPadding = 8;
const FilesBadge = Badge as any;
const FilesButton = Button as any;
const FilesScrollArea = ScrollArea as any;
const FilesTooltip = Tooltip as any;
const FilesTooltipContent = TooltipContent as any;
const FilesTooltipTrigger = TooltipTrigger as any;

type FileLinkProps = {
  item: InspectorFileItem;
  compact?: boolean;
  currentWorkspaceRoot?: string;
  disabledReason?: string;
  label?: string;
  onOpenPreview?: (item: InspectorFileItem) => void;
  onOpenContextMenu?: (event: React.MouseEvent<HTMLElement>, item: InspectorFileItem) => void;
};

type TreeNodeProps = {
  currentWorkspaceRoot?: string;
  depth?: number;
  getDisabledFileSelectionReason?: (item?: InspectorFileItem | null) => string;
  messages: any;
  node: InspectorFileNode;
  onOpenContextMenu?: (event: React.MouseEvent<HTMLElement>, item: InspectorFileItem) => void;
  onOpenDirectory?: (node: InspectorFileNode) => void;
  onOpenPreview?: (item: InspectorFileItem) => void;
};

type SessionTreeNodeProps = TreeNodeProps & {
  expandedDirectories?: Record<string, boolean>;
  onToggleDirectory?: (directoryPath: string) => void;
};

type FileContextMenuProps = {
  menu: { item: InspectorFileItem; x: number; y: number } | null;
  messages: any;
  onClose: () => void;
  onOpenEdit?: (item: InspectorFileItem) => void;
  onOpenPreview?: (item: InspectorFileItem) => void;
  onRefreshDirectory?: (item: InspectorFileNode) => Promise<void>;
  onRename?: (item: InspectorFileItem) => void;
};

type FileGroupSectionProps = {
  children?: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  label: string;
  messages: any;
  onToggle?: (expanded: boolean) => void;
  action?: ReactNode;
  spacingClassName?: string;
};

type FileFilterInputProps = {
  filterInput: string;
  messages: any;
  onChange: (value: string) => void;
  onClear: () => void;
};

type InspectorFilesPanelProps = {
  currentAgentId?: string;
  currentSessionUser?: string;
  currentWorkspaceRoot?: string;
  fileSelectionMode?: "preview" | "edit" | string;
  items: InspectorFileItem[];
  messages: any;
  onOpenEdit?: (item: InspectorFileItem) => void;
  onOpenPreview?: (item: InspectorFileItem) => void;
  showHint?: boolean;
  workspaceCount?: number;
  workspaceItems?: InspectorFileItem[];
  workspaceLoaded?: boolean;
};

type ContextMenuState = { item: InspectorFileItem; x: number; y: number } | null;
type WorkspacePanelState = { loaded: boolean; loading: boolean; error: string };
type RenameState = { item: InspectorFileItem; value: string; submitting: boolean; error: string } | null;
type RenameExtensionState = { fromExtension: string; toExtension: string } | null;

function RenameDialog({
  confirmLabel,
  description,
  error,
  inputLabel,
  messages,
  onCancel,
  onChange,
  onConfirm,
  placeholder,
  submitting = false,
  title,
  value,
}) {
  return (
    <div className="fixed inset-0 z-[41] flex items-center justify-center bg-background/55 px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-[24px] border border-border/70 bg-card shadow-2xl">
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-foreground">{inputLabel}</span>
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onConfirm();
                }
              }}
              placeholder={placeholder}
              className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          {error ? <p className="text-sm leading-6 text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <FilesButton type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              {messages.inspector.workspaceTree.renameCancel}
            </FilesButton>
            <FilesButton type="button" onClick={onConfirm} disabled={submitting || !String(value || "").trim()}>
              {submitting ? messages.inspector.workspaceTree.renameConfirming : confirmLabel}
            </FilesButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenameExtensionConfirmDialog({ description, messages, onCancel, onConfirm, submitting = false, title }: any) {
  return (
    <div className="fixed inset-0 z-[42] flex items-center justify-center bg-background/55 px-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-[24px] border border-border/70 bg-card shadow-2xl">
        <div className="space-y-4 px-5 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="flex justify-end gap-2">
            <FilesButton type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              {messages.inspector.workspaceTree.renameCancel}
            </FilesButton>
            <FilesButton type="button" onClick={onConfirm} disabled={submitting}>
              {messages.inspector.workspaceTree.renameExtensionChangeConfirm}
            </FilesButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveFileManagerLocaleLabel(messages: any) {
  return isApplePlatform()
    ? messages.inspector.previewActions.fileManagers.finder
    : messages.inspector.previewActions.fileManagers.explorer;
}

async function requestWorkspaceTree({
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

export function FileLink({
  item,
  compact = false,
  currentWorkspaceRoot = "",
  disabledReason = "",
  label,
  onOpenPreview,
  onOpenContextMenu,
}: FileLinkProps) {
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
    <FilesTooltip open onOpenChange={() => {}}>
      <FilesTooltipTrigger asChild>
        <span className="block">
          {button}
        </span>
      </FilesTooltipTrigger>
      <FilesTooltipContent className="max-w-xs">{disabledReason}</FilesTooltipContent>
    </FilesTooltip>
  );
}

function renderCompactDirectoryLabel(chain: InspectorFileNode[] = []) {
  const names = chain.map((node) => node.name).filter(Boolean);
  if (!names.length) {
    return null;
  }

  if (names.length === 1) {
    return <span className="truncate">{names[0]}</span>;
  }

  const parts: ReactNode[] = [];
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

function WorkspaceTreeNode({
  currentWorkspaceRoot = "",
  depth = 0,
  getDisabledFileSelectionReason = (_item?: InspectorFileItem | null) => "",
  messages,
  node,
  onOpenContextMenu,
  onOpenDirectory,
  onOpenPreview,
}: TreeNodeProps) {
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
  getDisabledFileSelectionReason = (_item?: InspectorFileItem | null) => "",
  expandedDirectories = {},
  messages,
  node,
  onOpenContextMenu,
  onOpenPreview,
  onToggleDirectory,
}: SessionTreeNodeProps) {
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

function FileContextMenu({ menu, messages, onClose, onOpenEdit, onOpenPreview, onRefreshDirectory, onRename }: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
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

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && menuRef.current?.contains(target)) {
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
  const canRename = typeof onRename === "function";
  const targetPath = resolveItemPath(menu.item);
  const vscodeHref = getVsCodeHref(targetPath);
  const fileManagerLabel = resolveFileManagerLocaleLabel(messages);

  const handleRevealInFileManager = async () => {
    try {
      const response = await apiFetch("/api/file-manager/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || messages.inspector.previewErrors.revealInFileManagerFailed);
      }
    } finally {
      onClose();
    }
  };

  const handleOpenInVsCode = () => {
    try {
      if (vscodeHref) {
        window.open(vscodeHref, "_blank", "noopener,noreferrer");
      }
    } finally {
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={messages.inspector.fileMenu.label}
      className="fixed z-50 min-w-40 rounded-md border border-border/80 bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: position.left, top: position.top }}
    >
      {canRefreshDirectory ? (
        <>
          {canRename ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRename(menu.item);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{messages.inspector.fileMenu.rename}</span>
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              Promise.resolve(onRefreshDirectory(menu.item as InspectorFileNode)).catch(() => {});
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
          >
            <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.fileMenu.refresh}</span>
          </button>
        </>
      ) : (
        <>
          {canRename ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRename(menu.item);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{messages.inspector.fileMenu.rename}</span>
            </button>
          ) : null}
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
      {!canRefreshDirectory ? (
        <>
          <div role="separator" className="my-1 h-px bg-border/70" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              handleRevealInFileManager().catch(() => {});
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.previewActions.revealInFileManager(fileManagerLabel)}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleOpenInVsCode}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
          >
            <SquareArrowOutUpRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{messages.inspector.previewActions.openInCodeEditor}</span>
          </button>
          <div role="separator" className="my-1 h-px bg-border/70" />
        </>
      ) : null}
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

function FileGroupSection({ children, count = 0, defaultOpen = true, label, messages, onToggle, action, spacingClassName = "space-y-2" }: FileGroupSectionProps) {
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
          <FilesBadge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
            {count}
          </FilesBadge>
        </button>
        {action ? <div className="min-w-0 shrink-0">{action}</div> : null}
      </div>
      {!collapsed ? children : null}
    </section>
  );
}

function FileFilterInput({ filterInput, messages, onChange, onClear }: FileFilterInputProps) {
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
}: InspectorFilesPanelProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [sessionFilterInput, setSessionFilterInput] = useState("");
  const [workspaceFilterInput, setWorkspaceFilterInput] = useState("");
  const [workspaceFilter, setWorkspaceFilter] = useState("");
  const [sessionItems, setSessionItems] = useState(items);
  const [renameState, setRenameState] = useState<RenameState>(null);
  const [renameExtensionState, setRenameExtensionState] = useState<RenameExtensionState>(null);
  const fileActionSections = [
    { key: "created", label: messages.inspector.fileActions.created },
    { key: "modified", label: messages.inspector.fileActions.modified },
    { key: "viewed", label: messages.inspector.fileActions.viewed },
  ];
  const sessionFilterMatcher = buildFileFilterMatcher(sessionFilterInput);
  const groups = fileActionSections
    .map((section) => ({
      ...section,
      items: sessionItems
        .filter((item) => item.primaryAction === section.key)
        .filter((item) => (sessionFilterMatcher ? sessionFilterMatcher(item, currentWorkspaceRoot) : true))
        .sort((left, right) => compareFileItemsByPath(left, right, currentWorkspaceRoot)),
    }))
    .filter((section) => section.items.length);
  const [workspaceNodes, setWorkspaceNodes] = useState(() => normalizeWorkspaceNodes(workspaceItems, currentWorkspaceRoot));
  const [workspaceState, setWorkspaceState] = useState<WorkspacePanelState>({
    loaded: workspaceLoaded,
    loading: false,
    error: "",
  });
  const previousWorkspaceRootRef = useRef(currentWorkspaceRoot);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [expandedSessionDirectories, setExpandedSessionDirectories] = useState<Record<string, boolean>>({});
  const hasSessionFiles = sessionItems.length > 0;
  const hasSessionFilter = Boolean(String(sessionFilterInput || "").trim());
  const visibleSessionCount = groups.reduce((total, group) => total + group.items.length, 0);
  const hasWorkspaceFilter = Boolean(String(workspaceFilter || "").trim());
  const isEditSelectionMode = fileSelectionMode === "edit";
  const visibleWorkspaceCount = hasWorkspaceFilter
    ? countWorkspaceFiles(workspaceNodes)
    : (Number.isFinite(workspaceCount) ? workspaceCount : workspaceNodes.length);
  const getDisabledFileSelectionReason = useCallback((item?: InspectorFileItem | null) => {
    if (!isEditSelectionMode || item?.kind === "目录" || canEditFileItem(item)) {
      return "";
    }
    return messages.inspector.previewActions.editSelectionUnavailable;
  }, [isEditSelectionMode, messages.inspector.previewActions.editSelectionUnavailable]);
  const handleOpenFile = useCallback((item?: InspectorFileItem | null) => {
    if (item?.kind === "目录") {
      return;
    }

    if (isEditSelectionMode) {
      if (!canEditFileItem(item)) {
        return;
      }
      if (item) {
        onOpenEdit?.(item);
      }
      return;
    }

    if (item) {
      onOpenPreview?.(item);
    }
  }, [isEditSelectionMode, onOpenEdit, onOpenPreview]);

  useEffect(() => {
    setSessionItems(items);
  }, [items, currentWorkspaceRoot]);

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

  const fetchWorkspaceDirectory = useCallback(async (node: InspectorFileNode, { preserveExpanded }: { preserveExpanded?: boolean } = {}) => {
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
      setContextMenu(null);
      setRenameState(null);
      setRenameExtensionState(null);
      setExpandedSessionDirectories({});
      setSessionFilterInput("");
      setWorkspaceFilterInput("");
      setWorkspaceFilter("");
      setSessionItems(items);
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
  }, [currentWorkspaceRoot, hasWorkspaceFilter, items, workspaceItems, workspaceLoaded]);

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

  const handleWorkspaceDirectoryOpen = async (node: InspectorFileNode) => {
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

  const commitRename = useCallback(async ({ item, nextName }) => {
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
      throw new Error(
        typeof messages.inspector.workspaceTree.renameFailed === "function"
          ? messages.inspector.workspaceTree.renameFailed(item.name || getPathName(currentPath), payload.error || "Rename failed")
          : (payload.error || "Rename failed"),
      );
    }

    const nextPath = String(payload.nextPath || "").trim() || currentPath;
    setSessionItems((current) => renameSessionItems(current, currentPath, nextPath));

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
          error: messages.inspector.workspaceTree.loadFailed,
        }));
      }
    } else {
      setWorkspaceNodes((current) => renameWorkspaceNodes(current, currentPath, nextPath));
    }
  }, [
    currentAgentId,
    currentSessionUser,
    currentWorkspaceRoot,
    hasWorkspaceFilter,
    messages.inspector.workspaceTree,
    workspaceFilter,
  ]);

  const handleOpenRenameDialog = useCallback((item: InspectorFileItem) => {
    const resolvedPath = resolveItemPath(item);
    const fallbackName = String(item?.name || getPathName(resolvedPath) || "").trim();
    if (!fallbackName) {
      return;
    }
    setRenameExtensionState(null);
    setRenameState({
      item,
      value: fallbackName,
      submitting: false,
      error: "",
    });
  }, []);

  const submitRename = useCallback(async (forceExtensionChange = false) => {
    if (!renameState) {
      return;
    }

    const nextName = String(renameState.value || "").trim();
    const currentName = String(renameState.item?.name || getPathName(resolveItemPath(renameState.item)) || "").trim();
    if (!nextName) {
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
    } catch (error) {
      console.error(error);
      setRenameState((current) => current ? { ...current, submitting: false, error: error.message || messages.inspector.workspaceTree.loadFailed } : current);
      setRenameExtensionState(null);
    }
  }, [commitRename, messages.inspector.workspaceTree, renameState]);

  return (
    <>
      <FilesScrollArea className="h-full min-h-0 flex-1">
        <div className="space-y-2 py-1 pr-4">
          {showHint ? <InspectorHint text={messages.inspector.filesHint} /> : null}
          {hasSessionFiles ? (
            <FileGroupSection
              count={hasSessionFilter ? visibleSessionCount : sessionItems.length}
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
                        <FilesBadge variant="default" className="h-5 px-1.5 py-0 text-[10px]">
                          {group.items.length}
                        </FilesBadge>
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
      </FilesScrollArea>
      <FileContextMenu
        menu={contextMenu}
        messages={messages}
        onClose={() => setContextMenu(null)}
        onOpenEdit={onOpenEdit}
        onOpenPreview={onOpenPreview}
        onRename={handleOpenRenameDialog}
        onRefreshDirectory={!hasWorkspaceFilter ? handleRefreshWorkspaceDirectory : undefined}
      />
      {renameState ? (
        <RenameDialog
          confirmLabel={messages.inspector.workspaceTree.renameConfirm}
          description={messages.inspector.workspaceTree.renameDescription(renameState.item?.name || getPathName(resolveItemPath(renameState.item)))}
          error={renameState.error}
          inputLabel={messages.inspector.workspaceTree.renameLabel}
          messages={messages}
          onCancel={() => {
            if (renameState.submitting) {
              return;
            }
            setRenameState(null);
            setRenameExtensionState(null);
          }}
          onChange={(value) => {
            setRenameState((current) => current ? { ...current, value, error: "" } : current);
          }}
          onConfirm={() => {
            submitRename(false).catch(() => {});
          }}
          placeholder={messages.inspector.workspaceTree.renamePlaceholder}
          submitting={renameState.submitting}
          title={messages.inspector.workspaceTree.renameTitle}
          value={renameState.value}
        />
      ) : null}
      {renameState && renameExtensionState ? (
        <RenameExtensionConfirmDialog
          description={messages.inspector.workspaceTree.renameExtensionChangeDescription(
            renameExtensionState.fromExtension,
            renameExtensionState.toExtension,
          )}
          messages={messages}
          onCancel={() => {
            if (renameState.submitting) {
              return;
            }
            setRenameExtensionState(null);
          }}
          onConfirm={() => {
            submitRename(true).catch(() => {});
          }}
          submitting={renameState.submitting}
          title={messages.inspector.workspaceTree.renameExtensionChangeTitle}
        />
      ) : null}
    </>
  );
}
