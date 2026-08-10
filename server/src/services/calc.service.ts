import type { Contrat, Shift, JourEcole, RecupMouvement, WeeklyCounter } from '@obliplan/shared';
import { hmToMin, weekDates, dayOfWeek, isWeekday } from '../utils/date';

/** Span of a shift in minutes (fin − début − pause), clamped ≥ 0. Type-agnostic. */
function shiftSpanMinutes(shift: Shift): number {
  if (!shift.heureDebut || !shift.heureFin) return 0;
  const span = hmToMin(shift.heureFin) - hmToMin(shift.heureDebut) - (shift.pauseMin || 0);
  return Math.max(0, span);
}

/** Worked minutes of a single shift (only validated `travail` shifts count). */
export function shiftWorkedMinutes(shift: Shift): number {
  if (shift.type !== 'travail' || shift.statut !== 'valide') return 0;
  return shiftSpanMinutes(shift);
}

/** On-call minutes of a single shift (only validated `astreinte` shifts). */
export function shiftAstreinteMinutes(shift: Shift): number {
  if (shift.type !== 'astreinte' || shift.statut !== 'valide') return 0;
  return shiftSpanMinutes(shift);
}

/** Does `jourEcole` mark `iso` as a school day? */
function isEcoleDay(j: JourEcole, iso: string): boolean {
  if (j.date) return j.date === iso;
  if (j.weekday !== null && j.weekday === dayOfWeek(iso)) {
    if (j.periodStart && iso < j.periodStart) return false;
    if (j.periodEnd && iso > j.periodEnd) return false;
    return true;
  }
  return false;
}

/**
 * Count of école days on Mon–Fri of the week (drives the attendu reduction). With a
 * work pattern, only days the employee actually works count - a school day on a
 * structural off-day must not reduce expected hours.
 */
export function joursEcoleInWeek(joursEcole: JourEcole[], monday: string, contrat?: Contrat | null): number {
  const days = weekDates(monday).slice(0, 5); // Mon..Fri
  let count = 0;
  for (const iso of days) {
    if (contrat?.workPattern && expectedMinutesForDay(contrat, iso) <= 0) continue;
    if (joursEcole.some((j) => isEcoleDay(j, iso))) count++;
  }
  return count;
}

/**
 * Count of public holidays on Mon–Fri of the week (drives the attendu reduction).
 * With a work pattern, a férié on a structural off-day is NOT counted (it never
 * lowers a part-timer's expected hours).
 */
export function feriesInWeek(holidays: Set<string>, monday: string, contrat?: Contrat | null): number {
  const days = weekDates(monday).slice(0, 5); // Mon..Fri
  let count = 0;
  for (const iso of days) {
    if (contrat?.workPattern && expectedMinutesForDay(contrat, iso) <= 0) continue;
    if (holidays.has(iso)) count++;
  }
  return count;
}

/**
 * Effective expected minutes for a single weekday. With a work pattern set, reads
 * pattern[(dow+6)%7] (dayOfWeek is 0=Sun..6=Sat → remap to Mon=0..Sun=6); otherwise
 * the legacy uniform base/5 on Mon–Fri, 0 on the weekend.
 */
export function expectedMinutesForDay(contrat: Contrat | null, iso: string): number {
  if (!contrat) return 0;
  if (contrat.workPattern) {
    const dow = (dayOfWeek(iso) + 6) % 7; // Mon=0..Sun=6
    return Math.max(0, contrat.workPattern[dow] ?? 0);
  }
  return isWeekday(iso) ? contrat.heuresHebdoBaseMin / 5 : 0;
}

/** Σ of effective expected minutes over the 7 days of the week starting at `monday`. */
export function weekExpectedMinutes(contrat: Contrat | null, monday: string): number {
  if (!contrat) return 0;
  return weekDates(monday).reduce((sum, iso) => sum + expectedMinutesForDay(contrat, iso), 0);
}

/**
 * Per-working-day value used to reduce attendu for one école/férié/leave day.
 * Pattern: weekly sum / number of worked weekdays (the average working-day value).
 * Legacy (no pattern): base/5, byte-identical to the historic behaviour.
 */
function workingDayAverage(contrat: Contrat): number {
  if (contrat.workPattern) {
    const worked = contrat.workPattern.filter((m) => m > 0);
    const weeklySum = worked.reduce((s, m) => s + m, 0);
    return worked.length > 0 ? weeklySum / worked.length : 0;
  }
  return contrat.heuresHebdoBaseMin / 5;
}

