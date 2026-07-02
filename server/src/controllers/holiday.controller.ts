import type { Request, Response, NextFunction } from 'express';
import { holidayService } from '../services/holiday.service';
import { AppError } from '../middleware/errorHandler';

export const holidayController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const raw = req.query.year;
      const parsed = raw !== undefined && raw !== '' ? Number(raw) : NaN;
      const year = Number.isFinite(parsed) ? parsed : undefined;
      res.json({ success: true, data: await holidayService.getAll(req.tenantId, year) });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const holiday = await holidayService.addCustom(req.tenantId, req.body);
      res.status(201).json({ success: true, data: holiday });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await holidayService.deleteCustom(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Jour férié introuvable');
      res.json({ success: true, message: 'Jour férié supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
