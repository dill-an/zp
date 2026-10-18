"use server";

import { revalidatePath } from "next/cache";
import { ok, parseForm, runAction, type ActionResult } from "@/lib/action-result";
import { requirePermissionForAction } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { changedSettingKeys, formToSettings, houseSettingsSchema } from "@/lib/queries/dashboard-logic";
import { getSettings, setSetting } from "@/lib/settings";

/** Save every house setting from the /settings form (settings.manage). */
export async function saveHouseSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requirePermissionForAction("settings.manage");
    const parsed = parseForm(houseSettingsSchema, formData);
    if ("result" in parsed) return parsed.result;
    const next = formToSettings(parsed.data);
    const changed = changedSettingKeys(getSettings(), next);
    for (const [key, value] of Object.entries(next)) setSetting(key, value);
    logAudit({
      actorId: user.id,
      action: "settings.update",
      entityType: "setting",
      entityId: null,
      summary: `${user.username} updated house settings (${changed.length ? changed.join(", ") : "no changes"})`,
    });
    // The chapter name sits in the app shell and several modules read these keys at render.
    revalidatePath("/", "layout");
    return ok("Settings saved.");
  });
}
