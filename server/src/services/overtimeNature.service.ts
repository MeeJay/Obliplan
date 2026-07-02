import { db } from '../db';
import type { OvertimeNature } from '@obliplan/shared';

interface OvertimeNatureRow {
  id: number;
  tenant_id: number;
  libelle: string;
  color: string | null;
  position: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export function rowToOvertimeNature(r: OvertimeNatureRow): OvertimeNature {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    libelle: r.libelle,
    color: r.color,
    position: r.position,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface OvertimeNatureInput {
  libelle: string;
  color?: string | null;
  position?: number;
  isActive?: boolean;
}

export const overtimeNatureService = {
  async getAll(tenantId: number): Promise<OvertimeNature[]> {
    const rows = await db<OvertimeNatureRow>('overtime_natures')
      .where({ tenant_id: tenantId })
      .orderBy(['position', 'libelle']);
    return rows.map(rowToOvertimeNature);
  },

  async getById(id: number, tenantId: number): Promise<OvertimeNature | null> {
    const row = await db<OvertimeNatureRow>('overtime_natures').where({ id, tenant_id: tenantId }).first();
    return row ? rowToOvertimeNature(row) : null;
  },

  async create(tenantId: number, data: OvertimeNatureInput): Promise<OvertimeNature> {
    const [row] = await db<OvertimeNatureRow>('overtime_natures')
      .insert({
        tenant_id: tenantId,
        libelle: data.libelle,
        color: data.color ?? null,
        position: data.position ?? 0,
        is_active: data.isActive ?? true,
      })
      .returning('*');
    return rowToOvertimeNature(row);
  },

  async update(id: number, tenantId: number, data: Partial<OvertimeNatureInput>): Promise<OvertimeNature | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.libelle !== undefined) patch.libelle = data.libelle;
    if (data.color !== undefined) patch.color = data.color;
    if (data.position !== undefined) patch.position = data.position;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    const [row] = await db<OvertimeNatureRow>('overtime_natures')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToOvertimeNature(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('overtime_natures').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};
