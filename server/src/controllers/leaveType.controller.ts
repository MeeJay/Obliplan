import type { Request, Response, NextFunction } from 'express';
import { leaveTypeService } from '../services/leaveType.service';
import { AppError } from '../middleware/errorHandler';

export const leaveTypeController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await leaveTypeService.getAll(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ success: true, data: await leaveTypeService.create(req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lt = await leaveTypeService.update(Number(req.params.id), req.tenantId, req.body);
      if (!lt) throw new AppError(404, 'Type de congé introuvable');
      res.json({ success: true, data: lt });
    } catch (err) {
      next(err);
    }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await leaveTypeService.delete(Number(req.params.id), req.tenantId);
      if (!ok) {
        next(new AppError(404, 'Type de congé introuvable'));
        return;
      }
      res.json({ success: true, message: 'Type supprimé' });
    } catch {
      next(new AppError(409, 'Suppression impossible (type utilisé par des demandes ?)'));
    }
  },
};
