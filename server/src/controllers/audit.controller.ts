import type { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';

export const auditController = {
  /** GET /audit?action=&limit=&offset= - tenant's audit trail, newest first (users:manage). */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Clamp to sane, non-negative bounds so an unbounded/negative limit can't
      // exhaust memory or reach Postgres as `LIMIT -1` (500).
      const rawLimit = Number(req.query.limit);
      const rawOffset = Number(req.query.offset);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 100, 1), 500);
      const offset = Math.max(Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0, 0);
      const action = typeof req.query.action === 'string' && req.query.action ? req.query.action : undefined;
      const data = await auditService.list(req.tenantId, { action, limit, offset });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /** GET /audit/verify - recompute the tenant's hash chain (users:manage). */
  async verify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await auditService.verifyChain(req.tenantId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
