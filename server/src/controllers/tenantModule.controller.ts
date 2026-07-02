import type { Request, Response, NextFunction } from 'express';
import { tenantModuleService } from '../services/tenantModule.service';
import { AppError } from '../middleware/errorHandler';
import { isModuleKey } from '@obliplan/shared';

export const tenantModuleController = {
  /** GET /api/modules - enabled module keys for the active workspace. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await tenantModuleService.getEnabled(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/modules - enable/disable a module (requires tenants:manage). */
  async setEnabled(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { key, enabled } = req.body as { key?: string; enabled?: boolean };
      if (!key || !isModuleKey(key)) throw new AppError(400, 'Module inconnu');
      if (typeof enabled !== 'boolean') throw new AppError(400, 'enabled requis');
      await tenantModuleService.setEnabled(req.tenantId, key, enabled);
      res.json({ success: true, data: await tenantModuleService.getEnabled(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/tenants/:id/modules - enabled module keys for an arbitrary workspace (admin). */
  async getForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = Number(req.params.id);
      if (!tenantId) throw new AppError(400, 'tenantId requis');
      res.json({ success: true, data: await tenantModuleService.getEnabled(tenantId) });
    } catch (err) {
      next(err);
    }
  },

  /** PATCH /api/tenants/:id/modules - enable/disable a module for an arbitrary workspace (admin). */
  async setForTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = Number(req.params.id);
      if (!tenantId) throw new AppError(400, 'tenantId requis');
      const { key, enabled } = req.body as { key?: string; enabled?: boolean };
      if (!key || !isModuleKey(key)) throw new AppError(400, 'Module inconnu');
      if (typeof enabled !== 'boolean') throw new AppError(400, 'enabled requis');
      await tenantModuleService.setEnabled(tenantId, key, enabled);
      res.json({ success: true, data: await tenantModuleService.getEnabled(tenantId) });
    } catch (err) {
      next(err);
    }
  },
};
