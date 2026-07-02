import type { Shift, User, WeeklyCounter, ComplianceFlag, TeamOverviewDTO, TeamOverviewMember } from '@obliplan/shared';
import { db } from '../db';
import { contratService } from './contrat.service';
import { shiftService, rowToShift } from './shift.service';
import { jourEcoleService } from './jourEcole.service';
import { recupService } from './recup.service';
import { userService } from './user.service';
import { leaveRequestService, workingDaysFromPattern } from './leaveRequest.service';
import { leaveTypeService } from './leaveType.service';
import { holidayService } from './holiday.service';
import { computeWeeklyCounter, feriesInWeek } from './calc.service';
import { complianceService } from './compliance.service';
import { notify, emailFor } from './notify';
import { mondayOf, addDays, isWeekday, dayOfWeek } from '../utils/date';

export interface UserWeek {
  user: User;
  shifts: Shift[];
  counter: WeeklyCounter;
  recupSoldeMin: number;
  /** Non-blocking working-time compliance flags for the week. */
  flags: ComplianceFlag[];
  /**
   * The (id, name) of every project (board) referenced by THIS week's shifts, tenant-scoped.
   * Privacy: only boards the user is actually assigned hours on are exposed, and only their
   * id + name (nothing else). Empty when no shift of the week carries a board.
   */
  boards: { id: number; name: string }[];
  /**
   * The hour-types referenced by THIS week's shifts, tenant-scoped (mirrors `boards`): id,
   * libellé and color. Lets the client colour each worked créneau by its hour-type. Empty when
   * no shift of the week carries an hour-type.
   */
  hourTypes: { id: number; libelle: string; color: string | null }[];
  /**
   * ISO dates in [monday, monday+7) that are public holidays this week (sorted). Purely a
   * visual day-marker: shifts still render on a jour férié and remain addable/editable.
   */
  holidays: string[];
  /**
   * The Axis-C `user_teams` ids this employee belongs to (tenant-scoped), so the client can
   * group/filter rows by team. `getUserWeek` returns `[]`; the team grids (`getTeamWeek`) fill
   * it via a single batch query. An employee in several teams keeps ONE row carrying every id.
   */
  teamIds: number[];
}

