import { db } from '../db';
import type { PublicHoliday } from '@obliplan/shared';
import { toIso } from '../utils/date';
import { AppError } from '../middleware/errorHandler';

interface PublicHolidayRow {
  id: number;
  tenant_id: number | null;
  date: Date | string;
  label: string;
  region_code: string | null;
  created_at: Date;
}

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIso(v));

export function rowToPublicHoliday(r: PublicHolidayRow): PublicHoliday {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    date: isoDate(r.date),
    label: r.label,
    regionCode: r.region_code,
  };
}

export interface HolidayInput {
  date: string;
  label: string;
}

export const holidayService = {
  /**
   * Set of ISO dates that are public holidays in [from, toExclusive) for the
   * tenant: the global FR set (tenant_id NULL) ∪ any tenant-specific custom rows.
   */
  async getSet(tenantId: number, fromIso: string, toExclusiveIso: string): Promise<Set<string>> {
    const rows = await db<PublicHolidayRow>('public_holidays')
      .where((b) => b.whereNull('tenant_id').orWhere({ tenant_id: tenantId }))
      .andWhere('date', '>=', fromIso)
      .andWhere('date', '<', toExclusiveIso)
      .select('date');
    return new Set(rows.map((r) => isoDate(r.date)));
  },

  /** Merged global + tenant holidays for display, optionally scoped to a civil year. */
  async getAll(tenantId: number, year?: number): Promise<PublicHoliday[]> {
    const q = db<PublicHolidayRow>('public_holidays').where((b) =>
      b.whereNull('tenant_id').orWhere({ tenant_id: tenantId }),
    );
    if (year !== undefined) {
      q.andWhere('date', '>=', `${year}-01-01`).andWhere('date', '<', `${year + 1}-01-01`);
    }
    const rows = await q.orderBy('date');
    return rows.map(rowToPublicHoliday);
  },

  /** Add a tenant-specific custom holiday (rejects a date already covered by a global or tenant row). */
  async addCustom(tenantId: number, data: HolidayInput): Promise<PublicHoliday> {
    const existing = await db<PublicHolidayRow>('public_holidays')
      .where('date', data.date)
      .andWhere((b) => b.whereNull('tenant_id').orWhere({ tenant_id: tenantId }))
      .first();
    if (existing) {
      throw new AppError(409, 'Un jour férié existe déjà à cette date');
    }
    const [row] = await db<PublicHolidayRow>('public_holidays')
      .insert({ tenant_id: tenantId, date: data.date, label: data.label, region_code: null })
      .returning('*');
    return rowToPublicHoliday(row);
  },

  /** Delete a tenant-owned custom holiday - never the global tenant_id NULL set. */
  async deleteCustom(id: number, tenantId: number): Promise<boolean> {
    const n = await db('public_holidays').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};
