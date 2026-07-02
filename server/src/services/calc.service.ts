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
 * Compute the weekly counter for a user.
 * - réalisé = Σ worked minutes of validated `travail` shifts.
 * - attendu = base − école days.
 * - overflow split per contract: heures sup (if authorized) vs récup-eligible.
 */
export function computeWeeklyCounter(params: {
  userId: number;
  monday: string;
  contrat: Contrat | null;
  shifts: Shift[];
  joursEcole: JourEcole[];
  /** Approved leave weekdays this week (reducing the expected hours). */
  leaveDays?: number;
  /** Public-holiday weekdays this week (reducing the expected hours). */
  feriesCount?: number;
}): WeeklyCounter {
  const { userId, monday, contrat, shifts, joursEcole, leaveDays = 0, feriesCount = 0 } = params;

  const realiseMin = shifts.reduce((sum, s) => sum + shiftWorkedMinutes(s), 0);
  // Astreinte (on-call): time always counts as heures sup, plus a call-out count.
  const astreinteShifts = shifts.filter((s) => s.type === 'astreinte' && s.statut === 'valide');
  const astreinteMin = astreinteShifts.reduce((sum, s) => sum + shiftAstreinteMinutes(s), 0);
  const astreinteDeclenchements = astreinteShifts.length;

  const ecoleCount = joursEcoleInWeek(joursEcole, monday, contrat);
  // Expected = (pattern weekly sum, or legacy base) minus école days, public holidays and
  // approved leave days. Each reduced day = base/5 for legacy contrats, or the per-working-day
  // average (weeklySum / nb worked days) for work-pattern contrats.
  const baseAttendu = attenduMinutes(contrat, ecoleCount, feriesCount);
  const perDay = contrat ? workingDayAverage(contrat) : 0;
  const attenduMin = Math.max(0, Math.round(baseAttendu - leaveDays * perDay));
  const ecartMin = realiseMin - attenduMin;
  const overflow = Math.max(0, ecartMin);

  let heuresSupMin = 0;
  let recupEligibleMin = 0;
  if (overflow > 0 && contrat) {
    if (contrat.heuresSupAutorisees) {
      // Above the optional threshold (else above attendu) counts as heures sup.
      const floor = contrat.seuilHeuresSupMin ?? attenduMin;
      heuresSupMin = Math.max(0, realiseMin - Math.max(attenduMin, floor));
    } else {
      // No heures sup → overflow is eligible for manual récup attribution.
      recupEligibleMin = overflow;
    }
  }
  // On-call time is heures sup regardless of contract.
  heuresSupMin += astreinteMin;

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
