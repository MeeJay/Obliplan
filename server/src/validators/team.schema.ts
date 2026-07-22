import { z } from 'zod';

// ── User teams (Axis C) ────────────────────────────────────────────────────────
export const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  canCreate: z.boolean().optional(),
  weight: z.number().int().min(-9999).max(9999).optional(),
});
export const updateTeamSchema = createTeamSchema.partial();

export const setTeamMembersSchema = z.object({
  members: z.array(
    z.object({
      userId: z.number().int().positive(),
      role: z.enum(['member', 'manager']),
      inPlanning: z.boolean().optional(),
    }),
  ),
});

export const setTeamPermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      scope: z.enum(['client', 'project', 'all']),
      scopeId: z.number().int().min(0).optional(),
      level: z.enum(['ro', 'rw']).optional(),
    }),
  ),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type SetTeamMembersInput = z.infer<typeof setTeamMembersSchema>;
export type SetTeamPermissionsInput = z.infer<typeof setTeamPermissionsSchema>;
