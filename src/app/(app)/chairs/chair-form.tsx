"use client";

import { useActionState, useState } from "react";
import { createChair, updateChair } from "@/lib/actions/chairs";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { CHAIR_CATEGORIES, type Chair } from "@/db/schema";
import { chairSlugFromName, CHAIR_CATEGORY_LABELS, parseResponsibilities } from "@/lib/queries/members-logic";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, FormRow, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ChairForm({ chair, cancelHref }: { chair: Chair | null; cancelHref: string }) {
  const isNew = chair === null;
  const [result, action] = useActionState(isNew ? createChair : updateChair, null as ActionResult | null);
  const errors = (key: string) => (result && !result.ok ? result.fieldErrors?.[key] : undefined);
  const v = (key: string, fallback?: string | number | null) => fieldValue(result, key, fallback);
  const bool = (key: string, fallback: boolean) => (result && !result.ok && result.values ? key in result.values : fallback);

  const [name, setName] = useState(v("name", chair?.name));
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState(v("slug", ""));
  const slugValue = slugTouched ? slug : chairSlugFromName(name);

  return (
    <form action={action} className="space-y-5">
      {chair ? <input type="hidden" name="id" value={chair.id} /> : null}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Position</CardTitle>
            <CardDescription>{isNew ? "The slug becomes the chair's URL and cannot change later." : `URL: /chairs/${chair.slug}`}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormRow>
            <Field label="Name" htmlFor="name" required error={errors("name")}>
              <Input id="name" name="name" required autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {isNew ? (
              <Field label="Slug" htmlFor="slug" hint="Lowercase letters, numbers and underscores." error={errors("slug")}>
                <Input
                  id="slug"
                  name="slug"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={slugValue}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                />
              </Field>
            ) : (
              <Field label="Slug" htmlFor="slug-readonly" hint="Fixed after creation.">
                <Input id="slug-readonly" value={chair.slug} readOnly disabled />
              </Field>
            )}
          </FormRow>
          <FormRow className="sm:grid-cols-3">
            <Field label="Category" htmlFor="category" error={errors("category")}>
              <Select id="category" name="category" defaultValue={v("category", chair?.category ?? "internal")}>
                {CHAIR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CHAIR_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Sort order" htmlFor="sortOrder" hint="Lower shows first." error={errors("sortOrder")}>
              <Input id="sortOrder" name="sortOrder" type="number" inputMode="numeric" defaultValue={v("sortOrder", chair?.sortOrder ?? 0)} />
            </Field>
            <div className="flex flex-col justify-end gap-2 pb-2 text-sm font-medium">
              <label className="flex items-center gap-2">
                <Checkbox name="isExec" defaultChecked={bool("isExec", chair?.isExec ?? false)} />
                Exec board seat
              </label>
              <label className="flex items-center gap-2">
                <Checkbox name="isActive" defaultChecked={bool("isActive", chair?.isActive ?? true)} />
                Active
              </label>
            </div>
          </FormRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the chair does</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Description" htmlFor="description" hint="One or two sentences shown on the chairs page." error={errors("description")}>
            <Textarea id="description" name="description" className="min-h-20" defaultValue={v("description", chair?.description)} />
          </Field>
          <Field label="Responsibilities" htmlFor="responsibilities" hint="One per line. Standing duties, not one-off tasks." error={errors("responsibilities")}>
            <Textarea
              id="responsibilities"
              name="responsibilities"
              className="min-h-32"
              defaultValue={result && !result.ok && result.values && "responsibilities" in result.values ? result.values.responsibilities : parseResponsibilities(chair?.responsibilities).join("\n")}
            />
          </Field>
        </CardContent>
      </Card>

      <FormMessage result={result} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText="Saving…">{isNew ? "Add chair" : "Save changes"}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
