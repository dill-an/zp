import type { ReactNode } from "react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { AppShell } from "@/components/nav/app-shell";
import { displayName, initials } from "@/lib/names";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { ForcePasswordChange } from "@/components/force-password-change";
import { humanize } from "@/lib/utils";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const chapterName = getSetting(SETTING_KEYS.chapterName);
  const roleLabel = user.role === "admin" ? "Admin" : user.chairSlugs.length ? user.chairSlugs.map(humanize).join(", ") : "Brother";
  return (
    <AppShell user={{ id: user.id, name: displayName(user), initials: initials(user), roleLabel }} chapterName={chapterName} logoutAction={logout}>
      {user.mustChangePassword ? <ForcePasswordChange /> : children}
    </AppShell>
  );
}
