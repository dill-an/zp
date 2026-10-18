import { requirePermission } from "@/lib/auth";
import { addDaysISO, todayISO } from "@/lib/dates";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { weeklySeries } from "@/lib/queries/meetings-logic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader } from "@/components/ui";
import { MeetingForm } from "../_components/meeting-form";
import { SeriesForm } from "../_components/series-form";

export const metadata = { title: "New meeting" };

export default async function NewMeetingPage() {
  await requirePermission("meetings.manage");
  const weekday = Math.min(6, Math.max(0, Number(getSetting(SETTING_KEYS.houseMeetingDay)) || 0));
  const time = /^\d{2}:\d{2}$/.test(getSetting(SETTING_KEYS.houseMeetingTime)) ? getSetting(SETTING_KEYS.houseMeetingTime) : "19:00";
  const today = todayISO();
  const nextDate = weeklySeries(today, addDaysISO(today, 7), weekday)[0] ?? today;

  return (
    <>
      <PageHeader eyebrow="Meetings" title="New meeting" description="Schedule one meeting, or a whole semester of weekly meetings at once." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Single meeting</CardTitle>
              <CardDescription>Defaults to the next house meeting slot.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="py-4">
            <MeetingForm defaultScheduledAt={`${nextDate}T${time}`} defaultLocation="House" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Create weekly series</CardTitle>
              <CardDescription>One meeting per week between two dates.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="py-4">
            <SeriesForm defaultWeekday={weekday} defaultTime={time} defaultFirstDate={today} defaultLastDate={addDaysISO(today, 84)} defaultLocation="House" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
