import type { Request, Response, NextFunction } from 'express';
import type { PlanningTeamRef } from '@obliplan/shared';
import { planningService } from '../services/planning.service';
import { teamService } from '../services/team.service';
import { userService } from '../services/user.service';
import { authService } from '../services/auth.service';
import { auditService } from '../services/audit.service';
import { AppError } from '../middleware/errorHandler';
import { mondayOf, todayIso } from '../utils/date';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

function weekParam(req: Request): string {
  const w = req.query.week;
  return typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : mondayOf(todayIso());
}

function monthParam(req: Request): string {
  const m = req.query.month;
  return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) ? m : todayIso().slice(0, 7);
}

export const planningController = {
  /** GET /planning/me?week= - the current user's own week. */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getUserById(req.session.userId!);
      if (!user) throw new AppError(401, 'Utilisateur introuvable');
      res.json({ success: true, data: await planningService.getUserWeek(req.tenantId, user, weekParam(req)) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /planning/me/month?month=YYYY-MM - the current user's full month (stacked weeks). */
  async meMonth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getUserById(req.session.userId!);
      if (!user) throw new AppError(401, 'Utilisateur introuvable');
      res.json({ success: true, data: await planningService.getUserMonth(req.tenantId, user, monthParam(req)) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /planning/week?userId=&week= - one user's week (self or manager/admin). */
  async week(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const user = await userService.getById(userId, req.tenantId);
      if (!user) throw new AppError(404, 'Utilisateur introuvable');
      res.json({ success: true, data: await planningService.getUserWeek(req.tenantId, user, weekParam(req)) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /planning/team?week= - manager grid (one row per report; admin = whole tenant).
   *  Gated by requireTenantCapability('planning:read_team'); manager-vs-admin row scoping
   *  is handled in planningService.getTeamWeek. */
  async team(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await planningService.getTeamWeek(req.tenantId, actor(req), weekParam(req)) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /planning/team-overview?week= - read-only who-works-when for EVERY employee.
   *  Gated by requireTenantCapability('planning:view_team'); tenant-scoped, validated
   *  shifts only, note stripped, no counters/flags. See planningService.getTeamOverview. */
  async teamOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await planningService.getTeamOverview(req.tenantId, weekParam(req)) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /planning/teams - the tenant's Axis-C teams (id + name only), name-ordered, for the
   *  planning visibility filter. Gated by requireTenantCapability('planning:view_team'); reuses
   *  the tenant-scoped teamService.getAll so no cross-tenant team can leak. */
  async teams(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const teams = await teamService.getAll(req.tenantId);
      const data: PlanningTeamRef[] = teams.map((t) => ({ id: t.id, name: t.name }));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** POST /planning/copy-week - clone a week's shifts to another week (drafts). planning:write. */
  async copyWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fromMonday, toMonday, userIds } = req.body as { fromMonday: string; toMonday: string; userIds: number[] };
      const count = await planningService.copyWeek(req.tenantId, req.session.userId!, fromMonday, toMonday, userIds);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  },

  /** POST /planning/clone-shifts - clone selected shifts onto another (employee, day) as drafts. planning:write. */
  async cloneShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { shiftIds, toUserId, toDate } = req.body as { shiftIds: number[]; toUserId: number; toDate: string };
      const data = await planningService.cloneShifts(req.tenantId, actor(req), shiftIds, toUserId, toDate);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** POST /planning/publish - flip a week's draft shifts to validé + notify each affected employee. planning:write. */
  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { monday, userIds } = req.body as { monday: string; userIds: number[] };
      const data = await planningService.publishWeek(req.tenantId, req.session.userId!, monday, userIds);
      await auditService.record(req.tenantId, req.session.userId!, 'planning.publish', {
        meta: { week: monday },
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
