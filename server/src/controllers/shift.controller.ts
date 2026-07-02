import type { Request, Response, NextFunction } from 'express';
import { shiftService } from '../services/shift.service';
import { userService } from '../services/user.service';
import { planningNotify } from '../services/planningNotify';
import { AppError } from '../middleware/errorHandler';
import { mondayOf, todayIso } from '../utils/date';
import type { CreateShiftInput, UpdateShiftInput } from '../validators/schemas';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

function weekParam(req: Request): string {
  const w = req.query.week;
  return typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w) ? mondayOf(w) : mondayOf(todayIso());
}

export const shiftController = {
  /** GET /shifts?userId=&week= - self, or manager/admin over the target. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const shifts = await shiftService.getForUserWeek(req.tenantId, userId, weekParam(req));
      res.json({ success: true, data: shifts });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateShiftInput;
      if (!(await userService.canManage(actor(req), data.userId, req.tenantId))) {
        throw new AppError(403, 'Seul le manager peut éditer le planning de son équipe');
      }
      const shift = await shiftService.create(req.tenantId, req.session.userId!, data);
      void planningNotify.shiftCreated(req.tenantId, req.session.userId!, shift);
      res.status(201).json({ success: true, data: shift });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await shiftService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Shift introuvable');
      if (!(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const data = req.body as UpdateShiftInput;
      // Reassigning to another employee (drag-move) requires managing the destination too.
      if (data.userId != null && data.userId !== existing.userId && !(await userService.canManage(actor(req), data.userId, req.tenantId))) {
        throw new AppError(403, 'Réassignation non autorisée pour ce salarié');
      }
      const shift = await shiftService.update(existing.id, req.tenantId, req.session.userId!, data);
      if (shift) void planningNotify.shiftUpdated(req.tenantId, req.session.userId!, existing, shift);
      res.json({ success: true, data: shift });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await shiftService.getById(Number(req.params.id), req.tenantId);
      if (!existing) throw new AppError(404, 'Shift introuvable');
      if (!(await userService.canManage(actor(req), existing.userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      await shiftService.delete(existing.id, req.tenantId);
      void planningNotify.shiftDeleted(req.tenantId, req.session.userId!, existing);
      res.json({ success: true, message: 'Shift supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
