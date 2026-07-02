import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@obliplan/shared';
import { AppError } from './errorHandler';
import { permissionService } from '../services/permission.service';

/** Require the session role to be one of `roles`. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session?.userId) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    if (!roles.includes(req.session.role as UserRole)) {
      next(new AppError(403, 'Insufficient permissions'));
      return;
    }
    next();
  };
}

/** Manager or admin (the planning-management gate). */
export function requireManager() {
  return requireRole('manager', 'admin');
}

/** Tenant administrator (also the Obligate all-tenants admin / god view). */
export function requireAdmin() {
  return requireRole('admin');
}

/**
 * Platform (system) administrator - for GLOBAL configuration that is NOT tenant-
 * scoped (SMTP, Obligate gateway, all-tenants/workspace management). Checks the
 * true platform flag (session.platformAdmin), NOT the effective per-tenant role,
 * so a mere tenant admin cannot reach it.
 */
export function requirePlatformAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.session?.userId) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    if (!req.session.platformAdmin) {
      next(new AppError(403, 'Réservé aux administrateurs de la plateforme'));
      return;
    }
    next();
  };
}

/**
 * Require a tenant-scoped capability (Axis B of the permission matrix).
 * Platform admin (session.role='admin') and tenant admin (user_tenants.role='admin')
 * bypass. Otherwise the capability must be in the user's permission set for the
 * active tenant. Apply AFTER requireAuth + requireTenant.
 */
export function requireTenantCapability(capability: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const isPlatformAdmin = req.session.role === 'admin';
      if (isPlatformAdmin) return next();
      if (!req.tenantId) return next(new AppError(403, 'Capacité requise'));
      const ok = await permissionService.userHasTenantCapability(
        req.session.userId!,
        req.tenantId,
        capability,
        false,
      );
      if (!ok) return next(new AppError(403, `Capacité requise : ${capability}`));
      next();
    } catch (err) {
      next(err);
    }
  };
}
