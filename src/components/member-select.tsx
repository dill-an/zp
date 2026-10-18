import { Select } from "@/components/ui/form";
import { displayName } from "@/lib/names";
import type { ComponentProps } from "react";

type M = { id: number; firstName: string; lastName: string; preferredName: string };

/** Native <select> of members, optionally grouped. Pass `groups` from groupByPledgeClass() or a flat `members` list. */
export function MemberSelect({
  members,
  groups,
  placeholder = "Select a brother",
  ...props
}: ComponentProps<"select"> & { members?: M[]; groups?: { label: string; members: M[] }[]; placeholder?: string | null }) {
  return (
    <Select {...props}>
      {placeholder !== null ? <option value="">{placeholder}</option> : null}
      {groups
        ? groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m)}
                </option>
              ))}
            </optgroup>
          ))
        : (members ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)}
            </option>
          ))}
    </Select>
  );
}
