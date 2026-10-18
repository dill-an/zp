import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { getAttendanceRoster, getMeeting } from "@/lib/queries/meetings";
import { ButtonLink, PageHeader } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { AttendanceForm } from "../../_components/attendance-form";
import { MeetingKindBadge } from "../../_components/meeting-bits";

export const metadata = { title: "Take attendance" };

export default async function TakeAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("meetings.manage");
  const { id } = await params;
  const meetingId = Number(id);
  const meeting = Number.isInteger(meetingId) ? getMeeting(meetingId) : null;
  if (!meeting) notFound();

  const groups = getAttendanceRoster(meeting.id).map((g) => ({
    label: g.label,
    rows: g.rows.map((r) => ({ memberId: r.member.id, name: displayName(r.member), status: r.status, note: r.note, hasRecord: r.hasRecord, excused: r.excused })),
  }));
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Take attendance <MeetingKindBadge kind={meeting.kind} />
          </span>
        }
        title={meeting.title}
        description={
          <>
            {formatDateTime(meeting.scheduledAt, { year: true })}
            {meeting.location ? ` · ${meeting.location}` : ""} · {total} brothers
            {meeting.attendanceTaken && meeting.recordedAt ? (
              <>
                <br />
                Last recorded {formatDateTime(meeting.recordedAt)}
                {meeting.recordedBy ? (
                  <>
                    {" "}
                    by <MemberLink member={meeting.recordedBy} />
                  </>
                ) : null}
              </>
            ) : (
              <>
                <br />
                Unmarked brothers are saved as absent. Approved excuses default to excused.
              </>
            )}
          </>
        }
        actions={
          <ButtonLink variant="ghost" size="sm" href={`/meetings/${meeting.id}`}>
            Back to meeting
          </ButtonLink>
        }
      />
      <AttendanceForm meetingId={meeting.id} groups={groups} />
    </>
  );
}
