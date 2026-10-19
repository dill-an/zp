"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

/** Old-browser path: a hidden textarea plus execCommand, which still works where the Clipboard API is missing or blocked. */
function copyWithTextarea(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

/**
 * Copies `text` to the clipboard (navigator.clipboard, falling back to a textarea) and says so on
 * the button for a moment. Used to paste the week's schedule or a brother's jobs into the group chat.
 */
export function CopyTextButton({
  text,
  label = "Copy as text",
  variant = "outline",
  size = "sm",
  className,
}: {
  text: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    let ok = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = copyWithTextarea(text);
    setState(ok ? "copied" : "failed");
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={copy} aria-live="polite" data-testid="copy-text" data-copy-state={state}>
      {state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : label}
    </Button>
  );
}
