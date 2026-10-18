import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getMemberProfile, type ChairTerm } from "@/lib/queries/members";
import { canManageMemberAccount, termLabel } from "@/lib/queries/members-logic";
import { setMemberStatusForm } from "@/lib/actions/members";
import { displayName, fullName, initials } from "@/lib/names";
import { formatDate } from "@/lib/dates";
import { humanize } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { AttendanceSection, DuesSection, LaborSection, SanctionsSection, TasksSection } from "./sections";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const id = parseId((await params).id);
  const profile = id ? getMemberProfile(id) : null;
  return { title: profile ? displayName(profile.member) : "Member" };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function TermList({ terms, emptyText }: { terms: ChairTerm[]; emptyText: string }) {
  if (terms.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {terms.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
          <span className="flex items-center gap-2">
            <Link href={`/chairs/${t.chair.slug}`} className="font-medium hover:underline">
              {t.chair.name}
            </Link>
            {t.title ? <Badge>{t.title}</Badge> : null}
            {!t.chair.isActive ? <Badge>Inactive chair</Badge> : null}
          </span>
          <span className="text-muted">{termLabel(t.termStart, t.termEnd, (d) => formatDate(d, { year: true }))}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function MemberProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireUser();
  const id = parseId((await params).id);
  if (!id) notFound();
  const profile = getMemberProfile(id);
  if (!profile) notFound();
  const sp = await searchParams;
  const { member, pledgeClass, currentChairs, chairHistory } = profile;

  const canManage = can(viewer, "members.manage");
  // Only admins may reset or deactivate another admin; other members.manage holders just get Edit.
  const canManageAccount = canManage && canManageMemberAccount(viewer.role, member.role);
  const isSelf = viewer.id === member.id;
  const canEdit = isSelf || canManage;
  const seesPrivate = isSelf || canManage;
  const name = displayName(member);
  const inactive = member.status === "inactive" || member.status === "alumni";

  const flash =
    typeof sp.error === "string"
      ? { ok: false as const, error: sp.error }
      : typeof sp.ok === "string"
        ? { ok: true as const, message: sp.ok }
        : sp.created === "1"
          ? { ok: true as const, message: `${name} was added. Give them their temporary password in person.` }
          : sp.saved === "1"
            ? { ok: true as const, message: "Profile saved." }
            : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/members" className="hover:underline">
            Members
          </Link>
        }
        title={name}
        actions={
          <>
            {canEdit ? (
              <ButtonLink href={`/members/${member.id}/edit`} size="sm">
                Edit
              </ButtonLink>
            ) : null}
            {canManageAccount ? <ResetPasswordDialog memberId={member.id} memberName={name} /> : null}
            {canManageAccount && !isSelf ? (
              <form action={setMemberStatusForm}>
                <input type="hidden" name="memberId" value={member.id} />
                <input type="hidden" name="status" value={inactive ? "active" : "inactive"} />
                {inactive ? (
                  <ConfirmButton variant="outline" confirmText={`Reactivate ${name}? They will be able to log in again.`}>
                    Reactivate
                  </ConfirmButton>
                ) : (
                  <ConfirmButton variant="danger" confirmText={`Deactivate ${name}? They will be logged out and hidden from the roster.`}>
                    Deactivate
                  </ConfirmButton>
                )}
              </form>
            ) : null}
          </>
        }
      />

      {flash ? <FormMessage result={flash} className="mb-4" /> : null}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-4 py-4">
          <Avatar initials={initials(member)} seed={member.id} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold leading-tight">{name}</p>
            <p className="text-sm text-muted">
              {fullName(member) !== name ? <>{fullName(member)} · </> : null}@{member.username}
              {pledgeClass ? <> · {pledgeClass.name}</> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="profile-pills">
              <StatusPill status={member.status} />
              {member.laborGroup !== "none" ? <StatusPill status={member.laborGroup} label={`${humanize(member.laborGroup)} group`} /> : <Badge>No labor group</Badge>}
              <StatusPill status={member.role} />
              {currentChairs.map((t) => (
                <Link key={t.id} href={`/chairs/${t.chair.slug}`}>
                  <Badge tone="primary">{t.chair.name}</Badge>
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chairs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Now</p>
            <TermList terms={currentChairs} emptyText="Not holding a chair right now." />
            {chairHistory.length ? (
              <>
                <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted">Before</p>
                <TermList terms={chairHistory} emptyText="" />
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Email">
                {member.email ? (
                  <a href={`mailto:${member.email}`} className="break-all hover:underline">
                    {member.email}
                  </a>
                ) : (
                  <span className="text-muted">Not set</span>
                )}
              </Row>
              <Row label="Phone">
                {member.phone ? (
                  <a href={`tel:${member.phone}`} className="hover:underline" data-testid="profile-phone">
                    {member.phone}
                  </a>
                ) : (
                  <span className="text-muted">Not set</span>
                )}
              </Row>
              <Row label="Room">{member.room ?? <span className="text-muted">Not set</span>}</Row>
              <Row label="Lives in house">{member.livesInHouse ? "Yes" : "No"}</Row>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Academics</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Major">{member.major ?? <span className="text-muted">Not set</span>}</Row>
              <Row label="Graduation year">{member.gradYear ?? <span className="text-muted">Not set</span>}</Row>
              <Row label="Birthday">{member.birthday ? formatDate(member.birthday, { year: true }) : <span className="text-muted">Not set</span>}</Row>
            </dl>
          </CardContent>
        </Card>

        {seesPrivate ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Private</CardTitle>
                <p className="text-xs text-muted">Visible to {isSelf ? "you" : name} and people who manage members.</p>
              </div>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <Row label="Emergency contact">{member.emergencyContact ?? <span className="text-muted">Not set</span>}</Row>
                <Row label="Dietary notes">{member.dietaryNotes ?? <span className="text-muted">Not set</span>}</Row>
              </dl>
              {canManage ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Admin notes</p>
                  {member.notes ? <p className="whitespace-pre-wrap text-sm">{member.notes}</p> : <p className="text-sm text-muted">None.</p>}
                  <p className="mt-2 text-xs text-muted">Member since {formatDate(member.createdAt, { year: true })}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <LaborSection memberId={member.id} viewer={viewer} />
        <TasksSection memberId={member.id} viewer={viewer} />
        <DuesSection memberId={member.id} viewer={viewer} />
        <AttendanceSection memberId={member.id} viewer={viewer} />
        <SanctionsSection memberId={member.id} viewer={viewer} />
      </div>
    </>
  );
}
