import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { formatDateTime, isoToLocalInput } from "@/lib/dates";
import { getMeeting } from "@/lib/queries/meetings";
import { Card, CardContent, PageHeader } from "@/components/ui";
import { MeetingForm } from "../../_components/meeting-form";
import { DeleteMeetingForm } from "../../_components/small-forms";

export const metadata = { title: "Edit meeting" };

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("meetings.manage");
  const { id } = await params;
  const meetingId = Number(id);
  const meeting = Number.isInteger(meetingId) ? getMeeting(meetingId) : null;
  if (!meeting) notFound();

  return (
    <>
      <PageHeader eyebrow="Edit meeting" title={meeting.title} description={formatDateTime(meeting.scheduledAt, { year: true })} actions={<DeleteMeetingForm meetingId={meeting.id} label="Delete meeting" />} />
      <Card className="max-w-2xl">
        <CardContent className="py-4">
          <MeetingForm
            meeting={{
              id: meeting.id,
              title: meeting.title,
              kind: meeting.kind,
              scheduledAtLocal: isoToLocalInput(meeting.scheduledAt),
              location: meeting.location,
              agenda: meeting.agenda,
              isMandatory: meeting.isMandatory,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
