import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MEETING_KINDS, type MeetingKind } from "@/db/schema";
import { formatDate, formatShortDate } from "@/lib/dates";
import { displayName } from "@/lib/names";
import { listPledgeClasses } from "@/lib/queries/common";
import { getAttendanceMatrix } from "@/lib/queries/meetings";
import { ATTENDANCE_LETTERS, attendanceRate, MEETING_KIND_LABELS, mostAbsences } from "@/lib/queries/meetings-logic";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Stat, Table, TBody, Td, Th, THead } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { cn } from "@/lib/utils";
import { CELL_CLASSES } from "../_components/meeting-bits";
import { ScrollToId } from "../_components/small-forms";

export const metadata = { title: "Attendance" };

type KindFilter = MeetingKind | "all";
const isKind = (v: string | undefined): v is MeetingKind => !!v && (MEETING_KINDS as readonly string[]).includes(v);

export default async function AttendanceGridPage({ searchParams }: { searchParams: Promise<{ kind?: string; class?: string; member?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const kind: KindFilter = sp.kind === "all" ? "all" : isKind(sp.kind) ? sp.kind : "house";
  const classes = listPledgeClasses();
  const classId = sp.class && classes.some((c) => String(c.id) === sp.class) ? Number(sp.class) : undefined;
  const highlight = sp.member && /^\d+$/.test(sp.member) ? Number(sp.member) : null;

  const matrix = getAttendanceMatrix({ kind, classId });
  const rows = matrix.groups.flatMap((g) => g.rows);
  const worst = mostAbsences(matrix, 10);
  const totalAbsences = rows.reduce((n, r) => n + r.summary.absent, 0);
  const avgRate = matrix.meetings.length ? Math.round(matrix.meetings.reduce((n, m) => n + attendanceRate(m.totals), 0) / matrix.meetings.length) : null;
  const extraCols = 5;

  const href = (k: KindFilter, c: number | undefined) => {
    const q = new URLSearchParams();
    if (k !== "house") q.set("kind", k);
    if (c != null) q.set("class", String(c));
    const s = q.toString();
    return `/meetings/attendance${s ? `?${s}` : ""}`;
  };
  const pill = (active: boolean) =>
    cn("rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap", active ? "border-primary bg-primary-soft text-primary-strong" : "border-border text-muted hover:bg-surface-2");

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/meetings" className="hover:underline">
            Meetings
          </Link>
        }
        title="Attendance"
        description="Every meeting with attendance taken, by pledge class. P present, A absent, E excused, L late."
      />

      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Filter by kind">
        {(["house", "all", ...MEETING_KINDS.filter((k) => k !== "house")] as KindFilter[]).map((k) => (
          <Link key={k} href={href(k, classId)} aria-current={k === kind ? "true" : undefined} className={pill(k === kind)}>
            {k === "all" ? "All kinds" : MEETING_KIND_LABELS[k]}
          </Link>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Filter by pledge class">
        <Link href={href(kind, undefined)} aria-current={classId == null ? "true" : undefined} className={pill(classId == null)}>
          All classes
        </Link>
        {classes.map((c) => (
          <Link key={c.id} href={href(kind, c.id)} aria-current={classId === c.id ? "true" : undefined} className={pill(classId === c.id)}>
            {c.name}
          </Link>
        ))}
      </div>

      {matrix.meetings.length === 0 ? (
        <EmptyState title="No attendance recorded yet" description="Once an officer takes attendance at a meeting, the grid fills in here." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Meetings" value={matrix.meetings.length} hint={`${formatDate(matrix.meetings[0].date)} to ${formatDate(matrix.meetings[matrix.meetings.length - 1].date)}`} />
            <Stat label="Avg attendance" value={avgRate == null ? "·" : `${avgRate}%`} tone={avgRate != null && avgRate < 80 ? "warning" : "success"} />
            <Stat label="Absences" value={totalAbsences} tone={totalAbsences > 0 ? "danger" : undefined} />
          </div>

          <Card className="mb-4">
            <Table className="text-xs sm:text-sm">
              <THead>
                <tr>
                  <Th className="sticky left-0 z-20 min-w-36 bg-surface-2 sm:min-w-44">Brother</Th>
                  {matrix.meetings.map((m) => (
                    <Th key={m.id} className="px-1 text-center" scope="col">
                      <Link href={`/meetings/${m.id}`} className="hover:underline" title={`${m.title}, ${formatDate(m.date, { year: true })}`}>
                        {formatShortDate(m.date)}
                      </Link>
                    </Th>
                  ))}
                  <Th className="border-l border-border px-1.5 text-center text-success" title="Present">
                    P
                  </Th>
                  <Th className="px-1.5 text-center text-danger" title="Absent">
                    A
                  </Th>
                  <Th className="px-1.5 text-center text-warning" title="Excused">
                    E
                  </Th>
                  <Th className="px-1.5 text-center text-info" title="Late">
                    L
                  </Th>
                  <Th className="px-1.5 text-center" title="Attendance rate (late counts as present, excused ignored)">
                    Rate
                  </Th>
                </tr>
              </THead>
              {matrix.groups.map((g) => (
                <TBody key={g.label}>
                  <tr className="bg-surface-2/70">
                    <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      {g.label} <span className="font-normal normal-case">({g.rows.length})</span>
                    </td>
                    <td colSpan={matrix.meetings.length + extraCols} className="bg-surface-2/70" />
                  </tr>
                  {g.rows.map((r) => {
                    const hl = highlight === r.member.id;
                    return (
                      <Tr key={r.member.id} id={`member-${r.member.id}`} highlighted={hl} data-member-id={r.member.id}>
                        <td className={cn("sticky left-0 z-10 px-3 py-1.5 whitespace-nowrap", hl ? "bg-primary-soft" : "bg-surface")}>
                          <MemberLink member={r.member} />
                          {r.member.status !== "active" ? <span className="ml-1.5 text-[10px] uppercase text-muted">{r.member.status.replace("_", " ")}</span> : null}
                        </td>
                        {r.cells.map((c, i) => (
                          <td key={matrix.meetings[i].id} className="p-0.5 text-center" data-date={matrix.meetings[i].date} data-status={c ?? ""}>
                            {c ? (
                              <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded font-semibold", CELL_CLASSES[c])} title={`${displayName(r.member)}: ${c}`}>
                                {ATTENDANCE_LETTERS[c]}
                              </span>
                            ) : (
                              <span className="text-muted/60" title="No record">
                                ·
                              </span>
                            )}
                          </td>
                        ))}
                        <Td className="border-l border-border px-1.5 text-center tabular-nums text-success">{r.summary.present}</Td>
                        <Td className={cn("px-1.5 text-center tabular-nums", r.summary.absent > 0 ? "font-semibold text-danger" : "text-muted")}>{r.summary.absent}</Td>
                        <Td className="px-1.5 text-center tabular-nums text-warning">{r.summary.excused}</Td>
                        <Td className="px-1.5 text-center tabular-nums text-info">{r.summary.late}</Td>
                        <Td className={cn("px-1.5 text-center tabular-nums", r.summary.total === 0 ? "text-muted" : r.rate < 80 ? "font-semibold text-danger" : "")}>
                          {r.summary.total === 0 ? "·" : `${r.rate}%`}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              ))}
              <tfoot className="border-t-2 border-border bg-surface-2 text-xs">
                {(["present", "absent", "excused", "late"] as const).map((s) => (
                  <tr key={s}>
                    <td className={cn("sticky left-0 z-10 bg-surface-2 px-3 py-1 font-medium capitalize", s === "present" ? "text-success" : s === "absent" ? "text-danger" : s === "excused" ? "text-warning" : "text-info")}>
                      {s}
                    </td>
                    {matrix.meetings.map((m) => (
                      <td key={m.id} className="px-1 py-1 text-center tabular-nums">
                        {m.totals[s]}
                      </td>
                    ))}
                    <td colSpan={extraCols} className="border-l border-border" />
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1 font-medium">Rate</td>
                  {matrix.meetings.map((m) => (
                    <td key={m.id} className="px-1 py-1 text-center tabular-nums">
                      {attendanceRate(m.totals)}%
                    </td>
                  ))}
                  <td colSpan={extraCols} className="border-l border-border" />
                </tr>
              </tfoot>
            </Table>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Most absences</CardTitle>
                <CardDescription>Unexcused absences across the meetings shown.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {worst.length === 0 ? (
                <p className="text-sm text-muted">No unexcused absences. Nice.</p>
              ) : (
                <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {worst.map((r, i) => (
                    <li key={r.member.id} className="flex items-center justify-between gap-2 border-b border-border py-1.5 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 text-right tabular-nums text-muted">{i + 1}.</span>
                        <Link href={href(kind, classId) + (href(kind, classId).includes("?") ? "&" : "?") + `member=${r.member.id}`} className="truncate font-medium hover:underline">
                          {displayName(r.member)}
                        </Link>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-semibold text-danger">{r.summary.absent}</span>
                        <span className="text-muted"> absent · {r.rate}%</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {highlight != null ? <ScrollToId id={`member-${highlight}`} /> : null}
    </>
  );
}

function Tr({ highlighted, className, ...props }: React.ComponentProps<"tr"> & { highlighted?: boolean }) {
  return <tr className={cn("hover:bg-surface-2/60", highlighted && "bg-primary-soft outline-2 outline-primary", className)} {...props} />;
}
