import { FileContextMenu } from "@/components/command-center/inspector-panel-file-menu";
import {
  RenameDialog,
  RenameExtensionConfirmDialog,
} from "@/components/command-center/inspector-panel-dialogs";
import { getPathName, resolveItemPath } from "@/components/command-center/inspector-files-panel-utils";
import { useI18n } from "@/lib/i18n";

type InspectorMessages = ReturnType<typeof useI18n>["messages"];

export function FilesTabOverlays({
  hasWorkspaceFilter = false,
  menu = null,
  messages,
  onCloseMenu,
  onOpenEdit,
  onOpenPreview,
  onPasteDirectory,
  onRefreshDirectory,
  onRename,
  onRenameCancel,
  onRenameChange,
  onRenameConfirm,
  onRenameExtensionCancel,
  onRenameExtensionConfirm,
  renameExtensionState = null,
  renameState = null,
}: {
  hasWorkspaceFilter?: boolean;
  menu?: any;
  messages: InspectorMessages;
  onCloseMenu: () => void;
  onOpenEdit?: (item: any, options?: any) => void;
  onOpenPreview?: (item: any, options?: any) => void;
  onPasteDirectory?: (item: any) => void | Promise<void>;
  onRefreshDirectory?: (item: any) => void | Promise<void>;
  onRename?: (item: any, source?: string) => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameConfirm: () => void;
  onRenameExtensionCancel: () => void;
  onRenameExtensionConfirm: () => void;
  renameExtensionState?: { fromExtension: string; toExtension: string } | null;
  renameState?: {
    item: any;
    value: string;
    submitting: boolean;
    error: string;
  } | null;
}) {
  return (
    <>
      <FileContextMenu
        menu={menu}
        messages={messages}
        onClose={onCloseMenu}
        onOpenEdit={onOpenEdit}
        onOpenPreview={onOpenPreview}
        onPasteDirectory={onPasteDirectory ? async (item) => onPasteDirectory(item) : undefined}
        onRename={onRename}
        onRefreshDirectory={!hasWorkspaceFilter && onRefreshDirectory ? async (item) => onRefreshDirectory(item) : undefined}
      />
      {renameState ? (
        <RenameDialog
          confirmLabel={messages.inspector.workspaceTree.renameConfirm}
          description={messages.inspector.workspaceTree.renameDescription(renameState.item?.name || getPathName(resolveItemPath(renameState.item)))}
          error={renameState.error}
          inputLabel={messages.inspector.workspaceTree.renameLabel}
          messages={messages}
          onCancel={onRenameCancel}
          onChange={onRenameChange}
          onConfirm={onRenameConfirm}
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
          onCancel={onRenameExtensionCancel}
          onConfirm={onRenameExtensionConfirm}
          submitting={renameState.submitting}
          title={messages.inspector.workspaceTree.renameExtensionChangeTitle}
        />
      ) : null}
    </>
  );
}
