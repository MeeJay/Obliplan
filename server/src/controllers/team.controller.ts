import type { Request, Response, NextFunction } from 'express';
import { teamService } from '../services/team.service';
import { AppError } from '../middleware/errorHandler';
import type {
  CreateTeamInput,
  UpdateTeamInput,
  SetTeamMembersInput,
  SetTeamPermissionsInput,
} from '../validators/team.schema';

export const teamController = {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await teamService.getAll(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const team = await teamService.create(req.tenantId, req.body as CreateTeamInput);
      res.status(201).json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const team = await teamService.update(Number(req.params.id), req.tenantId, req.body as UpdateTeamInput);
      if (!team) throw new AppError(404, 'Équipe introuvable');
      res.json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await teamService.delete(Number(req.params.id), req.tenantId);
      if (!ok) throw new AppError(404, 'Équipe introuvable');
      res.json({ success: true, message: 'Équipe supprimée' });
    } catch (err) {
      next(err);
    }
  },

  async getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const team = await teamService.getById(Number(req.params.id), req.tenantId);
      if (!team) throw new AppError(404, 'Équipe introuvable');
      res.json({ success: true, data: await teamService.getMembers(team.id) });
    } catch (err) {
      next(err);
    }
  },

  async setMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const team = await teamService.getById(Number(req.params.id), req.tenantId);
      if (!team) throw new AppError(404, 'Équipe introuvable');
      const { userIds } = req.body as SetTeamMembersInput;
      res.json({ success: true, data: await teamService.setMembers(team.id, req.tenantId, userIds) });
    } catch (err) {
      next(err);
    }
  },

  async getPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const team = await teamService.getById(Number(req.params.id), req.tenantId);
      if (!team) throw new AppError(404, 'Équipe introuvable');
      res.json({ success: true, data: await teamService.getPermissions(team.id, req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  async setPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const team = await teamService.getById(Number(req.params.id), req.tenantId);
      if (!team) throw new AppError(404, 'Équipe introuvable');
      const { permissions } = req.body as SetTeamPermissionsInput;
      res.json({ success: true, data: await teamService.setPermissions(team.id, req.tenantId, permissions) });
    } catch (err) {
      next(err);
    }
  },
};
