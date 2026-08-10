import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { authService } from '../services/auth.service';
import { tenantService } from '../services/tenant.service';
import { obligateService } from '../services/obligate.service';
import { permissionService } from '../services/permission.service';
import { tenantModuleService } from '../services/tenantModule.service';
import { AppError } from '../middleware/errorHandler';
import type { LoginRequest, SessionInfo } from '@obliplan/shared';

/** Set req.session.currentTenantId to the user's default workspace if set and still
 *  accessible, otherwise their first accessible tenant. */
export async function setSessionTenant(req: Request, userId: number): Promise<void> {
  const preferred = await tenantService.getPreferredTenant(userId);
  if (preferred && (req.session.platformAdmin || (await tenantService.userHasAccess(userId, preferred)))) {
    req.session.currentTenantId = preferred;
    return;
  }
  const tenant = await tenantService.getFirstTenantForUser(userId);
  req.session.currentTenantId = tenant?.id ?? 1;
}

/** Resolve the session's effective role for the active tenant (platform admin → 'admin'). */
export async function applyTenantRole(req: Request, userId: number): Promise<void> {
  const tenantId = req.session.currentTenantId;
  if (!tenantId) return;
  req.session.role = req.session.platformAdmin
    ? 'admin'
    : (await tenantService.getUserTenantRole(userId, tenantId)) ?? 'employe';
}

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body as LoginRequest;
      const user = await authService.authenticate(username, password);
      if (!user) throw new AppError(401, 'Identifiant ou mot de passe invalide');

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.platformAdmin = user.role === 'admin';
      await setSessionTenant(req, user.id);
      await applyTenantRole(req, user.id);

      // sessionToken (= sessionID) lets cross-site iframe clients send X-Auth-Token.
      res.json({ success: true, data: { user, sessionToken: req.sessionID } });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      req.session.destroy((err) => {
        if (err) {
          next(new AppError(500, 'Échec de la déconnexion'));
          return;
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Déconnecté' });
      });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getUserById(req.session.userId!);
      if (!user) throw new AppError(401, 'Utilisateur introuvable');
      if (!req.session.currentTenantId) await setSessionTenant(req, user.id);
      // Backfill + resolve the per-tenant effective role (handles legacy sessions).
      if (req.session.platformAdmin === undefined) req.session.platformAdmin = user.role === 'admin';
      await applyTenantRole(req, user.id);
      const isPlatformAdmin = !!req.session.platformAdmin;

      const tenants = await tenantService.getTenantsForUser(user.id);
      const capabilities = await permissionService.listUserTenantCapabilities(
        user.id,
        req.session.currentTenantId!,
        isPlatformAdmin,
      );
      const modules = await tenantModuleService.getEnabled(req.session.currentTenantId!);
      // Surface the EFFECTIVE per-tenant role to the client (drives nav + can()).
      const effectiveUser = { ...user, role: (req.session.role ?? user.role) as typeof user.role };
      const data: SessionInfo = {
        user: effectiveUser,
        currentTenantId: req.session.currentTenantId!,
        tenants,
        capabilities,
        modules,
        platformAdmin: isPlatformAdmin,
        preferredTenantId: await tenantService.getPreferredTenant(user.id),
      };
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/auth/me/shift-notify - self opt-in to shift-change notifications.
   * Body { minutesBefore: number|null }: null (or ≤0) disables; a positive value is the lead time.
   */
  async setShiftNotify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const raw = (req.body as { minutesBefore?: number | null }).minutesBefore;
      const minutesBefore =
        raw === null || raw === undefined || Number(raw) <= 0 ? null : Math.min(120, Math.round(Number(raw)));
      await db('users').where({ id: req.session.userId! }).update({ shift_notify_before_min: minutesBefore, updated_at: new Date() });
      res.json({ success: true, data: { shiftNotifyBeforeMin: minutesBefore } });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/connected-apps - Obli* apps reachable via Obligate, for the
   * header app switcher. Scoped to the user's Obligate permissions.
   */
  async connectedApps(req: Request, res: Response): Promise<void> {
    try {
      const row = (await db('users')
        .where({ id: req.session.userId })
        .select('foreign_source', 'foreign_id')
        .first()) as { foreign_source: string | null; foreign_id: number | null } | undefined;
      const obligateUserId = row?.foreign_source === 'obligate' && row.foreign_id ? row.foreign_id : null;
      res.json({ success: true, data: await obligateService.getConnectedApps(obligateUserId) });
    } catch {
      res.json({ success: true, data: [] });
    }
  },

  /** Public: lets the login page decide whether to show the SSO button. */
  async ssoConfig(_req: Request, res: Response): Promise<void> {
    try {
      const cfg = await obligateService.getSsoConfig();
      res.json({ success: true, data: cfg });
    } catch {
      res.json({ success: true, data: { obligateEnabled: false, obligateReachable: false, obligateUrl: null } });
    }
  },
};
