import type { Request, Response, NextFunction } from 'express';
import { timeEntryService } from '../services/timeEntry.service';
import { userService } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';
import type { StartTimerInput, CreateTimeEntryInput, UpdateTimeEntryInput } from '../validators/timeEntry.schema';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

export const timeEntryController = {
  /** GET /time-entries?userId= - self, or manager/admin over the target. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.json({ success: true, data: await timeEntryService.listForUser(req.tenantId, userId) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /time-entries/running - the caller's currently running timer (or null). */
  async running(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await timeEntryService.getRunning(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /time-entries/board/:boardId - all entries on a board (managers/admin or own). */
  async listForBoard(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await timeEntryService.listForBoard(req.tenantId, Number(req.params.boardId)) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /time-entries/board/:boardId/totals - total minutes per card. */
  async totals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await timeEntryService.totalsPerCard(req.tenantId, Number(req.params.boardId)) });
    } catch (err) {
      next(err);
    }
  },

  /** POST /time-entries/start - start a timer for the caller (stops any other). */
  async start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await timeEntryService.start(req.tenantId, req.session.userId!, req.body as StartTimerInput);
      res.status(201).json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  },

  /** POST /time-entries/:id/stop - stop the caller's running timer. */
  async stop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await timeEntryService.stop(Number(req.params.id), req.tenantId, req.session.userId!);
      if (!entry) throw new AppError(404, 'Minuteur introuvable');
      res.json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  },

  /** POST /time-entries - create a finished manual entry for the caller (or, for a manager, a teammate). */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CreateTimeEntryInput;
      const target = body.userId ?? req.session.userId!;
      if (target !== req.session.userId) {
        // Must manage the target AND the target must be a member of this tenant (canManage's
        // admin branch short-circuits without a membership check, so verify it explicitly).
        const inTenant = await userService.getById(target, req.tenantId);
        if (!inTenant || !(await userService.canManage(actor(req), target, req.tenantId))) {
          throw new AppError(403, 'Accès refusé');
        }
      }
      const entry = await timeEntryService.createManual(req.tenantId, req.session.userId!, body);
      res.status(201).json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  },

  /** PUT /time-entries/:id - owner or manager/admin edits an entry. */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await timeEntryService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Entrée introuvable');
      const isOwner = existing.userId === req.session.userId;
      if (!isOwner && !(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const entry = await timeEntryService.update(existing.id, req.tenantId, req.body as UpdateTimeEntryInput);
      res.json({ success: true, data: entry });
    } catch (err) {
      next(err);
    }
  },

  /** DELETE /time-entries/:id - owner or manager/admin removes an entry. */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await timeEntryService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Entrée introuvable');
      const isOwner = existing.userId === req.session.userId;
      if (!isOwner && !(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      await timeEntryService.delete(existing.id, req.tenantId);
      res.json({ success: true, message: 'Entrée supprimée' });
    } catch (err) {
      next(err);
    }
  },
};
