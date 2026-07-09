import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { appConfigService } from '../services/appConfig.service';
import { systemInfoService } from '../services/systemInfo.service';
import { mailerService } from '../services/mailer.service';
import { obligateService } from '../services/obligate.service';
import { provisionUserCore } from '../routes/obligateCallback.routes';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

function selfUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  return `${proto}://${host}`.replace(/\/$/, '');
}

export const appConfigController = {
  async system(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await systemInfoService.get() });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/config/obligate/import-users
   * Pull every Obligate user with access to this app and pre-provision them
   * locally, so they appear in Obliplan without waiting for their first login.
   * Idempotent: re-running refreshes existing accounts (roles, memberships).
   */
  async importObligateUsers(_req: Request, res: Response, next: NextFunction) {
    try {
      const raw = await appConfigService.getObligateRaw();
      if (!raw.url || !raw.apiKey) {
        throw new AppError(400, "La passerelle Obligate n'est pas configurée.");
      }
      const users = await obligateService.listAppUsers();
      let created = 0;
      let updated = 0;
      let failed = 0;
      for (const assertion of users) {
        try {
          const existing = await db('sso_foreign_users')
            .where({ foreign_source: 'obligate', foreign_user_id: assertion.obligateUserId })
            .first<{ local_user_id: number }>();
          await provisionUserCore(assertion);
          if (existing) updated++;
          else created++;
        } catch (err) {
          failed++;
          logger.warn({ err, obligateUserId: assertion.obligateUserId }, 'import: user provision failed');
        }
      }
      res.json({ success: true, data: { total: users.length, created, updated, failed } });
    } catch (err) {
      next(err);
    }
  },

  async getObligate(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await appConfigService.getObligateConfig() });
    } catch (err) {
      next(err);
    }
  },

  async patchObligate(req: Request, res: Response, next: NextFunction) {
    try {
      const patch = req.body as { url?: string | null; apiKey?: string | null; enabled?: boolean };
      // Never let the gateway URL point back at this app (would cause a redirect loop).
      if (patch.url && patch.url.replace(/\/$/, '') === selfUrl(req)) {
        throw new AppError(400, "L'URL Obligate ne peut pas pointer vers cette application.");
      }
      res.json({ success: true, data: await appConfigService.patchObligateConfig(patch) });
    } catch (err) {
      next(err);
    }
  },

  async getSmtp(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await appConfigService.getSmtpConfig() });
    } catch (err) {
      next(err);
    }
  },

  async patchSmtp(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await appConfigService.patchSmtpConfig(req.body) });
    } catch (err) {
      next(err);
    }
  },

  async testSmtp(req: Request, res: Response, next: NextFunction) {
    try {
      const { to } = req.body as { to: string };
      const result = await mailerService.sendTest(to);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
};
