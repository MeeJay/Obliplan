import type { ShiftType } from '@obliplan/shared';

export const SHIFT_META: Record<ShiftType, { label: string; cls: string }> = {
  travail: { label: 'Travail', cls: 'bg-accent/15 text-accent border-accent/40' },
  astreinte: { label: 'Astreinte', cls: 'bg-status-pending/20 text-status-pending border-status-pending/50' },
  pause: { label: 'Pause déj.', cls: 'bg-bg-tertiary text-text-muted border-border' },
  repos: { label: 'Repos', cls: 'bg-bg-active text-text-secondary border-border' },
  // Distinct teal - status-maintenance resolves to the SAME value as the accent (violet/indigo),
  // so récup used to be indistinguishable from 'travail'. Teal reads on both dark and light themes.
  recup: { label: 'Récup', cls: 'bg-teal-500/15 text-teal-500 border-teal-500/45' },
  conge: { label: 'Congé', cls: 'bg-status-up/15 text-status-up border-status-up/40' },
  absence: { label: 'Absence', cls: 'bg-status-down/15 text-status-down border-status-down/40' },
  ecole: { label: 'École', cls: 'bg-status-pending/15 text-status-pending border-status-pending/40' },
};

/** Types that carry a time range (shown with hours): work, on-call and the lunch break. */
export const TIMED_SHIFT_TYPES: ShiftType[] = ['travail', 'astreinte', 'pause'];

/** " · Matin" / " · Après-midi" suffix for a half-day absence block ('full' → ''). */
export function periodSuffix(dayPeriod?: 'full' | 'am' | 'pm' | null): string {
  return dayPeriod === 'am' ? ' · Matin' : dayPeriod === 'pm' ? ' · Après-midi' : '';
}

/** Lightweight lookup maps for decorating shift chips with their hour type / project. */
export type HourTypeLookup = Record<number, { libelle: string; color: string | null }>;
export type BoardLookup = Record<number, { name: string }>;

export const SHIFT_TYPES: ShiftType[] = ['travail', 'astreinte', 'pause', 'repos', 'recup', 'conge', 'absence', 'ecole'];
