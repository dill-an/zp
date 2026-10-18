"use client";

import { useActionState, useState } from "react";
import { createMember, updateMember } from "@/lib/actions/members";
import { fieldValue, type ActionResult } from "@/lib/action-result";
import { LABOR_GROUPS, MEMBER_STATUSES, type Member, type PledgeClass } from "@/db/schema";
import { humanize, slugify } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox, Field, FormMessage, FormRow, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";

export type MemberFormProps = {
  /** Null when creating. */
  member: Member | null;
  pledgeClasses: PledgeClass[];
  /** Viewer holds members.manage. */
  canManage: boolean;
  /** Viewer is an admin (may grant or remove admin). */
  isAdmin: boolean;
  /** Viewer is editing their own profile. */
  isSelf: boolean;
  cancelHref: string;
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  new_member: "New member",
  abroad: "Abroad",
  inactive: "Inactive",
  alumni: "Alumni",
};

export function MemberForm({ member, pledgeClasses, canManage, isAdmin, isSelf, cancelHref }: MemberFormProps) {
  const isNew = member === null;
  const [result, action] = useActionState(isNew ? createMember : updateMember, null as ActionResult | null);
  const errors = (key: string) => (result && !result.ok ? result.fieldErrors?.[key] : undefined);
  const v = (key: string, fallback?: string | number | null) => fieldValue(result, key, fallback);
  const bool = (key: string, fallback: boolean) => {
    if (result && !result.ok && result.values) return key in result.values;
    return fallback;
  };

  // Auto-suggest the username from first.last until the admin edits it by hand.
  const [usernameTouched, setUsernameTouched] = useState(!isNew);
  const [first, setFirst] = useState(v("firstName", member?.firstName));
  const [last, setLast] = useState(v("lastName", member?.lastName));
  const [username, setUsername] = useState(v("username", member?.username));
  const suggested = `${slugify(first)}${slugify(last) ? "." + slugify(last) : ""}`;
  const usernameValue = usernameTouched ? username : suggested;

  const targetIsAdmin = member?.role === "admin";
  const roleLocked = canManage && !isAdmin && targetIsAdmin;
  const roleOptions = isAdmin ? ["member", "officer", "admin"] : ["member", "officer"];

  return (
    <form action={action} className="space-y-5">
      {member ? <input type="hidden" name="memberId" value={member.id} /> : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Name and account</CardTitle>
              <CardDescription>{isNew ? "They log in with the username and the temporary password you set here." : "Username changes take effect at next login."}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormRow>
              <Field label="First name" htmlFor="firstName" required error={errors("firstName")}>
                <Input id="firstName" name="firstName" required autoComplete="off" value={first} onChange={(e) => setFirst(e.target.value)} />
              </Field>
              <Field label="Last name" htmlFor="lastName" required error={errors("lastName")}>
                <Input id="lastName" name="lastName" required autoComplete="off" value={last} onChange={(e) => setLast(e.target.value)} />
              </Field>
            </FormRow>
            <FormRow>
              <Field label="Preferred name" htmlFor="preferredName" hint="Short name used on the labor grid, e.g. Gio or David Coll." error={errors("preferredName")}>
                <Input id="preferredName" name="preferredName" autoComplete="off" defaultValue={v("preferredName", member?.preferredName)} />
              </Field>
              <Field label="Username" htmlFor="username" required={!isNew} hint="Lowercase letters, numbers, dots and dashes. Leave blank to use first.last." error={errors("username")}>
                <Input
                  id="username"
                  name="username"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required={!isNew}
                  value={usernameValue}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(e.target.value);
                  }}
                />
              </Field>
            </FormRow>
            {isNew ? (
              <Field label="Temporary password" htmlFor="temporaryPassword" required hint="At least 8 characters. They must change it at first login." error={errors("temporaryPassword")}>
                <Input id="temporaryPassword" name="temporaryPassword" type="text" autoComplete="off" required minLength={8} />
              </Field>
            ) : null}
            <FormRow className="sm:grid-cols-4">
              <Field label="Pledge class" htmlFor="pledgeClassId" error={errors("pledgeClassId")}>
                <Select id="pledgeClassId" name="pledgeClassId" defaultValue={v("pledgeClassId", member?.pledgeClassId ?? "")}>
                  <option value="">None</option>
                  {pledgeClasses.map((pc) => (
                    <option key={pc.id} value={pc.id}>
                      {pc.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="status" error={errors("status")}>
                <Select id="status" name="status" defaultValue={v("status", member?.status ?? "active")}>
                  {MEMBER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s] ?? humanize(s)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Labor group" htmlFor="laborGroup" error={errors("laborGroup")}>
                <Select id="laborGroup" name="laborGroup" defaultValue={v("laborGroup", member?.laborGroup ?? "none")}>
                  {LABOR_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {humanize(g)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Role" htmlFor="role" hint={roleLocked ? "Only an admin can change an admin's role." : isAdmin ? undefined : "Only admins can grant admin."} error={errors("role")}>
                <Select id="role" name="role" defaultValue={v("role", member?.role ?? "member")} disabled={roleLocked || (isSelf && targetIsAdmin)}>
                  {(targetIsAdmin && !roleOptions.includes("admin") ? [...roleOptions, "admin"] : roleOptions).map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormRow>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Name</CardTitle>
              <CardDescription>Ask the secretary or webmaster to change your legal name, username, pledge class or status.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Field label="Preferred name" htmlFor="preferredName" hint="Short name used on the labor grid." error={errors("preferredName")}>
              <Input id="preferredName" name="preferredName" autoComplete="nickname" defaultValue={v("preferredName", member?.preferredName)} />
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormRow>
            <Field label="Email" htmlFor="email" error={errors("email")}>
              <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={v("email", member?.email)} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={errors("phone")}>
              <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={v("phone", member?.phone)} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Room" htmlFor="room" error={errors("room")}>
              <Input id="room" name="room" autoComplete="off" defaultValue={v("room", member?.room)} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox name="livesInHouse" defaultChecked={bool("livesInHouse", member?.livesInHouse ?? true)} />
                Lives in the house
              </label>
            </div>
          </FormRow>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academics and personal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <FormRow className="sm:grid-cols-3">
            <Field label="Major" htmlFor="major" error={errors("major")}>
              <Input id="major" name="major" autoComplete="off" defaultValue={v("major", member?.major)} />
            </Field>
            <Field label="Graduation year" htmlFor="gradYear" error={errors("gradYear")}>
              <Input id="gradYear" name="gradYear" type="number" inputMode="numeric" min={1950} max={2100} defaultValue={v("gradYear", member?.gradYear)} />
            </Field>
            <Field label="Birthday" htmlFor="birthday" error={errors("birthday")}>
              <Input id="birthday" name="birthday" type="date" defaultValue={v("birthday", member?.birthday)} />
            </Field>
          </FormRow>
          <Field label="Emergency contact" htmlFor="emergencyContact" hint="Name, relationship and phone. Visible only to you and the secretary." error={errors("emergencyContact")}>
            <Input id="emergencyContact" name="emergencyContact" autoComplete="off" defaultValue={v("emergencyContact", member?.emergencyContact)} />
          </Field>
          <Field label="Dietary notes" htmlFor="dietaryNotes" hint="Allergies and restrictions for the steward. Visible only to you and the secretary." error={errors("dietaryNotes")}>
            <Textarea id="dietaryNotes" name="dietaryNotes" className="min-h-16" defaultValue={v("dietaryNotes", member?.dietaryNotes)} />
          </Field>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Admin notes</CardTitle>
              <CardDescription>Only people who manage members can see these.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea id="notes" name="notes" defaultValue={v("notes", member?.notes)} aria-label="Admin notes" />
          </CardContent>
        </Card>
      ) : null}

      <FormMessage result={result} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pendingText={isNew ? "Adding…" : "Saving…"}>{isNew ? "Add member" : "Save changes"}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
