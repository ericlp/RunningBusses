export type ServiceDays = Map<string, Set<string>>;

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll('-', '');
const date = (s: string) => {
  if (!/^\d{8}$/.test(s)) throw new Error(`Invalid service date ${s}`);
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime()) || ymd(d) !== s) throw new Error(`Invalid service date ${s}`);
  return d;
};

export function serviceDays(calendar: Record<string, string>[], exceptions: Record<string, string>[]): ServiceDays {
  const days: ServiceDays = new Map();
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (const row of calendar) {
    const start = date(row.start_date);
    const end = date(row.end_date);
    if (end < start) throw new Error(`Reversed service range for ${row.service_id}`);
    const active = new Set<string>();
    for (const d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (row[weekdays[d.getUTCDay()]] === '1') active.add(ymd(d));
    }
    days.set(row.service_id, active);
  }
  for (const row of exceptions) {
    date(row.date);
    const active = days.get(row.service_id) ?? new Set<string>();
    days.set(row.service_id, active);
    if (row.exception_type === '1') active.add(row.date);
    else if (row.exception_type === '2') active.delete(row.date);
    else throw new Error(`Invalid calendar exception ${row.exception_type}`);
  }
  return days;
}

export function referenceWednesday(days: ServiceDays, today = new Date()): string {
  const first = ymd(today);
  const candidates = [...new Set([...days.values()].flatMap((d) => [...d]))].sort();
  const found = candidates.find((d) => d >= first && date(d).getUTCDay() === 3);
  if (!found) throw new Error('No Wednesday with service found in the feed');
  return found;
}

export function tripWeight(active: ReadonlySet<string>, referenceDate: string, preferReference: boolean): number {
  return preferReference ? Number(active.has(referenceDate)) : active.size;
}
