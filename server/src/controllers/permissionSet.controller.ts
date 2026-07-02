import type { Request, Response, NextFunction } from 'express';
import { permissionSetService } from '../services/permissionSet.service';
import { CAPABILITIES } from '@obliplan/shared';
import { AppError } from '../middleware/errorHandler';

export const permissionSetController = {
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await permissionSetService.getAll() });
    } catch (err) {
      next(err);
    }
  },

  /** Capability catalog (for the matrix rows). */
  capabilities(_req: Request, res: Response): void {
    res.json({ success: true, data: CAPABILITIES });
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, capabilities } = req.body as { name: string; capabilities?: string[] };
      res.status(201).json({ success: true, data: await permissionSetService.create({ name, capabilities }) });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const set = await permissionSetService.update(Number(req.params.id), req.body);
      if (!set) throw new AppError(404, 'Permission set introuvable');
      res.json({ success: true, data: set });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const r = await permissionSetService.delete(Number(req.params.id));
      if (!r.ok) {
        next(new AppError(r.reason === 'default' ? 409 : 404, r.reason === 'default' ? 'Un set par défaut ne peut pas être supprimé' : 'Introuvable'));
        return;
      }
      res.json({ success: true, message: 'Set supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
