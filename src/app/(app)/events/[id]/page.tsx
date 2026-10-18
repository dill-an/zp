import Link from "next/link";
import { notFound } from "next/navigation";
import { EVENT_DUTY_KINDS } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getEvent, type EventRsvpRow } from "@/lib/queries/community";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { bodyParagraphs, formatEventRange } from "@/lib/queries/community-logic";
import { deleteEvent, removeEventDuty, setDutyStatus } from "@/lib/actions/community";
import { formatDateTime, isoToLocalInput } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Button, ButtonLink, Card, CardContent, CardHeader, CardTitle, ConfirmButton, Dialog, EmptyState, PageHeader, StatusPill, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { MemberLink } from "@/components/member-link";
import { DutyBadge, KindBadge, MandatoryBadge } from "../badges";
import { RsvpForm } from "./rsvp-form";
import { DutyForm } from "./duty-form";

export const metadata = { title: "Event" };

function RsvpList({ title, rows }: { title: string; rows: EventRsvpRow[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nobody yet.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-sm">
          {rows.map((r) => (
            <li key={r.member.id}>
              <MemberLink member={r.member} />
              {r.guests > 0 ? <span className="text-muted"> +{r.guests}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id: idParam } = await params;
  const id = Number(idParam);
  const event = Number.isInteger(id) ? getEvent(id, user.id) : null;
  if (!event) notFound();
  const manage = can(user, "events.manage");
  const groups = manage ? groupByPledgeClass(listMembers({ activeOnly: true })) : [];
  const going = event.rsvps.filter((r) => r.status === "going");
  const maybe = event.rsvps.filter((r) => r.status === "maybe");
  const notGoing = event.rsvps.filter((r) => r.status === "not_going");
  const paragraphs = bodyParagraphs(event.description ?? "");

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/events" className="hover:underline">
            Events
          </Link>
        }
        title={event.title}
        description={
          <>
            {formatEventRange(event.startsAt, event.endsAt)}
            {event.location ? ` at ${event.location}` : ""}
          </>
        }
        actions={
          manage ? (
            <>
              <ButtonLink href={`/events/${event.id}/edit`} variant="outline">
                Edit
              </ButtonLink>
              <form
                action={async () => {
                  "use server";
                  await deleteEvent(event.id);
                }}
              >
                <ConfirmButton confirmText={`Delete "${event.title}"? RSVPs and duties go with it.`} size="md">
                  Delete
                </ConfirmButton>
              </form>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <KindBadge kind={event.kind} />
        {event.isMandatory ? <MandatoryBadge /> : null}
        {event.isPast ? <StatusPill status="done" label="Ended" /> : null}
        {event.myRsvp ? <StatusPill status={event.myRsvp} label={`You: ${event.myRsvp.replace("_", " ")}`} /> : null}
      </div>

      {event.isMandatory ? (
        <p role="note" className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          Attendance is mandatory. Ask the chair ahead of time if you cannot make it.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {paragraphs.length === 0 ? (
                <p className="text-muted">No description.</p>
              ) : (
                paragraphs.map((lines, i) => (
                  <p key={i}>
                    {lines.map((line, j) => (
                      <span key={j}>
                        {j > 0 ? <br /> : null}
                        {line}
                      </span>
                    ))}
                  </p>
                ))
              )}
              <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">When</dt>
                  <dd>
                    {formatDateTime(event.startsAt, { year: true })}
                    {event.endsAt ? <span className="text-muted"> until {formatDateTime(event.endsAt, { year: true })}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Where</dt>
                  <dd>{event.location || <span className="text-muted">TBD</span>}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Run by</dt>
                  <dd>
                    {event.chair ? (
                      <Link href={`/chairs/${event.chair.slug}`} className="font-medium hover:underline">
                        {event.chair.name}
                      </Link>
                    ) : (
                      <span className="text-muted">No chair</span>
                    )}
                    {event.createdBy ? (
                      <span className="text-muted">
                        {" "}
                        (posted by <MemberLink member={event.createdBy} className="font-normal" />)
                      </span>
                    ) : null}
                  </dd>
                </div>
                {event.budgetCents != null ? (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">Budget</dt>
                    <dd>{formatCents(event.budgetCents)}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Duties</CardTitle>
              {manage ? (
                <Dialog trigger="Add duty" triggerSize="sm" triggerVariant="outline" title="Add a duty">
                  <DutyForm eventId={event.id} groups={groups} dutyKinds={EVENT_DUTY_KINDS} defaultStart={isoToLocalInput(event.startsAt)} defaultEnd={isoToLocalInput(event.endsAt)} />
                </Dialog>
              ) : null}
            </CardHeader>
            {event.duties.length === 0 ? (
              <CardContent>
                <EmptyState title="No duties yet" description={manage ? "Add sober monitors, setup and cleanup shifts here." : "Nobody has been given a job for this event."} className="py-6" />
              </CardContent>
            ) : (
              <Table>
                <THead>
                  <Tr>
                    <Th>Duty</Th>
                    <Th>Brother</Th>
                    <Th>When</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Actions</Th>
                  </Tr>
                </THead>
                <TBody>
                  {event.duties.map((d) => {
                    const own = d.memberId === user.id;
                    return (
                      <Tr key={d.id} data-duty-id={d.id}>
                        <Td>
                          <div className="flex flex-col gap-1">
                            <DutyBadge duty={d.duty} className="w-fit" />
                            {d.label ? <span className="text-sm">{d.label}</span> : null}
                          </div>
                        </Td>
                        <Td>{d.member ? <MemberLink member={d.member} /> : <span className="text-muted">Unassigned</span>}</Td>
                        <Td className="text-sm text-muted whitespace-nowrap">{d.startsAt ? formatEventRange(d.startsAt, d.endsAt) : "Whole event"}</Td>
                        <Td>
                          <StatusPill status={d.status} />
                        </Td>
                        <Td className="text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {(manage ? d.status !== "done" : own && d.status === "assigned") ? (
                              <form
                                action={async () => {
                                  "use server";
                                  await setDutyStatus(d.id, "done");
                                }}
                              >
                                <Button type="submit" size="sm" variant="outline">
                                  Mark done
                                </Button>
                              </form>
                            ) : null}
                            {manage && d.status !== "missed" ? (
                              <form
                                action={async () => {
                                  "use server";
                                  await setDutyStatus(d.id, "missed");
                                }}
                              >
                                <Button type="submit" size="sm" variant="ghost">
                                  Missed
                                </Button>
                              </form>
                            ) : null}
                            {manage && d.status !== "assigned" ? (
                              <form
                                action={async () => {
                                  "use server";
                                  await setDutyStatus(d.id, "assigned");
                                }}
                              >
                                <Button type="submit" size="sm" variant="ghost">
                                  Reopen
                                </Button>
                              </form>
                            ) : null}
                            {manage ? (
                              <form
                                action={async () => {
                                  "use server";
                                  await removeEventDuty(d.id);
                                }}
                              >
                                <ConfirmButton confirmText="Remove this duty?" variant="ghost" size="sm" className="text-danger">
                                  Remove
                                </ConfirmButton>
                              </form>
                            ) : null}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>RSVPs</CardTitle>
              {event.rsvpEnabled ? (
                <p className="text-sm text-muted" data-testid="rsvp-summary">
                  {event.counts.going} going{event.counts.guests ? ` (+${event.counts.guests} guests)` : ""}, {event.counts.maybe} maybe
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {!event.rsvpEnabled ? (
                <p className="text-sm text-muted">RSVPs are not being collected for this event.</p>
              ) : event.isPast ? (
                <p className="text-sm text-muted">This event has ended.</p>
              ) : (
                <RsvpForm eventId={event.id} current={event.myRsvp} guests={event.rsvps.find((r) => r.member.id === user.id)?.guests ?? 0} />
              )}
              {event.rsvpEnabled ? (
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  <RsvpList title="Going" rows={going} />
                  <RsvpList title="Maybe" rows={maybe} />
                  <RsvpList title="Not going" rows={notGoing} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
