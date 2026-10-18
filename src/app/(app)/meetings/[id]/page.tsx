import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { formatDateTime, isPast } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { fineAbsences, issueAbsenceSanctions } from "@/lib/actions/meetings";
import { getFinePreview, getMeeting, getMeetingAttendance, getMyExcuseForMeeting, getSanctionPreview } from "@/lib/queries/meetings";
import { attendanceRate, splitParagraphs } from "@/lib/queries/meetings-logic";
import { ButtonLink, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Stat, StatusPill } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { AbsencePanel } from "../_components/absence-panel";
import { ExcuseDialog } from "../_components/excuse-dialog";
import { MandatoryBadge, MeetingKindBadge } from "../_components/meeting-bits";
import { MinutesEditor } from "../_components/minutes-editor";
import { DeleteMeetingForm, WithdrawExcuseForm } from "../_components/small-forms";

export const metadata = { title: "Meeting" };

export default async function MeetingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { saved } = await searchParams;
  const meetingId = Number(id);
  const meeting = Number.isInteger(meetingId) ? getMeeting(meetingId) : null;
  if (!meeting) notFound();

  const manage = can(user, "meetings.manage");
  const upcoming = !isPast(meeting.scheduledAt);
  const groups = meeting.attendanceTaken ? getMeetingAttendance(meeting.id) : [];
  const mine = groups.flatMap((g) => g.rows).find((r) => r.memberId === user.id) ?? null;
  const myExcuse = getMyExcuseForMeeting(user.id, meeting.id);
  const eligible = upcoming || mine?.status === "absent";
  const canRequest = eligible && myExcuse?.status !== "pending" && myExcuse?.status !== "approved";
  const finePreview = manage && meeting.attendanceTaken ? getFinePreview(meeting) : null;
  const sanctionPreview = manage && meeting.attendanceTaken ? getSanctionPreview(meeting) : null;
  const agenda = splitParagraphs(meeting.agenda);
  const minutes = splitParagraphs(meeting.minutes);
  const label = `${meeting.title}, ${formatDateTime(meeting.scheduledAt)}`;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/meetings" className="hover:underline">
              Meetings
            </Link>
            <MeetingKindBadge kind={meeting.kind} />
            <MandatoryBadge isMandatory={meeting.isMandatory} />
          </span>
        }
        title={meeting.title}
        description={
          <>
            {formatDateTime(meeting.scheduledAt, { year: true })}
            {meeting.location ? ` · ${meeting.location}` : ""}
          </>
        }
        actions={
          <>
            {eligible ? <ExcuseDialog meetingId={meeting.id} meetingLabel={label} canRequest={canRequest} /> : null}
            {manage ? (
              <>
                <ButtonLink variant="ghost" size="sm" href={`/meetings/${meeting.id}/edit`}>
                  Edit
                </ButtonLink>
                <ButtonLink size="sm" href={`/meetings/${meeting.id}/attendance`}>
                  {meeting.attendanceTaken ? "Edit attendance" : "Take attendance"}
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />

      {saved === "attendance" ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Attendance saved.
        </p>
      ) : null}

      {meeting.counts ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="attendance-counts">
          <div className="contents" data-testid="count-present">
            <Stat label="Present" value={meeting.counts.present} tone="success" />
          </div>
          <div className="contents" data-testid="count-absent">
            <Stat label="Absent" value={meeting.counts.absent} tone={meeting.counts.absent > 0 ? "danger" : undefined} />
          </div>
          <div className="contents" data-testid="count-excused">
            <Stat label="Excused" value={meeting.counts.excused} tone="warning" />
          </div>
          <div className="contents" data-testid="count-late">
            <Stat label="Late" value={meeting.counts.late} tone="info" />
          </div>
          <Stat label="Attendance" value={`${attendanceRate(meeting.counts)}%`} hint={`${meeting.counts.total} recorded`} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>My status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {mine ? (
                <p className="flex flex-wrap items-center gap-2">
                  <StatusPill status={mine.status} />
                  {mine.note ? <span className="text-muted">{mine.note}</span> : null}
                </p>
              ) : meeting.attendanceTaken ? (
                <p className="text-muted">You were not on the attendance sheet for this meeting.</p>
              ) : (
                <p className="text-muted">{upcoming ? "Attendance has not been taken yet." : "Attendance not taken."}</p>
              )}
              {myExcuse ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
                  <span className="text-muted">My excuse request</span>
                  <StatusPill status={myExcuse.status} />
                  <span className="min-w-0 flex-1 truncate">{myExcuse.reason}</span>
                  {myExcuse.reviewNote ? <span className="text-muted">Note: {myExcuse.reviewNote}</span> : null}
                  {myExcuse.status === "pending" ? <WithdrawExcuseForm requestId={myExcuse.id} /> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {agenda.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Agenda</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {agenda.map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Attendance</CardTitle>
                {meeting.attendanceTaken && meeting.recordedAt ? (
                  <CardDescription>
                    Recorded {formatDateTime(meeting.recordedAt)}
                    {meeting.recordedBy ? (
                      <>
                        {" "}
                        by <MemberLink member={meeting.recordedBy} className="font-normal" />
                      </>
                    ) : null}
                  </CardDescription>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              {!meeting.attendanceTaken ? (
                <EmptyState
                  title="Attendance not taken"
                  description={upcoming ? "The sheet opens when an officer takes attendance." : "Nobody has recorded attendance for this meeting."}
                  action={manage ? <ButtonLink href={`/meetings/${meeting.id}/attendance`}>Take attendance</ButtonLink> : undefined}
                  className="py-6"
                />
              ) : (
                <div className="space-y-4">
                  {groups.map((g) => (
                    <section key={g.label}>
                      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {g.label} <span className="font-normal normal-case">({g.rows.length})</span>
                      </h3>
                      <ul className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                        {g.rows.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-2 rounded px-1 py-0.5" data-testid="attendance-row">
                            <span className="min-w-0 truncate">
                              <MemberLink member={r.member} />
                              {r.note ? <span className="ml-1.5 text-xs text-muted">{r.note}</span> : null}
                            </span>
                            <StatusPill status={r.status} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Minutes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {minutes.length > 0 ? (
                minutes.map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p}
                  </p>
                ))
              ) : (
                <p className="text-muted">No minutes yet.</p>
              )}
              {manage ? <MinutesEditor meetingId={meeting.id} minutes={meeting.minutes} /> : null}
            </CardContent>
          </Card>

          {manage && finePreview && sanctionPreview ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Absences</CardTitle>
                  <CardDescription>Absent and not excused. Members already handled for this meeting are skipped.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">
                    Fine absences <span className="text-muted">({formatCents(finePreview.amountCents)} each, due in 14 days)</span>
                  </h3>
                  <AbsencePanel
                    meetingId={meeting.id}
                    members={finePreview.members}
                    action={fineAbsences}
                    buttonLabel={`Fine ${finePreview.members.length} ${finePreview.members.length === 1 ? "absence" : "absences"}`}
                    confirmText={`Charge ${formatCents(finePreview.amountCents)} to each of ${finePreview.members.length} brother(s) for "${finePreview.description}"?`}
                    emptyText={meeting.counts?.absent ? "Every absence for this meeting has been fined." : "No unexcused absences."}
                    testId="fine-panel"
                  />
                </section>
                <section className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-sm font-medium">
                    Issue sanctions for absences <span className="text-muted">(due in 7 days)</span>
                  </h3>
                  <AbsencePanel
                    meetingId={meeting.id}
                    members={sanctionPreview.members}
                    action={issueAbsenceSanctions}
                    buttonLabel={`Sanction ${sanctionPreview.members.length} ${sanctionPreview.members.length === 1 ? "absence" : "absences"}`}
                    confirmText={`Issue a missed-meeting sanction to each of ${sanctionPreview.members.length} brother(s)?`}
                    emptyText={meeting.counts?.absent ? "Every absence for this meeting has a sanction." : "No unexcused absences."}
                    testId="sanction-panel"
                  />
                </section>
              </CardContent>
            </Card>
          ) : null}

          {manage ? (
            <div className="flex justify-end">
              <DeleteMeetingForm meetingId={meeting.id} label="Delete meeting" />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
