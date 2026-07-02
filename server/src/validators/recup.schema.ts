import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date ISO yyyy-mm-dd attendue');

// GET /recup/week-preview?userId=&semaine= - query params arrive as strings.
export const weekPreviewQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
  semaine: isoDate,
});

// POST /recup/validate-week - auto-credit the week's eligible récup.
export const validateWeekSchema = z.object({
  userId: z.number().int().positive(),
  semaine: isoDate,
});

// PATCH /recup/self-service - toggle a user's self-service récup view.
export const selfServiceSchema = z.object({
  userId: z.number().int().positive(),
  enabled: z.boolean(),
});

export type WeekPreviewQuery = z.infer<typeof weekPreviewQuerySchema>;
export type ValidateWeekInput = z.infer<typeof validateWeekSchema>;
export type SelfServiceInput = z.infer<typeof selfServiceSchema>;
