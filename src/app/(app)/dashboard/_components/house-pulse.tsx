import { Stat } from "@/components/ui/stat";
import { formatDate } from "@/lib/dates";
import type { HousePulse as HousePulseData } from "@/lib/queries/dashboard";

/** House-wide numbers everyone can see. */
export function HousePulse({ pulse }: { pulse: HousePulseData }) {
  const labor = pulse.labor;
  return (
    <section className="space-y-3" data-testid="house-pulse" aria-labelledby="house-pulse-heading">
      <h2 id="house-pulse-heading" className="text-lg font-semibold">
        House pulse
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Labor this week"
          value={labor ? `${labor.done}/${labor.assigned}` : "No week"}
          hint={labor ? `${labor.percent}% done, week of ${formatDate(labor.weekStart)}` : "Nothing posted yet"}
          tone={labor ? (labor.percent >= 75 ? "success" : labor.percent >= 40 ? "warning" : undefined) : undefined}
        />
        <Stat
          label="Last meeting"
          value={pulse.lastMeeting ? `${pulse.lastMeeting.rate}%` : "n/a"}
          hint={pulse.lastMeeting ? `attended, ${formatDate(pulse.lastMeeting.meeting.scheduledAt)}` : "No attendance taken yet"}
          tone={pulse.lastMeeting ? (pulse.lastMeeting.rate >= 80 ? "success" : "warning") : undefined}
        />
        <Stat label="Open maintenance" value={pulse.openMaintenance} hint="requests open or in progress" tone={pulse.openMaintenance ? "warning" : undefined} />
        <Stat label="Zero cleans" value={pulse.zeroCleans} hint={`of ${pulse.poolSize} in the labor pool this semester`} tone={pulse.zeroCleans ? "danger" : "success"} />
      </div>
    </section>
  );
}
