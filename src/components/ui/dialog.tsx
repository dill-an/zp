"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import { cn } from "@/lib/utils";

/**
 * Simple modal built on <dialog>. Renders a trigger button; children render inside the modal.
 * Children receive `close` via render-prop if a function is passed.
 */
export function Dialog({
  trigger,
  triggerVariant = "primary",
  triggerSize = "md",
  title,
  children,
  className,
  triggerClassName,
}: {
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  title: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  triggerClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
        className={cn(
          "m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/50",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={close} aria-label="Close" className="rounded px-2 text-muted hover:bg-surface-2">
            ×
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">{open ? (typeof children === "function" ? children(close) : children) : null}</div>
      </dialog>
    </>
  );
}
