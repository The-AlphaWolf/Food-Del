"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * A modal on the native <dialog>: focus moves in and returns on close, Escape closes it, and
 * the page behind is inert. Clicking the backdrop closes it too.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click is a mouse shortcut; the native dialog already closes on Escape.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[min(94vw,40rem)] overflow-y-auto rounded-xl border border-line bg-card p-0 text-ink shadow-lift"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-card px-5 py-4">
        <div>
          <h2 id={titleId} className="text-xl font-bold">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-0.5 text-sm text-ink-soft">
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-soft hover:bg-paper-deep hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <div className="px-5 py-4">{open && children}</div>
    </dialog>
  );
}
