"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import type { ComponentProps } from "react";

/** Submit button that disables itself while the parent form's server action is pending. */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}
