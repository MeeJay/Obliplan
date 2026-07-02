import type { Request, Response, NextFunction } from 'express';
import { hourTypeService } from '../services/hourType.service';
import { AppError } from '../middleware/errorHandler';

export const hourTypeController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await hourTypeService.getAll(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ success: true, data: await hourTypeService.create(req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ht = await hourTypeService.update(Number(req.params.id), req.tenantId, req.body);
      if (!ht) throw new AppError(404, "Type d'heure introuvable");
      res.json({ success: true, data: ht });
    } catch (err) {
      next(err);
    }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await hourTypeService.delete(Number(req.params.id), req.tenantId);
      if (!ok) {
        next(new AppError(404, "Type d'heure introuvable"));
        return;
      }
      res.json({ success: true, message: 'Type supprimé' });
    } catch {
      next(new AppError(409, 'Suppression impossible (type utilisé ?)'));
    }
  },
};