/**
 * Expected weekly minutes = contract base minus one working day per école day
 * (alternance only) and per public holiday. With a work pattern the base is the
 * pattern's weekly sum and each reduced day is the average working-day value;
 * without a pattern it is the legacy base − reducedDays×(base/5). Clamped ≥ 0.
 */
export function attenduMinutes(contrat: Contrat | null, joursEcoleCount: number, feriesCount = 0): number {
  if (!contrat) return 0;
  const ecoleDays = contrat.alternance ? Math.max(0, joursEcoleCount) : 0;
  const reducedDays = ecoleDays + Math.max(0, feriesCount);
  if (contrat.workPattern) {
    const weeklySum = contrat.workPattern.reduce((s, m) => s + Math.max(0, m), 0);
    if (reducedDays <= 0) return weeklySum;
    const perDay = workingDayAverage(contrat);
    return Math.max(0, Math.round(weeklySum - reducedDays * perDay));
  }
  const base = contrat.heuresHebdoBaseMin;
  if (reducedDays <= 0) return base;
  const perDay = base / 5;
  return Math.max(0, Math.round(base - reducedDays * perDay));
}

/**
 * Shift types that NEUTRALISE a day drawn straight on the planning: a block of one of
 * these makes the day count as "not expected to work" (attendu → 0 for that day), exactly
 * like an approved leave or a public holiday. `astreinte` is deliberately NOT here: an
 * on-call call-out during a leave must still add heures sup, not cancel the day.
 */
export const NEUTRALISING_SHIFT_TYPES: ReadonlyArray<Shift['type']> = ['conge', 'absence', 'recup'];

/** A leave span reducing the expected hours, as consumed by the per-day counter below. */
export interface CounterLeaveSpan {
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  leaveTypeId: number;
}

/**
 * Per-day neutralisation factor ∈ [0,1]: how much of `iso`'s expected hours are cancelled.
 * The factor is the MAX across every source (never the sum), so overlapping sources - a leave
 * that is ALSO a drawn block, say - can never reduce a day twice. Sources:
 *   - public holiday                                        → 1
 *   - école day (alternance contracts only)                 → 1
 *   - approved leave of a `reducesAttendu` type             → 1 (0.5 for a single half-day)
 *   - a drawn conge/absence/recup block on that day         → 1  (any status: it states intent)
 * Returns { factor, leaveFactor } so the counter can report congeJours without counting fériés.
 */
function dayNeutralisation(
  iso: string,
  contrat: Contrat | null,
  holidays: Set<string>,
  leaves: CounterLeaveSpan[],
  reduceLeaveTypeIds: Set<number>,
  joursEcole: JourEcole[],
  shifts: Shift[],
): { factor: number; leaveFactor: number } {
  const holidayF = holidays.has(iso) ? 1 : 0;
  const ecoleF = contrat?.alternance && joursEcole.some((j) => isEcoleDay(j, iso)) ? 1 : 0;
  let leaveF = 0;
  for (const lv of leaves) {
    if (!reduceLeaveTypeIds.has(lv.leaveTypeId)) continue;
    if (iso < lv.startDate || iso > lv.endDate) continue;
    leaveF = Math.max(leaveF, lv.halfDay && lv.startDate === lv.endDate ? 0.5 : 1);
  }
  if (shifts.some((s) => s.date === iso && NEUTRALISING_SHIFT_TYPES.includes(s.type))) leaveF = 1;
  return { factor: Math.min(1, Math.max(holidayF, ecoleF, leaveF)), leaveFactor: leaveF };
}

/**
 * Compute the weekly counter for a user.
 * - réalisé = Σ worked minutes of validated `travail` shifts (a congé/absence block is 0 min,
 *   so a 24h leave block can never inflate the balance).
 * - attendu = Σ per worked day of the contract's expected minutes, each day NEUTRALISED (→0)
 *   when it is a public holiday, an approved reducing leave, an école day, or carries a drawn
 *   conge/absence/recup block. Neutralisation is deduplicated per day (max of sources), so the
 *   same day is never cancelled twice → a leave leaves the balance at 0, never negative nor positive.
 * - astreinte time is added to heures sup on TOP of all this, so an on-call call-out during a
 *   leave is still paid even though the day's attendu is 0.
 */
