import { Sun, Star, CalendarDays, UserCheck, Home, type LucideIcon } from 'lucide-react';
import type { SmartList } from '@obliplan/shared';

/** A selected view in the To Do page: a smart list or a custom list. */
export type TodoView = { kind: 'smart'; key: SmartList } | { kind: 'list'; id: number };

export interface SmartMeta {
  key: SmartList;
  label: string;
  icon: LucideIcon;
  /** Icon tint (the MS To Do smart-list accents). */
  color: string;
}

export const SMART_LISTS: SmartMeta[] = [
  { key: 'my_day', label: 'Ma journée', icon: Sun, color: '#5b8def' },
  { key: 'important', label: 'Important', icon: Star, color: '#e25563' },
  { key: 'planned', label: 'Planifié', icon: CalendarDays, color: '#3aa76d' },
  { key: 'assigned', label: 'Affectées à moi', icon: UserCheck, color: '#7c6cff' },
  { key: 'tasks', label: 'Tâches', icon: Home, color: '#4f9cf9' },
];

export const viewEquals = (a: TodoView, b: TodoView): boolean =>
  a.kind === b.kind && (a.kind === 'smart' ? a.key === (b as { key: SmartList }).key : a.id === (b as { id: number }).id);
