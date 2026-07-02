import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { userService } from '../services/user.service';
import { authService } from '../services/auth.service';
import { tenantService } from '../services/tenant.service';
import { auditService } from '../services/audit.service';
import { AppError } from '../middleware/errorHandler';
import { getEffectiveTenantScope } from '../utils/tenantScope';
import type { CreateUserInput, UpdateUserInput } from '../validators/schemas';

export const userController = {
  /** Manager → own reports; admin → whole tenant (or all tenants in God View). */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const role = req.session.role;
      if (role === 'admin') {
        res.json({ success: true, data: await userService.getByTenant(getEffectiveTenantScope(req)) });
        return;
      }
      if (role === 'manager') {
        res.json({ success: true, data: await userService.getTeam(req.session.userId!, req.tenantId) });
        return;
      }
      throw new AppError(403, 'Accès refusé');
    } catch (err) {
      next(err);
    }
  },

  /** Any authenticated teammate: minimal user list for assignee pickers. */
  async listAssignable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await userService.getAssignable(req.tenantId) });
    } catch (err) {
      next(err);
    }
  },

  /** Users the caller may act ON BEHALF of: admin → whole tenant, manager → own reports, else none.
   *  Minimal {id, displayName, username} shape for on-behalf pickers (e.g. logging time for a teammate). */
  async listManageable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { role, platformAdmin, userId } = req.session;
      const users =
        platformAdmin || role === 'admin'
          ? await userService.getByTenant(req.tenantId)
          : role === 'manager'
            ? await userService.getTeam(userId!, req.tenantId)
            : [];
      res.json({
        success: true,
        data: users.map((u) => ({ id: u.id, displayName: u.displayName, username: u.username })),
      });
    } catch (err) {
      next(err);
    }
  },

  /** Admin creates a local salarié in the current tenant. */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = req.body as CreateUserInput;
      const existing = await db('users').where({ username: data.username }).first();
      if (existing) throw new AppError(409, 'Identifiant déjà utilisé');
      const role = data.role ?? 'employe';
      const user = await authService.createUser({
        tenantId: req.tenantId,
        username: data.username,
        password: data.password,
        role,
        displayName: data.displayName ?? null,
        email: data.email ?? null,
        contratId: data.contratId ?? null,
        managerId: data.managerId ?? null,
      });
      await tenantService.addUser(req.tenantId, user.id, role);
      await auditService.record(req.tenantId, req.session.userId!, 'user.create', {
        entityType: 'user',
        entityId: user.id,
      });
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await userService.getById(Number(req.params.id), req.tenantId);
      if (!user) throw new AppError(404, 'Utilisateur introuvable');
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },

  /** Admin manages users (role, contract, manager, activation). */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as UpdateUserInput;
      const user = await userService.update(Number(req.params.id), req.tenantId, body);
      if (!user) throw new AppError(404, 'Utilisateur introuvable');
      // The per-tenant role (user_tenants.role) is what drives capabilities - keep it
      // in sync when the role is changed from the Salariés screen.
      if (body.role !== undefined) {
        await tenantService.addUser(req.tenantId, Number(req.params.id), body.role);
      }
      await auditService.record(req.tenantId, req.session.userId!, 'user.update', {
        entityType: 'user',
        entityId: Number(req.params.id),
      });
      res.json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  },
};
