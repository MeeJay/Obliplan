import type { Request, Response, NextFunction } from 'express';
import { shiftTemplateService } from '../services/shiftTemplate.service';
import { AppError } from '../middleware/errorHandler';

export const shiftTemplateController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await shiftTemplateService.getAll(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tpl = await shiftTemplateService.create(req.tenantId, req.body);
      res.status(201).json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tpl = await shiftTemplateService.update(Number(req.params.id), req.tenantId, req.body);
      if (!tpl) throw new AppError(404, 'Modèle introuvable');
      res.json({ success: true, data: tpl });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await shiftTemplateService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Modèle introuvable');
      res.json({ success: true, message: 'Modèle supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
