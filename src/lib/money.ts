/** Format integer cents as US dollars: 123456 -> "$1,234.56". Negative values get a leading minus. */
export function formatCents(cents: number | null | undefined, opts: { showPlus?: boolean } = {}): string {
  const value = cents ?? 0;
  const abs = Math.abs(value);
  const str = `$${(abs / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value < 0) return `-${str}`;
  if (opts.showPlus && value > 0) return `+${str}`;
  return str;
}

/** Parse a dollars input ("12", "12.5", "$1,234.56", "-3") into integer cents. Returns null if invalid. */
export function parseDollarsToCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  const cleaned = String(input).replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return negative ? -cents : cents;
}

/** Cents to a plain "12.50" string for form inputs. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
