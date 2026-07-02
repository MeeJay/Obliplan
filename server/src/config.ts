export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // Database
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://obliplan:changeme@localhost:5432/obliplan',

  // Session
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  sessionMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days

  // Audit-log HMAC key - keyed hash chain so an actor with only DB write access
  // cannot recompute the trail. Dedicated env var, falling back to the session
  // secret (both from env, never the repo). MUST stay stable across restarts, or
  // every existing row fails integrity verification.
  auditSecret: process.env.AUDIT_LOG_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-me',

  // CORS
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // HTTPS - set FORCE_HTTPS=true behind an HTTPS reverse proxy
  forceHttps: process.env.FORCE_HTTPS === 'true',

  // App
  appName: process.env.APP_NAME || 'Obliplan',
  appUrl: process.env.APP_URL || 'http://localhost:5173',

  // Web push (PWA notifications) - all from env; push is DISABLED unless BOTH keys
  // are set. Generate a keypair once with `npx web-push generate-vapid-keys` and put
  // them in the environment (never the repo). The subject is a mailto:/https: contact.
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:contact@obliplan.app',

  // Default admin (local-auth bootstrap)
  defaultAdminUsername: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
};
