"use client";

import { Dialog } from "@/components/ui/dialog";
import type { ButtonSize, ButtonVariant } from "@/components/ui/button";
import { PaymentForm, type MemberOption, type PaymentFormValues, type PeriodOption } from "./payment-form";
import { ChargeForm, type ChargeFormValues } from "./charge-form";
import { PeriodForm, type PeriodFormValues } from "./period-form";
import { PlanForm, type PlanScope } from "./plan-form";

type TriggerProps = { trigger?: string; triggerVariant?: ButtonVariant; triggerSize?: ButtonSize; triggerClassName?: string };

export function PaymentDialog({
  memberId,
  memberName,
  members,
  periods,
  defaultPeriodId,
  today,
  payment,
  trigger,
  triggerVariant = "primary",
  triggerSize = "md",
  triggerClassName,
}: TriggerProps & {
  memberId?: number;
  memberName?: string;
  members?: MemberOption[];
  periods: PeriodOption[];
  defaultPeriodId: number | null;
  today: string;
  payment?: PaymentFormValues;
}) {
  return (
    <Dialog
      trigger={trigger ?? (payment ? "Edit" : "Record payment")}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      title={payment ? "Edit payment" : memberName ? `Record payment from ${memberName}` : "Record payment"}
    >
      {(close) => <PaymentForm memberId={memberId} members={members} periods={periods} defaultPeriodId={defaultPeriodId} today={today} payment={payment} onDone={close} />}
    </Dialog>
  );
}

export function ChargeDialog({
  memberId,
  memberName,
  members,
  periods,
  defaultPeriodId,
  defaultDueDate,
  charge,
  trigger,
  triggerVariant = "outline",
  triggerSize = "md",
  triggerClassName,
}: TriggerProps & {
  memberId?: number;
  memberName?: string;
  members?: MemberOption[];
  periods: PeriodOption[];
  defaultPeriodId: number | null;
  defaultDueDate: string | null;
  charge?: ChargeFormValues;
}) {
  return (
    <Dialog
      trigger={trigger ?? (charge ? "Edit" : "Add charge")}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      title={charge ? "Edit charge" : memberName ? `Add charge for ${memberName}` : "Add charge or credit"}
    >
      {(close) => (
        <ChargeForm memberId={memberId} members={members} periods={periods} defaultPeriodId={defaultPeriodId} defaultDueDate={defaultDueDate} charge={charge} onDone={close} />
      )}
    </Dialog>
  );
}

export function PeriodDialog({ period, trigger, triggerVariant = "primary", triggerSize = "md", triggerClassName }: TriggerProps & { period?: PeriodFormValues }) {
  return (
    <Dialog
      trigger={trigger ?? (period ? "Edit" : "New period")}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      title={period ? `Edit ${period.name}` : "New dues period"}
    >
      {(close) => <PeriodForm period={period} onDone={close} />}
    </Dialog>
  );
}

export function PlanDialog({
  memberId,
  memberName,
  scopes,
  trigger,
  triggerVariant = "outline",
  triggerSize = "md",
  triggerClassName,
}: TriggerProps & { memberId: number; memberName?: string; scopes: PlanScope[] }) {
  return (
    <Dialog
      trigger={trigger ?? "Payment plan"}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
      title={memberName ? `Payment plan for ${memberName}` : "Payment plan"}
    >
      {(close) => <PlanForm memberId={memberId} scopes={scopes} onDone={close} />}
    </Dialog>
  );
}
