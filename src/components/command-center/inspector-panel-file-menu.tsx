import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Eye, FolderOpen, Pencil, RotateCcw, SquareArrowOutUpRight } from "lucide-react";

import {
  canEditFileItem,
  canPreviewFileItem,
  getVsCodeHref,
  resolveItemPath,
} from "@/components/command-center/inspector-files-panel-utils";
import { clipboardHasPasteableFiles, copyTextToClipboard } from "@/components/command-center/clipboard-utils";
import { resolveFileManagerActionLabel } from "@/components/command-center/inspector-panel-utils";
import { apiFetch } from "@/lib/api-client";

const contextMenuViewportPadding = 8;

type FileContextMenuProps = {
  menu: Record<string, any> | null;
  messages: any;
  onClose: () => void;
  onOpenEdit?: (item: Record<string, any>) => void;
  onOpenPreview?: (item: Record<string, any>) => void;
  onPasteDirectory?: (item: Record<string, any>) => Promise<unknown>;
  onRefreshDirectory?: (item: Record<string, any>) => Promise<unknown>;
  onRename?: (item: Record<string, any>, source?: string) => void;
};

export function FileContextMenu({
  menu,
  messages,
  onClose,
  onOpenEdit,
  onOpenPreview,
  onPasteDirectory,
  onRefreshDirectory,
  onRename,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [canPasteDirectory, setCanPasteDirectory] = useState(false);

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
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };

    const handleEscape = (event: KeyboardEvent) => {
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

  useEffect(() => {
    let cancelled = false;

    if (!menu || menu.item?.kind !== "目录" || typeof onPasteDirectory !== "function") {
      setCanPasteDirectory(false);
      return undefined;
    }

    setCanPasteDirectory(typeof window !== "undefined" && typeof window.navigator?.clipboard?.read === "function");
    clipboardHasPasteableFiles()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setCanPasteDirectory(Boolean(result));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setCanPasteDirectory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [menu, onPasteDirectory]);

  if (!menu) {
    return null;
  }

  const handleCopyPath = async () => {
    try {
      await copyTextToClipboard(resolveItemPath(menu.item));
    } finally {
      onClose();
    }
  };
  const canPreview = canPreviewFileItem(menu.item);
  const canEdit = canEditFileItem(menu.item);
  const isDirectory = menu.item?.kind === "目录";
  const canRename = typeof onRename === "function";
  const canRefreshDirectory = isDirectory && menu.source === "workspace" && typeof onRefreshDirectory === "function";
  const showPasteDirectory = isDirectory && typeof onPasteDirectory === "function";
  const targetPath = resolveItemPath(menu.item);
  const vscodeHref = getVsCodeHref(targetPath);
  const pasteMenuLabel = messages.inspector.fileMenu.paste || messages.chat.uploadAttachment;

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
      {isDirectory ? (
        <>
          {canRename ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRename(menu.item, menu.source);
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{messages.inspector.fileMenu.rename}</span>
            </button>
          ) : null}
          {canRefreshDirectory ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRefreshDirectory?.(menu.item).catch(() => {});
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
            >
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{messages.inspector.fileMenu.refresh}</span>
            </button>
          ) : null}
          {showPasteDirectory ? (
            <button
              type="button"
              role="menuitem"
              disabled={!canPasteDirectory}
              onClick={() => {
                if (!canPasteDirectory) {
                  return;
                }
                onPasteDirectory?.(menu.item).catch(() => {});
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{pasteMenuLabel}</span>
            </button>
          ) : null}
          {(canRename || canRefreshDirectory || showPasteDirectory) ? <div role="separator" className="my-1 h-px bg-border/70" /> : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              handleRevealInFileManager().catch(() => {});
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/60"
          >
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{resolveFileManagerActionLabel(messages, true)}</span>
          </button>
          <div role="separator" className="my-1 h-px bg-border/70" />
        </>
      ) : (
        <>
          {canRename ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onRename(menu.item, menu.source);
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
      {!isDirectory ? (
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
            <span>{resolveFileManagerActionLabel(messages, false)}</span>
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
