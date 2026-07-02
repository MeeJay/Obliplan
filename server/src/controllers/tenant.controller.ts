import type { Request, Response, NextFunction } from 'express';
import { tenantService } from '../services/tenant.service';
import { AppError } from '../middleware/errorHandler';
import { MASTER_TENANT_ID } from '@obliplan/shared';
import type { TenantRole } from '@obliplan/shared';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'workspace';
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  let i = 1;
  while (await tenantService.getBySlug(candidate)) candidate = `${base}-${i++}`;
  return candidate;
}

export const tenantController = {
  /** GET /api/tenants - tenants the current user can access. */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenants = await tenantService.getTenantsForUser(req.session.userId!);
      res.json({ success: true, data: tenants });
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/tenant/switch - change the active tenant. */
  async switch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = Number((req.body as { tenantId?: number }).tenantId);
      if (!tenantId) throw new AppError(400, 'tenantId requis');

      const isAdmin = req.session.role === 'admin';
      const allowed = isAdmin || (await tenantService.userHasAccess(req.session.userId!, tenantId));
      if (!allowed) throw new AppError(403, 'Accès au tenant refusé');

      const tenant = await tenantService.getById(tenantId);
      if (!tenant) throw new AppError(404, 'Tenant introuvable');

      req.session.currentTenantId = tenantId;
      // Re-resolve the effective per-tenant role for the new workspace.
      req.session.role = req.session.platformAdmin
        ? 'admin'
        : (await tenantService.getUserTenantRole(req.session.userId!, tenantId)) ?? 'employe';
      res.json({ success: true, data: { currentTenantId: tenantId } });
    } catch (err) {
      next(err);
    }
  },

  // ── Admin: workspace management ──────────────────────────────────────────────
  /** GET /api/tenants/all - every workspace (admin). */
  async listAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await tenantService.getAll() });
    } catch (err) {
      next(err);
    }
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, slug } = req.body as { name: string; slug?: string };
      const finalSlug = await uniqueSlug(slug ? slugify(slug) : slugify(name));
      const tenant = await tenantService.create({ name, slug: finalSlug });
      // The creating admin joins as a member so the workspace appears in their switcher.
      await tenantService.addUser(tenant.id, req.session.userId!, 'admin');
      res.status(201).json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      const data = req.body as { name?: string; slug?: string };
      if (data.slug) data.slug = slugify(data.slug);
      const tenant = await tenantService.update(id, data);
      if (!tenant) throw new AppError(404, 'Workspace introuvable');
      res.json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (id === MASTER_TENANT_ID) throw new AppError(400, 'Le workspace par défaut ne peut pas être supprimé');
      await tenantService.delete(id);
      res.json({ success: true, message: 'Workspace supprimé' });
    } catch (err) {
      next(err);
    }
  },

  async members(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await tenantService.getMembers(Number(req.params.id)) });
    } catch (err) {
      next(err);
    }
  },

  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = Number(req.params.id);
      const { userId, role } = req.body as { userId: number; role?: TenantRole };
      if (!userId) throw new AppError(400, 'userId requis');
      await tenantService.addUser(tenantId, userId, role ?? 'employe');
      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  },

  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await tenantService.removeUser(Number(req.params.id), Number(req.params.userId));
      res.json({ success: true, message: 'Membre retiré' });
    } catch (err) {
      next(err);
    }
  },
};
