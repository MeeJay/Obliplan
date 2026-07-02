import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date ISO yyyy-mm-dd attendue');

// ── Time tracking ───────────────────────────────────────────────────────────
export const startTimerSchema = z.object({
  boardId: z.number().int().positive().nullable().optional(),
  cardId: z.number().int().positive().nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export const createTimeEntrySchema = z.object({
  boardId: z.number().int().positive().nullable().optional(),
  cardId: z.number().int().positive().nullable().optional(),
  minutes: z.number().int().positive().max(7 * 24 * 60),
  note: z.string().max(2000).nullable().optional(),
  spentOn: isoDate.nullable().optional(),
  /** The teammate the time is logged for (managers only); omit = the caller. */
  userId: z.number().int().positive().optional(),
});

export const updateTimeEntrySchema = z.object({
  boardId: z.number().int().positive().nullable().optional(),
  cardId: z.number().int().positive().nullable().optional(),
  minutes: z.number().int().positive().max(7 * 24 * 60).optional(),
  note: z.string().max(2000).nullable().optional(),
  spentOn: isoDate.nullable().optional(),
});

export type StartTimerInput = z.infer<typeof startTimerSchema>;
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;
