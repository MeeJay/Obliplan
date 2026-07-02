import type { Request, Response, NextFunction } from 'express';
import { contratService } from '../services/contrat.service';
import { AppError } from '../middleware/errorHandler';
import { getEffectiveTenantScope } from '../utils/tenantScope';
import type { CreateContratInput, UpdateContratInput } from '../validators/schemas';

export const contratController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contrats = await contratService.getAll(getEffectiveTenantScope(req));
      res.json({ success: true, data: contrats });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contrat = await contratService.getById(Number(req.params.id), getEffectiveTenantScope(req));
      if (!contrat) throw new AppError(404, 'Contrat introuvable');
      res.json({ success: true, data: contrat });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contrat = await contratService.create(req.tenantId, req.body as CreateContratInput);
      res.status(201).json({ success: true, data: contrat });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contrat = await contratService.update(Number(req.params.id), req.tenantId, req.body as UpdateContratInput);
      if (!contrat) throw new AppError(404, 'Contrat introuvable');
      res.json({ success: true, data: contrat });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await contratService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Contrat introuvable');
      res.json({ success: true, message: 'Contrat supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
