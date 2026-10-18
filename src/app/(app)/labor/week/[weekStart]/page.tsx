import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { formatDate, weekStartFor } from "@/lib/dates";
import { isSunday, isValidISODate } from "@/lib/queries/labor-logic";
import { WeekPage } from "../../_components/week-page";

export async function generateMetadata({ params }: { params: Promise<{ weekStart: string }> }) {
  const { weekStart } = await params;
  return { title: isValidISODate(weekStart) ? `Week of ${formatDate(weekStart)} | Labor` : "Labor" };
}

export default async function LaborWeekPage({ params, searchParams }: { params: Promise<{ weekStart: string }>; searchParams: Promise<{ manage?: string }> }) {
  const user = await requireUser();
  const { weekStart } = await params;
  const { manage } = await searchParams;
  if (!isValidISODate(weekStart)) notFound();
  if (!isSunday(weekStart)) redirect(`/labor/week/${weekStartFor(weekStart)}${manage === "1" ? "?manage=1" : ""}`);
  return <WeekPage user={user} weekStart={weekStart} manage={manage === "1"} />;
}
