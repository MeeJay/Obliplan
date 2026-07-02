import type { Request, Response, NextFunction } from 'express';
import { jourEcoleService } from '../services/jourEcole.service';
import { userService } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';
import type { CreateJourEcoleInput } from '../validators/schemas';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

export const jourEcoleController = {
  /** GET /jours-ecole?userId= - self, or manager/admin over the target. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      if (userId !== req.session.userId && !(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.json({ success: true, data: await jourEcoleService.getForUser(req.tenantId, userId) });
    } catch (err) {
      next(err);
    }
  },

  /** Manager/admin adds a school day to a report. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateJourEcoleInput;
      if (!(await userService.canManage(actor(req), data.userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      res.status(201).json({ success: true, data: await jourEcoleService.create(req.tenantId, data) });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await jourEcoleService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Jour d\'école introuvable');
      res.json({ success: true, message: 'Supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
