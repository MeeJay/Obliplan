import type { Request, Response, NextFunction } from 'express';
import { icsService } from '../services/ics.service';
import { config } from '../config';

/** Full subscribe URL for a token (the api prefix is applied by app.ts). */
function subscribeUrl(token: string): string {
  return `${config.appUrl}/api/ics/${token}.ics`;
}

export const icsController = {
  /**
   * GET /ics/:token(.ics) - PUBLIC (no auth/tenant). Emits the token owner's own
   * planning as raw text/calendar; an unknown token is a plain-text 404.
   */
  async feed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const raw = String(req.params.token);
      // This PUBLIC catch-all `/ics/:token` is mounted (globally) BEFORE the authed
      // tenant router's `/ics/me` + `/ics/regenerate`, so it would otherwise swallow
      // them (resolving as always-unknown feed tokens). Real tokens are 32-char
      // base64url and can never be these words - let the reserved paths fall through.
      if (raw === 'me' || raw === 'regenerate') return next();
      const token = raw.replace(/\.ics$/i, '');
      const body = await icsService.buildFeed(token);
      if (body === null) {
        res.status(404).type('text/plain').send('Not found');
        return;
      }
      res.type('text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="obliplan.ics"');
      res.send(body);
    } catch (err) {
      next(err);
    }
  },

  /** GET /ics/me - authed: ensure a token exists, return the subscribe URL. */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = await icsService.ensureToken(req.session.userId!);
      res.json({ success: true, data: { url: subscribeUrl(token), token } });
    } catch (err) {
      next(err);
    }
  },

  /** POST /ics/regenerate - authed: rotate the token (old URL stops working). */
  async regenerate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = await icsService.regenerate(req.session.userId!);
      res.json({ success: true, data: { url: subscribeUrl(token), token } });
    } catch (err) {
      next(err);
    }
  },
};
