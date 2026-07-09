import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { appConfigService } from '../services/appConfig.service';
import { obligateService, type ObligateUserAssertion } from '../services/obligate.service';
import { tenantService } from '../services/tenant.service';
import { MASTER_TENANT_ID, TENANT_SLUG_RE } from '@obliplan/shared';
import { logger } from '../utils/logger';

const router = Router();

/** Map an Obligate assertion to a single Obliplan app role (users.role). */
function computeAppRole(assertion: ObligateUserAssertion): 'admin' | 'manager' | 'employe' {
  if (assertion.role === 'admin') return 'admin';
  const roles = assertion.tenants.map((t) => t.role);
  if (roles.includes('admin') || roles.includes('manager')) return 'manager';
  return 'employe';
}

// Themes Obliplan can actually render (one [data-theme=...] block each). Obligate may
// offer themes we don't ship; those are ignored so we never persist an unrenderable id.
const KNOWN_THEMES = new Set(['obli-operator', 'obli-daylight', 'modern', 'neon']);

/** Obligate-selected theme, if it's one Obliplan supports; else null (leave as-is). */
function syncedTheme(assertion: ObligateUserAssertion): string | null {
  const t = assertion.preferences?.preferredTheme;
  return t && KNOWN_THEMES.has(t) ? t : null;
}

/**
 * Provision/sync a local user from an Obligate assertion WITHOUT touching the
 * session. Creates or refreshes the user, the sso_foreign_users link and the
 * per-tenant memberships. Returns the local user id. Shared by the SSO callback
 * (which then attaches a session) and the admin "import from Obligate" action
 * (which pre-provisions users who have not logged in yet).
 */
export async function provisionUserCore(assertion: ObligateUserAssertion): Promise<number> {
  const appRole = computeAppRole(assertion);
  const theme = syncedTheme(assertion);

  // Resolve a home tenant_id for the user record (first matching assertion tenant, else master).
  let homeTenantId = MASTER_TENANT_ID;
  for (const t of assertion.tenants) {
    const tenant = await tenantService.getBySlug(t.slug);
    if (tenant) {
      homeTenantId = tenant.id;
      break;
    }
  }

  // 1. Locate existing local user. An anonymised (RGPD-erased) account is treated
  // as absent so it can never be silently re-provisioned/un-anonymised - a
  // returning employee gets a fresh account instead of resurrecting the erased one.
  let localUserId = 0;
  if (assertion.linkedLocalUserId) {
    const existing = await db('users').where({ id: assertion.linkedLocalUserId }).first();
    if (existing && !existing.anonymized_at) localUserId = existing.id;
  }
  if (!localUserId) {
    const link = await db('sso_foreign_users')
      .where({ foreign_source: 'obligate', foreign_user_id: assertion.obligateUserId })
      .first<{ local_user_id: number }>();
    if (link) {
      const existing = await db('users').where({ id: link.local_user_id }).first();
      if (existing && !existing.anonymized_at) localUserId = existing.id;
      else await db('sso_foreign_users').where({ local_user_id: link.local_user_id }).del();
    }
  }

  // 2. Create if needed.
  if (!localUserId) {
    const [row] = await db('users')
      .insert({
        tenant_id: homeTenantId,
        username: `og_${assertion.username}`,
        password_hash: null,
        display_name: assertion.displayName || assertion.username,
        email: assertion.email,
        role: appRole,
        is_active: true,
        foreign_source: 'obligate',
        foreign_id: assertion.obligateUserId,
        preferred_language: assertion.preferences?.preferredLanguage || 'fr',
        avatar: assertion.preferences?.profilePhotoUrl ?? null,
        preferences: theme ? JSON.stringify({ preferredTheme: theme }) : '{}',
      })
      .returning('id');
    localUserId = (row as { id: number }).id ?? (row as unknown as number);
    await db('sso_foreign_users')
      .insert({ foreign_source: 'obligate', foreign_user_id: assertion.obligateUserId, local_user_id: localUserId })
      .onConflict(['foreign_source', 'foreign_user_id'])
      .merge({ local_user_id: localUserId });
    obligateService.reportProvision(assertion.obligateUserId, localUserId).catch(() => {});
  } else {
    // Obligate owns identity + role, sync every login (promote AND demote).
    const syncUpdate: Record<string, unknown> = {
      email: assertion.email,
      display_name: assertion.displayName || assertion.username,
      role: appRole,
      updated_at: new Date(),
    };
    // Import/refresh the Obligate avatar; only touch it when the assertion carries
    // one (undefined ⇒ leave as-is, so a transient omission can't wipe it).
    if (assertion.preferences?.profilePhotoUrl !== undefined) {
      syncUpdate.avatar = assertion.preferences.profilePhotoUrl;
    }
    // Mirror the Obligate-selected theme into preferences via a jsonb merge, so we
    // set only preferredTheme and leave any local prefs (toasts, etc.) untouched.
    if (theme) {
      syncUpdate.preferences = db.raw(`coalesce(preferences, '{}'::jsonb) || ?::jsonb`, [
        JSON.stringify({ preferredTheme: theme }),
      ]);
    }
    await db('users').where({ id: localUserId }).update(syncUpdate);
  }

  // 3. Sync per-tenant memberships from assertion.tenants[].
  for (const t of assertion.tenants) {
    const tenant = await tenantService.getBySlug(t.slug);
    if (!tenant) continue;
    const roleSlug = t.role && t.role.length > 0 ? t.role : 'employe';
    await db('user_tenants')
      .insert({ user_id: localUserId, tenant_id: tenant.id, role: roleSlug })
      .onConflict(['user_id', 'tenant_id'])
      .merge({ role: roleSlug });
  }
  // All-tenants admin → ensure a master-tenant membership (god view landing).
  if (appRole === 'admin') {
    await db('user_tenants')
      .insert({ user_id: localUserId, tenant_id: MASTER_TENANT_ID, role: 'admin' })
      .onConflict(['user_id', 'tenant_id'])
      .merge({ role: 'admin' });
  }

  return localUserId;
}

