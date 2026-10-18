"use client";

import { useActionState, useMemo, useState } from "react";
import { saveAttendance } from "@/lib/actions/meetings";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/db/schema";
import { Badge, Button, ButtonLink, FormMessage, Input, SubmitButton } from "@/components/ui";
import { cn } from "@/lib/utils";

export type SheetRow = { memberId: number; name: string; status: AttendanceStatus; note: string; hasRecord: boolean; excused: boolean };
export type SheetGroup = { label: string; rows: SheetRow[] };

const LABELS: Record<AttendanceStatus, { short: string; long: string; on: string }> = {
  present: { short: "P", long: "Present", on: "bg-success text-white border-success" },
  absent: { short: "A", long: "Absent", on: "bg-danger text-white border-danger" },
  excused: { short: "E", long: "Excused", on: "bg-warning text-white border-warning" },
  late: { short: "L", long: "Late", on: "bg-info text-white border-info" },
};

type Entry = { status: AttendanceStatus; note: string };

export function AttendanceForm({ meetingId, groups }: { meetingId: number; groups: SheetGroup[] }) {
  const bound = saveAttendance.bind(null, meetingId);
  const [result, action] = useActionState(bound, null);
  const [entries, setEntries] = useState<Record<number, Entry>>(() => {
    const out: Record<number, Entry> = {};
    for (const g of groups) for (const r of g.rows) out[r.memberId] = { status: r.status, note: r.note };
    return out;
  });
  const [openNotes, setOpenNotes] = useState<Set<number>>(() => new Set(groups.flatMap((g) => g.rows.filter((r) => r.note).map((r) => r.memberId))));

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, excused: 0, late: 0 };
    for (const e of Object.values(entries)) c[e.status] += 1;
    return c;
  }, [entries]);

  const setStatus = (memberId: number, status: AttendanceStatus) => setEntries((prev) => ({ ...prev, [memberId]: { ...prev[memberId], status } }));
  const setNote = (memberId: number, note: string) => setEntries((prev) => ({ ...prev, [memberId]: { ...prev[memberId], note } }));
  const markAll = (status: AttendanceStatus, keepExcused: boolean) =>
    setEntries((prev) => {
      const next: Record<number, Entry> = {};
      for (const [id, e] of Object.entries(prev)) {
        const keep = keepExcused && e.status === "excused";
        next[Number(id)] = keep ? e : { ...e, status };
      }
      return next;
    });
  const toggleNote = (memberId: number) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });

  const total = Object.keys(entries).length;

  return (
    <form action={action} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => markAll("present", true)}>
          Mark everyone present
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => markAll("absent", true)}>
          Mark everyone absent
        </Button>
        <p className="ml-auto text-xs text-muted">Approved excuses stay excused.</p>
      </div>

      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {g.label}
            <span className="text-xs font-normal normal-case">{g.rows.length}</span>
          </h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {g.rows.map((r) => {
              const entry = entries[r.memberId];
              const noteOpen = openNotes.has(r.memberId);
              return (
                <li key={r.memberId} className="px-3 py-2.5" data-member-id={r.memberId}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="font-medium">{r.name}</span>
                      {r.excused && !r.hasRecord ? <Badge tone="warning">Excuse approved</Badge> : null}
                      <button type="button" onClick={() => toggleNote(r.memberId)} className="text-xs text-muted underline-offset-2 hover:underline" aria-expanded={noteOpen}>
                        {noteOpen ? "Hide note" : entry.note ? "Edit note" : "Add note"}
                      </button>
                    </div>
                    <fieldset className="grid grid-cols-4 gap-1 sm:w-64" aria-label={`${r.name} attendance`}>
                      <legend className="sr-only">{r.name}</legend>
                      {ATTENDANCE_STATUSES.map((s) => {
                        const selected = entry.status === s;
                        return (
                          <label
                            key={s}
                            title={LABELS[s].long}
                            className={cn(
                              "flex h-11 cursor-pointer select-none items-center justify-center rounded-md border text-sm font-semibold transition-colors sm:h-9",
                              selected ? LABELS[s].on : "border-border bg-surface text-muted hover:bg-surface-2",
                            )}
                          >
                            <input type="radio" name={`status_${r.memberId}`} value={s} checked={selected} onChange={() => setStatus(r.memberId, s)} className="sr-only" />
                            <span className="sm:hidden">{LABELS[s].short}</span>
                            <span className="hidden sm:inline">{LABELS[s].long}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  </div>
                  {noteOpen ? (
                    <Input
                      name={`note_${r.memberId}`}
                      value={entry.note}
                      onChange={(e) => setNote(r.memberId, e.target.value)}
                      placeholder="Short note (left early, excused by…)"
                      maxLength={200}
                      className="mt-2 h-9"
                      aria-label={`Note for ${r.name}`}
                    />
                  ) : entry.note ? (
                    <input type="hidden" name={`note_${r.memberId}`} value={entry.note} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="text-success">{counts.present} present</span>
            <span className="text-muted"> · </span>
            <span className="text-danger">{counts.absent} absent</span>
            <span className="text-muted"> · </span>
            <span className="text-warning">{counts.excused} excused</span>
            {counts.late ? (
              <>
                <span className="text-muted"> · </span>
                <span className="text-info">{counts.late} late</span>
              </>
            ) : null}
            <span className="text-muted"> of {total}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <ButtonLink variant="ghost" size="md" href={`/meetings/${meetingId}`}>
              Cancel
            </ButtonLink>
            <SubmitButton pendingText="Saving…">Save attendance</SubmitButton>
          </div>
        </div>
        <FormMessage result={result} className="mt-2" />
      </div>
    </form>
  );
}
