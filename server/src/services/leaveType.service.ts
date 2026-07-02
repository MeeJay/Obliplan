import { db } from '../db';
import type { LeaveType } from '@obliplan/shared';

interface LeaveTypeRow {
  id: number;
  tenant_id: number;
  libelle: string;
  code: string;
  color: string | null;
  paid: boolean;
  reduces_attendu: boolean;
  requires_justification: boolean;
  allowance_days: string | number | null;
  accrual_mode: string;
  accrual_rate_per_month: string | number | null;
  period_start_month: number;
  is_active: boolean;
  position: number;
  created_at: Date;
  updated_at: Date;
}

export function rowToLeaveType(r: LeaveTypeRow): LeaveType {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    libelle: r.libelle,
    code: r.code,
    color: r.color,
    paid: r.paid,
    reducesAttendu: r.reduces_attendu,
    requiresJustification: r.requires_justification,
    allowanceDays: r.allowance_days != null ? Number(r.allowance_days) : null,
    accrualMode: r.accrual_mode as LeaveType['accrualMode'],
    accrualRatePerMonth: r.accrual_rate_per_month != null ? Number(r.accrual_rate_per_month) : null,
    periodStartMonth: r.period_start_month,
    isActive: r.is_active,
    position: r.position,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface LeaveTypeInput {
  libelle: string;
  code: string;
  color?: string | null;
  paid?: boolean;
  reducesAttendu?: boolean;
  requiresJustification?: boolean;
  allowanceDays?: number | null;
  accrualMode?: 'fixed_annual' | 'monthly';
  accrualRatePerMonth?: number | null;
  periodStartMonth?: number;
  isActive?: boolean;
  position?: number;
}

export const leaveTypeService = {
  async getAll(tenantId: number): Promise<LeaveType[]> {
    const rows = await db<LeaveTypeRow>('leave_types')
      .where({ tenant_id: tenantId })
      .orderBy(['position', 'libelle']);
    return rows.map(rowToLeaveType);
  },

  async getById(id: number, tenantId: number): Promise<LeaveType | null> {
    const row = await db<LeaveTypeRow>('leave_types').where({ id, tenant_id: tenantId }).first();
    return row ? rowToLeaveType(row) : null;
  },

  async create(tenantId: number, data: LeaveTypeInput): Promise<LeaveType> {
    const [row] = await db<LeaveTypeRow>('leave_types')
      .insert({
        tenant_id: tenantId,
        libelle: data.libelle,
        code: data.code,
        color: data.color ?? null,
        paid: data.paid ?? true,
        reduces_attendu: data.reducesAttendu ?? true,
        requires_justification: data.requiresJustification ?? false,
        allowance_days: data.allowanceDays ?? null,
        accrual_mode: data.accrualMode ?? 'fixed_annual',
        accrual_rate_per_month: data.accrualRatePerMonth ?? null,
        period_start_month: data.periodStartMonth ?? 1,
        is_active: data.isActive ?? true,
        position: data.position ?? 0,
      })
      .returning('*');
    return rowToLeaveType(row);
  },

  async update(id: number, tenantId: number, data: Partial<LeaveTypeInput>): Promise<LeaveType | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.libelle !== undefined) patch.libelle = data.libelle;
    if (data.code !== undefined) patch.code = data.code;
    if (data.color !== undefined) patch.color = data.color;
    if (data.paid !== undefined) patch.paid = data.paid;
    if (data.reducesAttendu !== undefined) patch.reduces_attendu = data.reducesAttendu;
    if (data.requiresJustification !== undefined) patch.requires_justification = data.requiresJustification;
    if (data.allowanceDays !== undefined) patch.allowance_days = data.allowanceDays;
    if (data.accrualMode !== undefined) patch.accrual_mode = data.accrualMode;
    if (data.accrualRatePerMonth !== undefined) patch.accrual_rate_per_month = data.accrualRatePerMonth;
    if (data.periodStartMonth !== undefined) patch.period_start_month = data.periodStartMonth;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.position !== undefined) patch.position = data.position;
    const [row] = await db<LeaveTypeRow>('leave_types').where({ id, tenant_id: tenantId }).update(patch).returning('*');
    return row ? rowToLeaveType(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('leave_types').where({ id, tenant_id: tenantId }).del()) > 0;
  },
};
