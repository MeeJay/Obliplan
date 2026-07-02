import type { Request, Response, NextFunction } from 'express';
import { leaveRequestService } from '../services/leaveRequest.service';
import { userService } from '../services/user.service';
import { notify, emailFor, managerIdOf } from '../services/notify';
import { auditService } from '../services/audit.service';
import { AppError } from '../middleware/errorHandler';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

export const leaveRequestController = {
  /** GET /leave-requests?userId= - self, or manager/admin over the target. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.json({ success: true, data: await leaveRequestService.getForUser(req.tenantId, userId) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /leave-requests/balances?userId= */
  async balances(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.json({ success: true, data: await leaveRequestService.balancesForUser(req.tenantId, userId) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /leave-requests/pending - pending requests for the manager's team (platform admin = whole
   *  tenant). Gated by requireTenantCapability('leave:validate') on the route. */
  async pending(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const managerId = req.session.platformAdmin || req.session.role === 'admin' ? null : req.session.userId!;
      res.json({ success: true, data: await leaveRequestService.getPending(req.tenantId, managerId) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /leave/calendar?month=YYYY-MM - approved + pending leave for the manager's team (platform
   *  admin = whole tenant). Gated by requireTenantCapability('leave:validate') on the route. */
  async calendar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month))
        ? String(req.query.month)
        : new Date().toISOString().slice(0, 7);
      const managerId = req.session.platformAdmin || req.session.role === 'admin' ? null : req.session.userId!;
      res.json({ success: true, data: await leaveRequestService.getCalendar(req.tenantId, managerId, month) });
    } catch (err) {
      next(err);
    }
  },

  /** POST /leave-requests - employee requests for self; manager/admin can request for a report. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as {
        userId?: number;
        leaveTypeId: number;
        startDate: string;
        endDate: string;
        halfDay?: boolean;
        startPeriod?: 'full' | 'am' | 'pm';
        endPeriod?: 'full' | 'am' | 'pm';
        motif?: string | null;
      };
      const targetUserId = body.userId ?? req.session.userId!;
      if (targetUserId !== req.session.userId && !(await userService.canManage(actor(req), targetUserId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const request = await leaveRequestService.create(req.tenantId, { ...body, userId: targetUserId });
      // Notify the requester's manager (best-effort, never blocks the response).
      const managerId = await managerIdOf(req.tenantId, targetUserId);
      if (managerId && managerId !== req.session.userId) {
        const title = 'Nouvelle demande de congé';
        const emailBody = `Une demande de congé du ${request.startDate} au ${request.endDate} attend votre validation.`;
        await notify(req.tenantId, {
          recipientIds: [managerId],
          actorId: req.session.userId,
          type: 'leave.submitted',
          title,
          body: emailBody,
          link: '/conges',
          entityType: 'leave_request',
          entityId: request.id,
          email: emailFor(title, { title, body: emailBody, link: '/conges' }),
        });
      }
      res.status(201).json({ success: true, data: request });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /leave-requests/:id/decision - manager/admin validates or refuses. */
  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await leaveRequestService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Demande introuvable');
      if (!(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Seul le manager peut valider une demande');
      }
      const { decision, comment } = req.body as { decision: 'valide' | 'refuse'; comment?: string | null };
      const updated = await leaveRequestService.decide(existing.id, req.tenantId, req.session.userId!, decision, comment);
      // Notify the requester of the decision (best-effort, never blocks the response).
      if (existing.userId !== req.session.userId) {
        const approved = decision === 'valide';
        const title = approved ? 'Demande de congé validée' : 'Demande de congé refusée';
        const body = !approved && comment?.trim() ? `Motif du refus : ${comment.trim()}` : undefined;
        await notify(req.tenantId, {
          recipientIds: [existing.userId],
          actorId: req.session.userId,
          type: 'leave.decided',
          title,
          body,
          link: '/conges',
          entityType: 'leave_request',
          entityId: existing.id,
          email: emailFor(title, { title, body, link: '/conges' }),
        });
      }
      await auditService.record(req.tenantId, req.session.userId!, 'leave.decide', {
        entityType: 'leave_request',
        entityId: existing.id,
        meta: { decision },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /leave-requests/:id/cancel - owner or manager cancels. */
  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await leaveRequestService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Demande introuvable');
      const isOwner = existing.userId === req.session.userId;
      if (!isOwner && !(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.json({ success: true, data: await leaveRequestService.cancel(existing.id, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
};
