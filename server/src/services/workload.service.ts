import { db } from '../db';
import type { WorkloadRow } from '@obliplan/shared';
import { boardService } from './kanban.service';
import { userService } from './user.service';
import { contratService } from './contrat.service';
import { leaveRequestService } from './leaveRequest.service';
import { mondayOf, addDays, countWeekdays, todayIso } from '../utils/date';

/** The session actor driving workload scope (admin/platformAdmin see the whole tenant). */
export interface WorkloadActor {
  userId: number;
  role: string;
  platformAdmin: boolean;
}

export const workloadService = {
  /**
   * Per-teammate active work vs weekly capacity (the "Charge" view).
   *
   * Members = admin/platformAdmin → the whole tenant, manager → their direct
   * reports. For each member, `assignedMin` = Σ estimate_min of their assigned
   * cards sitting in a NON-done column, scoped to the boards the actor may see
   * (admin → every tenant board; manager → own + reports' boards). `capacityMin`
   * = the member's contrat weekly base minutes minus this week's approved-leave
   * weekdays × (base/5), floored at 0. `overCount` = active cards with no
   * estimate (so the bar's honesty is visible). Rows are sorted by name.
   */
  async teamWorkload(tenantId: number, actor: WorkloadActor): Promise<WorkloadRow[]> {
    const isAdmin = actor.platformAdmin || actor.role === 'admin';
    const members = isAdmin
      ? await userService.getByTenant(tenantId)
      : await userService.getTeam(actor.userId, tenantId);

    // Boards the actor may see (tenant-scoped). Admin → every board of the tenant.
    const boards = await boardService.listVisible(tenantId, {
      userId: actor.userId,
      role: isAdmin ? 'admin' : actor.role,
    });
    const boardIds = boards.map((b) => b.id);

    // This week's Mon..Sun window (leave overlap uses the [monday, monday+7) half-open range).
    const monday = mondayOf(todayIso());
    const sunday = addDays(monday, 6);
    const weekEndExclusive = addDays(monday, 7);

    const rows = await Promise.all(
      members.map(async (m): Promise<WorkloadRow> => {
        const userName = m.displayName ?? m.username;

        // Active assigned work = the member's cards in a non-done column, within visible boards.
        // whereIn([]) yields no rows, so a boardless actor correctly gets zero load.
        const agg = boardIds.length
          ? await db('cards as c')
              .join('board_columns as col', 'col.id', 'c.column_id')
              .where('c.tenant_id', tenantId)
              .andWhere('c.assignee_id', m.id)
              .andWhere('col.is_done', false)
              .whereIn('c.board_id', boardIds)
              .first<{ assigned_min: string | number | null; card_count: string | number; over_count: string | number }>(
                db.raw('COALESCE(SUM(COALESCE(c.estimate_min, 0)), 0) as assigned_min'),
                db.raw('COUNT(*) as card_count'),
                db.raw('COUNT(*) FILTER (WHERE c.estimate_min IS NULL) as over_count'),
              )
          : null;
        const assignedMin = Number(agg?.assigned_min ?? 0);
        const cardCount = Number(agg?.card_count ?? 0);
        const overCount = Number(agg?.over_count ?? 0);

        // Weekly capacity = contrat base minutes − this-week approved-leave weekdays × (base/5).
        const contrat = m.contratId ? await contratService.getById(m.contratId, tenantId) : null;
        const baseMin = contrat?.heuresHebdoBaseMin ?? 0;
        const leaves = await leaveRequestService.getApprovedOverlapping(tenantId, m.id, monday, weekEndExclusive);
        let leaveWeekdays = 0;
        for (const lv of leaves) leaveWeekdays += countWeekdays(lv.startDate, lv.endDate, monday, sunday);
        leaveWeekdays = Math.min(leaveWeekdays, 5); // cap at a full week off
        const capacityMin = Math.max(0, Math.round(baseMin - leaveWeekdays * (baseMin / 5)));

        return { userId: m.id, userName, assignedMin, capacityMin, cardCount, overCount };
      }),
    );

    return rows.sort((a, b) => a.userName.localeCompare(b.userName));
  },
};
