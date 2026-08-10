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
  pays: string | null;
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
    pays: r.pays ?? null,
  };
}

export interface HolidayInput {
  date: string;
  label: string;
  pays?: string | null;
}

/** Does a holiday of country `holidayPays` apply to a contract of country `contratPays`?
 *  A null holiday country is universal (every contract); otherwise the codes must match. */
export function holidayAppliesTo(holidayPays: string | null, contratPays: string): boolean {
  return holidayPays == null || holidayPays === contratPays;
}

export const holidayService = {
  /**
   * Public holiday rows (date + country) in [from, toExclusive) for the tenant: the global
   * set (tenant_id NULL) ∪ tenant-specific custom rows. Used to resolve per-employee holidays
   * (each employee observes only the holidays of their contract's country).
   */
  async getRows(tenantId: number, fromIso: string, toExclusiveIso: string): Promise<{ date: string; pays: string | null }[]> {
    const rows = await db<PublicHolidayRow>('public_holidays')
      .where((b) => b.whereNull('tenant_id').orWhere({ tenant_id: tenantId }))
      .andWhere('date', '>=', fromIso)
      .andWhere('date', '<', toExclusiveIso)
      .select('date', 'pays');
    return rows.map((r) => ({ date: isoDate(r.date), pays: r.pays ?? null }));
  },

  /**
   * Set of ISO dates that are public holidays in [from, toExclusive) observed by a contract
   * of country `pays`: a row applies when its own country is null (universal) or equals `pays`.
   */
  async getSet(tenantId: number, fromIso: string, toExclusiveIso: string, pays = 'FR'): Promise<Set<string>> {
    const rows = await this.getRows(tenantId, fromIso, toExclusiveIso);
    return new Set(rows.filter((r) => holidayAppliesTo(r.pays, pays)).map((r) => r.date));
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
    // A date may repeat across countries (14 juillet FR vs a MG holiday); a duplicate is only
    // the SAME date AND the same country (null = universal).
    const existing = await db<PublicHolidayRow>('public_holidays')
      .where('date', data.date)
      .andWhere((b) => b.whereNull('tenant_id').orWhere({ tenant_id: tenantId }))
      .andWhere((b) => (data.pays == null ? b.whereNull('pays') : b.where({ pays: data.pays })))
      .first();
    if (existing) {
      throw new AppError(409, 'Un jour férié existe déjà à cette date pour ce pays');
    }
    const [row] = await db<PublicHolidayRow>('public_holidays')
      .insert({ tenant_id: tenantId, date: data.date, label: data.label, region_code: null, pays: data.pays ?? null })
      .returning('*');
    return rowToPublicHoliday(row);
  },

  /** Delete a tenant-owned custom holiday - never the global tenant_id NULL set. */
  async deleteCustom(id: number, tenantId: number): Promise<boolean> {
    const n = await db('public_holidays').where({ id, tenant_id: tenantId }).del();
    return n > 0;
  },
};