export function computeWeeklyCounter(params: {
  userId: number;
  monday: string;
  contrat: Contrat | null;
  shifts: Shift[];
  joursEcole: JourEcole[];
  /** Public holidays (ISO dates) in the tenant this week - neutralise their day. */
  holidays?: Set<string>;
  /** Approved leaves overlapping this week (only `reducesAttendu` types reduce). */
  leaves?: CounterLeaveSpan[];
  /** Ids of leave types flagged `reducesAttendu`. */
  reduceLeaveTypeIds?: Set<number>;
}): WeeklyCounter {
  const { userId, monday, contrat, shifts, joursEcole } = params;
  const holidays = params.holidays ?? new Set<string>();
  const leaves = params.leaves ?? [];
  const reduceLeaveTypeIds = params.reduceLeaveTypeIds ?? new Set<number>();

  const realiseMin = shifts.reduce((sum, s) => sum + shiftWorkedMinutes(s), 0);
  // Astreinte (on-call): time always counts as heures sup, plus a call-out count.
  const astreinteShifts = shifts.filter((s) => s.type === 'astreinte' && s.statut === 'valide');
  const astreinteMin = astreinteShifts.reduce((sum, s) => sum + shiftAstreinteMinutes(s), 0);
  const astreinteDeclenchements = astreinteShifts.length;

  // Attendu, computed day by day so every neutralisation source is deduplicated on its day.
  let attenduMin = 0;
  let leaveDays = 0; // neutralised-by-leave working days (fériés excluded), for display
  let ecoleCount = 0;
  for (const iso of weekDates(monday)) {
    const base = expectedMinutesForDay(contrat, iso);
    if (base <= 0) continue; // structural off day / weekend → nothing expected, nothing to cancel
    const { factor, leaveFactor } = dayNeutralisation(
      iso,
      contrat,
      holidays,
      leaves,
      reduceLeaveTypeIds,
      joursEcole,
      shifts,
    );
    attenduMin += Math.round(base * (1 - factor));
    if (!holidays.has(iso)) leaveDays += leaveFactor;
    if (contrat?.alternance && joursEcole.some((j) => isEcoleDay(j, iso))) ecoleCount += 1;
  }
  const ecartMin = realiseMin - attenduMin;

  // Hours worked ON an observed public holiday (holidays is already filtered to the contract's
  // country upstream). These are ALWAYS heures sup - a worked bank holiday is overtime by rule -
  // scaled by the contract's coefficient (2 = +100%). They are handled separately from the
  // ordinary overflow so they count even when the contract otherwise has no heures sup.
  const ferieWorkedMin = shifts.reduce(
    (sum, s) => sum + (holidays.has(s.date) ? shiftWorkedMinutes(s) : 0),
    0,
  );
  const ferieCoeff = contrat?.ferieWorkedCoeff && contrat.ferieWorkedCoeff > 0 ? contrat.ferieWorkedCoeff : 1;
  const ferieSupMin = Math.round(ferieCoeff * ferieWorkedMin);

  let heuresSupMin = 0;
  let recupEligibleMin = 0;
  if (contrat) {
    // Ordinary overflow excludes holiday-worked time (credited via ferieSupMin below).
    const nonFerieRealise = realiseMin - ferieWorkedMin;
    const nonFerieOverflow = Math.max(0, nonFerieRealise - attenduMin);
    if (nonFerieOverflow > 0) {
      if (contrat.heuresSupAutorisees) {
        const floor = contrat.seuilHeuresSupMin ?? attenduMin;
        heuresSupMin = Math.max(0, nonFerieRealise - Math.max(attenduMin, floor));
      } else {
        // No heures sup → this part is eligible for manual récup attribution.
        recupEligibleMin = nonFerieOverflow;
      }
    }
  }
  // Worked-holiday hours: always heures sup (coefficient-scaled). On-call time: always heures sup.
  heuresSupMin += ferieSupMin + astreinteMin;

  return {
    userId,
    semaine: monday,
    contratId: contrat?.id ?? null,
    realiseMin,
    attenduMin,
    ecartMin,
    heuresSupMin,
    recupEligibleMin,
    joursEcole: ecoleCount,
    astreinteMin,
    astreinteDeclenchements,
    congeJours: leaveDays,
  };
}

/** Running récup balance: Σ credits − Σ debits (minutes). */
export function recupSoldeMinutes(movements: RecupMouvement[]): number {
  return movements.reduce((acc, m) => acc + (m.sens === 'credit' ? m.heuresMin : -m.heuresMin), 0);
}
