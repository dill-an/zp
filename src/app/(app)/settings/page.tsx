import Link from "next/link";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { calendarFeedUrls, calendarTokenFor, publicBaseUrl } from "@/lib/calendar";
import { formatDateTime } from "@/lib/dates";
import { displayName, initials } from "@/lib/names";
import { can } from "@/lib/permissions";
import { settingsToForm } from "@/lib/queries/dashboard-logic";
import { getMemberProfile } from "@/lib/queries/members";
import { getSettings } from "@/lib/settings";
import { humanize } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { CalendarSubscribe } from "./calendar-subscribe";
import { HouseSettingsForm } from "./house-settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = getMemberProfile(user.id);
  const manageSettings = can(user, "settings.manage");
  const settings = manageSettings ? getSettings() : null;
  const requestHeaders = await headers();
  const feed = calendarFeedUrls(publicBaseUrl((name) => requestHeaders.get(name)), calendarTokenFor(user.id));
  const dataLinks = [
    can(user, "members.manage") ? { href: "/members/export", label: "Export roster (CSV)", hint: "Every member with contact details." } : null,
    can(user, "dues.manage") ? { href: "/dues/export", label: "Export dues (CSV)", hint: "Balances for the active period." } : null,
    user.role === "admin" ? { href: "/settings/backup", label: "Download database backup", hint: "A copy of the whole SQLite database, dated today." } : null,
    can(user, "audit.view") ? { href: "/settings/audit", label: "Audit log", hint: "Who changed what, newest first." } : null,
  ].filter((l): l is { href: string; label: string; hint: string } => l !== null);

  return (
    <>
      <PageHeader title="Settings" description="Your account, and the house settings when you manage them." />

      <div className="space-y-4">
        <Card data-testid="profile-card">
          <CardHeader>
            <CardTitle>My profile</CardTitle>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/members/${user.id}`} variant="outline" size="sm">
                View profile
              </ButtonLink>
              <ButtonLink href={`/members/${user.id}/edit`} variant="outline" size="sm">
                Edit profile
              </ButtonLink>
              <ButtonLink href="/settings/password" size="sm">
                Change password
              </ButtonLink>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <Avatar initials={initials(user)} seed={user.id} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold leading-tight">{displayName(user)}</p>
              <p className="text-sm text-muted">
                @{user.username}
                {profile?.pledgeClass ? ` · ${profile.pledgeClass.name}` : ""}
                {user.email ? ` · ${user.email}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusPill status={user.role} />
                <StatusPill status={user.status} />
                {user.laborGroup !== "none" ? <StatusPill status={user.laborGroup} label={`${humanize(user.laborGroup)} group`} /> : null}
                {profile?.currentChairs.map((t) => (
                  <Link key={t.id} href={`/chairs/${t.chair.slug}`}>
                    <Badge tone="primary">{t.chair.name}</Badge>
                  </Link>
                ))}
              </div>
              {user.mustChangePassword ? <p className="mt-2 text-sm text-warning">You still need to change your temporary password.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="calendar-card">
          <CardHeader>
            <div>
              <CardTitle>Subscribe in your calendar</CardTitle>
              <CardDescription>Your cleans, events and duties, house meetings and sanction deadlines, kept up to date on your phone.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <CalendarSubscribe webcalUrl={feed.webcal} httpsUrl={feed.https} />
            <ul className="space-y-1 text-sm text-muted">
              <li>
                <span className="font-medium text-text">iPhone:</span> open the webcal link in Safari and tap Subscribe, or go to Settings, Calendar, Accounts, Add Subscribed Calendar and paste the feed URL.
              </li>
              <li>
                <span className="font-medium text-text">Google Calendar:</span> on the web, next to Other calendars press +, choose From URL and paste the feed URL.
              </li>
            </ul>
            <p className="text-xs text-muted">The link is private to you: anyone who has it can read your schedule, so do not share it.</p>
          </CardContent>
        </Card>

        {manageSettings && settings ? (
          <Card data-testid="house-settings-card">
            <CardHeader>
              <div>
                <CardTitle>House settings</CardTitle>
                <CardDescription>Names, the semester, fines and where dues get paid. Changes apply everywhere right away.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <HouseSettingsForm current={settingsToForm(settings)} />
              <p className="mt-4 border-t border-border pt-3 text-sm text-muted">
                The standards policy text is managed by the standards board under{" "}
                <Link href="/sanctions/policy" className="underline">
                  Sanctions policy
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        ) : null}

        {dataLinks.length ? (
          <Card data-testid="data-card">
            <CardHeader>
              <div>
                <CardTitle>Data</CardTitle>
                <CardDescription>Exports and the audit trail.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 py-0">
              <ul className="divide-y divide-border">
                {dataLinks.map((l) => (
                  <li key={l.href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <Link href={l.href} className="font-medium hover:underline" prefetch={false}>
                        {l.label}
                      </Link>
                      <p className="text-sm text-muted">{l.hint}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <p className="text-xs text-muted">Member since {formatDateTime(user.createdAt, { year: true })}.</p>
      </div>
    </>
  );
}
