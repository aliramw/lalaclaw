import type { MouseEvent, ReactNode } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";

import {
  formatCompactDirectoryLabel,
  formatDisplayPath,
  getCompactDirectoryChain,
  resolveItemPath,
} from "@/components/command-center/inspector-files-panel-utils";
import { cn } from "@/lib/utils";

type FileLinkProps = {
  compact?: boolean;
  currentWorkspaceRoot?: string;
  item: Record<string, any>;
  label?: string;
  onOpenContextMenu?: (event: MouseEvent<HTMLButtonElement>, item: Record<string, any>) => void;
  onOpenPreview?: (item: Record<string, any>) => void;
  onRevealInFileManager?: (item: Record<string, any>) => void;
};

type WorkspaceTreeNodeProps = {
  currentWorkspaceRoot?: string;
  depth?: number;
  messages: any;
  node: Record<string, any>;
  onOpenContextMenu?: (event: MouseEvent<HTMLButtonElement>, item: Record<string, any>) => void;
  onOpenDirectory?: (node: Record<string, any>) => void;
  onOpenPreview?: (item: Record<string, any>) => void;
  onSelectDirectory?: (item: Record<string, any>) => void;
  selectedDirectoryPath?: string;
};

type SessionTreeNodeProps = {
  currentWorkspaceRoot?: string;
  depth?: number;
  expandedDirectories?: Record<string, boolean>;
  messages: any;
  node: Record<string, any>;
  onOpenContextMenu?: (event: MouseEvent<HTMLButtonElement>, item: Record<string, any>) => void;
  onOpenPreview?: (item: Record<string, any>) => void;
  onSelectDirectory?: (item: Record<string, any>) => void;
  onToggleDirectory?: (path: string) => void;
  selectedDirectoryPath?: string;
};

export function FileLink({
  item,
  compact = false,
  currentWorkspaceRoot = "",
  label,
  onOpenPreview,
  onOpenContextMenu,
  onRevealInFileManager,
}: FileLinkProps) {
  const isDirectory = item.kind === "目录";
  const canPreview = Boolean((item.fullPath || item.path) && !isDirectory);
  const canReveal = Boolean((item.fullPath || item.path) && isDirectory && typeof onRevealInFileManager === "function");
  const canOpen = canPreview || canReveal;
  const displayPath = label || formatDisplayPath(item, currentWorkspaceRoot);

  return (
    <button
      type="button"
      onContextMenu={(event) => {
        if (!canPreview) {
          return;
        }
        event.preventDefault();
        onOpenContextMenu?.(event, item);
      }}
      onClick={() => {
        if (canPreview) {
          onOpenPreview?.(item);
        } else if (canReveal) {
          onRevealInFileManager?.(item);
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
          "flex items-center gap-1.5 font-mono",
          compact ? "text-[11px] leading-[1.35]" : "text-sm",
        )}
      >
        {isDirectory ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/80" aria-hidden="true">
            <FolderOpen data-testid="file-link-directory-icon" className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <span className={cn("file-link min-w-0 flex-1 break-all transition-colors", canOpen ? "" : "no-underline")}>{displayPath}</span>
      </div>
    </button>
  );
}

function renderCompactDirectoryLabel(chain: Record<string, any>[] = []) {
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

export function WorkspaceTreeNode({
  currentWorkspaceRoot = "",
  depth = 0,
  messages,
  node,
  onOpenContextMenu,
  onOpenDirectory,
  onOpenPreview,
  onSelectDirectory,
  selectedDirectoryPath = "",
}: WorkspaceTreeNodeProps) {
  const isDirectory = node.kind === "目录";
  const compactChain = isDirectory ? getCompactDirectoryChain(node as any) : [];
  const visibleNode = compactChain.at(-1) || node;
  const displayName = compactChain.length ? formatCompactDirectoryLabel(compactChain) : node.name;
  const isExpandable = isDirectory && (visibleNode.hasChildren || visibleNode.children?.length || visibleNode.loading || visibleNode.error);
  const visibleNodePath = resolveItemPath(visibleNode);
  const isSelected = Boolean(visibleNodePath) && visibleNodePath === selectedDirectoryPath;

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
          isSelected && "bg-accent/35 text-foreground ring-1 ring-border/35",
          !isExpandable && "cursor-default hover:bg-transparent",
        )}
        data-selected={isSelected ? "true" : "false"}
        aria-expanded={isExpandable ? node.expanded : undefined}
        aria-label={`${displayName} ${node.expanded ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelectDirectory?.(visibleNode);
          onOpenContextMenu?.(event, visibleNode);
        }}
        onClick={() => {
          onSelectDirectory?.(visibleNode);
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
          {!visibleNode.loading && !visibleNode.error ? visibleNode.children.map((child: Record<string, any>) => (
            <WorkspaceTreeNode
              key={child.key}
              currentWorkspaceRoot={currentWorkspaceRoot}
              depth={depth + 1}
              messages={messages}
              node={child}
              onOpenPreview={onOpenPreview}
              onOpenContextMenu={onOpenContextMenu}
              onOpenDirectory={onOpenDirectory}
              onSelectDirectory={onSelectDirectory}
              selectedDirectoryPath={selectedDirectoryPath}
            />
          )) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SessionTreeNode({
  currentWorkspaceRoot = "",
  depth = 0,
  expandedDirectories = {},
  messages,
  node,
  onOpenContextMenu,
  onOpenPreview,
  onSelectDirectory,
  onToggleDirectory,
  selectedDirectoryPath = "",
}: SessionTreeNodeProps) {
  const isDirectory = node.kind === "目录";
  const compactChain = isDirectory ? getCompactDirectoryChain(node as any) : [];
  const visibleNode = compactChain.at(-1) || node;
  const displayName = compactChain.length ? formatCompactDirectoryLabel(compactChain) : node.name;
  const visibleNodePath = resolveItemPath(visibleNode);
  const isSelected = Boolean(visibleNodePath) && visibleNodePath === selectedDirectoryPath;

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
        className={cn(
          "flex w-full items-center gap-1.5 rounded-sm py-0.5 text-left text-[11px] font-medium text-muted-foreground transition hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/35",
          isSelected && "bg-accent/35 text-foreground ring-1 ring-border/35",
        )}
        data-selected={isSelected ? "true" : "false"}
        aria-expanded={isExpanded}
        aria-label={`${displayName} ${isExpanded ? messages.inspector.timeline.collapse : messages.inspector.timeline.expand}`}
        style={{ paddingLeft: `${depth * 14}px` }}
        onContextMenu={(event) => {
          event.preventDefault();
          onSelectDirectory?.(visibleNode);
          onOpenContextMenu?.(event, visibleNode);
        }}
        onClick={() => {
          onSelectDirectory?.(visibleNode);
          onToggleDirectory?.(node.fullPath);
        }}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} />
        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
        {compactChain.length ? renderCompactDirectoryLabel(compactChain) : <span className="truncate">{displayName}</span>}
      </button>
      {isExpanded ? (
        <div className="space-y-1">
          {visibleNode.children.map((child: Record<string, any>) => (
            <SessionTreeNode
              key={child.key}
              currentWorkspaceRoot={currentWorkspaceRoot}
              depth={depth + 1}
              expandedDirectories={expandedDirectories}
              messages={messages}
              node={child}
              onOpenPreview={onOpenPreview}
              onOpenContextMenu={onOpenContextMenu}
              onSelectDirectory={onSelectDirectory}
              onToggleDirectory={onToggleDirectory}
              selectedDirectoryPath={selectedDirectoryPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
