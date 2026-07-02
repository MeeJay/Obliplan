import { db } from '../db';
import type { Shift, ShiftType, ShiftStatus } from '@obliplan/shared';
import { toIso, addDays } from '../utils/date';
import { recupService } from './recup.service';

interface ShiftRow {
  id: number;
  tenant_id: number;
  user_id: number;
  date: Date | string;
  heure_debut: string | null;
  heure_fin: string | null;
  pause_min: number;
  type: string;
  statut: string;
  note: string | null;
  hour_type_id: number | null;
  board_id: number | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: Date;
  updated_at: Date;
}

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIso(v));
const hm = (v: string | null): string | null => (v == null ? null : v.slice(0, 5));

export function rowToShift(r: ShiftRow): Shift {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    date: isoDate(r.date),
    heureDebut: hm(r.heure_debut),
    heureFin: hm(r.heure_fin),
    pauseMin: r.pause_min,
    type: r.type as ShiftType,
    statut: r.statut as ShiftStatus,
    note: r.note,
    hourTypeId: r.hour_type_id,
    boardId: r.board_id,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface ShiftInput {
  userId: number;
  date: string;
  heureDebut?: string | null;
  heureFin?: string | null;
  pauseMin?: number;
  type: ShiftType;
  statut?: ShiftStatus;
  note?: string | null;
  hourTypeId?: number | null;
  boardId?: number | null;
}

export const shiftService = {
  /** Shifts for a user across the Mon..Sun week starting at `monday`. */
  async getForUserWeek(tenantId: number, userId: number, monday: string): Promise<Shift[]> {
    const end = addDays(monday, 7);
    const rows = await db<ShiftRow>('shifts')
      .where({ tenant_id: tenantId, user_id: userId })
      .andWhere('date', '>=', monday)
      .andWhere('date', '<', end)
      .orderBy(['date', 'heure_debut']);
    return rows.map(rowToShift);
  },

  /** Shifts for many users across one week (manager grid). */
  async getForUsersWeek(tenantId: number, userIds: number[], monday: string): Promise<Shift[]> {
    if (userIds.length === 0) return [];
    const end = addDays(monday, 7);
    const rows = await db<ShiftRow>('shifts')
      .where({ tenant_id: tenantId })
      .whereIn('user_id', userIds)
      .andWhere('date', '>=', monday)
      .andWhere('date', '<', end)
      .orderBy(['user_id', 'date', 'heure_debut']);
    return rows.map(rowToShift);
  },

  async getById(id: number, tenantId: number): Promise<Shift | null> {
    const row = await db<ShiftRow>('shifts').where({ id, tenant_id: tenantId }).first();
    return row ? rowToShift(row) : null;
  },

  async create(tenantId: number, actorId: number, data: ShiftInput): Promise<Shift> {
    const [row] = await db<ShiftRow>('shifts')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId,
        date: data.date,
        heure_debut: data.heureDebut ?? null,
        heure_fin: data.heureFin ?? null,
        pause_min: data.pauseMin ?? 0,
        type: data.type,
        statut: data.statut ?? 'brouillon',
        note: data.note ?? null,
        hour_type_id: data.hourTypeId ?? null,
        board_id: data.boardId ?? null,
        created_by: actorId,
        updated_by: actorId,
      })
      .returning('*');
    const shift = rowToShift(row);
    await recupService.syncRecupForShift(shift);
    return shift;
  },

  async update(id: number, tenantId: number, actorId: number, data: Partial<ShiftInput>): Promise<Shift | null> {
    const patch: Record<string, unknown> = { updated_by: actorId, updated_at: db.fn.now() };
    if (data.userId !== undefined) patch.user_id = data.userId; // reassign (drag to another employee)
    if (data.date !== undefined) patch.date = data.date;
    if (data.heureDebut !== undefined) patch.heure_debut = data.heureDebut;
    if (data.heureFin !== undefined) patch.heure_fin = data.heureFin;
    if (data.pauseMin !== undefined) patch.pause_min = data.pauseMin;
    if (data.type !== undefined) patch.type = data.type;
    if (data.statut !== undefined) patch.statut = data.statut;
    if (data.note !== undefined) patch.note = data.note;
    if (data.hourTypeId !== undefined) patch.hour_type_id = data.hourTypeId;
    if (data.boardId !== undefined) patch.board_id = data.boardId;
    const [row] = await db<ShiftRow>('shifts')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    if (!row) return null;
    const shift = rowToShift(row);
    await recupService.syncRecupForShift(shift);
    return shift;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    const n = await db('shifts').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};
