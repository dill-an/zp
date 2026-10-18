import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SETTING_DEFAULTS, SETTING_KEYS } from "./settings-keys";

export { SETTING_DEFAULTS, SETTING_KEYS };

export function getSetting(key: string): string {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export function getSettings(): Record<string, string> {
  const rows = db.select().from(settings).all();
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
    .run();
}
