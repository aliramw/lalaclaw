import { useCallback, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

type PreviewItem = {
  alt?: string;
  dataUrl?: string;
  fileManagerLabel?: string;
  fullPath?: string;
  localPath?: string;
  name?: string;
  path?: string;
  previewUrl?: string;
  src?: string;
};

type PreviewOptions = {
  startInEditMode?: boolean;
};

type FilePreviewState = {
  error: string;
  item: PreviewItem;
  loading: boolean;
  name: string;
  path: string;
  startInEditMode: boolean;
} & Record<string, unknown>;

type ImagePreviewState = {
  alt: string;
  fileManagerLabel: string;
  path: string;
  src: string;
};

type PreviewErrorPayload = {
  error?: string;
  errorCode?: string;
  installCommand?: string;
};

const emptyPreviewItem: PreviewItem = {};

function buildLocalFilePreviewUrl(filePath = "") {
  const normalizedPath = String(filePath || "").trim();
  return normalizedPath ? `/api/file-preview/content?path=${encodeURIComponent(normalizedPath)}` : "";
}

export function useFilePreview() {
  const { messages } = useI18n();
  const [filePreview, setFilePreview] = useState<FilePreviewState | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const previewRequestRef = useRef(0);

  const resolvePreviewErrorMessage = useCallback((payload: PreviewErrorPayload = {}, fallbackMessage = "") => {
    if (payload?.errorCode === "office_preview_requires_libreoffice") {
      return payload.installCommand
        ? messages.inspector.previewErrors.officeRequiresLibreOfficeWithCommand(payload.installCommand)
        : messages.inspector.previewErrors.officeRequiresLibreOffice;
    }

    if (payload?.errorCode === "office_preview_failed") {
      return messages.inspector.previewErrors.officeFailed;
    }

    if (payload?.errorCode === "heic_preview_unavailable") {
      return messages.inspector.previewErrors.heicUnavailable;
    }

    if (payload?.errorCode === "heic_preview_failed") {
      return messages.inspector.previewErrors.heicFailed;
    }

    return fallbackMessage || payload?.error || messages.inspector.previewErrors.loadFailed;
  }, [messages]);

  const openImagePreview = useCallback((image: PreviewItem | null | undefined) => {
    const src = String(
      image?.src
      || image?.previewUrl
      || image?.dataUrl
      || buildLocalFilePreviewUrl(image?.path || image?.fullPath || image?.localPath),
    ).trim();
    if (!src) {
      return;
    }

    setFilePreview(null);
    setImagePreview({
      src,
      alt: image?.alt || image?.name || "",
      path: image?.path || image?.fullPath || image?.localPath || "",
      fileManagerLabel: image?.fileManagerLabel || "Folder",
    });
  }, []);

  const handleOpenPreview = useCallback(async (item: PreviewItem | null | undefined, options: PreviewOptions = {}) => {
    const targetPath = String(item?.fullPath || item?.path || "").trim();
    if (!targetPath) {
      return;
    }

    const startInEditMode = Boolean(options?.startInEditMode);

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setFilePreview({
      item: item || emptyPreviewItem,
      path: targetPath,
      name: targetPath.split("/").filter(Boolean).pop() || targetPath,
      startInEditMode,
      loading: true,
      error: "",
    });

    try {
      const response = await apiFetch(`/api/file-preview?path=${encodeURIComponent(targetPath)}`);
      const payload = await response.json() as Record<string, unknown> & PreviewErrorPayload & {
        contentUrl?: string;
        fileManagerLabel?: string;
        kind?: string;
        name?: string;
        ok?: boolean;
        path?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(resolvePreviewErrorMessage(payload));
      }
      if (requestId !== previewRequestRef.current) {
        return;
      }
      if (payload.kind === "image" && payload.contentUrl) {
        openImagePreview({
          src: payload.contentUrl,
          alt: payload.name || item?.name || "",
          path: payload.path || targetPath,
          fileManagerLabel: payload.fileManagerLabel || "Folder",
        });
        return;
      }
      const resolvedPath = String(payload.path || targetPath);
      setFilePreview({
        ...payload,
        item: item || {},
        path: resolvedPath,
        name: String(payload.name || resolvedPath.split("/").filter(Boolean).pop() || resolvedPath),
        startInEditMode,
        loading: false,
        error: "",
      });
    } catch (error) {
      if (requestId !== previewRequestRef.current) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : "";
      setFilePreview({
        item: item || {},
        path: targetPath,
        name: targetPath.split("/").filter(Boolean).pop() || targetPath,
        startInEditMode,
        loading: false,
        error: errorMessage || messages.inspector.previewErrors.loadFailed,
      });
    }
  }, [messages.inspector.previewErrors.loadFailed, openImagePreview, resolvePreviewErrorMessage]);

  const closeFilePreview = useCallback(() => setFilePreview(null), []);
  const closeImagePreview = useCallback(() => setImagePreview(null), []);

  return {
    filePreview,
    imagePreview,
    handleOpenPreview,
    openImagePreview,
    closeFilePreview,
    closeImagePreview,
  };
}
