import type { Request, Response, NextFunction } from 'express';
import { overtimeNatureService } from '../services/overtimeNature.service';
import { AppError } from '../middleware/errorHandler';

export const overtimeNatureController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await overtimeNatureService.getAll(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(201).json({ success: true, data: await overtimeNatureService.create(req.tenantId, req.body) });
    } catch (err) {
      next(err);
    }
  },
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const nature = await overtimeNatureService.update(Number(req.params.id), req.tenantId, req.body);
      if (!nature) throw new AppError(404, "Nature d'heures sup introuvable");
      res.json({ success: true, data: nature });
    } catch (err) {
      next(err);
    }
  },
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await overtimeNatureService.delete(Number(req.params.id), req.tenantId);
      if (!ok) {
        next(new AppError(404, "Nature d'heures sup introuvable"));
        return;
      }
      res.json({ success: true, message: 'Nature supprimée' });
    } catch {
      next(new AppError(409, 'Suppression impossible (nature utilisée par des déclarations ?)'));
    }
  },
};
