import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldValue, formToObject, formValues, parseForm } from "./action-result";

function fd(entries: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("formToObject", () => {
  it("collects repeated keys and arrays, drops empty strings and action ids", () => {
    const obj = formToObject(fd([["title", "Hi"], ["note", ""], ["ids[]", "1"], ["ids[]", "2"], ["tag", "a"], ["tag", "b"], ["$ACTION_ID_x", "y"]]));
    expect(obj).toEqual({ title: "Hi", note: undefined, ids: ["1", "2"], tag: ["a", "b"] });
  });
});

describe("parseForm", () => {
  const schema = z.object({ title: z.string().min(1, "Enter a title."), amount: z.coerce.number().positive() });
  it("returns parsed data", () => {
    const r = parseForm(schema, fd([["title", "Dues"], ["amount", "12"]]));
    expect("data" in r && r.data).toEqual({ title: "Dues", amount: 12 });
  });
  it("returns a failure with field errors and the submitted values", () => {
    const r = parseForm(schema, fd([["title", ""], ["amount", "-1"], ["password", "secret"]]));
    expect("result" in r).toBe(true);
    if ("result" in r && !r.result.ok) {
      expect(r.result.error).toBe("Title: This field is required.");
      expect(r.result.fieldErrors?.title?.[0]).toBe("This field is required.");
      expect(r.result.values).toEqual({ title: "", amount: "-1" });
    }
  });
});

describe("formValues / fieldValue", () => {
  it("never echoes passwords and falls back to existing values", () => {
    const values = formValues(fd([["username", "gio"], ["newPassword", "x"]]));
    expect(values).toEqual({ username: "gio" });
    expect(fieldValue({ ok: false, error: "e", values }, "username", "other")).toBe("gio");
    expect(fieldValue({ ok: false, error: "e", values }, "phone", "617")).toBe("617");
    expect(fieldValue(null, "phone", null)).toBe("");
    expect(fieldValue({ ok: true }, "phone", 5)).toBe("5");
  });
});
