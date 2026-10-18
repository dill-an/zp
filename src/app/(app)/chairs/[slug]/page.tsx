import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { can, canManageChair } from "@/lib/permissions";
import { getChairDetail } from "@/lib/queries/chairs";
import { groupByPledgeClass, listMembers } from "@/lib/queries/common";
import { CHAIR_CATEGORY_LABELS, parseResponsibilities, termLabel } from "@/lib/queries/members-logic";
import { endChairTermForm } from "@/lib/actions/chairs";
import { dueDescription, formatDate, todayISO } from "@/lib/dates";
import { MemberLink } from "@/components/member-link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormMessage } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { AssignHolderDialog } from "./assign-holder-dialog";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const detail = getChairDetail((await params).slug);
  return { title: detail ? detail.chair.name : "Chair" };
}

export default async function ChairPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const user = await requireUser();
  const { slug } = await params;
  const detail = getChairDetail(slug);
  if (!detail) notFound();
  const sp = await searchParams;
  const { chair, holders, history, openTasks, open, overdue } = detail;
  const canManage = can(user, "chairs.manage");
  const canTasks = canManageChair(user, chair.id);
  const holdsIt = user.chairIds.includes(chair.id);
  const responsibilities = parseResponsibilities(chair.responsibilities);
  const flash = typeof sp.error === "string" ? { ok: false as const, error: sp.error } : typeof sp.ok === "string" ? { ok: true as const, message: sp.ok } : null;
  const groups = canManage ? groupByPledgeClass(listMembers({ activeOnly: true })) : [];
  const categoryLabel = (CHAIR_CATEGORY_LABELS as Record<string, string>)[chair.category] ?? chair.category;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/chairs" className="hover:underline">
              Chairs
            </Link>
            <span aria-hidden>/</span>
            <span>{categoryLabel}</span>
          </span>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {chair.name}
            {chair.isExec ? <Badge tone="primary">Exec</Badge> : null}
            {!chair.isActive ? <Badge>Inactive</Badge> : null}
            {holdsIt ? <Badge tone="success">You hold this chair</Badge> : null}
          </span>
        }
        description={chair.description ?? undefined}
        actions={
          <>
            <ButtonLink href={`/tasks?chair=${chair.id}`} variant="outline" size="sm">
              View tasks
            </ButtonLink>
            {canTasks ? (
              <ButtonLink href={`/tasks/new?chair=${chair.id}`} variant="secondary" size="sm" data-testid="new-task-link">
                New task
              </ButtonLink>
            ) : null}
            {canManage ? (
              <>
                {chair.isActive ? <AssignHolderDialog chairId={chair.id} chairName={chair.name} groups={groups} today={todayISO()} hasCurrent={holders.length > 0} /> : null}
                <ButtonLink href={`/chairs/${chair.slug}/edit`} variant="outline" size="sm">
                  Edit chair
                </ButtonLink>
              </>
            ) : null}
          </>
        }
      />

      {flash ? <FormMessage result={flash} className="mb-4" /> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Holders" value={holders.length} hint={holders.length === 0 ? "Unassigned" : undefined} tone={holders.length === 0 && chair.isActive ? "warning" : undefined} />
        <Stat label="Open tasks" value={open} />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : undefined} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current holders</CardTitle>
          </CardHeader>
          <CardContent>
            {holders.length === 0 ? (
              <p className="text-sm text-muted">Unassigned.{canManage ? (chair.isActive ? " Use Assign holder to set one." : " Inactive chairs cannot take holders.") : ""}</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="current-holders">
                {holders.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <MemberLink member={h.member} withAvatar />
                        {h.title ? <Badge>{h.title}</Badge> : null}
                      </div>
                      <p className="pl-9 text-xs text-muted">Since {formatDate(h.termStart, { year: true })}</p>
                    </div>
                    {canManage ? (
                      <form action={endChairTermForm}>
                        <input type="hidden" name="holderId" value={h.id} />
                        <input type="hidden" name="slug" value={chair.slug} />
                        <ConfirmButton variant="outline" confirmText={`End ${h.member.preferredName}'s term as ${chair.name} today?`}>
                          End term
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Responsibilities</CardTitle>
          </CardHeader>
          <CardContent>
            {responsibilities.length === 0 ? (
              <p className="text-sm text-muted">No standing responsibilities written down yet.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {responsibilities.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Open tasks</CardTitle>
            <Link href={`/tasks?chair=${chair.id}`} className="text-sm text-muted hover:underline">
              All tasks
            </Link>
          </CardHeader>
          {openTasks.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">Nothing open.{canTasks ? " Add the first task with New task." : ""}</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Task</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {openTasks.map((t) => {
                  const due = t.dueAt ? dueDescription(t.dueAt) : "";
                  const isOverdue = due.includes("overdue");
                  return (
                    <Tr key={t.id}>
                      <Td>
                        <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                        {t.priority === "high" || t.priority === "urgent" ? <StatusPill status={t.priority} className="ml-2" /> : null}
                      </Td>
                      <Td className={isOverdue ? "whitespace-nowrap text-danger" : "whitespace-nowrap"}>
                        {t.dueAt ? (
                          <>
                            {formatDate(t.dueAt)}
                            <span className="ml-1 text-xs text-muted">({due})</span>
                          </>
                        ) : (
                          <span className="text-muted">No due date</span>
                        )}
                      </Td>
                      <Td>
                        <StatusPill status={t.status} />
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Holder history</CardTitle>
          </CardHeader>
          {history.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">No past holders recorded.</p>
            </CardContent>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Brother</Th>
                  <Th>Term</Th>
                </tr>
              </THead>
              <TBody>
                {history.map((h) => (
                  <Tr key={h.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <MemberLink member={h.member} />
                        {h.title ? <Badge>{h.title}</Badge> : null}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-muted">{termLabel(h.termStart, h.termEnd, (d) => formatDate(d, { year: true }))}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
