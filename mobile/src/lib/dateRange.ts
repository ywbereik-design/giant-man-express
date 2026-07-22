export interface DateRange {
  label: string;
  start: Date;
  end: Date;
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
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `${fmt(r.start)} – ${fmt(r.end)}`;
}
