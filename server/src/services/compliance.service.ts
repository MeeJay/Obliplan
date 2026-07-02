import type { Contrat, Shift, ComplianceFlag } from '@obliplan/shared';
import { hmToMin, addDays } from '../utils/date';

const REST_DAILY_MIN = 11 * 60; // 11h between two days
const REST_WEEKLY_MIN = 35 * 60; // 35h continuous weekly rest
const MAX_DAY_MIN = 10 * 60; // 10h worked / day
const MAX_WEEK_MIN = 48 * 60; // 48h worked / week

/** A time-bearing shift reduced to absolute minute offsets from the week's Monday 00:00. */
interface Span {
  date: string;
  startAbs: number;
  endAbs: number;
  worked: boolean; // counts toward worked-hours caps (travail only)
}

function fmtH(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/**
 * Compute non-blocking working-time compliance flags for one user's week.
 * Reads only existing shift data - no schema change, no side effects.
 */
export const complianceService = {
  computeFlags(params: { monday: string; contrat: Contrat | null; shifts: Shift[] }): ComplianceFlag[] {
    const { monday, shifts } = params;
    const flags: ComplianceFlag[] = [];

    // Index each weekday to an absolute day offset (0..6) from Monday.
    const dayIndex = new Map<string, number>();
    for (let i = 0; i < 7; i++) dayIndex.set(addDays(monday, i), i);

    const spans: Span[] = [];
    for (const s of shifts) {
      // 'pause' (lunch/break) is neither worked nor an occupancy that affects rest -
      // skip it entirely, like repos/congé/absence, so it never raises a flag.
      if (s.type === 'pause' || s.type === 'repos' || s.type === 'conge' || s.type === 'absence') continue;
      if (!s.heureDebut || !s.heureFin) continue;
      const di = dayIndex.get(s.date);
      if (di === undefined) continue;
      const start = hmToMin(s.heureDebut);
      const end = hmToMin(s.heureFin);
      if (end <= start) continue;
      spans.push({
        date: s.date,
        startAbs: di * 1440 + start,
        endAbs: di * 1440 + end,
        worked: s.type === 'travail',
      });
    }
    spans.sort((a, b) => a.startAbs - b.startAbs);

    // ── Overlap (same person, overlapping times) ──────────────────────────────
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].startAbs < spans[i - 1].endAbs) {
        flags.push({
          code: 'OVERLAP',
          severity: 'error',
          message: `Chevauchement de créneaux le ${spans[i].date}.`,
          date: spans[i].date,
        });
      }
    }

    // ── Per-day worked total > 10h ────────────────────────────────────────────
    const perDay = new Map<string, number>();
    for (const sp of spans) {
      if (!sp.worked) continue;
      perDay.set(sp.date, (perDay.get(sp.date) ?? 0) + (sp.endAbs - sp.startAbs));
    }
    for (const [date, mins] of perDay) {
      if (mins > MAX_DAY_MIN) {
        flags.push({
          code: 'MAX_DAY_10H',
          severity: 'error',
          message: `${fmtH(mins)} travaillées le ${date} (max légal 10h/jour).`,
          date,
        });
      }
    }

    // ── Weekly worked total > 48h ─────────────────────────────────────────────
    const weekWorked = spans.filter((s) => s.worked).reduce((sum, s) => sum + (s.endAbs - s.startAbs), 0);
    if (weekWorked > MAX_WEEK_MIN) {
      flags.push({
        code: 'MAX_WEEK_48H',
        severity: 'error',
        message: `${fmtH(weekWorked)} travaillées sur la semaine (max légal 48h).`,
        date: null,
      });
    }

    // ── Daily rest < 11h between consecutive shifts on different days ──────────
    for (let i = 1; i < spans.length; i++) {
      const prev = spans[i - 1];
      const cur = spans[i];
      if (cur.date === prev.date) continue;
      const gap = cur.startAbs - prev.endAbs;
      if (gap >= 0 && gap < REST_DAILY_MIN) {
        flags.push({
          code: 'REST_DAILY_11H',
          severity: 'error',
          message: `Repos quotidien de ${fmtH(gap)} avant le ${cur.date} (min légal 11h).`,
          date: cur.date,
        });
      }
    }

    // ── Weekly rest: the largest continuous OFF block over the whole Mon 00:00–Sun 24:00
    // window must be ≥ 35h. This counts the time BEFORE the first shift and AFTER the last
    // (the week-end / repos days) - not only the gaps between two worked days - so a normal
    // Mon–Fri week with the week-end off is correctly considered compliant.
    if (spans.length >= 1) {
      const weekEnd = 7 * 1440; // minutes from Monday 00:00 to Sunday 24:00
      let maxGap = spans[0].startAbs; // leading rest, before the first worked shift
      for (let i = 1; i < spans.length; i++) {
        maxGap = Math.max(maxGap, spans[i].startAbs - spans[i - 1].endAbs);
      }
      maxGap = Math.max(maxGap, weekEnd - spans[spans.length - 1].endAbs); // trailing rest (week-end)
      if (maxGap < REST_WEEKLY_MIN) {
        flags.push({
          code: 'REST_WEEKLY_35H',
          severity: 'warn',
          message: `Aucun repos hebdomadaire continu de 35h détecté cette semaine.`,
          date: null,
        });
      }
    }

    return flags;
  },
};
