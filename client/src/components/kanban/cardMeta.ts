import type { CardPriority } from '@obliplan/shared';

export const PRIORITY_META: Record<CardPriority, { label: string; cls: string }> = {
  low: { label: 'Basse', cls: 'bg-bg-active text-text-muted border-border' },
  medium: { label: 'Moyenne', cls: 'bg-status-pending/15 text-status-pending border-status-pending/40' },
  high: { label: 'Haute', cls: 'bg-status-down/15 text-status-down border-status-down/40' },
};

export const PRIORITIES: CardPriority[] = ['low', 'medium', 'high'];

/** Solid dot colour per priority - compact indicator used across the board/list/table views. */
export const PRIORITY_DOT: Record<CardPriority, string> = {
  low: 'bg-text-muted',
  medium: 'bg-status-pending',
  high: 'bg-status-down',
};

/** True when a due date is strictly before today (local ISO day). */
export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}
