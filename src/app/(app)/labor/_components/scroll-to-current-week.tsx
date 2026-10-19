"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Horizontal scroll container for the brothers grid. On mount it scrolls sideways so the column
 * marked `data-current-week` sits just right of the sticky name column; without this a phone opened
 * the grid on the oldest week and the current one was off screen.
 */
export function ScrollToCurrentWeek({ children, className, ...rest }: { children: ReactNode; className?: string } & Record<`data-${string}`, string | undefined>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>("[data-current-week]");
    if (!target) return;
    const sticky = el.querySelector<HTMLElement>("[data-sticky-col]");
    const stickyWidth = sticky?.getBoundingClientRect().width ?? 0;
    const offset = target.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - stickyWidth;
    const left = Math.max(0, Math.round(offset));
    if (left > 0) el.scrollLeft = left;
  }, []);

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}
