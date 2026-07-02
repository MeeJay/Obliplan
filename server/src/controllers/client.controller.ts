import type { Request, Response, NextFunction } from 'express';
import { clientService } from '../services/client.service';
import { AppError } from '../middleware/errorHandler';
import { getEffectiveTenantScope } from '../utils/tenantScope';
import type { CreateClientInput, UpdateClientInput } from '../validators/client.schema';

export const clientController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clients = await clientService.getAll(getEffectiveTenantScope(req), {
        userId: req.session.userId!,
        role: req.session.role!,
        platformAdmin: req.session.platformAdmin,
      });
      res.json({ success: true, data: clients });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.getById(Number(req.params.id), getEffectiveTenantScope(req));
      if (!client) throw new AppError(404, 'Client introuvable');
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.create(req.tenantId, req.body as CreateClientInput);
      res.status(201).json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const client = await clientService.update(Number(req.params.id), req.tenantId, req.body as UpdateClientInput);
      if (!client) throw new AppError(404, 'Client introuvable');
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await clientService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Client introuvable');
      res.json({ success: true, message: 'Client supprimé' });
    } catch (err) {
      next(err);
    }
  },
};
