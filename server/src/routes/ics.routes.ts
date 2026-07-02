import { Router } from 'express';
import { icsController } from '../controllers/ics.controller';

// PUBLIC feed router - mounted at the GLOBAL level (no requireAuth/requireTenant).
// A calendar client polls GET /api/ics/:token(.ics) unauthenticated; the token is
// the only secret and resolves to exactly one user's own planning.
export const icsPublicRoutes = Router();
icsPublicRoutes.get('/:token', icsController.feed);

// AUTHED router - mounted under the tenantRouter. The signed-in user manages their
// OWN subscription token.
export const icsAuthedRoutes = Router();
icsAuthedRoutes.get('/me', icsController.me);
icsAuthedRoutes.post('/regenerate', icsController.regenerate);
