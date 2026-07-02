import { db } from '../db';
import type {
  User,
  ReportSummary,
  ReportByProject,
  ReportByUser,
  AstreinteQuinzaineReport,
  AstreinteQuinzaineCol,
  AstreinteQuinzaineRow,
} from '@obliplan/shared';
import { boardService } from './kanban.service';
import { userService } from './user.service';
import { recupService } from './recup.service';
import { contratService } from './contrat.service';
import { holidayService } from './holiday.service';
import { leaveRequestService } from './leaveRequest.service';
import { leaveTypeService } from './leaveType.service';
import { expectedMinutesForDay, shiftAstreinteMinutes } from './calc.service';
import { rowToShift } from './shift.service';
import { addDays, todayIso, quinzaineStart } from '../utils/date';

/** The session actor driving reporting scope (admin/platformAdmin see the whole tenant). */
export interface ReportActor {
  userId: number;
  role: string;
  platformAdmin: boolean;
}

interface ReportScope {
  users: User[];
  userIds: number[];
  boardIds: number[];
}

/**
 * Cross-cutting, read-only management reporting aggregators (the Rapports hub).
 * Everything is tenant-scoped and limited to the actor's people-scope: an
 * admin/platformAdmin reports on the whole tenant, a manager on their direct
 * reports. Reads existing planning/time/overtime/récup/leave data - no migration.
 *
 * Planned hours (`plannedMin`) are computed DAY-PRECISE over [from, toExcl): the
 * contract's expected minutes per worked day (work-pattern aware), minus public
 * holidays and approved reducesAttendu leave falling in range - so it covers the
 * exact same days as trackedMin (no whole-week over-counting at the boundaries).
 */
