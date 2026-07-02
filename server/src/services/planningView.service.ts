import { db } from '../db';
import { AppError } from '../middleware/errorHandler';
import type { PlanningView, PlanningViewInput } from '@obliplan/shared';

interface PlanningViewRow {
  id: number;
  tenant_id: number;
  user_id: number;
  name: string;
  team_ids: number[] | string;
  created_at: Date;
  updated_at: Date;
}

// jsonb comes back as a parsed array on pg, but tolerate a raw JSON string too.
function parseTeamIds(v: number[] | string): number[] {
  const arr = typeof v === 'string' ? (JSON.parse(v) as unknown) : v;
  return Array.isArray(arr)
    ? (arr as unknown[]).map(Number).filter((n) => Number.isInteger(n))
    : [];
}

export function rowToView(r: PlanningViewRow): PlanningView {
  return {
    id: r.id,
    name: r.name,
    teamIds: parseTeamIds(r.team_ids),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/**
 * Normalise an incoming view: trim + clamp the name to 80 chars, dedupe the team
 * ids, and enforce that every id belongs to a `user_teams` row of THIS tenant
 * (teamIds must be a subset of the tenant's teams). Returns storage-ready values.
 */
async function sanitizeInput(
  tenantId: number,
  input: PlanningViewInput,
): Promise<{ name: string; teamIds: number[] }> {
  const name = (input.name ?? '').trim().slice(0, 80);
  if (!name) throw new AppError(400, 'Le nom de la vue est obligatoire');

  const requested = Array.from(
    new Set((input.teamIds ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (requested.length === 0) return { name, teamIds: [] };

  const rows = await db('user_teams')
    .where({ tenant_id: tenantId })
    .whereIn('id', requested)
    .select<{ id: number }[]>('id');
  const valid = new Set(rows.map((r) => r.id));
  const teamIds = requested.filter((id) => valid.has(id));
  if (teamIds.length !== requested.length) {
    throw new AppError(400, "Une ou plusieurs équipes sélectionnées n'existent pas");
  }
  return { name, teamIds };
}

export const planningViewService = {
  // Own views only (tenant + owner scoped), alphabetical for a stable dropdown.
  async list(tenantId: number, userId: number): Promise<PlanningView[]> {
    const rows = await db<PlanningViewRow>('planning_views')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('name');
    return rows.map(rowToView);
  },

  // Lets the unique (tenant_id, user_id, name) conflict throw; the controller maps it to 409.
  async create(tenantId: number, userId: number, input: PlanningViewInput): Promise<PlanningView> {
    const { name, teamIds } = await sanitizeInput(tenantId, input);
    const [row] = await db<PlanningViewRow>('planning_views')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        name,
        team_ids: JSON.stringify(teamIds),
      })
      .returning('*');
    return rowToView(row);
  },

  // Owner-scoped update; returns null when no own row matches the id.
  async update(
    id: number,
    tenantId: number,
    userId: number,
    input: PlanningViewInput,
  ): Promise<PlanningView | null> {
    const { name, teamIds } = await sanitizeInput(tenantId, input);
    const [row] = await db<PlanningViewRow>('planning_views')
      .where({ id, tenant_id: tenantId, user_id: userId })
      .update({ name, team_ids: JSON.stringify(teamIds), updated_at: db.fn.now() })
      .returning('*');
    return row ? rowToView(row) : null;
  },

  async remove(id: number, tenantId: number, userId: number): Promise<boolean> {
    return (await db('planning_views').where({ id, tenant_id: tenantId, user_id: userId }).del()) > 0;
  },
};
