import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller';
import { validate } from '../middleware/validate';
import { bookingConfigSchema } from '../validators/booking.schema';

// Authenticated, tenant-scoped: every user manages their OWN booking page + inbox.
const router = Router();

router.get('/me', bookingController.me);
router.put('/me', validate(bookingConfigSchema), bookingController.update);
router.post('/me/regenerate', bookingController.regenerate);

router.get('/appointments', bookingController.appointments);
router.post('/appointments/:id/confirm', bookingController.confirm);
router.post('/appointments/:id/cancel', bookingController.cancel);

export default router;
