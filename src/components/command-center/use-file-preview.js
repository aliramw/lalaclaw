import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

export function useFilePreview() {
  const { messages } = useI18n();
  const [filePreview, setFilePreview] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const previewRequestRef = useRef(0);

  const resolvePreviewErrorMessage = (payload = {}, fallbackMessage = "") => {
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
  };

  const openImagePreview = (image) => {
    const src = String(image?.src || image?.previewUrl || image?.dataUrl || "").trim();
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
  };

  const handleOpenPreview = async (item, options = {}) => {
    const targetPath = String(item?.fullPath || item?.path || "").trim();
    if (!targetPath) {
      return;
    }

    const startInEditMode = Boolean(options?.startInEditMode);

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setFilePreview({
      item,
      path: targetPath,
      name: targetPath.split("/").filter(Boolean).pop() || targetPath,
      startInEditMode,
      loading: true,
      error: "",
    });

    try {
      const response = await fetch(`/api/file-preview?path=${encodeURIComponent(targetPath)}`);
      const payload = await response.json();
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
      setFilePreview({
        ...payload,
        item,
        startInEditMode,
        loading: false,
        error: "",
      });
    } catch (error) {
      if (requestId !== previewRequestRef.current) {
        return;
      }
      setFilePreview({
        item,
        path: targetPath,
        name: targetPath.split("/").filter(Boolean).pop() || targetPath,
        startInEditMode,
        loading: false,
        error: error.message || messages.inspector.previewErrors.loadFailed,
      });
    }
  };

  return {
    filePreview,
    imagePreview,
    handleOpenPreview,
    openImagePreview,
    closeFilePreview: () => setFilePreview(null),
    closeImagePreview: () => setImagePreview(null),
  };
}
