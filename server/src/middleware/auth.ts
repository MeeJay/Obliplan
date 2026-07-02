import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

// Session shape carried in the PG-backed session store.
declare module 'express-session' {
  interface SessionData {
    userId: number;
    username: string;
    /** Effective role IN THE ACTIVE TENANT (resolved from user_tenants; 'admin' for platform admins). */
    role: string;
    /** True when the user is a platform admin (global users.role='admin') - drives God View. */
    platformAdmin: boolean;
    currentTenantId: number;
    // OAuth (Obligate SSO) - CSRF state + cross-app tenant handoff
    oauthState?: string;
    requestedTenantSlug?: string;
  }
}

/** Reject the request unless a session user is present. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    next(new AppError(401, 'Authentication required'));
    return;
  }
  next();
}
