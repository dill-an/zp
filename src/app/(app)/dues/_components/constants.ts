/** Client-safe copies of the dues enums (type-checked against the schema; no drizzle import in the browser bundle). */
import type { ChargeKind, PaymentMethod } from "@/db/schema";
import type { Tone } from "@/components/ui/badge";

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "venmo", label: "Venmo" },
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export const CHARGE_KIND_OPTIONS: { value: ChargeKind; label: string }[] = [
  { value: "dues", label: "Dues" },
  { value: "fine", label: "Fine" },
  { value: "late_fee", label: "Late fee" },
  { value: "social", label: "Social" },
  { value: "damage", label: "Damage" },
  { value: "credit", label: "Credit" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

export const KIND_TONES: Record<string, Tone> = {
  dues: "primary",
  fine: "danger",
  late_fee: "danger",
  social: "info",
  damage: "warning",
  credit: "success",
  adjustment: "neutral",
  other: "neutral",
};

export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "none", label: "Not billed" },
];

export function methodLabel(method: string): string {
  return PAYMENT_METHOD_OPTIONS.find((m) => m.value === method)?.label ?? method;
}

export function kindLabel(kind: string): string {
  return CHARGE_KIND_OPTIONS.find((k) => k.value === kind)?.label ?? kind;
}
