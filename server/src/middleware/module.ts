import type { Request, Response, NextFunction } from 'express';
import type { ModuleKey } from '@obliplan/shared';
import { AppError } from './errorHandler';
import { tenantModuleService } from '../services/tenantModule.service';

/**
 * Reject the request with 403 when `key` is disabled for the active workspace.
 * Apply AFTER requireAuth + requireTenant (relies on req.tenantId). Modules are
 * default-on, so a workspace with no explicit row passes through.
 */
export function requireModule(key: ModuleKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.tenantId) return next(new AppError(400, 'No tenant selected'));
      const enabled = await tenantModuleService.isEnabled(req.tenantId, key);
      if (!enabled) return next(new AppError(403, 'Module désactivé pour ce workspace'));
      next();
    } catch (err) {
      next(err);
    }
  };
}
