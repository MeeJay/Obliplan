import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date ISO yyyy-mm-dd attendue');

// ── Natures (config) ────────────────────────────────────────────────────────
export const createOvertimeNatureSchema = z.object({
  libelle: z.string().min(1).max(120),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex #rrggbb attendue').nullable().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export const updateOvertimeNatureSchema = createOvertimeNatureSchema.partial();

// ── Declarations ────────────────────────────────────────────────────────────
export const createOvertimeDeclarationSchema = z
  .object({
    userId: z.number().int().positive().optional(),
    natureId: z.number().int().positive(),
    date: isoDate,
    minutes: z.number().int().positive().max(7 * 24 * 60),
    recupMinutes: z.number().int().min(0).optional(),
    motif: z.string().max(2000).nullable().optional(),
  })
  .refine((d) => (d.recupMinutes ?? 0) <= d.minutes, {
    message: 'La récup ne peut excéder les heures déclarées',
    path: ['recupMinutes'],
  });

export const decideOvertimeDeclarationSchema = z.object({
  decision: z.enum(['valide', 'refuse']),
  // Required (non-blank) when refusing - enforced in the controller.
  comment: z.string().max(2000).nullable().optional(),
});

// Owner edits a pending declaration (all fields optional - partial update).
export const updateOvertimeDeclarationSchema = z
  .object({
    natureId: z.number().int().positive(),
    date: isoDate,
    minutes: z.number().int().positive().max(7 * 24 * 60),
    recupMinutes: z.number().int().min(0),
    motif: z.string().max(2000).nullable(),
  })
  .partial()
  .refine((d) => d.recupMinutes == null || d.minutes == null || d.recupMinutes <= d.minutes, {
    message: 'La récup ne peut excéder les heures déclarées',
    path: ['recupMinutes'],
  });

// Owner requests a modification on a validated declaration (corrected values).
export const requestChangeOvertimeDeclarationSchema = updateOvertimeDeclarationSchema;

export type CreateOvertimeNatureInput = z.infer<typeof createOvertimeNatureSchema>;
export type UpdateOvertimeNatureInput = z.infer<typeof updateOvertimeNatureSchema>;
export type CreateOvertimeDeclarationInput = z.infer<typeof createOvertimeDeclarationSchema>;
export type DecideOvertimeDeclarationInput = z.infer<typeof decideOvertimeDeclarationSchema>;
export type UpdateOvertimeDeclarationInput = z.infer<typeof updateOvertimeDeclarationSchema>;
