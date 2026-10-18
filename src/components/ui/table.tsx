import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="table-wrap">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-surface-2 text-left text-xs uppercase tracking-wide text-muted", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-surface-2/60", className)} {...props} />;
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cn("px-3 py-2 font-medium whitespace-nowrap", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...props} />;
}
