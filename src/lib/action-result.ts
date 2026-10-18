import type { ZodType } from "zod";

/** Standard return shape for server actions used with useActionState. */
export type ActionResult =
  | { ok: true; message?: string; id?: number }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
      /** Submitted string values, so forms can re-populate inputs (React resets forms after an action). */
      values?: Record<string, string>;
    };

export const ok = (message?: string, id?: number): ActionResult => ({ ok: true, message, id });
export const fail = (error: string, fieldErrors?: Record<string, string[]>, values?: Record<string, string>): ActionResult => ({
  ok: false,
  error,
  fieldErrors,
  values,
});

/** String entries of a FormData as a plain record (for re-populating a form after a failed action). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || typeof value !== "string") continue;
    if (/password/i.test(key)) continue;
    out[key] = value;
  }
  return out;
}

/** Helper for forms: `defaultValue={fieldValue(result, "title", task.title)}`. */
export function fieldValue(result: ActionResult | null | undefined, key: string, fallback: string | number | null | undefined = ""): string {
  if (result && !result.ok && result.values && key in result.values) return result.values[key];
  return fallback == null ? "" : String(fallback);
}

/** Convert FormData into a plain object. Repeated keys become arrays. Empty strings become undefined. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const v = typeof value === "string" ? (value === "" ? undefined : value) : value;
    if (key.endsWith("[]")) {
      const k = key.slice(0, -2);
      const arr = (out[k] as unknown[] | undefined) ?? [];
      if (v !== undefined) arr.push(v);
      out[k] = arr;
    } else if (key in out) {
      const prev = out[key];
      out[key] = Array.isArray(prev) ? [...prev, v] : [prev, v];
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Validate FormData with a zod schema; returns parsed data or an ActionResult failure. */
export function parseForm<T>(schema: ZodType<T>, formData: FormData): { data: T } | { result: ActionResult } {
  const parsed = schema.safeParse(formToObject(formData));
  if (parsed.success) return { data: parsed.data };
  const fieldErrors: Record<string, string[]> = {};
  const issues = parsed.error.issues.map((issue) => ({
    ...issue,
    // Empty inputs arrive as undefined (see formToObject); say "required" instead of zod's type message.
    message: /received undefined/i.test(issue.message) ? "This field is required." : issue.message,
  }));
  for (const issue of issues) {
    const key = issue.path.map(String).join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  const first = issues[0];
  const where = first?.path.length ? `${humanizeKey(first.path.map(String).join("."))}: ` : "";
  return { result: fail(`${where}${first?.message ?? "Invalid input."}`, fieldErrors, formValues(formData)) };
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_.]/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Wrap an action body so thrown errors become ActionResult failures. */
export async function runAction(fn: () => Promise<ActionResult> | ActionResult): Promise<ActionResult> {
  try {
    return await fn();
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return fail(message);
  }
}

function isNextRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
