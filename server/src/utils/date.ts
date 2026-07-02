// Lightweight ISO-date (yyyy-mm-dd) helpers - UTC-based, no time zone drift.

export function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The app's business timezone - planning/HR dates are CIVIL (Paris) calendar dates,
 *  not UTC. Override via APP_TIMEZONE when deploying in another region. */
const APP_TZ = process.env.APP_TIMEZONE || 'Europe/Paris';

/**
 * Today's date (yyyy-mm-dd) in the business timezone. Use this for EVERY "today" in
 * planning/HR logic: `toIso(new Date())` yields the UTC date, which lags Paris after
 * midnight (00:00–02:00 CEST) and silently breaks `date >= today` range filters
 * (e.g. "prochain créneau" showing yesterday). formatToParts is locale-order-proof.
 */
export function todayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

/** Day of week, 0=Sunday..6=Saturday (matches jours_ecole.weekday). */
export function dayOfWeek(iso: string): number {
  return parseIso(iso).getUTCDay();
}

/** Monday (ISO) of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const dow = (dayOfWeek(iso) + 6) % 7; // 0 = Monday
  return addDays(iso, -dow);
}

/** The 7 ISO dates Mon..Sun of the week starting at `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Reference Monday anchoring the fortnight ('quinzaine') grid. 2024-01-01 is a Monday. */
const QUINZAINE_EPOCH = '2024-01-01';

/**
 * Monday starting the two-week 'quinzaine' (fortnight) containing `iso`, anchored to
 * QUINZAINE_EPOCH so fortnights tile the calendar deterministically (whole weeks apart,
 * so DST never shifts a boundary). NOTE: this is a conventional anchor - adjust
 * QUINZAINE_EPOCH if the client's real astreinte rotation starts on a different reference.
 */
export function quinzaineStart(iso: string): string {
  const monday = mondayOf(iso);
  const days = Math.round((parseIso(monday).getTime() - parseIso(QUINZAINE_EPOCH).getTime()) / 86_400_000);
  return addDays(QUINZAINE_EPOCH, Math.floor(days / 14) * 14);
}

/** 'HH:mm' → minutes since midnight. */
export function hmToMin(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Is this ISO date a weekday (Mon–Fri)? */
export function isWeekday(iso: string): boolean {
  const d = dayOfWeek(iso);
  return d >= 1 && d <= 5;
}

/**
 * Count weekdays (Mon–Fri) within [startIso, endIso] inclusive, clipped to the optional
 * [clipStart, clipEnd] window. A weekday present in `holidays` (public-holiday ISO dates)
 * is NOT counted.
 */
export function countWeekdays(
  startIso: string,
  endIso: string,
  clipStart?: string,
  clipEnd?: string,
  holidays?: Set<string>,
): number {
  let from = startIso;
  let to = endIso;
  if (clipStart && from < clipStart) from = clipStart;
  if (clipEnd && to > clipEnd) to = clipEnd;
  if (from > to) return 0;
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekday(d) && !holidays?.has(d)) count++;
  }
  return count;
}
