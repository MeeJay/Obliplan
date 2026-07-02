import { db } from '../db';
import type { Shift, WeeklyCounter, LeaveBalance, LeaveType, User } from '@obliplan/shared';
import { planningService } from './planning.service';
import { leaveRequestService } from './leaveRequest.service';
import { leaveTypeService } from './leaveType.service';
import { overtimeDeclarationService } from './overtimeDeclaration.service';
import { rowToShift } from './shift.service';
import { mondayOf, todayIso } from '../utils/date';

/** Pending-approval counts - only populated when the caller can validate. */
export interface DashboardApprovals {
  pendingLeave: number;
  pendingOvertime: number;
}

/** Aggregated home dashboard for a single caller. */
export interface DashboardDTO {
  /** Monday (ISO) of the current week the counter covers. */
  weekStart: string;
  /** This week's computed counter (réalisé / attendu …). */
  counter: WeeklyCounter;
  /** Running récup balance in minutes. */
  recupSoldeMin: number;
  /** Next upcoming validated shift with a start time, or null. */
  nextShift: Shift | null;
  /** Per-type leave balances (allowance − consumed − pending). */
  leaveBalances: LeaveBalance[];
  /** Leave types (for labelling the balances client-side). */
  leaveTypes: LeaveType[];
  /** Manager/admin pending-approval counts, or null for plain employees. */
  approvals: DashboardApprovals | null;
}

export const dashboardService = {
  /** Build the home dashboard for `user`, scoped to `tenantId`. */
  async forUser(
    tenantId: number,
    user: User,
    actor: { userId: number; role: string; platformAdmin: boolean },
  ): Promise<DashboardDTO> {
    const today = todayIso();
    const monday = mondayOf(today);
    const canValidate = actor.role === 'manager' || actor.role === 'admin';
    // Admin / platform admin see the whole tenant; a manager only their reports.
    const managerId = actor.platformAdmin || actor.role === 'admin' ? null : actor.userId;

    const [week, leaveBalances, leaveTypes, nextShift, pendingLeave, pendingOvertime] = await Promise.all([
      planningService.getUserWeek(tenantId, user, monday),
      leaveRequestService.balancesForUser(tenantId, user.id),
      leaveTypeService.getAll(tenantId),
      this.nextShift(tenantId, user.id, today),
      canValidate ? leaveRequestService.getPending(tenantId, managerId) : Promise.resolve([]),
      canValidate ? overtimeDeclarationService.getPending(tenantId, managerId) : Promise.resolve([]),
    ]);

    return {
      weekStart: monday,
      counter: week.counter,
      recupSoldeMin: week.recupSoldeMin,
      nextShift,
      leaveBalances,
      leaveTypes,
      approvals: canValidate
        ? { pendingLeave: pendingLeave.length, pendingOvertime: pendingOvertime.length }
        : null,
    };
  },

  /** The next validated, timed shift on or after `fromIso` for a user. */
  async nextShift(tenantId: number, userId: number, fromIso: string): Promise<Shift | null> {
    const row = await db('shifts')
      .where({ tenant_id: tenantId, user_id: userId, statut: 'valide' })
      .andWhere('date', '>=', fromIso)
      .whereNotNull('heure_debut')
      .orderBy([
        { column: 'date', order: 'asc' },
        { column: 'heure_debut', order: 'asc' },
      ])
      .first();
    return row ? rowToShift(row as Parameters<typeof rowToShift>[0]) : null;
  },
};
