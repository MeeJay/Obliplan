import { z } from 'zod';

// ── Clients (customers) ────────────────────────────────────────────────────────
export const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex #rrggbb attendue').nullable().optional(),
  contact: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // A small, client-side resized data-URI (or URL); 200k chars is a safe cap under the 1mb json limit.
  logo: z.string().max(200000).nullable().optional(),
  archived: z.boolean().optional(),
});
export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
