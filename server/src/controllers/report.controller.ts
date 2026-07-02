import type { Request, Response, NextFunction } from 'express';
import { workloadService } from '../services/workload.service';
import { reportingService, type ReportActor } from '../services/reporting.service';
import { todayIso } from '../utils/date';
import { AppError } from '../middleware/errorHandler';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Default reporting window = the current calendar month (Paris), [first, first-of-next). */
function currentMonthRange(): { from: string; toExcl: string } {
  const today = todayIso(); // yyyy-mm-dd in the business timezone
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)); // 1–12
  const from = `${today.slice(0, 7)}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const toExcl = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return { from, toExcl };
}

/**
 * Resolve the manager/admin actor plus the [from, toExcl) window from the query
 * (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, `to` exclusive; defaults to current month).
 * The route already applies requireTenantCapability('planning:read_team'); the
 * role check here is defence in depth.
 */
function resolve(req: Request): { actor: ReportActor; from: string; toExcl: string } {
  // Authorization is the route's requireTenantCapability('planning:read_team'); the SCOPE
  // (manager → reports, admin → tenant) is applied in reportingService.resolveScope, so a
  // capability-holder who manages no one simply gets an empty report (no 403 dead-end).
  const { role, platformAdmin, userId } = req.session;
  const def = currentMonthRange();
  const from = typeof req.query.from === 'string' && ISO_DATE.test(req.query.from) ? req.query.from : def.from;
  const toExcl = typeof req.query.to === 'string' && ISO_DATE.test(req.query.to) ? req.query.to : def.toExcl;
  if (toExcl <= from) throw new AppError(400, 'Période invalide : la date de fin doit suivre la date de début.');
  return { actor: { userId: userId!, role: role!, platformAdmin: !!platformAdmin }, from, toExcl };
}

export const reportController = {
  /**
   * GET /reports/workload - per-teammate active work vs weekly capacity (the
   * "Charge" view). Manager/admin only: the route already applies
   * requireTenantCapability('planning:read_team'); the role check here is
   * defence in depth. Manager-vs-admin row scoping lives in workloadService.
   */
  async workload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, platformAdmin, userId } = req.session;
      const actor = { userId: userId!, role: role!, platformAdmin: !!platformAdmin };
      res.json({ success: true, data: await workloadService.teamWorkload(req.tenantId, actor) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /reports/summary - KPI summary over the actor's scope for the period. */
  async summary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { actor, from, toExcl } = resolve(req);
      res.json({ success: true, data: await reportingService.summary(req.tenantId, actor, from, toExcl) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /reports/by-project - tracked time grouped by project for the period. */
  async byProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { actor, from, toExcl } = resolve(req);
      res.json({ success: true, data: await reportingService.byProject(req.tenantId, actor, from, toExcl) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /reports/by-user - per-employee tracked vs planned time for the period. */
  async byUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { actor, from, toExcl } = resolve(req);
      res.json({ success: true, data: await reportingService.byUser(req.tenantId, actor, from, toExcl) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /reports/astreinte - on-call minutes + déclenchements per fortnight, per employee. */
  async astreinte(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { actor, from, toExcl } = resolve(req);
      res.json({ success: true, data: await reportingService.astreinteByQuinzaine(req.tenantId, actor, from, toExcl) });
    } catch (err) {
      next(err);
    }
  },
};
