import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { displayName, initials, shortName } from "@/lib/names";
import { cn } from "@/lib/utils";

type M = { id: number; firstName: string; lastName: string; preferredName: string };

/** Name that links to the member profile. `short` shows only the preferred name (for grids). */
export function MemberLink({ member, short = false, withAvatar = false, className }: { member: M; short?: boolean; withAvatar?: boolean; className?: string }) {
  return (
    <Link href={`/members/${member.id}`} className={cn("inline-flex items-center gap-2 font-medium hover:underline", className)}>
      {withAvatar ? <Avatar initials={initials(member)} seed={member.id} size="sm" /> : null}
      {short ? shortName(member) : displayName(member)}
    </Link>
  );
}
