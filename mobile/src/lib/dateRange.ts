export interface DateRange {
  label: string;
  start: Date;
  end: Date;
}

const LOCALE = "en-CA";

// Centralizes the "en-CA" locale so a future locale/format change is one
// edit instead of hunting down every toLocaleTimeString/toLocaleDateString
// call site across the app. opts passes straight through to Intl, so every
// existing call site's exact formatting is preserved by passing its own
// options here unchanged.
export function formatTime(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleTimeString(LOCALE, opts);
}

export function formatDate(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(value).toLocaleDateString(LOCALE, opts);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function presetRanges(): DateRange[] {
  const today = startOfDay(new Date());
  const endExclusive = new Date(today);
  endExclusive.setDate(endExclusive.getDate() + 1);

  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return [
    { label: "Last 7 days", start: sevenDaysAgo, end: endExclusive },
    { label: "Last 14 days (bi-weekly)", start: fourteenDaysAgo, end: endExclusive },
    { label: "This month", start: firstOfMonth, end: endExclusive },
  ];
}

export function formatRange(r: { start: Date; end: Date }): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${formatDate(r.start, opts)} – ${formatDate(r.end, opts)}`;
}
