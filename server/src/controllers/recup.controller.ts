import type { Request, Response, NextFunction } from 'express';
import { recupService } from '../services/recup.service';
import { userService } from '../services/user.service';
import { planningService } from '../services/planning.service';
import { AppError } from '../middleware/errorHandler';
import { mondayOf } from '../utils/date';
import type { CreateRecupInput } from '../validators/schemas';
import { weekPreviewQuerySchema, type ValidateWeekInput, type SelfServiceInput } from '../validators/recup.schema';

function actor(req: Request) {
  return { userId: req.session.userId!, role: req.session.role! };
}

export const recupController = {
  /** GET /recup?userId= - movements; self or manager/admin over the target. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = Number(req.query.userId) || req.session.userId!;
      const isManagerAdmin =
        req.session.role === 'manager' || req.session.role === 'admin' || !!req.session.platformAdmin;
      if (userId === req.session.userId) {
        // Self-view is gated behind the per-employee self-service opt-in (managers/admins always allowed).
        if (!isManagerAdmin) {
          const me = await userService.getById(userId, req.tenantId);
          if (!me?.recupSelfService) throw new AppError(403, 'Accès self-service récup non activé');
        }
      } else if (!(await userService.canManage(actor(req), userId, req.tenantId))) {
        throw new AppError(403, 'Accès refusé');
      }
      const [movements, soldeMin] = await Promise.all([
        recupService.getForUser(req.tenantId, userId),
        recupService.soldeForUser(req.tenantId, userId),
      ]);
      res.json({ success: true, data: { movements, soldeMin } });
    } catch (err) {
      next(err);
    }
  },

  /** Manager/admin attributes récup (never automatic). */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateRecupInput;
      if (!(await userService.canManage(actor(req), data.userId, req.tenantId))) {
        throw new AppError(403, 'Seul le manager peut attribuer de la récupération');
      }
      const movement = await recupService.create(req.tenantId, req.session.userId!, data);
      res.status(201).json({ success: true, data: movement });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /recup/week-preview?userId=&semaine= - what validating the week would credit.
   * eligibleMin comes from the computed weekly counter; projectedSolde reflects the
   * idempotent upsert (replacing any already-credited eligible amount for that week).
   */
  async weekPreview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = weekPreviewQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new AppError(400, 'Paramètres invalides (userId, semaine)');
      const { userId } = parsed.data;
      const semaine = mondayOf(parsed.data.semaine);
      const user = await userService.getById(userId, req.tenantId);
      if (!user) throw new AppError(404, 'Utilisateur introuvable');
      const { counter } = await planningService.getUserWeek(req.tenantId, user, semaine);
      const existing = await recupService.eligibleForWeek(req.tenantId, userId, semaine);
      const soldeMin = await recupService.soldeForUser(req.tenantId, userId);
      const eligibleMin = counter.recupEligibleMin;
      const alreadyCreditedMin = existing?.heuresMin ?? 0;
      const projectedSoldeMin = soldeMin - alreadyCreditedMin + eligibleMin;
      res.json({
        success: true,
        data: { eligibleMin, soldeMin, alreadyCreditedMin, projectedSoldeMin, negative: projectedSoldeMin < 0 },
      });
    } catch (err) {
      next(err);
    }
  },

  /** POST /recup/validate-week - idempotently auto-credit the week's eligible récup. */
  async validateWeek(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.body as ValidateWeekInput;
      const semaine = mondayOf((req.body as ValidateWeekInput).semaine);
      const user = await userService.getById(userId, req.tenantId);
      if (!user) throw new AppError(404, 'Utilisateur introuvable');
      const { counter } = await planningService.getUserWeek(req.tenantId, user, semaine);
      await recupService.creditEligibleWeek(req.tenantId, req.session.userId!, {
        userId,
        semaine,
        heuresMin: counter.recupEligibleMin,
      });
      const soldeMin = await recupService.soldeForUser(req.tenantId, userId);
      res.json({ success: true, data: { soldeMin } });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /recup/self-service - enable/disable a user's self récup view. */
  async setSelfService(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, enabled } = req.body as SelfServiceInput;
      const user = await recupService.setSelfService(req.tenantId, userId, enabled);
      if (!user) throw new AppError(404, 'Utilisateur introuvable');
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await recupService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Mouvement introuvable');
      res.json({ success: true, message: 'Mouvement supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
