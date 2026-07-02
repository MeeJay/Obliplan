import type { Request, Response, NextFunction } from 'express';
import { pushService } from '../services/push.service';
import { AppError } from '../middleware/errorHandler';

export const pushController = {
  /** GET /push/public-key - the VAPID public key + whether push is enabled server-side. */
  async publicKey(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: { publicKey: pushService.publicKey(), enabled: pushService.isEnabled() } });
    } catch (err) {
      next(err);
    }
  },

  /** POST /push/subscribe - register the caller's current device subscription. */
  async subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const b = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
      const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
      const p256dh = b.keys && typeof b.keys.p256dh === 'string' ? b.keys.p256dh : '';
      const auth = b.keys && typeof b.keys.auth === 'string' ? b.keys.auth : '';
      if (!endpoint || !p256dh || !auth) throw new AppError(400, 'Abonnement push invalide.');
      await pushService.subscribe(req.session.userId!, { endpoint, keys: { p256dh, auth } });
      res.json({ success: true, data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },

  /** POST /push/unsubscribe - drop the caller's device subscription by endpoint. */
  async unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const endpoint = typeof (req.body as { endpoint?: unknown })?.endpoint === 'string' ? (req.body.endpoint as string) : '';
      if (!endpoint) throw new AppError(400, 'Endpoint requis.');
      await pushService.unsubscribe(req.session.userId!, endpoint);
      res.json({ success: true, data: { ok: true } });
    } catch (err) {
      next(err);
    }
  },
};
