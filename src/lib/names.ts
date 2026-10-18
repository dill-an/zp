import type { Member } from "@/db/schema";

type NameFields = Pick<Member, "firstName" | "lastName" | "preferredName">;

export function fullName(m: NameFields): string {
  return `${m.firstName} ${m.lastName}`.trim();
}

/** Name shown in most UI: preferred name plus last name, e.g. "Gio Mandwee". */
export function displayName(m: NameFields): string {
  const first = m.preferredName || m.firstName;
  if (first.includes(" ")) return first; // e.g. "David Coll"
  // A brother known by his last name ("Santana") gets his full name instead of "Santana Santana".
  if (first.toLowerCase() === m.lastName.toLowerCase()) return `${m.firstName} ${m.lastName}`.trim();
  return `${first} ${m.lastName}`.trim();
}

/** Short label for grids: the preferred name. */
export function shortName(m: NameFields): string {
  return m.preferredName || m.firstName;
}

export function initials(m: NameFields): string {
  return `${(m.preferredName || m.firstName).charAt(0)}${m.lastName.charAt(0)}`.toUpperCase();
}

/** "Last, First" sort key. */
export function sortKey(m: NameFields): string {
  return `${m.lastName} ${m.firstName}`.toLowerCase();
}