export const reportingService = {
  /** Scope users (admin → tenant, manager → reports; ACTIVE only) + the actor's visible boards. */
  async resolveScope(tenantId: number, actor: ReportActor): Promise<ReportScope> {
    const isAdmin = actor.platformAdmin || actor.role === 'admin';
    const all = isAdmin
      ? await userService.getByTenant(tenantId)
      : await userService.getTeam(actor.userId, tenantId);
    const users = all.filter((u) => u.isActive); // deactivated members are out of scope
    const boards = await boardService.listVisible(tenantId, {
      userId: actor.userId,
      role: isAdmin ? 'admin' : actor.role,
    });
    return { users, userIds: users.map((u) => u.id), boardIds: boards.map((b) => b.id) };
  },

  /** Σ expected (attendu) minutes for one user over the in-range days, day-precise. */
  async plannedMinForUser(tenantId: number, user: User, from: string, toExcl: string): Promise<number> {
    const contrat = user.contratId ? await contratService.getById(user.contratId, tenantId) : null;
    if (!contrat) return 0;
    const [holidays, leaves, leaveTypes] = await Promise.all([
      holidayService.getSet(tenantId, from, toExcl),
      leaveRequestService.getApprovedOverlapping(tenantId, user.id, from, toExcl),
      leaveTypeService.getAll(tenantId),
    ]);
    const reduces = new Set(leaveTypes.filter((t) => t.reducesAttendu).map((t) => t.id));
    const leaveDays = new Set<string>();
    for (const lv of leaves) {
      if (!reduces.has(lv.leaveTypeId)) continue;
      for (let d = lv.startDate < from ? from : lv.startDate; d <= lv.endDate && d < toExcl; d = addDays(d, 1)) {
        leaveDays.add(d);
      }
    }
    let total = 0;
    for (let iso = from; iso < toExcl; iso = addDays(iso, 1)) {
      const exp = expectedMinutesForDay(contrat, iso);
      if (exp <= 0 || holidays.has(iso) || leaveDays.has(iso)) continue;
      total += exp;
    }
    return total;
  },

  /** Σ finished (is_running=false) tracked minutes for scope users in [from, toExcl). */
  async trackedMinFor(tenantId: number, userIds: number[], from: string, toExcl: string): Promise<number> {
    if (userIds.length === 0) return 0;
    const row = await db('time_entries')
      .where('tenant_id', tenantId)
      .whereIn('user_id', userIds)
      .andWhere('is_running', false)
      .andWhere('spent_on', '>=', from)
      .andWhere('spent_on', '<', toExcl)
      .first<{ total: string | number | null }>(db.raw('COALESCE(SUM(minutes), 0) as total'));
    return Number(row?.total ?? 0);
  },

  /** Σ validated overtime minutes for scope users in [from, toExcl). */
  async overtimeMinFor(tenantId: number, userIds: number[], from: string, toExcl: string): Promise<number> {
    if (userIds.length === 0) return 0;
    const row = await db('overtime_declarations')
      .where('tenant_id', tenantId)
      .whereIn('user_id', userIds)
      .andWhere('status', 'valide')
      .andWhere('date', '>=', from)
      .andWhere('date', '<', toExcl)
      .first<{ total: string | number | null }>(db.raw('COALESCE(SUM(minutes), 0) as total'));
    return Number(row?.total ?? 0);
  },

  /** KPI summary over the actor's scope for [from, toExcl). */
  async summary(tenantId: number, actor: ReportActor, from: string, toExcl: string): Promise<ReportSummary> {
    const { users, userIds } = await this.resolveScope(tenantId, actor);

    const [trackedMin, overtimeMin, plannedPerUser, recupPerUser, leaveDaysUpcoming] = await Promise.all([
      this.trackedMinFor(tenantId, userIds, from, toExcl),
      this.overtimeMinFor(tenantId, userIds, from, toExcl),
      Promise.all(users.map((u) => this.plannedMinForUser(tenantId, u, from, toExcl))),
      Promise.all(users.map((u) => recupService.soldeForUser(tenantId, u.id))),
      this.leaveDaysUpcoming(tenantId, userIds),
    ]);

    return {
      from,
      to: toExcl,
      trackedMin,
      plannedMin: plannedPerUser.reduce((a, b) => a + b, 0),
      overtimeMin,
      recupBalanceMin: recupPerUser.reduce((a, b) => a + b, 0),
      leaveDaysUpcoming,
      activeUsers: userIds.length,
    };
  },

  /** Σ approved leave days starting within the next 30 days for scope users. */
  async leaveDaysUpcoming(tenantId: number, userIds: number[]): Promise<number> {
    if (userIds.length === 0) return 0;
    const today = todayIso();
    const horizon = addDays(today, 30);
    const row = await db('leave_requests')
      .where('tenant_id', tenantId)
      .whereIn('user_id', userIds)
      .andWhere('status', 'valide')
      .andWhere('start_date', '>=', today)
      .andWhere('start_date', '<', horizon)
      .first<{ total: string | number | null }>(db.raw('COALESCE(SUM(days), 0) as total'));
    return Number(row?.total ?? 0);
  },

  /** Tracked time grouped by project (board) for scope users in [from, toExcl), desc. */
  async byProject(tenantId: number, actor: ReportActor, from: string, toExcl: string): Promise<ReportByProject[]> {
    const { userIds, boardIds } = await this.resolveScope(tenantId, actor);
    if (userIds.length === 0 || boardIds.length === 0) return [];
    // Inner-join boards → only entries tied to a tenant board contribute (a null
    // board_id or cross-tenant ref is excluded); left-join clients for the name.
    const rows = await db('time_entries as te')
      .join('boards as b', function () {
        this.on('b.id', 'te.board_id').andOn('b.tenant_id', 'te.tenant_id');
      })
      .leftJoin('clients as c', function () {
        this.on('c.id', 'b.client_id').andOn('c.tenant_id', 'b.tenant_id');
      })
      .where('te.tenant_id', tenantId)
      .whereIn('te.user_id', userIds)
      .whereIn('te.board_id', boardIds) // only boards the actor can see (not just any tenant board)
      .andWhere('te.is_running', false)
      .andWhere('te.spent_on', '>=', from)
      .andWhere('te.spent_on', '<', toExcl)
      .groupBy('b.id', 'b.name', 'c.name')
      .select<{ board_id: number; board_name: string; client_name: string | null; tracked_min: string | number; entry_count: string | number }[]>(
        'b.id as board_id',
        'b.name as board_name',
        'c.name as client_name',
        db.raw('COALESCE(SUM(te.minutes), 0) as tracked_min'),
        db.raw('COUNT(*) as entry_count'),
      )
      .orderBy('tracked_min', 'desc');
    return rows.map((r) => ({
      boardId: r.board_id,
      boardName: r.board_name,
      clientName: r.client_name ?? null,
      trackedMin: Number(r.tracked_min),
      entryCount: Number(r.entry_count),
    }));
  },

  /** Per-employee tracked vs planned (attendu) time and overtime for [from, toExcl). */
  async byUser(tenantId: number, actor: ReportActor, from: string, toExcl: string): Promise<ReportByUser[]> {
    const { users, userIds } = await this.resolveScope(tenantId, actor);
    if (users.length === 0) return [];

    // Per-user tracked & overtime totals in two grouped passes (users with none → 0).
    const trackedRows = await db('time_entries')
      .where('tenant_id', tenantId)
      .whereIn('user_id', userIds)
      .andWhere('is_running', false)
      .andWhere('spent_on', '>=', from)
      .andWhere('spent_on', '<', toExcl)
      .groupBy('user_id')
      .select('user_id')
      .sum<{ user_id: number; total: string }[]>({ total: 'minutes' });
    const overtimeRows = await db('overtime_declarations')
      .where('tenant_id', tenantId)
      .whereIn('user_id', userIds)
      .andWhere('status', 'valide')
      .andWhere('date', '>=', from)
      .andWhere('date', '<', toExcl)
      .groupBy('user_id')
      .select('user_id')
      .sum<{ user_id: number; total: string }[]>({ total: 'minutes' });
    const trackedMap = new Map(trackedRows.map((r) => [r.user_id, Number(r.total)]));
    const overtimeMap = new Map(overtimeRows.map((r) => [r.user_id, Number(r.total)]));

    const rows = await Promise.all(
      users.map(async (u): Promise<ReportByUser> => {
        const trackedMin = trackedMap.get(u.id) ?? 0;
        const plannedMin = await this.plannedMinForUser(tenantId, u, from, toExcl);
        return {
          userId: u.id,
          userName: u.displayName ?? u.username,
          trackedMin,
          plannedMin,
          overtimeMin: overtimeMap.get(u.id) ?? 0,
          ecartMin: trackedMin - plannedMin,
        };
      }),
    );
    return rows.sort((a, b) => a.userName.localeCompare(b.userName));
  },

  /**
   * Astreinte (on-call) aggregated per fortnight ('quinzaine'), per employee, over
   * [from, toExcl). Fortnights are anchored deterministically (see quinzaineStart);
   * each validated `astreinte` shift contributes its span in minutes and one
   * "déclenchement" to the fortnight containing its date. Only scope users with at
   * least one on-call shift appear in `rows` (this is an astreinte-specific report).
   */
  async astreinteByQuinzaine(
    tenantId: number,
    actor: ReportActor,
    from: string,
    toExcl: string,
  ): Promise<AstreinteQuinzaineReport> {
    const { users, userIds } = await this.resolveScope(tenantId, actor);

    // Enumerate every fortnight overlapping the period so the grid is stable.
    const quinzaines: AstreinteQuinzaineCol[] = [];
    for (let qs = quinzaineStart(from); qs < toExcl; qs = addDays(qs, 14)) {
      quinzaines.push({ start: qs, end: addDays(qs, 13) });
    }
    if (userIds.length === 0) return { quinzaines, rows: [] };

    const shiftRows = await db('shifts')
      .where({ tenant_id: tenantId, statut: 'valide', type: 'astreinte' })
      .whereIn('user_id', userIds)
      .andWhere('date', '>=', from)
      .andWhere('date', '<', toExcl);

    // Bucket by (userId | fortnight-start) → summed minutes + shift count.
    const bucket = new Map<string, { minutes: number; count: number }>();
    for (const r of shiftRows) {
      const s = rowToShift(r);
      const min = shiftAstreinteMinutes(s);
      if (min <= 0) continue;
      const key = `${s.userId}|${quinzaineStart(s.date)}`;
      const cur = bucket.get(key) ?? { minutes: 0, count: 0 };
      cur.minutes += min;
      cur.count += 1;
      bucket.set(key, cur);
    }

    const rows: AstreinteQuinzaineRow[] = users
      .map((u) => {
        const cells = quinzaines.map((q) => {
          const c = bucket.get(`${u.id}|${q.start}`) ?? { minutes: 0, count: 0 };
          return { start: q.start, minutes: c.minutes, count: c.count };
        });
        return {
          userId: u.id,
          userName: u.displayName ?? u.username,
          cells,
          totalMin: cells.reduce((sum, c) => sum + c.minutes, 0),
          totalCount: cells.reduce((sum, c) => sum + c.count, 0),
        };
      })
      .filter((r) => r.totalCount > 0)
      .sort((a, b) => a.userName.localeCompare(b.userName));

    return { quinzaines, rows };
  },
};
