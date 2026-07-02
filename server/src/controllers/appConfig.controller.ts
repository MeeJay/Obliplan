import type { Request, Response, NextFunction } from 'express';
import { appConfigService } from '../services/appConfig.service';
import { systemInfoService } from '../services/systemInfo.service';
import { mailerService } from '../services/mailer.service';
import { AppError } from '../middleware/errorHandler';

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
