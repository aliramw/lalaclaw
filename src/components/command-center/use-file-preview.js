import { useRef, useState } from "react";

export function useFilePreview() {
  const [filePreview, setFilePreview] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const previewRequestRef = useRef(0);

  const handleOpenPreview = async (item) => {
    const targetPath = String(item?.fullPath || item?.path || "").trim();
    if (!targetPath) {
      return;
    }

    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setFilePreview({
      item,
      path: targetPath,
      name: targetPath.split("/").filter(Boolean).pop() || targetPath,
      loading: true,
      error: "",
    });

    try {
      const response = await fetch(`/api/file-preview?path=${encodeURIComponent(targetPath)}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "File preview failed");
      }
      if (requestId !== previewRequestRef.current) {
        return;
      }
      if (payload.kind === "image" && payload.contentUrl) {
        setFilePreview(null);
        setImagePreview({
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
        loading: false,
        error: error.message || "File preview failed",
      });
    }
  };

  return {
    filePreview,
    imagePreview,
    handleOpenPreview,
    closeFilePreview: () => setFilePreview(null),
    closeImagePreview: () => setImagePreview(null),
  };
}
