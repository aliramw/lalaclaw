import type { Dispatch, SetStateAction } from "react";

import { Badge } from "@/components/ui/badge";
import { PanelEmpty, FileFilterInput, FileGroupSection } from "@/components/command-center/inspector-panel-primitives";
import { SessionTreeNode, WorkspaceTreeNode } from "@/components/command-center/inspector-panel-files";
import { buildSessionTreeNodes, resolveItemPath } from "@/components/command-center/inspector-files-panel-utils";
import { cn } from "@/lib/utils";

type SessionFilesSectionProps = {
  collapsedGroups: Record<string, boolean>;
  currentWorkspaceRoot?: string;
  expandedSessionDirectories: Record<string, boolean>;
  groups: Array<{ key: string; label: string; items: Record<string, any>[] }>;
  hasSessionFilter: boolean;
  messages: any;
  onOpenPreview?: (item: Record<string, any>) => void;
  onSessionFilterChange: (value: string) => void;
  onSetCollapsedGroups: Dispatch<SetStateAction<Record<string, boolean>>>;
  onSetContextMenu: Dispatch<SetStateAction<any>>;
  onSetExpandedSessionDirectories: Dispatch<SetStateAction<Record<string, boolean>>>;
  onSetSelectedDirectoryPath: (path: string) => void;
  selectedDirectoryPath?: string;
  sessionFilterInput?: string;
  visibleSessionCount: number;
};

type WorkspaceFilesSectionProps = {
  currentWorkspaceRoot?: string;
  hasWorkspaceFilter: boolean;
  messages: any;
  onOpenPreview?: (item: Record<string, any>) => void;
  onOpenWorkspaceDirectory: (node: Record<string, any>) => void;
  onSetContextMenu: Dispatch<SetStateAction<any>>;
  onSetSelectedDirectoryPath: (path: string) => void;
  onToggleOpen: () => void;
  selectedDirectoryPath?: string;
  visibleWorkspaceCount: number;
  workspaceFilterInput?: string;
  workspaceNodes: Record<string, any>[];
  workspaceState: { error?: string; loading?: boolean };
  onWorkspaceFilterChange: (value: string) => void;
  onWorkspaceFilterClear: () => void;
};

export function SessionFilesSection({
  collapsedGroups,
  currentWorkspaceRoot = "",
  expandedSessionDirectories,
  groups,
  hasSessionFilter,
  messages,
  onOpenPreview,
  onSessionFilterChange,
  onSetCollapsedGroups,
  onSetContextMenu,
  onSetExpandedSessionDirectories,
  onSetSelectedDirectoryPath,
  selectedDirectoryPath = "",
  sessionFilterInput = "",
  visibleSessionCount,
}: SessionFilesSectionProps) {
  return (
    <FileGroupSection
      count={visibleSessionCount}
      defaultOpen
      label={messages.inspector.fileCollections.session}
      messages={messages}
      spacingClassName="space-y-1"
      action={(
        <FileFilterInput
          filterInput={sessionFilterInput}
          messages={messages.inspector.sessionFilter}
          onChange={onSessionFilterChange}
          onClear={() => onSessionFilterChange("")}
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
                  onSetCollapsedGroups((current) => ({ ...current, [group.key]: !current[group.key] }));
                }}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", collapsedGroups[group.key] ? "-rotate-90" : "rotate-0")}
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-full w-full">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
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
                        onSetContextMenu({
                          item: nextItem,
                          source: "session",
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      onSelectDirectory={(nextItem) => {
                        onSetSelectedDirectoryPath(resolveItemPath(nextItem));
                      }}
                      onToggleDirectory={(directoryPath) => {
                        onSetExpandedSessionDirectories((current) => ({
                          ...current,
                          [directoryPath]: !(current[directoryPath] ?? true),
                        }));
                      }}
                      selectedDirectoryPath={selectedDirectoryPath}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ))}
        </div>
      ) : <PanelEmpty compact text={hasSessionFilter ? messages.inspector.sessionFilter.empty(sessionFilterInput.trim()) : messages.inspector.empty.files} />}
    </FileGroupSection>
  );
}

export function WorkspaceFilesSection({
  currentWorkspaceRoot = "",
  hasWorkspaceFilter,
  messages,
  onOpenPreview,
  onOpenWorkspaceDirectory,
  onSetContextMenu,
  onSetSelectedDirectoryPath,
  onToggleOpen,
  selectedDirectoryPath = "",
  visibleWorkspaceCount,
  workspaceFilterInput = "",
  workspaceNodes,
  workspaceState,
  onWorkspaceFilterChange,
  onWorkspaceFilterClear,
}: WorkspaceFilesSectionProps) {
  return (
    <FileGroupSection
      count={visibleWorkspaceCount}
      defaultOpen={false}
      label={messages.inspector.fileCollections.workspace}
      messages={messages}
      action={(
        <FileFilterInput
          filterInput={workspaceFilterInput}
          messages={messages.inspector.workspaceFilter}
          onChange={onWorkspaceFilterChange}
          onClear={onWorkspaceFilterClear}
        />
      )}
      onToggle={(expanded) => {
        if (expanded) {
          onToggleOpen();
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
              onOpenDirectory={onOpenWorkspaceDirectory}
              onOpenContextMenu={(event, nextItem) => {
                onSetContextMenu({
                  item: nextItem,
                  source: "workspace",
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onSelectDirectory={(nextItem) => {
                onSetSelectedDirectoryPath(resolveItemPath(nextItem));
              }}
              selectedDirectoryPath={selectedDirectoryPath}
            />
          ))}
        </div>
      ) : <PanelEmpty compact text={hasWorkspaceFilter ? messages.inspector.workspaceFilter.empty(workspaceFilterInput.trim()) : messages.inspector.empty.workspaceFiles} />}
    </FileGroupSection>
  );
}
