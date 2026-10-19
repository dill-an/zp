import type { LaborGroup } from "../schema";

export type AliasEntry = { id: number; first: string; preferred?: string; aliases?: string[]; laborGroup: LaborGroup };

/**
 * Maps the short names used on the cleans sheet ("Daniel", "Dom", "David Coll") to member ids.
 * Labor-pool members win every name: their explicit preferred names and aliases first, then their bare
 * first names when unique within the pool, and only then do non-pool members (new members) get names
 * nobody else claimed. Two pool members claiming the same explicit name is an error in the seed data.
 */
export function buildAliasIndex(entries: AliasEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  const pool = entries.filter((e) => e.laborGroup !== "none");
  const key = (s: string) => s.trim().toLowerCase();

  for (const e of pool) {
    for (const alias of [e.preferred, ...(e.aliases ?? [])]) {
      if (!alias) continue;
      const k = key(alias);
      const owner = map.get(k);
      if (owner != null && owner !== e.id) throw new Error(`Seed alias "${alias}" is claimed by two labor-pool members.`);
      map.set(k, e.id);
    }
  }
  const firstCounts = new Map<string, number>();
  for (const e of pool) firstCounts.set(key(e.first), (firstCounts.get(key(e.first)) ?? 0) + 1);
  for (const e of pool) {
    const k = key(e.first);
    if (firstCounts.get(k) === 1 && !map.has(k)) map.set(k, e.id);
  }
  for (const e of entries) {
    if (e.laborGroup !== "none") continue;
    for (const alias of [e.preferred ?? e.first, ...(e.aliases ?? [])]) {
      const k = key(alias);
      if (!map.has(k)) map.set(k, e.id);
    }
  }
  return map;
}
