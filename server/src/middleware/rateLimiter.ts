import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Coarse limiter for unauthenticated endpoints. Authenticated users are
 * skipped (session set before this middleware) to avoid shared-IP false
 * positives behind a reverse proxy.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => !!req.session?.userId,
});
