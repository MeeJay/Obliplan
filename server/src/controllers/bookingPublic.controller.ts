import type { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.service';
import { AppError } from '../middleware/errorHandler';

/**
 * PUBLIC (no auth / no tenant) booking endpoints. Token-gated; a page is only
 * reachable if it exists and is active. Responses are PII-free (free slots only).
 */
export const bookingPublicController = {
  async page(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      const data = await bookingService.getPublicPage(String(req.params.token), from, to);
      if (!data) throw new AppError(404, 'Page de réservation introuvable');
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async book(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await bookingService.book(String(req.params.token), req.body);
      if ('error' in result) {
        throw new AppError(
          result.error === 'unknown' ? 404 : 409,
          result.error === 'unknown' ? 'Page de réservation introuvable' : 'Créneau non disponible',
        );
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ok = await bookingService.cancelByToken(String(req.params.cancelToken));
      if (!ok) throw new AppError(404, 'Rendez-vous introuvable');
      res.json({ success: true, message: 'Rendez-vous annulé' });
    } catch (err) {
      next(err);
    }
  },
};
