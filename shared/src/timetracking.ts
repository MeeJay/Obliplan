// ============================================================================
// Time tracking on projects/tasks: timer + manual entries, totals per card/board.
// ============================================================================

/** A logged chunk of time on a board (and optionally a card). */
export interface TimeEntry {
  id: number;
  tenantId: number;
  userId: number;
  /** Null = time logged with no specific project/board. */
  boardId: number | null;
  /** Null = time logged against the board with no specific card. */
  cardId: number | null;
  /** Duration in minutes (0 while a timer is still running). */
  minutes: number;
  note: string | null;
  /** ISO date (yyyy-mm-dd) the time was spent on. */
  spentOn: string | null;
  /** True while a live timer is ticking for this entry. */
  isRunning: boolean;
  /** Timestamp the running timer was started at (null for manual entries). */
  startedAt: string | null;
  createdAt: string;
  /** Display name of the user the time is logged for (board listing only). */
  userName?: string;
  /** Title of the card the time is on (board listing only; null = board-level). */
  cardTitle?: string | null;
}

/** Aggregated time per card for a board (cardId null = unassigned to a card). */
export interface CardTimeTotal {
  cardId: number | null;
  minutes: number;
}
