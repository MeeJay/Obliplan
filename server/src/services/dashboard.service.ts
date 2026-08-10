import { db } from '../db';
import type { WeeklyCounter, LeaveBalance, LeaveType, User, UpcomingShift } from '@obliplan/shared';
import { planningService } from './planning.service';
import { leaveRequestService } from './leaveRequest.service';
import { leaveTypeService } from './leaveType.service';
import { overtimeDeclarationService } from './overtimeDeclaration.service';
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
  /** Upcoming validated timed shifts (today onward, hour-type resolved) for the "mon créneau"
   *  widget. The client derives the in-progress / next one from the Paris clock. */
  upcoming: UpcomingShift[];
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

    const [week, leaveBalances, leaveTypes, upcoming, pendingLeave, pendingOvertime] = await Promise.all([
      planningService.getUserWeek(tenantId, user, monday),
      leaveRequestService.balancesForUser(tenantId, user.id),
      leaveTypeService.getAll(tenantId),
      this.upcomingShifts(tenantId, user.id, today),
      canValidate ? leaveRequestService.getPending(tenantId, managerId) : Promise.resolve([]),
      canValidate ? overtimeDeclarationService.getPending(tenantId, managerId) : Promise.resolve([]),
    ]);

    return {
      weekStart: monday,
      counter: week.counter,
      recupSoldeMin: week.recupSoldeMin,
      upcoming,
      leaveBalances,
      leaveTypes,
      approvals: canValidate
        ? { pendingLeave: pendingLeave.length, pendingOvertime: pendingOvertime.length }
        : null,
    };
  },

  /**
   * Validated timed shifts on or after `fromIso` (hour-type + project resolved), ordered by
   * date then start. Covers today's remaining shifts and the next working days, so the client
   * can show both the in-progress and the next shift (and, at day's end, the next day / Monday).
   */
  async upcomingShifts(tenantId: number, userId: number, fromIso: string): Promise<UpcomingShift[]> {
    const rows = await db('shifts as s')
      .leftJoin('hour_types as ht', 'ht.id', 's.hour_type_id')
      .leftJoin('boards as b', 'b.id', 's.board_id')
      .where({ 's.tenant_id': tenantId, 's.user_id': userId, 's.statut': 'valide' })
      .andWhere('s.date', '>=', fromIso)
      .whereNotNull('s.heure_debut')
      .whereNotNull('s.heure_fin')
      .orderBy([
        { column: 's.date', order: 'asc' },
        { column: 's.heure_debut', order: 'asc' },
      ])
      .limit(40)
      .select<
        {
          id: number;
          date: Date | string;
          heure_debut: string;
          heure_fin: string;
          type: string;
          ht_label: string | null;
          ht_color: string | null;
          board_name: string | null;
        }[]
      >(
        's.id',
        's.date',
        's.heure_debut',
        's.heure_fin',
        's.type',
        'ht.libelle as ht_label',
        'ht.color as ht_color',
        'b.name as board_name',
      );
    return rows.map((r) => ({
      id: r.id,
      date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date.toISOString().slice(0, 10),
      start: r.heure_debut.slice(0, 5),
      end: r.heure_fin.slice(0, 5),
      type: r.type as UpcomingShift['type'],
      hourTypeLabel: r.ht_label ?? null,
      hourTypeColor: r.ht_color ?? null,
      boardName: r.board_name ?? null,
    }));
  },
};
