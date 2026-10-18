import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { autoFillWeek, clearWeek, deleteWeek, setWeekPublished, updateWeekNotes } from "@/lib/actions/labor";
import type { WeekGrid } from "@/lib/queries/labor";
import { ActionForm } from "./action-form";

/** Manager toolbar shown in manage mode: fill, clear, publish, notes, delete. */
export function WeekManageBar({ grid }: { grid: WeekGrid }) {
  const { week, untouched, counts } = grid;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Manage this week</CardTitle>
          <p className="text-sm text-muted">
            {counts.filled} of {counts.slots} slots filled. Pick brothers in each row and press Save, or fill the gaps automatically.
          </p>
        </div>
        <ButtonLink href={`/labor/week/${week.weekStart}`} variant="outline" size="sm">
          Done managing
        </ButtonLink>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ActionForm action={autoFillWeek} hidden={{ weekId: week.id }} showSuccess>
            <SubmitButton size="sm" pendingText="Filling…">
              Auto-fill empty slots
            </SubmitButton>
          </ActionForm>
          <ActionForm action={clearWeek} hidden={{ weekId: week.id }} showSuccess>
            <ConfirmButton variant="outline" size="sm" confirmText="Remove every open assignment from this week? Jobs already done, missed or excused are kept.">
              Clear all
            </ConfirmButton>
          </ActionForm>
          <ActionForm action={setWeekPublished} hidden={{ weekId: week.id, published: week.isPublished ? "0" : "1" }} showSuccess>
            <SubmitButton size="sm" variant={week.isPublished ? "outline" : "primary"} pendingText="Saving…">
              {week.isPublished ? "Unpublish" : "Publish"}
            </SubmitButton>
          </ActionForm>
          <ButtonLink href={`/labor/verify?week=${week.weekStart}`} variant="ghost" size="sm">
            Verify this week
          </ButtonLink>
          {untouched ? (
            <ActionForm action={deleteWeek} hidden={{ weekId: week.id }} className="ml-auto">
              <ConfirmButton variant="danger" size="sm" confirmText="Delete this week and all its assignments?">
                Delete week
              </ConfirmButton>
            </ActionForm>
          ) : (
            <span className="ml-auto text-xs text-muted">Delete is available only while nothing is done or resolved.</span>
          )}
        </div>
        <ActionForm action={updateWeekNotes} hidden={{ weekId: week.id }} stacked showSuccess className="max-w-xl">
          <label htmlFor="week-notes" className="block text-sm font-medium">
            Week notes
          </label>
          <Textarea id="week-notes" name="notes" rows={2} defaultValue={week.notes ?? ""} placeholder="Anything brothers should know this week (inspection Sunday 6pm, supplies in the closet...)" />
          <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
            Save notes
          </SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