/** Provision the user (via provisionUserCore) AND attach an SSO session. Returns local user id. */
async function provisionObligateUser(assertion: ObligateUserAssertion, req: import('express').Request): Promise<number> {
  const localUserId = await provisionUserCore(assertion);
  const appRole = computeAppRole(assertion);

  // 4. Session.
  req.session.userId = localUserId;
  req.session.username = `og_${assertion.username}`;
  req.session.platformAdmin = appRole === 'admin';

  // 5. Resolve active tenant: cross-app requested slug → else first accessible → else master.
  let resolvedTenantId: number | null = null;
  const requestedSlug = req.session.requestedTenantSlug;
  if (requestedSlug) {
    const isAdmin = appRole === 'admin';
    const match = isAdmin
      ? await tenantService.getBySlug(requestedSlug)
      : (await db('tenants as t')
          .join('user_tenants as ut', 'ut.tenant_id', 't.id')
          .where({ 't.slug': requestedSlug, 'ut.user_id': localUserId })
          .select('t.id')
          .first<{ id: number }>()) ?? null;
    if (match) resolvedTenantId = match.id;
    delete req.session.requestedTenantSlug;
  }
  if (resolvedTenantId === null) {
    const tenant = await tenantService.getFirstTenantForUser(localUserId);
    resolvedTenantId = tenant?.id ?? MASTER_TENANT_ID;
  }
  req.session.currentTenantId = resolvedTenantId;
  // Effective per-tenant role for the landing tenant.
  req.session.role = req.session.platformAdmin
    ? 'admin'
    : (await tenantService.getUserTenantRole(localUserId, resolvedTenantId)) ?? 'employe';

  return localUserId;
}

// GET /auth/sso-redirect - server-side redirect to Obligate authorize.
router.get('/sso-redirect', async (req, res) => {
  try {
    const requested = req.query.tenant;
    if (typeof requested === 'string' && TENANT_SLUG_RE.test(requested)) {
      req.session.requestedTenantSlug = requested;
    }
    const raw = await appConfigService.getObligateRaw();
    if (!raw.enabled || !raw.url || !raw.apiKey) {
      res.redirect('/login');
      return;
    }
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    const redirectUri = `${protocol}://${host}/auth/callback`;
    const state = crypto.randomBytes(32).toString('hex');
    req.session.oauthState = state;

    const url = `${raw.url}/authorize?client_id=${encodeURIComponent(raw.apiKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    req.session.save((err) => {
      if (err) {
        logger.error(err, 'sso-redirect: session save failed');
        res.redirect('/login?error=sso_failed');
        return;
      }
      res.redirect(url);
    });
  } catch (err) {
    logger.error(err, 'sso-redirect error');
    res.redirect('/login?error=sso_failed');
  }
});

// GET /auth/sso-logout - destroy the local session AND the Obligate session
// (single logout), then land back on the login page.
router.get('/sso-logout', async (req, res) => {
  try {
    const raw = await appConfigService.getObligateRaw();
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    const selfLogin = `${protocol}://${host}/login`;
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      if (raw.enabled && raw.url) {
        res.redirect(`${raw.url}/logout?redirect_uri=${encodeURIComponent(selfLogin)}`);
      } else {
        res.redirect('/login');
      }
    });
  } catch {
    res.redirect('/login');
  }
});

// GET /auth/callback?code&state - exchange + provision + session.
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code) {
      res.redirect('/login?error=sso_failed');
      return;
    }
    const expected = req.session.oauthState;
    if (!expected || !state || state !== expected) {
      logger.warn('Obligate callback: state mismatch');
      res.redirect('/login?error=sso_failed');
      return;
    }
    delete req.session.oauthState;

    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    const redirectUri = `${protocol}://${host}/auth/callback`;

    const assertion = await obligateService.exchangeCode(code, redirectUri);
    if (!assertion) {
      res.redirect('/login?error=sso_failed');
      return;
    }

    await provisionObligateUser(assertion, req);
    req.session.save((err) => {
      if (err) {
        logger.error(err, 'callback: session save failed');
        res.redirect('/login?error=sso_failed');
        return;
      }
      res.redirect('/');
    });
  } catch (err) {
    logger.error(err, 'Obligate callback error');
    res.redirect('/login?error=sso_failed');
  }
});

export default router;
