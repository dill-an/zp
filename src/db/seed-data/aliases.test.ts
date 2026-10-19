import { describe, expect, it } from "vitest";
import { buildAliasIndex } from "./aliases";
import { SEED_MEMBERS } from "./roster";
import { SEED_WEEKS } from "./cleans";

const entries = SEED_MEMBERS.map((m, i) => ({ id: i + 1, first: m.first, preferred: m.preferred, aliases: m.aliases, laborGroup: m.laborGroup }));
const idOf = (first: string, last: string) => SEED_MEMBERS.findIndex((m) => m.first === first && m.last === last) + 1;

describe("seed aliases", () => {
  const index = buildAliasIndex(entries);

  it("credits the sheet's Daniel to Daniel Tecum, not the new member Daniel Idowu", () => {
    expect(index.get("daniel")).toBe(idOf("Daniel", "Tecum"));
  });

  it("resolves nicknames and alternate spellings from the sheet", () => {
    expect(index.get("dom")).toBe(idOf("Dominik", "Grzeszczak"));
    expect(index.get("david coll")).toBe(idOf("David", "Coll Leon"));
    expect(index.get("santana")).toBe(idOf("David", "Santana"));
    expect(index.get("david santana")).toBe(idOf("David", "Santana"));
    expect(index.get("veolsing")).toBe(idOf("Andrew", "Voelsing"));
    expect(index.get("ponciano")).toBe(idOf("Ponciano", "Rubio"));
    expect(index.get("ponce")).toBe(idOf("Ponciano", "Rubio"));
    expect(index.get("payton")).toBe(idOf("Payton", "Berry-Briggs"));
  });

  it("leaves ambiguous bare first names unmapped", () => {
    expect(index.has("david")).toBe(false); // David Coll Leon and David Santana
    expect(index.has("andrew")).toBe(false); // Andy Jacoby and Voelsing
  });

  it("resolves every name used on the cleans sheet to a labor-pool member", () => {
    const poolIds = new Set(entries.filter((e) => e.laborGroup !== "none").map((e) => e.id));
    for (const jobs of Object.values(SEED_WEEKS)) {
      for (const names of Object.values(jobs)) {
        for (const name of names) {
          const id = index.get(name.trim().toLowerCase());
          expect(id, `unresolved sheet name "${name}"`).toBeDefined();
          expect(poolIds.has(id!), `"${name}" resolved outside the labor pool`).toBe(true);
        }
      }
    }
  });

  it("rejects two pool members claiming one explicit alias", () => {
    expect(() =>
      buildAliasIndex([
        { id: 1, first: "A", preferred: "Ace", laborGroup: "cleans" },
        { id: 2, first: "B", aliases: ["Ace"], laborGroup: "cooks" },
      ]),
    ).toThrow(/claimed by two/);
  });
});
