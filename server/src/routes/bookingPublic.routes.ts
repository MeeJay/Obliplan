import { Router } from 'express';
import { bookingPublicController } from '../controllers/bookingPublic.controller';
import { validate } from '../middleware/validate';
import { createAppointmentSchema } from '../validators/booking.schema';

// PUBLIC (no auth / no tenant). Token-gated. Covered by the global /api rate limiter.
const router = Router();

router.get('/:token', bookingPublicController.page);
router.post('/:token', validate(createAppointmentSchema), bookingPublicController.book);
router.post('/appointment/:cancelToken/cancel', bookingPublicController.cancel);

export default router;
