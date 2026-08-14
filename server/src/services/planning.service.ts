import type {
  Shift,
  User,
  WeeklyCounter,
  ComplianceFlag,
  TeamOverviewDTO,
  TeamOverviewMember,
  PlanningAppointment,
} from '@obliplan/shared';
import { db } from '../db';
import { contratService } from './contrat.service';
import { shiftService, rowToShift } from './shift.service';
import { jourEcoleService } from './jourEcole.service';
import { recupService } from './recup.service';
import { userService } from './user.service';
import { leaveRequestService } from './leaveRequest.service';
import { leaveTypeService } from './leaveType.service';
import { holidayService, holidayAppliesTo } from './holiday.service';
import { computeWeeklyCounter } from './calc.service';
import { complianceService } from './compliance.service';
import { notify, emailFor } from './notify';
import { mondayOf, addDays } from '../utils/date';

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
   * Confirmed/pending meeting reservations landing on THIS employee's calendar this week,
   * carrying the external booker's name + e-mail. Surfaced read-only on the planning.
   */
  appointments: PlanningAppointment[];
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
    const weekEndExclusive = addDays(monday, 7);
    const [shifts, joursEcole, contrat, recupSoldeMin, leaves, leaveTypes, holidayRows] = await Promise.all([
      shiftService.getForUserWeek(tenantId, user.id, monday),
      jourEcoleService.getForUser(tenantId, user.id),
      user.contratId ? contratService.getById(user.contratId, tenantId) : Promise.resolve(null),
      recupService.soldeForUser(tenantId, user.id),
      leaveRequestService.getApprovedOverlapping(tenantId, user.id, monday, weekEndExclusive),
      leaveTypeService.getAll(tenantId),
      holidayService.getRows(tenantId, monday, weekEndExclusive),
    ]);

    // Only the public holidays of THIS employee's contract country apply (a MG contract does
    // not observe FR bank holidays, and vice-versa). Null-country holidays are universal.
    const pays = contrat?.pays ?? 'FR';
    const holidays = new Set(holidayRows.filter((r) => holidayAppliesTo(r.pays, pays)).map((r) => r.date));

    // Leave types flagged "réduit l'attendu". The counter neutralises each working day from ANY
    // source (public holiday / approved reducing leave / école / a drawn conge-absence-recup
    // block on the day), deduplicated per day so a day is never cancelled twice.
    const reduceLeaveTypeIds = new Set(leaveTypes.filter((t) => t.reducesAttendu).map((t) => t.id));

    const counter = computeWeeklyCounter({
      userId: user.id,
      monday,
      contrat,
      shifts,
      joursEcole,
      holidays,
      leaves,
      reduceLeaveTypeIds,
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

    // Booked meeting reservations on this employee's calendar this week (confirmed +
    // pending), with the external booker's name/e-mail, surfaced read-only on the planning.
    const apptRows = await db('appointments')
      .where({ tenant_id: tenantId, user_id: user.id })
      .whereIn('status', ['confirmed', 'pending'])
      .andWhere('date', '>=', monday)
      .andWhere('date', '<', weekEndExclusive)
      .orderBy(['date', 'heure_debut'])
      .select<
        {
          id: number;
          date: Date | string;
          heure_debut: string;
          heure_fin: string;
          status: PlanningAppointment['status'];
          external_name: string;
          external_email: string;
          subject: string | null;
        }[]
      >('id', 'date', 'heure_debut', 'heure_fin', 'status', 'external_name', 'external_email', 'subject');
    const appointments: PlanningAppointment[] = apptRows.map((a) => ({
      id: a.id,
      date: typeof a.date === 'string' ? a.date.slice(0, 10) : a.date.toISOString().slice(0, 10),
      start: a.heure_debut.slice(0, 5),
      end: a.heure_fin.slice(0, 5),
      status: a.status,
      name: a.external_name,
      email: a.external_email,
      subject: a.subject,
    }));

    return {
      user,
      shifts,
      counter,
      recupSoldeMin,
      flags,
      boards,
      hourTypes,
      holidays: [...holidays].sort(),
      appointments,
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

  /**
   * The subset of `userIds` that is EXCLUDED from every planning roster, i.e. management-only
   * members: they hold at least one `team_memberships` row in this tenant and NONE of them has
   * `in_planning = true` (the "pas dans le planning" checkbox, manager role only - see
   * `teamService.setMembers`). A user with no team at all is NOT excluded: they simply have no
   * team, which the grids handle separately ("sans équipe"). A manager excluded from one team but
   * an in-planning member of another keeps their row, carried by that second team.
   */
  async planningExcludedIds(tenantId: number, userIds: number[]): Promise<Set<number>> {
    if (userIds.length === 0) return new Set();
    const rows = await db<{ user_id: number; in_planning: boolean }>('team_memberships as tm')
      .join('user_teams as ut', 'ut.id', 'tm.team_id')
      .where('ut.tenant_id', tenantId)
      .whereIn('tm.user_id', userIds)
      .select('tm.user_id', 'tm.in_planning');
    const anyMembership = new Set<number>();
    const anyInPlanning = new Set<number>();
    for (const r of rows) {
      anyMembership.add(r.user_id);
      if (r.in_planning) anyInPlanning.add(r.user_id);
    }
    return new Set([...anyMembership].filter((id) => !anyInPlanning.has(id)));
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
    opts: { spread?: boolean; replace?: boolean } = {},
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
        // OrSelf: callers are gated by planning:write, and a team manager must be able to
        // copy/paste within their OWN planning (the management closure excludes self).
        ok = await userService.canManageOrSelf(actor, targetUserId, tenantId);
        manageCache.set(targetUserId, ok);
      }
      return ok;
    };

    // Destination must be manageable (admins manage everyone). A destination equal to a
    // manageable source owner is allowed even if canManage(dest) is false on its own.
    const destManageable = await canManage(toUserId);

    // Resolve every allowed source shift FIRST: the target dates depend on the whole
    // selection (spread) and the rows to clear depend on the whole target set (replace).
    const sources: Shift[] = [];
    for (const id of shiftIds) {
      const shift = await shiftService.getById(id, tenantId);
      if (!shift) continue; // wrong tenant / deleted
      if (!(await canManage(shift.userId))) continue; // actor can't manage the source owner
      if (!destManageable && toUserId !== shift.userId) continue; // destination not allowed
      sources.push(shift);
    }
    if (sources.length === 0) return { count: 0 };

    // `spread`: a multi-day copy keeps its shape. Each shift lands on toDate + (its own day -
    // the earliest day of the selection), so pasting a Mon..Fri block onto a Wednesday spans
    // Wed..Sun instead of collapsing every hour onto the single target day.
    const dayOffset = (from: string, to: string): number =>
      Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
    const anchor = sources.reduce((min, s) => (s.date < min ? s.date : min), sources[0].date);
    const targetDateOf = (s: Shift): string =>
      opts.spread ? addDays(toDate, dayOffset(anchor, s.date)) : toDate;

    // `replace`: "annule et remplace" - wipe the destination's existing shifts on every day
    // being pasted onto, so the paste never stacks on top of what was already there.
    if (opts.replace) {
      const targetDates = [...new Set(sources.map(targetDateOf))];
      const keptIds = sources.filter((s) => s.userId === toUserId).map((s) => s.id);
      await db('shifts')
        .where({ tenant_id: tenantId, user_id: toUserId })
        .whereIn('date', targetDates)
        .whereNotIn('id', keptIds.length ? keptIds : [0]) // never delete the very rows being copied
        .del();
    }

    let count = 0;
    for (const shift of sources) {
      await shiftService.create(tenantId, actor.userId, {
        userId: toUserId,
        date: targetDateOf(shift),
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
   * Undo support: make (userId, [monday, monday+7)) look EXACTLY like `shifts`.
   * Every existing shift of that employee in the window is dropped and replaced by the
   * snapshot the client captured before the mutation it is undoing. Ids are NOT preserved
   * (the rows are recreated), which is fine for undo since the client refetches after.
   * Caller must be gated by planning:write; the actor must manage the employee (or be them).
   */
  async restoreWeek(
    tenantId: number,
    actor: { userId: number; role: string },
    userId: number,
    monday: string,
    shifts: Array<{
      date: string;
      heureDebut: string | null;
      heureFin: string | null;
      pauseMin: number;
      type: Shift['type'];
      statut: Shift['statut'];
      note: string | null;
      hourTypeId: number | null;
      boardId: number | null;
    }>,
  ): Promise<{ restored: number }> {
    const target = await userService.getById(userId, tenantId);
    if (!target) return { restored: 0 };
    if (!(await userService.canManageOrSelf(actor, userId, tenantId))) return { restored: 0 };

    const end = addDays(monday, 7);
    // Only rows inside the snapshot window may be written back, so a stale/forged payload
    // can never touch another week.
    const inWindow = shifts.filter((s) => s.date >= monday && s.date < end);

    await db('shifts')
      .where({ tenant_id: tenantId, user_id: userId })
      .andWhere('date', '>=', monday)
      .andWhere('date', '<', end)
      .del();

    for (const s of inWindow) {
      await shiftService.create(tenantId, actor.userId, {
        userId,
        date: s.date,
        heureDebut: s.heureDebut,
        heureFin: s.heureFin,
        pauseMin: s.pauseMin,
        type: s.type,
        statut: s.statut,
        note: s.note,
        hourTypeId: s.hourTypeId,
        boardId: s.boardId,
      });
    }
    return { restored: inWindow.length };
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
    let members: User[];
    if (actor.role === 'admin') {
      members = await userService.getByTenant(tenantId);
    } else {
      members = await userService.getTeam(actor.userId, tenantId);
      // A team-manager who is also a team member should see THEIR OWN planning in the grid
      // (e.g. N managing "équipe technique" from inside it). Add self once, if not already present.
      if (!members.some((m) => m.id === actor.userId)) {
        const self = await userService.getById(actor.userId, tenantId);
        if (self) members = [self, ...members];
      }
    }
    // A management-only member has no row in the grid, NO MATTER how they got into `members`:
    // neither via the admin whole-tenant branch, nor via the self-add above (a manager excluded
    // from the planning does not see their own row either). This is the single choke point where
    // `in_planning` is enforced for the grid, so both branches are covered by construction.
    const excluded = await this.planningExcludedIds(tenantId, members.map((u) => u.id));
    if (excluded.size) members = members.filter((u) => !excluded.has(u.id));
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
    const active = (await userService.getByTenant(tenantId)).filter((u) => u.isActive);
    // Same rule as the grid: management-only members (in_planning=false everywhere) are not part
    // of any planning roster, so they never surface here either.
    const excluded = await this.planningExcludedIds(tenantId, active.map((u) => u.id));
    const members = excluded.size ? active.filter((u) => !excluded.has(u.id)) : active;
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

    // Anonymised booked reservations per member (confirmed + pending) - the overview shows
    // busy "Rendez-vous" blocks WITHOUT any external name/e-mail (privacy: this view is
    // readable by every employee via planning:view_team).
    const apptRows = ids.length
      ? await db('appointments')
          .whereIn('user_id', ids)
          .where('tenant_id', tenantId)
          .whereIn('status', ['confirmed', 'pending'])
          .andWhere('date', '>=', monday)
          .andWhere('date', '<', end)
          .orderBy(['user_id', 'date', 'heure_debut'])
          .select<
            { id: number; user_id: number; date: Date | string; heure_debut: string; heure_fin: string; status: 'pending' | 'confirmed' }[]
          >('id', 'user_id', 'date', 'heure_debut', 'heure_fin', 'status')
      : [];
    const apptsByUser = new Map<number, TeamOverviewMember['appointments']>();
    for (const a of apptRows) {
      const list = apptsByUser.get(a.user_id) ?? [];
      list.push({
        id: a.id,
        date: typeof a.date === 'string' ? a.date.slice(0, 10) : a.date.toISOString().slice(0, 10),
        start: a.heure_debut.slice(0, 5),
        end: a.heure_fin.slice(0, 5),
        status: a.status,
      });
      apptsByUser.set(a.user_id, list);
    }

    // Public holidays this week, resolved PER MEMBER by their contract country: a MG member's
    // fériés differ from a FR member's. Null-country rows are universal. The DTO-level holidays
    // stays FR-based as a header hint; the per-cell marking uses each member's own list.
    const [holidayRows, contrats, teamMap] = await Promise.all([
      holidayService.getRows(tenantId, monday, end),
      contratService.getAll(tenantId),
      this.teamIdsByUser(tenantId, ids),
    ]);
    const paysByContrat = new Map(contrats.map((c) => [c.id, c.pays]));
    const holidaysForPays = (pays: string) =>
      [...new Set(holidayRows.filter((r) => holidayAppliesTo(r.pays, pays)).map((r) => r.date))].sort();

    const overviewMembers: TeamOverviewMember[] = members
      .map((u) => {
        const pays = (u.contratId != null ? paysByContrat.get(u.contratId) : undefined) ?? 'FR';
        return {
          userId: u.id,
          displayName: u.displayName,
          username: u.username,
          shifts: byUser.get(u.id) ?? [],
          appointments: apptsByUser.get(u.id) ?? [],
          teamIds: teamMap.get(u.id) ?? [],
          holidays: holidaysForPays(pays),
        };
      })
      .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));

    return { monday, members: overviewMembers, holidays: holidaysForPays('FR') };
  },
};
