"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonSize, type ButtonVariant } from "./button";
import type { ComponentProps } from "react";

/** Submit button that asks for confirmation first. Place inside a <form action={...}>. */
export function ConfirmButton({
  confirmText = "Are you sure?",
  children,
  variant = "danger",
  size = "sm",
  ...props
}: ComponentProps<"button"> & { confirmText?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || props.disabled}
      onClick={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
