import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A dashboard card: title, optional count badge, a link to the module page, body. */
export function DashCard({
  title,
  count,
  href,
  hrefLabel = "See all",
  children,
  className,
  testId,
}: {
  title: ReactNode;
  count?: number;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={cn("flex flex-col", className)} data-testid={testId}>
      <CardHeader className="items-center">
        <div className="flex items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {count != null ? <Badge tone={count > 0 ? "primary" : "neutral"}>{count}</Badge> : null}
        </div>
        {href ? (
          <Link href={href} className="text-sm text-muted underline-offset-2 hover:text-text hover:underline">
            {hrefLabel}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}

/** One-line empty text inside a card, with an optional link. */
export function CardEmpty({ children, href, linkLabel }: { children: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted">
      {children}
      {href ? (
        <>
          {" "}
          <Link href={href} className="underline">
            {linkLabel ?? "Open"}
          </Link>
        </>
      ) : null}
    </p>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted">{children}</p>;
}
