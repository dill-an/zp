import { describe, expect, it } from "vitest";
import { displayName, initials, shortName, sortKey } from "./names";

describe("names", () => {
  it("uses the preferred name with the last name", () => {
    expect(displayName({ firstName: "Nicholas", lastName: "Ramos", preferredName: "Nick" })).toBe("Nick Ramos");
    expect(displayName({ firstName: "David", lastName: "Coll Leon", preferredName: "David Coll" })).toBe("David Coll");
  });
  it("does not double a last-name nickname", () => {
    expect(displayName({ firstName: "David", lastName: "Santana", preferredName: "Santana" })).toBe("David Santana");
    expect(displayName({ firstName: "Andrew", lastName: "Voelsing", preferredName: "Voelsing" })).toBe("Andrew Voelsing");
  });
  it("short names, initials and sort keys", () => {
    expect(shortName({ firstName: "David", lastName: "Santana", preferredName: "Santana" })).toBe("Santana");
    expect(initials({ firstName: "Dylan", lastName: "Nguyen", preferredName: "Dylan" })).toBe("DN");
    expect(sortKey({ firstName: "Dylan", lastName: "Nguyen", preferredName: "Dylan" })).toBe("nguyen dylan");
  });
});
