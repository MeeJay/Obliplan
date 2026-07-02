// FR public-holiday computation. Single source shared by the seed migration (049)
// and any runtime refresh so both derive holidays the same way.
import { addDays } from './date';

/**
 * Easter Sunday for a Gregorian `year` as an ISO date (yyyy-mm-dd).
 * Anonymous Gregorian algorithm (Meeus/Jones/Butcher computus).
 */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface HolidayDef {
  date: string;
  label: string;
}

/** The 11 French national public holidays for `year`, sorted by ISO date. */
export function frHolidays(year: number): HolidayDef[] {
  const easter = easterSunday(year);
  const fixed: HolidayDef[] = [
    { date: `${year}-01-01`, label: "Jour de l'an" },
    { date: `${year}-05-01`, label: 'Fête du travail' },
    { date: `${year}-05-08`, label: 'Victoire 1945' },
    { date: `${year}-07-14`, label: 'Fête nationale' },
    { date: `${year}-08-15`, label: 'Assomption' },
    { date: `${year}-11-01`, label: 'Toussaint' },
    { date: `${year}-11-11`, label: 'Armistice' },
    { date: `${year}-12-25`, label: 'Noël' },
  ];
  const movable: HolidayDef[] = [
    { date: addDays(easter, 1), label: 'Lundi de Pâques' },
    { date: addDays(easter, 39), label: 'Ascension' },
    { date: addDays(easter, 50), label: 'Lundi de Pentecôte' },
  ];
  return [...fixed, ...movable].sort((a, b) => a.date.localeCompare(b.date));
}
