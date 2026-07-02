import { db } from '../db';
import type { LeaveRequest, LeaveStatus, LeaveBalance, LeavePeriod, LeaveCalendarEntry } from '@obliplan/shared';
import { toIso, addDays, countWeekdays, isWeekday, dayOfWeek } from '../utils/date';
import { holidayService } from './holiday.service';
import { contratService } from './contrat.service';
import { userService } from './user.service';

interface LeaveRequestRow {
  id: number;
  tenant_id: number;
  user_id: number;
  leave_type_id: number;
  start_date: Date | string;
  end_date: Date | string;
  half_day: boolean;
  start_period: string;
  end_period: string;
  days: string | number;
  motif: string | null;
  status: string;
  decided_by: number | null;
  decided_at: Date | null;
  decision_comment: string | null;
  created_at: Date;
  updated_at: Date;
  /** Present only on queries that join users (e.g. getPending). */
  user_name?: string;
}

interface LeaveCalendarRow {
  id: number;
  user_id: number;
  user_name: string;
  leave_type_id: number;
  leave_type_libelle: string;
  leave_type_color: string | null;
  start_date: Date | string;
  end_date: Date | string;
  start_period: string;
  end_period: string;
  days: string | number;
  status: string;
}

const isoDate = (v: Date | string): string => (typeof v === 'string' ? v.slice(0, 10) : toIso(v));

export function rowToLeaveRequest(r: LeaveRequestRow): LeaveRequest {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    userId: r.user_id,
    leaveTypeId: r.leave_type_id,
    startDate: isoDate(r.start_date),
    endDate: isoDate(r.end_date),
    halfDay: r.half_day,
    startPeriod: r.start_period as LeavePeriod,
    endPeriod: r.end_period as LeavePeriod,
    days: Number(r.days),
    motif: r.motif,
    status: r.status as LeaveStatus,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at ? r.decided_at.toISOString() : null,
    decisionComment: r.decision_comment,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    ...(r.user_name !== undefined ? { userName: r.user_name } : {}),
  };
}

function rowToCalendarEntry(r: LeaveCalendarRow): LeaveCalendarEntry {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    leaveTypeId: r.leave_type_id,
    leaveTypeLibelle: r.leave_type_libelle,
    leaveTypeColor: r.leave_type_color,
    startDate: isoDate(r.start_date),
    endDate: isoDate(r.end_date),
    startPeriod: r.start_period as LeavePeriod,
    endPeriod: r.end_period as LeavePeriod,
    days: Number(r.days),
    status: r.status as LeaveStatus,
  };
}

/**
 * Leave days = weekdays in [start,end], adjusted for half-day periods:
 *  - single day with an am/pm period counts 0.5;
 *  - a multi-day range loses 0.5 when it starts in the afternoon (pm) and 0.5
 *    when it ends in the morning (am).
 * A weekday that is a public holiday (in `holidays`) is not counted.
 *
 * `workingDays` (optional) restricts counting to the days the employee actually
 * works: a set of day-of-week indices (0=Sun..6=Sat, matching `dayOfWeek`). A
 * weekday NOT in the set counts 0 - the same skip already applied to weekends &
 * holidays - so the off-day of an 80% / 4-day week neither accrues nor spends a
 * leave day. When omitted, behaviour is the legacy "every Mon–Fri counts".
 */
