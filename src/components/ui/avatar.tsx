import { cn } from "@/lib/utils";

const palette = ["bg-info-soft text-info", "bg-success-soft text-success", "bg-warning-soft text-warning", "bg-primary-soft text-primary-strong", "bg-danger-soft text-danger"];

export function Avatar({ initials, seed, size = "md", className }: { initials: string; seed?: number | string; size?: "sm" | "md" | "lg"; className?: string }) {
  const idx = typeof seed === "number" ? seed : seed ? [...seed].reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const sizes = { sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm", lg: "h-14 w-14 text-lg" };
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", palette[idx % palette.length], sizes[size], className)} aria-hidden>
      {initials}
    </span>
  );
}
