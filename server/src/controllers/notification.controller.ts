import type { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';

export const notificationController = {
  /** GET /notifications?limit&offset - the caller's own notifications, newest first. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
      const data = await notificationService.listForUser(req.tenantId, req.session.userId!, {
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** GET /notifications/unread-count - `{ count }` of the caller's unread notifications. */
  async unreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await notificationService.unreadCount(req.tenantId, req.session.userId!);
      res.json({ success: true, data: { count } });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /notifications/:id/read - mark one of the caller's notifications read. */
  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.markRead(Number(req.params.id), req.tenantId, req.session.userId!);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  /** POST /notifications/read-all - mark all of the caller's notifications read. */
  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.markAllRead(req.tenantId, req.session.userId!);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
};
