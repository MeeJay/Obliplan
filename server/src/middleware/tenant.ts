import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Carry the resolved tenantId on the request.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId: number;
    }
  }
}

/**
 * Resolve req.tenantId from the session. Apply after requireAuth on any route
 * that operates on tenant-scoped data.
 */
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  const tid = req.session?.currentTenantId;
  if (!tid) {
    next(new AppError(400, 'No tenant selected'));
    return;
  }
  req.tenantId = tid;
  next();
}
