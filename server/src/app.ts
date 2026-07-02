import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import { readFileSync } from 'fs';
import { join } from 'path';

let serverVersion = 'dev';
try {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version: string };
  serverVersion = pkg.version;
} catch {
  /* ignore */
}

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import { routes } from './routes';
import obligateCallbackRoutes from './routes/obligateCallback.routes';
import { logger } from './utils/logger';

const PgSession = connectPgSimple(session);

export function createApp() {
  const app = express();

  // Trust the first reverse-proxy hop (X-Forwarded-For / -Proto).
  app.set('trust proxy', 1);

  app.use(
    helmet({
      // ObliTools desktop shell embeds Obli apps in an iframe - must allow framing.
      frameguard: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'wss:', 'ws:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    }),
  );
  app.use(cors({ origin: config.clientOrigin, credentials: true }));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Sessions stored in PostgreSQL via connect-pg-simple.
  const sessionStore = new PgSession({
    conString: config.databaseUrl,
    tableName: 'session',
    createTableIfMissing: false,
  });
  sessionStore.on('error', (err: Error) => {
    logger.error(err, 'Session store error - sessions may fail until DB recovers');
  });

  app.use(
    session({
      store: sessionStore,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        // SameSite=None + Secure + Partitioned go together (cross-site iframe / OAuth).
        secure: config.forceHttps,
        httpOnly: true,
        maxAge: config.sessionMaxAge,
        sameSite: config.forceHttps ? 'none' : 'lax',
        partitioned: config.forceHttps,
      },
    }),
  );

  // X-Auth-Token fallback: cross-site iframe contexts (ObliTools shell) where the
  // browser blocks cookies. Login returns sessionToken = sessionID; client sends it
  // as X-Auth-Token; we hydrate req.session from the store.
  app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    if (req.session?.userId) return next();
    const token = req.headers['x-auth-token'];
    if (!token || typeof token !== 'string') return next();
    sessionStore.get(token, (err, sessionData) => {
      if (!err && sessionData) {
        const s = sessionData as unknown as Record<string, unknown>;
        if (typeof s.userId === 'number') {
          req.session.userId = s.userId;
          req.session.username = (s.username as string) ?? '';
          req.session.role = (s.role as string) ?? 'employe';
          req.session.platformAdmin = (s.platformAdmin as boolean) ?? false;
          req.session.currentTenantId = (s.currentTenantId as number) ?? 1;
        }
      }
      next();
    });
  });

  app.use(apiLimiter);

  // Obligate SSO callback (browser redirect, NOT under /api).
  app.use('/auth', obligateCallbackRoutes);

  // API routes
  app.use('/api', routes);

  // Public health check (also surfaces version to the login page).
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: serverVersion, timestamp: new Date().toISOString() });
  });

  // Serve the built client in production.
  if (!config.isDev) {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
