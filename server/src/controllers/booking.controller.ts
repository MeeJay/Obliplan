import type { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.service';
import { AppError } from '../middleware/errorHandler';

/** Host-side (authenticated) management of one's own booking page + appointments. */
export const bookingController = {
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await bookingService.getOrCreateConfig(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await bookingService.updateConfig(req.tenantId, req.session.userId!, req.body) });
    } catch (err) {
      next(err);
    }
  },

  async regenerate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ success: true, data: await bookingService.regenerateToken(req.tenantId, req.session.userId!) });
    } catch (err) {
      next(err);
    }
  },

  async appointments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const includePast = req.query.includePast === 'true';
      const data = await bookingService.listAppointments(req.tenantId, req.session.userId!, { includePast });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appt = await bookingService.setStatus(req.tenantId, req.session.userId!, Number(req.params.id), 'confirmed');
      if (!appt) throw new AppError(404, 'Rendez-vous introuvable');
      res.json({ success: true, data: appt });
    } catch (err) {
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const appt = await bookingService.setStatus(req.tenantId, req.session.userId!, Number(req.params.id), 'cancelled');
      if (!appt) throw new AppError(404, 'Rendez-vous introuvable');
      res.json({ success: true, data: appt });
    } catch (err) {
      next(err);
    }
  },
};
