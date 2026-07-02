import { Router } from 'express';
import { db } from '../db';
import { obligateService } from '../services/obligate.service';
import { permissionSetService } from '../services/permissionSet.service';
import { logger } from '../utils/logger';

// Reverse endpoints Obligate calls into Obliplan (auth = our stored API key).
// Mounted at /api/auth.
const router = Router();

async function requireObligate(authHeader: string | undefined, res: import('express').Response): Promise<boolean> {
  const ok = await obligateService.verifyInboundBearer(authHeader);
  if (!ok) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return false;
  }
  return true;
}

// GET /api/auth/app-info - teams + tenants + roles for Obligate's mapping UI.
router.get('/app-info', async (req, res) => {
  if (!(await requireObligate(req.headers.authorization, res))) return;
  try {
    const tenants = await db('tenants').select('slug', 'name').orderBy('name');
    const permissionSets = await permissionSetService.getAll();
    res.json({
      success: true,
      data: {
        roles: ['admin', 'manager', 'employe'],
        teams: [],
        tenants,
        // Slugs Obligate can map per (group, tenant) → applied to user_tenants.role.
        permissionSets: permissionSets.map((s) => ({ slug: s.slug, name: s.name })),
      },
    });
  } catch (err) {
    logger.error(err, 'app-info error');
    res.status(500).json({ success: false, error: 'Failed to fetch app info' });
  }
});

// GET /api/auth/dashboard-stats - surfaced on the Obligate dashboard.
router.get('/dashboard-stats', async (req, res) => {
  if (!(await requireObligate(req.headers.authorization, res))) return;
  try {
    const [users, shifts] = await Promise.all([
      db('users').where({ is_active: true }).count('id as c').first(),
      db('shifts').count('id as c').first(),
    ]);
    res.json({
      success: true,
      data: {
        stats: [
          { label: 'Salariés', value: Number((users as { c?: number })?.c ?? 0), color: '#7c6cff' },
          { label: 'Shifts', value: Number((shifts as { c?: number })?.c ?? 0), color: '#1edd8a' },
        ],
      },
    });
  } catch {
    res.json({ success: true, data: null });
  }
});

// POST /api/auth/sso-user-sync - Obligate pushes user state changes.
router.post('/sso-user-sync', async (req, res) => {
  if (!(await requireObligate(req.headers.authorization, res))) return;
  try {
    const { remoteUserId, action, role } = req.body as {
      remoteUserId: number;
      action: 'deactivate' | 'reactivate' | 'delete' | 'update-role';
      role?: string;
    };
    if (!remoteUserId || !action) {
      res.status(400).json({ success: false, error: 'Missing fields' });
      return;
    }
    const user = await db('users').where({ id: remoteUserId }).first();
    if (!user) {
      res.json({ success: true });
      return;
    }
    switch (action) {
      case 'deactivate':
        await db('users').where({ id: remoteUserId }).update({ is_active: false, updated_at: new Date() });
        break;
      case 'reactivate':
        await db('users').where({ id: remoteUserId }).update({ is_active: true, updated_at: new Date() });
        break;
      case 'delete':
        await db('sso_foreign_users').where({ local_user_id: remoteUserId }).del();
        await db('users').where({ id: remoteUserId }).del();
        break;
      case 'update-role': {
        const next = role === 'admin' ? 'admin' : role === 'manager' ? 'manager' : 'employe';
        await db('users').where({ id: remoteUserId }).update({ role: next, updated_at: new Date() });
        break;
      }
    }
    logger.info(`SSO sync: ${action} user #${remoteUserId}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(err, 'sso-user-sync error');
    res.status(500).json({ success: false, error: 'Sync failed' });
  }
});

export default router;