export function computeLeaveDays(
  startDate: string,
  endDate: string,
  startPeriod: LeavePeriod,
  endPeriod: LeavePeriod,
  holidays?: Set<string>,
  workingDays?: Set<number>,
): number {
  const isHoliday = (iso: string): boolean => !!holidays?.has(iso);
  const isOffPattern = (iso: string): boolean => workingDays !== undefined && !workingDays.has(dayOfWeek(iso));
  if (startDate === endDate) {
    if (!isWeekday(startDate) || isHoliday(startDate) || isOffPattern(startDate)) return 0;
    return startPeriod !== 'full' || endPeriod !== 'full' ? 0.5 : 1;
  }
  let days: number;
  if (workingDays === undefined) {
    days = countWeekdays(startDate, endDate, undefined, undefined, holidays);
  } else {
    days = 0;
    for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
      if (isWeekday(d) && !isHoliday(d) && !isOffPattern(d)) days++;
    }
  }
  if (startPeriod === 'pm' && isWeekday(startDate) && !isHoliday(startDate) && !isOffPattern(startDate)) days -= 0.5;
  if (endPeriod === 'am' && isWeekday(endDate) && !isHoliday(endDate) && !isOffPattern(endDate)) days -= 0.5;
  return days;
}

/** Standard Mon–Fri working week as day-of-week indices (0=Sun..6=Sat). */
const DEFAULT_WORKING_DAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

/**
 * Day-of-week indices (0=Sun..6=Sat) the employee works, derived from a contrat
 * `workPattern` ([Mon..Sun] expected minutes; a day with >0 min is "worked").
 * `null`/missing pattern → the standard Mon–Fri week (legacy behaviour).
 */
export function workingDaysFromPattern(pattern: number[] | null | undefined): Set<number> {
  if (!Array.isArray(pattern)) return new Set(DEFAULT_WORKING_DAYS);
  const set = new Set<number>();
  for (let i = 0; i < 7; i++) {
    // pattern index Mon=0..Sun=6 → dayOfWeek Mon=1..Sat=6, Sun=0.
    if ((pattern[i] ?? 0) > 0) set.add((i + 1) % 7);
  }
  return set;
}

/** Resolve a user's worked weekdays from their contrat's work pattern (tenant-scoped). */
async function workingDaysForUser(tenantId: number, userId: number): Promise<Set<number>> {
  const user = await userService.getById(userId, tenantId);
  const contrat = user?.contratId ? await contratService.getById(user.contratId, tenantId) : null;
  return workingDaysFromPattern(contrat?.workPattern);
}

export interface LeaveRequestInput {
  userId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  startPeriod?: LeavePeriod;
  endPeriod?: LeavePeriod;
  motif?: string | null;
}

