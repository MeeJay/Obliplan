import { db } from '../db';
import type { ShiftTemplate, ShiftType } from '@obliplan/shared';

interface ShiftTemplateRow {
  id: number;
  tenant_id: number;
  name: string;
  heure_debut: string;
  heure_fin: string;
  pause_min: number;
  type: string;
  hour_type_id: number | null;
  board_id: number | null;
  color: string | null;
  created_at: Date;
  updated_at: Date;
}

const hm = (v: string): string => v.slice(0, 5);

export function rowToShiftTemplate(r: ShiftTemplateRow): ShiftTemplate {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    heureDebut: hm(r.heure_debut),
    heureFin: hm(r.heure_fin),
    pauseMin: r.pause_min,
    type: r.type as ShiftType,
    hourTypeId: r.hour_type_id,
    boardId: r.board_id,
    color: r.color,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface ShiftTemplateInput {
  name: string;
  heureDebut: string;
  heureFin: string;
  pauseMin?: number;
  type?: ShiftType;
  hourTypeId?: number | null;
  boardId?: number | null;
  color?: string | null;
}

export const shiftTemplateService = {
  async getAll(tenantId: number): Promise<ShiftTemplate[]> {
    const rows = await db<ShiftTemplateRow>('shift_templates').where({ tenant_id: tenantId }).orderBy('name');
    return rows.map(rowToShiftTemplate);
  },

  async create(tenantId: number, data: ShiftTemplateInput): Promise<ShiftTemplate> {
    const [row] = await db<ShiftTemplateRow>('shift_templates')
      .insert({
        tenant_id: tenantId,
        name: data.name,
        heure_debut: data.heureDebut,
        heure_fin: data.heureFin,
        pause_min: data.pauseMin ?? 0,
        type: data.type ?? 'travail',
        hour_type_id: data.hourTypeId ?? null,
        board_id: data.boardId ?? null,
        color: data.color ?? null,
      })
      .returning('*');
    return rowToShiftTemplate(row);
  },

  async update(id: number, tenantId: number, data: Partial<ShiftTemplateInput>): Promise<ShiftTemplate | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.heureDebut !== undefined) patch.heure_debut = data.heureDebut;
    if (data.heureFin !== undefined) patch.heure_fin = data.heureFin;
    if (data.pauseMin !== undefined) patch.pause_min = data.pauseMin;
    if (data.type !== undefined) patch.type = data.type;
    if (data.hourTypeId !== undefined) patch.hour_type_id = data.hourTypeId;
    if (data.boardId !== undefined) patch.board_id = data.boardId;
    if (data.color !== undefined) patch.color = data.color;
    const [row] = await db<ShiftTemplateRow>('shift_templates')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToShiftTemplate(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    const n = await db('shift_templates').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};
