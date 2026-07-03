import { db } from '../db';
import type { HourType } from '@obliplan/shared';

interface HourTypeRow {
  id: number;
  tenant_id: number;
  libelle: string;
  code: string | null;
  color: string | null;
  position: number;
  is_active: boolean;
  bookable: boolean;
  booking_exclude_projects: boolean;
  created_at: Date;
  updated_at: Date;
}

export function rowToHourType(r: HourTypeRow): HourType {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    libelle: r.libelle,
    code: r.code,
    color: r.color,
    position: r.position,
    isActive: r.is_active,
    bookable: r.bookable,
    bookingExcludeProjects: r.booking_exclude_projects,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface HourTypeInput {
  libelle: string;
  code?: string | null;
  color?: string | null;
  position?: number;
  isActive?: boolean;
  bookable?: boolean;
  bookingExcludeProjects?: boolean;
}

export const hourTypeService = {
  async getAll(tenantId: number): Promise<HourType[]> {
    const rows = await db<HourTypeRow>('hour_types')
      .where({ tenant_id: tenantId })
      .orderBy(['position', 'libelle']);
    return rows.map(rowToHourType);
  },

  async getById(id: number, tenantId: number): Promise<HourType | null> {
    const row = await db<HourTypeRow>('hour_types').where({ id, tenant_id: tenantId }).first();
    return row ? rowToHourType(row) : null;
  },

  async create(tenantId: number, data: HourTypeInput): Promise<HourType> {
    const [row] = await db<HourTypeRow>('hour_types')
      .insert({
        tenant_id: tenantId,
        libelle: data.libelle,
        code: data.code ?? null,
        color: data.color ?? null,
        position: data.position ?? 0,
        is_active: data.isActive ?? true,
        bookable: data.bookable ?? false,
        booking_exclude_projects: data.bookingExcludeProjects ?? true,
      })
      .returning('*');
    return rowToHourType(row);
  },

  async update(id: number, tenantId: number, data: Partial<HourTypeInput>): Promise<HourType | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.libelle !== undefined) patch.libelle = data.libelle;
    if (data.code !== undefined) patch.code = data.code;
    if (data.color !== undefined) patch.color = data.color;
    if (data.position !== undefined) patch.position = data.position;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.bookable !== undefined) patch.bookable = data.bookable;
    if (data.bookingExcludeProjects !== undefined) patch.booking_exclude_projects = data.bookingExcludeProjects;
    const [row] = await db<HourTypeRow>('hour_types')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToHourType(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('hour_types').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};
