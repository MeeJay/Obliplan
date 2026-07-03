import { z } from 'zod';

export const createHourTypeSchema = z.object({
  libelle: z.string().min(1).max(120),
  code: z.string().min(1).max(16).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex #rrggbb attendue').nullable().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  bookable: z.boolean().optional(),
});
export const updateHourTypeSchema = createHourTypeSchema.partial();

export type CreateHourTypeInput = z.infer<typeof createHourTypeSchema>;
export type UpdateHourTypeInput = z.infer<typeof updateHourTypeSchema>;
