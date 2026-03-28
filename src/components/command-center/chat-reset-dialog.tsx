import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ButtonSurface as Button } from "@/components/ui/button";

export function ResetConversationDialog({ messages, onCancel, onConfirm, open }) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[2px]">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-[30rem] rounded-2xl border border-border/80 bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="space-y-2">
          <h2 id={titleId} className="text-lg font-semibold leading-7 text-foreground">
            {messages.title}
          </h2>
          <p id={descriptionId} className="text-sm leading-6 text-muted-foreground">
            {messages.description}
          </p>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            {messages.cancel}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={onConfirm}
          >
            {messages.confirm}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
