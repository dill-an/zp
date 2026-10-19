import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { shortName } from "@/lib/names";
import { isOfficer } from "@/lib/permissions";
import { dashboardToday, getDashboardData, getHousePulse, getOfficerPanel } from "@/lib/queries/dashboard";
import { deniedMessage, greeting, houseHour } from "@/lib/queries/dashboard-logic";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { AnnouncementsCard, ContactNotice, DuesCard, EventsCard, MyTasksCard, MyWeekCard, NextMeetingCard, SanctionsCard } from "./_components/cards";
import { HousePulse } from "./_components/house-pulse";
import { OfficerPanel } from "./_components/officer-panel";
import { WaitingCard } from "./_components/waiting-card";

export const metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const now = new Date();
  const data = getDashboardData(user, now);
  const officer = isOfficer(user) ? getOfficerPanel(user, now) : null;
  const pulse = getHousePulse();
  const semester = getSetting(SETTING_KEYS.semesterLabel);
  const denied = deniedMessage(sp.denied);

  return (
    <>
      <PageHeader title={`${greeting(houseHour(now))}, ${shortName(user)}`} description={`${formatDate(dashboardToday(), { weekday: true, year: true })} · ${semester}`} />

      {denied ? (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" data-testid="denied-notice">
          {denied}
        </p>
      ) : null}

      <ContactNotice memberId={user.id} missing={data.missingContact} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WaitingCard items={data.waiting} className="md:col-span-2 xl:col-span-3" />
        <MyWeekCard data={data} laborGroup={user.laborGroup} now={now} />
        <MyTasksCard data={data} now={now} />
        <DuesCard data={data} />
        <SanctionsCard data={data} />
        <NextMeetingCard data={data} />
        <EventsCard data={data} />
        <AnnouncementsCard data={data} />
      </div>

      <div className="mt-8 space-y-8">
        {officer ? <OfficerPanel panel={officer} /> : null}
        <HousePulse pulse={pulse} />
      </div>
    </>
  );
}