export const planningService = {
  /** Full week view for a single user: shifts + computed counter + récup balance. */
  async getUserWeek(tenantId: number, user: User, monday: string): Promise<UserWeek> {
    const sunday = addDays(monday, 6);
    const weekEndExclusive = addDays(monday, 7);
    const [shifts, joursEcole, contrat, recupSoldeMin, leaves, leaveTypes, holidays] = await Promise.all([
      shiftService.getForUserWeek(tenantId, user.id, monday),
      jourEcoleService.getForUser(tenantId, user.id),
      user.contratId ? contratService.getById(user.contratId, tenantId) : Promise.resolve(null),
      recupService.soldeForUser(tenantId, user.id),
      leaveRequestService.getApprovedOverlapping(tenantId, user.id, monday, weekEndExclusive),
      leaveTypeService.getAll(tenantId),
      holidayService.getSet(tenantId, monday, weekEndExclusive),
    ]);

    // Public holidays on a WORKED weekday reduce the expected weekly hours (pattern-aware).
    const feriesCount = feriesInWeek(holidays, monday, contrat);

    // Approved leave on `reducesAttendu` types reduces the expected weekly hours, counting
    // only days the employee actually works (a structural off-day / weekend / holiday is skipped).
    const reduces = new Set(leaveTypes.filter((t) => t.reducesAttendu).map((t) => t.id));
    const workingDays = workingDaysFromPattern(contrat?.workPattern);
    const isWorkedDay = (iso: string) => isWeekday(iso) && !holidays.has(iso) && workingDays.has(dayOfWeek(iso));
    let leaveDays = 0;
    for (const lv of leaves) {
      if (!reduces.has(lv.leaveTypeId)) continue;
      if (lv.halfDay && lv.startDate === lv.endDate) {
        if (lv.startDate >= monday && lv.startDate <= sunday && isWorkedDay(lv.startDate)) leaveDays += 0.5;
      } else {
        const from = lv.startDate < monday ? monday : lv.startDate;
        const to = lv.endDate > sunday ? sunday : lv.endDate;
        for (let d = from; d <= to; d = addDays(d, 1)) {
          if (isWorkedDay(d)) leaveDays += 1;
        }
      }
    }

    const counter = computeWeeklyCounter({
      userId: user.id,
      monday,
      contrat,
      shifts,
      joursEcole,
      leaveDays,
      feriesCount,
    });
    const flags = complianceService.computeFlags({ monday, contrat, shifts });

    // Projects (boards) referenced by this week's shifts - tenant-scoped, id+name only.
    // The employee sees the project NAME of their concerned créneaux, nothing more; a board
    // no shift points at is never fetched, so unrelated/cross-tenant boards can't leak.
    const boardIds = [...new Set(shifts.map((s) => s.boardId).filter((id): id is number => id != null))];
    const boards = boardIds.length
      ? await db('boards')
          .whereIn('id', boardIds)
          .where('tenant_id', tenantId)
          .orderBy('name')
          .select<{ id: number; name: string }[]>('id', 'name')
      : [];

    // Hour-types referenced by this week's shifts - tenant-scoped, id+libelle+color only
    // (mirror the boards fetch). Lets the client colour each worked créneau by its hour-type.
    const hourTypeIds = [...new Set(shifts.map((s) => s.hourTypeId).filter((id): id is number => id != null))];
    const hourTypes = hourTypeIds.length
      ? await db('hour_types')
          .whereIn('id', hourTypeIds)
          .where('tenant_id', tenantId)
          .orderBy('libelle')
          .select<{ id: number; libelle: string; color: string | null }[]>('id', 'libelle', 'color')
      : [];

    return {
      user,
      shifts,
      counter,
      recupSoldeMin,
      flags,
      boards,
      hourTypes,
      holidays: [...holidays].sort(),
      teamIds: [],
    };
  },

  /**
   * Batch-resolve the Axis-C team ids (`user_teams`) each of the given users belongs to,
   * tenant-scoped, in ONE query joining `team_memberships` -> `user_teams` filtered by
   * `user_teams.tenant_id`. Returns a Map<userId, number[]> (each list ordered by team id);
   * a user with no team is simply absent from the map. Used to enrich the team grids without
   * an N+1 fan-out.
   */
  async teamIdsByUser(tenantId: number, userIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (userIds.length === 0) return map;
    const rows = await db<{ user_id: number; team_id: number }>('team_memberships as tm')
      .join('user_teams as ut', 'ut.id', 'tm.team_id')
      .where('ut.tenant_id', tenantId)
      .whereIn('tm.user_id', userIds)
      .orderBy(['tm.user_id', 'ut.id'])
      .select('tm.user_id', 'ut.id as team_id');
    for (const r of rows) {
      const list = map.get(r.user_id) ?? [];
      list.push(r.team_id);
      map.set(r.user_id, list);
    }
    return map;
  },

  /** All weeks (Mon-Sun) intersecting a calendar month, for one user. */
  async getUserMonth(tenantId: number, user: User, month: string): Promise<UserWeek[]> {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // last day of month m (1-based)
    const weeks: UserWeek[] = [];
    let monday = mondayOf(`${month}-01`);
    while (monday <= lastDay) {
      weeks.push(await this.getUserWeek(tenantId, user, monday));
      monday = addDays(monday, 7);
    }
    return weeks;
  },

  /**
   * Clone every shift of the `fromMonday` week into the `toMonday` week for the given users,
   * as drafts (statut 'brouillon'). Returns the number of shifts created.
   */
  async copyWeek(
    tenantId: number,
    actorId: number,
    fromMonday: string,
    toMonday: string,
    userIds: number[],
  ): Promise<number> {
    const offsetDays = Math.round((Date.parse(toMonday) - Date.parse(fromMonday)) / 86_400_000);
    if (!Number.isFinite(offsetDays) || offsetDays === 0 || userIds.length === 0) return 0;
    const shifts = await shiftService.getForUsersWeek(tenantId, userIds, fromMonday);
    let count = 0;
    for (const s of shifts) {
      await shiftService.create(tenantId, actorId, {
        userId: s.userId,
        date: addDays(s.date, offsetDays),
        heureDebut: s.heureDebut,
        heureFin: s.heureFin,
        pauseMin: s.pauseMin,
        type: s.type,
        statut: 'brouillon',
        note: s.note,
        hourTypeId: s.hourTypeId,
        boardId: s.boardId,
      });
      count++;
    }
    return count;
  },

  /**
   * Clone the given shifts (by id, tenant-scoped) onto (toUserId, toDate) as drafts
   * (statut 'brouillon'), preserving heureDebut/heureFin/pauseMin/type/note/hourTypeId/
   * boardId. The actor must be able to manage BOTH the source owner of each shift
   * (shifts whose owner the actor can't manage are skipped) AND the destination user.
   * Returns how many shifts were created.
   */
  async cloneShifts(
    tenantId: number,
    actor: { userId: number; role: string },
    shiftIds: number[],
    toUserId: number,
    toDate: string,
  ): Promise<{ count: number }> {
    if (shiftIds.length === 0) return { count: 0 };

    // The destination MUST be a member of the actor's tenant. canManage short-circuits to true
    // for admins without a membership check, so validate tenant membership explicitly (getById is
    // membership-scoped → null for a non-member) to refuse a cross-tenant destination.
    const dest = await userService.getById(toUserId, tenantId);
    if (!dest) return { count: 0 };

    // Cache canManage(target) - the same source owner typically repeats across ids.
    const manageCache = new Map<number, boolean>();
    const canManage = async (targetUserId: number): Promise<boolean> => {
      let ok = manageCache.get(targetUserId);
      if (ok === undefined) {
        ok = await userService.canManage(actor, targetUserId, tenantId);
        manageCache.set(targetUserId, ok);
      }
      return ok;
    };

    // Destination must be manageable (admins manage everyone). A destination equal to a
    // manageable source owner is allowed even if canManage(dest) is false on its own.
    const destManageable = await canManage(toUserId);

    let count = 0;
    for (const id of shiftIds) {
      const shift = await shiftService.getById(id, tenantId);
      if (!shift) continue; // wrong tenant / deleted
      if (!(await canManage(shift.userId))) continue; // actor can't manage the source owner
      if (!destManageable && toUserId !== shift.userId) continue; // destination not allowed
      await shiftService.create(tenantId, actor.userId, {
        userId: toUserId,
        date: toDate,
        heureDebut: shift.heureDebut,
        heureFin: shift.heureFin,
        pauseMin: shift.pauseMin,
        type: shift.type,
        statut: 'brouillon',
        note: shift.note,
        hourTypeId: shift.hourTypeId,
        boardId: shift.boardId,
      });
      count++;
    }
    return { count };
  },

  /**
   * Publish a week: flip every 'brouillon' shift of the given users in the
   * [monday, monday+7) window to 'valide', then best-effort notify each affected
   * employee (excluding the actor) that their planning is published. Returns how
   * many shifts were published and how many employees were notified.
   */
  async publishWeek(
    tenantId: number,
    actorId: number,
    monday: string,
    userIds: number[],
  ): Promise<{ published: number; notified: number }> {
    if (userIds.length === 0) return { published: 0, notified: 0 };
    const end = addDays(monday, 7);
    const rows = await db('shifts')
      .where({ tenant_id: tenantId, statut: 'brouillon' })
      .whereIn('user_id', userIds)
      .andWhere('date', '>=', monday)
      .andWhere('date', '<', end)
      .update({ statut: 'valide', updated_by: actorId, updated_at: db.fn.now() })
      .returning<{ user_id: number }[]>('user_id');

    const published = rows.length;
    const affected = [...new Set(rows.map((r) => r.user_id))].filter((uid) => uid !== actorId);
    const title = 'Votre planning est publié';
    const body = `Votre planning de la semaine du ${monday} a été publié.`;
    let notified = 0;
    for (const uid of affected) {
      try {
        await notify(tenantId, {
          recipientIds: [uid],
          actorId,
          type: 'planning.published',
          title,
          body,
          link: '/mon-planning',
          email: emailFor('Planning publié', { title, body, link: '/mon-planning' }),
        });
        notified++;
      } catch {
        // notify is best-effort; a notification failure must never break publish.
      }
    }
    return { published, notified };
  },

  /** Manager grid: each report's week. Admin passes the whole tenant. */
  async getTeamWeek(
    tenantId: number,
    actor: { userId: number; role: string },
    monday: string,
  ): Promise<UserWeek[]> {
    const members =
      actor.role === 'admin'
        ? await userService.getByTenant(tenantId)
        : await userService.getTeam(actor.userId, tenantId);
    const [weeks, teamMap] = await Promise.all([
      Promise.all(members.map((u) => this.getUserWeek(tenantId, u, monday))),
      this.teamIdsByUser(tenantId, members.map((u) => u.id)),
    ]);
    // One row per employee (keyed by user id); a multi-team user carries every id in a single row.
    return weeks.map((w) => ({ ...w, teamIds: teamMap.get(w.user.id) ?? [] }));
  },

  /**
   * Read-only "who works when" overview for EVERY employee (Phase 7a / #20), gated by
   * `planning:view_team`. Tenant-scoped: all ACTIVE members of the tenant, each with their
   * VALIDATED shifts (statut='valide') in the Mon..Sun week window. Privacy: the free-text
   * `note` is stripped from every shift, and NO counters/écart/compliance flags are exposed -
   * only shift times + type + hour-type. Drafts (brouillon) are never queried, so unpublished
   * schedules cannot leak. Members are sorted by displayName ?? username.
   */
  async getTeamOverview(tenantId: number, monday: string): Promise<TeamOverviewDTO> {
    const members = (await userService.getByTenant(tenantId)).filter((u) => u.isActive);
    const ids = members.map((u) => u.id);
    const end = addDays(monday, 7);

    const rows = ids.length
      ? await db('shifts')
          .where({ tenant_id: tenantId, statut: 'valide' })
          .whereIn('user_id', ids)
          .andWhere('date', '>=', monday)
          .andWhere('date', '<', end)
          .orderBy(['user_id', 'date', 'heure_debut'])
      : [];

    // Group validated shifts by owner, stripping the private free-text note.
    const byUser = new Map<number, Shift[]>();
    for (const r of rows) {
      const s = rowToShift(r);
      const list = byUser.get(s.userId) ?? [];
      list.push({ ...s, note: null });
      byUser.set(s.userId, list);
    }

    // Week-level public holidays (tenant-wide, not per-member): a purely visual day-marker
    // so the overview can flag jours fériés without blocking any shift.
    const holidays = await holidayService.getSet(tenantId, monday, end);

    const teamMap = await this.teamIdsByUser(tenantId, ids);
    const overviewMembers: TeamOverviewMember[] = members
      .map((u) => ({
        userId: u.id,
        displayName: u.displayName,
        username: u.username,
        shifts: byUser.get(u.id) ?? [],
        teamIds: teamMap.get(u.id) ?? [],
      }))
      .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));

    return { monday, members: overviewMembers, holidays: [...holidays].sort() };
  },
};
