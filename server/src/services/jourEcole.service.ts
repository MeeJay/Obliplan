import { db } from '../db';
import type { JourEcole } from '@obliplan/shared';
import { toIso } from '../utils/date';

interface JourEcoleRow {
  id: number;
  tenant_id: number;
  user_id: number;
  date: Date | string | null;
  weekday: number | null;
  period_start: Date | string | null;
  period_end: Date | string | null;
  created_at: Date;
  updated_at: Date;
}

const d = (v: Date | string | null): string | null =>
  v == null ? null : typeof v === 'string' ? v.slice(0, 10) : toIso(v);

export function rowToJourEcole(r: JourEcoleRow): JourEcole {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    date: d(r.date),
    weekday: r.weekday,
    periodStart: d(r.period_start),
    periodEnd: d(r.period_end),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface JourEcoleInput {
  userId: number;
  date?: string | null;
  weekday?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export const jourEcoleService = {
  async getForUser(tenantId: number, userId: number): Promise<JourEcole[]> {
    const rows = await db<JourEcoleRow>('jours_ecole')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('id');
    return rows.map(rowToJourEcole);
  },

  async create(tenantId: number, data: JourEcoleInput): Promise<JourEcole> {
    const [row] = await db<JourEcoleRow>('jours_ecole')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId,
        date: data.date ?? null,
        weekday: data.weekday ?? null,
        period_start: data.periodStart ?? null,
        period_end: data.periodEnd ?? null,
      })
      .returning('*');
    return rowToJourEcole(row);
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    const n = await db('jours_ecole').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};