export const leaveRequestService = {
  async getForUser(tenantId: number, userId: number): Promise<LeaveRequest[]> {
    const rows = await db<LeaveRequestRow>('leave_requests')
      .where({ tenant_id: tenantId, user_id: userId })
      .orderBy('start_date', 'desc');
    return rows.map(rowToLeaveRequest);
  },

  async getById(id: number, tenantId: number): Promise<LeaveRequest | null> {
    const row = await db<LeaveRequestRow>('leave_requests').where({ id, tenant_id: tenantId }).first();
    return row ? rowToLeaveRequest(row) : null;
  },

  /** Pending requests for a manager's reports (or whole tenant for admin), enriched with the
   *  requester's display name (COALESCE(display_name, username)). */
  async getPending(tenantId: number, managerId: number | null): Promise<LeaveRequest[]> {
    const q = db<LeaveRequestRow>('leave_requests as lr')
      .join('users as u', 'u.id', 'lr.user_id')
      .where({ 'lr.tenant_id': tenantId, 'lr.status': 'en_attente' })
      .orderBy('lr.start_date')
      .select('lr.*', db.raw('COALESCE(u.display_name, u.username) as user_name'));
    if (managerId !== null) {
      q.whereIn('lr.user_id', db('users').select('id').where({ manager_id: managerId, tenant_id: tenantId }));
    }
    return (await q).map(rowToLeaveRequest);
  },

  /**
   * Approved + pending leave for a team calendar over a YYYY-MM month, joined
   * with user + leave type. Scoped like getPending (manager → reports, admin →
   * whole tenant). Includes any request overlapping the month.
   */
  async getCalendar(tenantId: number, managerId: number | null, month: string): Promise<LeaveCalendarEntry[]> {
    const monthStart = `${month}-01`;
    const [y, m] = month.split('-').map(Number);
    const nextMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    const q = db<LeaveRequestRow>('leave_requests as lr')
      .join('users as u', 'u.id', 'lr.user_id')
      .join('leave_types as lt', 'lt.id', 'lr.leave_type_id')
      .where('lr.tenant_id', tenantId)
      .whereIn('lr.status', ['valide', 'en_attente'])
      .andWhere('lr.start_date', '<', nextMonthStart)
      .andWhere('lr.end_date', '>=', monthStart)
      .orderBy('lr.start_date')
      .select(
        'lr.id',
        'lr.user_id',
        'lr.leave_type_id',
        'lr.start_date',
        'lr.end_date',
        'lr.start_period',
        'lr.end_period',
        'lr.days',
        'lr.status',
        'lt.libelle as leave_type_libelle',
        'lt.color as leave_type_color',
        db.raw('COALESCE(u.display_name, u.username) as user_name'),
      );
    if (managerId !== null) {
      q.whereIn('lr.user_id', db('users').select('id').where({ manager_id: managerId, tenant_id: tenantId }));
    }
    const rows = (await q) as unknown as LeaveCalendarRow[];
    return rows.map(rowToCalendarEntry);
  },

  async create(tenantId: number, data: LeaveRequestInput): Promise<LeaveRequest> {
    const startPeriod: LeavePeriod = data.startPeriod ?? 'full';
    const endPeriod: LeavePeriod = data.endPeriod ?? 'full';
    const holidays = await holidayService.getSet(tenantId, data.startDate, addDays(data.endDate, 1));
    const workingDays = await workingDaysForUser(tenantId, data.userId);
    const days = computeLeaveDays(data.startDate, data.endDate, startPeriod, endPeriod, holidays, workingDays);
    // Keep the legacy half_day flag in sync (single-day am/pm request).
    const halfDay =
      data.halfDay ?? (data.startDate === data.endDate && (startPeriod !== 'full' || endPeriod !== 'full'));
    const [row] = await db<LeaveRequestRow>('leave_requests')
      .insert({
        tenant_id: tenantId,
        user_id: data.userId,
        leave_type_id: data.leaveTypeId,
        start_date: data.startDate,
        end_date: data.endDate,
        half_day: halfDay,
        start_period: startPeriod,
        end_period: endPeriod,
        days,
        motif: data.motif ?? null,
        status: 'en_attente',
      })
      .returning('*');
    return rowToLeaveRequest(row);
  },

  async decide(
    id: number,
    tenantId: number,
    deciderId: number,
    decision: 'valide' | 'refuse',
    comment?: string | null,
  ): Promise<LeaveRequest | null> {
    const [row] = await db<LeaveRequestRow>('leave_requests')
      .where({ id, tenant_id: tenantId })
      .update({
        status: decision,
        decided_by: deciderId,
        decided_at: new Date(),
        decision_comment: comment ?? null,
        updated_at: db.fn.now(),
      })
      .returning('*');
    return row ? rowToLeaveRequest(row) : null;
  },

  async cancel(id: number, tenantId: number): Promise<LeaveRequest | null> {
    const [row] = await db<LeaveRequestRow>('leave_requests')
      .where({ id, tenant_id: tenantId })
      .update({ status: 'annule', updated_at: db.fn.now() })
      .returning('*');
    return row ? rowToLeaveRequest(row) : null;
  },

  /** Approved leave requests overlapping [from, to) (for the planning calc). */
  async getApprovedOverlapping(
    tenantId: number,
    userId: number,
    from: string,
    toExclusive: string,
  ): Promise<LeaveRequest[]> {
    const rows = await db<LeaveRequestRow>('leave_requests')
      .where({ tenant_id: tenantId, user_id: userId, status: 'valide' })
      .andWhere('start_date', '<', toExclusive)
      .andWhere('end_date', '>=', from);
    return rows.map(rowToLeaveRequest);
  },

  /**
   * Per-type balances for a user, scoped to each type's ACTIVE acquisition period.
   *
   * The period for "today" is [periodStart, periodEnd): periodStart = the most
   * recent 1st-of-`periodStartMonth` on/before today (this year if today's month
   * ≥ periodStartMonth, else last year); periodEnd = periodStart + 12 months.
   *
   * `acquired` = for 'monthly' types, `min(12, monthsElapsed) × rate` (running
   * accrual to-date, e.g. CP 2,5 j/mois); for 'fixed_annual' types, `allowanceDays`.
   * `consumed`/`pending` = Σ days of valide/en_attente requests whose start_date
   * falls within the period. `remaining = acquired − consumed` (null when untracked).
   *
   * NOTE: proration by hire date and N-1 carryover are later items - accrual
   * starts at periodStart regardless of hire date for now.
   */
  async balancesForUser(tenantId: number, userId: number): Promise<LeaveBalance[]> {
    const types = await db('leave_types')
      .where({ tenant_id: tenantId })
      .select('id', 'allowance_days', 'accrual_mode', 'accrual_rate_per_month', 'period_start_month');
    // Each type can anchor on a different month, so windows differ per type - fetch
    // the user's tracked requests once and scope per type in memory.
    const reqs = await db<LeaveRequestRow>('leave_requests')
      .where({ tenant_id: tenantId, user_id: userId })
      .whereIn('status', ['valide', 'en_attente'])
      .select('leave_type_id', 'start_date', 'days', 'status');

    // Server runtime - plain UTC Date math (new Date() is fine here).
    const now = new Date();
    const todayY = now.getUTCFullYear();
    const todayM = now.getUTCMonth(); // 0–11

    return types.map(
      (t: {
        id: number;
        allowance_days: string | number | null;
        accrual_mode: string;
        accrual_rate_per_month: string | number | null;
        period_start_month: number;
      }) => {
        const allowance = t.allowance_days != null ? Number(t.allowance_days) : null;
        const rate = t.accrual_rate_per_month != null ? Number(t.accrual_rate_per_month) : null;
        const startMonthIdx = t.period_start_month - 1; // 0–11

        // Active acquisition period [periodStart, periodEnd).
        const startYear = todayM >= startMonthIdx ? todayY : todayY - 1;
        const periodStart = isoDate(new Date(Date.UTC(startYear, startMonthIdx, 1)));
        const periodEnd = isoDate(new Date(Date.UTC(startYear + 1, startMonthIdx, 1)));

        // Months acquired so far this period, counting the current month (the anchor
        // month already credits one rate), clamped to 1–12 → CP 2,5 j/mois reaches 30.
        const monthsElapsed = (todayY - startYear) * 12 + (todayM - startMonthIdx) + 1;
        const acquired =
          t.accrual_mode === 'monthly' && rate != null
            ? Math.round(Math.min(12, monthsElapsed) * rate * 10) / 10
            : allowance;

        let consumed = 0;
        let pending = 0;
        for (const r of reqs) {
          if (r.leave_type_id !== t.id) continue;
          const start = isoDate(r.start_date);
          if (start < periodStart || start >= periodEnd) continue;
          if (r.status === 'valide') consumed += Number(r.days);
          else if (r.status === 'en_attente') pending += Number(r.days);
        }

        // Non-Jan periods straddle two civil years (e.g. "2026/2027"); a
        // Jan-anchored period maps to a single civil year (e.g. "2026").
        const periodLabel = t.period_start_month !== 1 ? `${startYear}/${startYear + 1}` : `${startYear}`;

        return {
          leaveTypeId: t.id,
          allowanceDays: allowance,
          acquiredDays: acquired,
          consumedDays: consumed,
          pendingDays: pending,
          remainingDays: acquired != null ? Math.round((acquired - consumed) * 10) / 10 : null,
          periodLabel,
        };
      },
    );
  },
};
