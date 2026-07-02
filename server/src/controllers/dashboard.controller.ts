import type { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service';
import { authService } from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';

export const dashboardController = {
  /** GET /dashboard/me - aggregated home dashboard for the authenticated caller. */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getUserById(req.session.userId!);
      if (!user) throw new AppError(401, 'Utilisateur introuvable');
      const actor = {
        userId: req.session.userId!,
        role: req.session.role!,
        platformAdmin: !!req.session.platformAdmin,
      };
      res.json({ success: true, data: await dashboardService.forUser(req.tenantId, user, actor) });
    } catch (err) {
      next(err);
    }
  },
};
