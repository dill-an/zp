import { requireUser } from "@/lib/auth";
import { currentWeekStart } from "@/lib/dates";
import { WeekPage } from "./_components/week-page";

export const metadata = { title: "Labor" };

export default async function LaborPage({ searchParams }: { searchParams: Promise<{ manage?: string }> }) {
  const user = await requireUser();
  const { manage } = await searchParams;
  return <WeekPage user={user} weekStart={currentWeekStart()} manage={manage === "1"} />;
}
