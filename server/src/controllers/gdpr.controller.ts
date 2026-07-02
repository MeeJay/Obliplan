import type { Request, Response, NextFunction } from 'express';
import { gdprService } from '../services/gdpr.service';
import { auditService } from '../services/audit.service';
import { AppError } from '../middleware/errorHandler';

export const gdprController = {
  /** Droit d'accès - the caller downloads their OWN personal data (any authed member). */
  async exportMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // The subject's own right of access → full cross-tenant membership list.
      const data = await gdprService.exportUserData(req.tenantId, req.session.userId!, { allTenants: true });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** Admin exports any member of the tenant (users:manage). */
  async exportUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // A confined tenant admin only sees membership in their own tenant; a
      // platform admin (authority over every space) gets the full list.
      const data = await gdprService.exportUserData(req.tenantId, Number(req.params.id), {
        allTenants: !!req.session.platformAdmin,
      });
      if (!data) throw new AppError(404, 'Salarié introuvable');
      await auditService.record(req.tenantId, req.session.userId!, 'gdpr.export', {
        entityType: 'user',
        entityId: Number(req.params.id),
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** Droit à l'effacement - admin pseudonymises a departed salarié (users:manage). */
  async anonymize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await gdprService.anonymizeUser(
        req.tenantId,
        req.session.userId!,
        !!req.session.platformAdmin,
        Number(req.params.id),
      );
      await auditService.record(req.tenantId, req.session.userId!, 'gdpr.anonymize', {
        entityType: 'user',
        entityId: Number(req.params.id),
      });
      res.json({ success: true, data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
};
