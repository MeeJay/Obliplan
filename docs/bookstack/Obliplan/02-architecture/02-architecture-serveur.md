Le serveur est une API REST Express structurée en couches et protégée par une chaîne de middleware montée dans `app.ts`. Le point d'entrée `index.ts` applique les migrations, provisionne le tenant maître et l'admin par défaut, puis démarre le serveur HTTP.

## Découpage en couches

Le code métier suit une séparation stricte des responsabilités :

```
routes/        déclarent les endpoints, montent les gates (middleware) et appellent…
controllers/   valident/façonnent la requête, formatent l'enveloppe de réponse et appellent…
services/      portent la logique métier et les accès aux données…
db/ (Knex)     query builder Knex sur PostgreSQL
```

- Les **routes** ne contiennent aucune logique métier : elles enchaînent gates et handlers de contrôleur.
- Les **contrôleurs** lisent `req.session` / `req.tenantId`, délèguent au service, puis renvoient l'enveloppe standard `{ success, data }` ou passent l'erreur à `next()`.
- Les **services** encapsulent les requêtes Knex et mappent les lignes `snake_case` vers les types `@obliplan/shared` (camelCase).
- L'accès à la base passe par l'instance Knex unique exportée par `db/index.ts` (avec un `typeParser` PostgreSQL sur les colonnes `date` pour rester stable côté fuseau horaire).

## Montage des routes

`routes/index.ts` distingue trois familles de routes selon les gates appliqués.

### Routes globales (sans tenant)

Montées directement, sans `requireTenant` :

| Préfixe | Contenu |
|---|---|
| `/api/auth` | login / logout / me / sso-config (+ endpoints inverses Obligate en Bearer) |
| `/api/admin/config` | About / passerelle Obligate / SMTP |
| `/api/permission-sets` | matrice de permissions (globale) |
| `/api/ics` (public) | flux calendrier **public**, gardé par token, sans auth ni tenant |
| `/api/public/booking` (public) | prise de rendez-vous **publique**, gardée par token, sans auth ni tenant |

### Gestion des tenants (`requireAuth`, sans `requireTenant`)

| Préfixe | Contenu |
|---|---|
| `/api/tenants` | mes workspaces, gestion (admin plateforme), modules d'un workspace arbitraire |
| `/api/tenant` | `POST /tenant/switch` (bascule de workspace) |

### Routes tenant-scopées (`requireAuth` + `requireTenant`)

Un sous-routeur `tenantRouter` applique d'abord `requireAuth` puis `requireTenant`, avant de monter chaque domaine. Certains domaines ajoutent un gate `requireModule(...)` :

```ts
const tenantRouter = Router();
tenantRouter.use(requireAuth);
tenantRouter.use(requireTenant);

tenantRouter.use('/recup', requireModule('recup'), recupRoutes);
tenantRouter.use('/boards', requireModule('projets'), boardsRoutes);
tenantRouter.use('/leave', requireModule('conges'), leaveRoutes);
tenantRouter.use('/clients', requireModule('clients'), clientsRoutes);
tenantRouter.use('/time-entries', requireModule('temps'), timeEntriesRoutes);
tenantRouter.use('/overtime', requireModule('heures_sup'), overtimeRoutes);
tenantRouter.use('/task-lists', requireModule('taches'), taskListsRoutes);
tenantRouter.use('/tasks', requireModule('taches'), tasksRoutes);
// … et les domaines universels (sans gate module) : /users, /contrats,
// /shifts, /planning, /holidays, /notifications, /dashboard, /teams, /audit…
```

Voir « Multi-tenant, isolation & modules par tenant » pour le détail des modules et de leur activation.

## Les gates (middleware d'accès)

Ils s'appliquent dans cet ordre et court-circuitent la requête en cas d'échec.

| Gate | Fichier | Rôle | Statut sur échec |
|---|---|---|---|
| `requireAuth` | `middleware/auth.ts` | exige un utilisateur en session (`req.session.userId`) | 401 |
| `requireTenant` | `middleware/tenant.ts` | résout `req.tenantId` depuis `session.currentTenantId` | 400 |
| `requireModule(key)` | `middleware/module.ts` | rejette si le module est désactivé pour le workspace (default-on) | 403 |
| `requireTenantCapability(cap)` | `middleware/rbac.ts` | exige une capacité tenant (admin plateforme et admin tenant contournent) | 403 |
| `requireRole(...)` / `requireManager` / `requireAdmin` | `middleware/rbac.ts` | exige un rôle effectif dans le tenant | 401 / 403 |
| `requirePlatformAdmin` | `middleware/rbac.ts` | exige le vrai flag `session.platformAdmin` (config globale) | 401 / 403 |
| `validate(schema, source)` | `middleware/validate.ts` | valide `body`/`query`/`params` via un schéma Zod | 400 |

> `requireTenantCapability` et `requireRole` reposent sur `req.session.role`, qui est la **valeur effective dans le tenant actif** (résolue depuis `user_tenants` ; `admin` pour un admin plateforme). Voir « RBAC : capacités, permission sets & rôles ».

## Chaîne de middleware d'application

`createApp()` (dans `app.ts`) assemble l'application Express dans cet ordre :

1. `app.set('trust proxy', 1)` — fait confiance au premier saut du reverse-proxy (`X-Forwarded-For` / `-Proto`).
2. **`helmet`** avec :
   - `frameguard: false` — l'iframe du shell desktop ObliTools doit pouvoir encapsuler l'app ;
   - une **CSP** stricte : `defaultSrc 'self'`, `scriptSrc 'self'`, `styleSrc 'self' 'unsafe-inline'`, `imgSrc 'self' data: blob:`, `connectSrc 'self' wss: ws:`, `objectSrc 'none'`, etc. ;
   - `hsts` (1 an, sous-domaines inclus), `referrerPolicy: strict-origin-when-cross-origin`, `permittedCrossDomainPolicies: none`.
3. **`cors`** : `{ origin: config.clientOrigin, credentials: true }` (cookies de session cross-origin).
4. **`express.json({ limit: '1mb' })`** — parsing du corps JSON.
5. **`cookie-parser`**.
6. **Session PostgreSQL** (`express-session` + `connect-pg-simple`) : store sur la table `session` (`createTableIfMissing: false`), `resave: false`, `saveUninitialized: false`. Le cookie est `httpOnly`, `secure`/`sameSite=none`/`partitioned` quand `FORCE_HTTPS=true` (contexte iframe cross-site / OAuth), sinon `sameSite=lax` ; `maxAge` = 7 jours.
7. **Fallback `X-Auth-Token`** : dans un iframe cross-site où le navigateur bloque les cookies, le login renvoie `sessionToken = sessionID` ; le client le rejoue en en-tête `X-Auth-Token` et ce middleware réhydrate `req.session` depuis le store.
8. **`apiLimiter`** (`middleware/rateLimiter.ts`) : fenêtre 60 s, max 300 requêtes, **ignoré pour les utilisateurs authentifiés** (évite les faux positifs derrière un proxy partagé).
9. `/auth` → callback SSO Obligate (redirection navigateur, **hors** `/api`).
10. **`/api`** → l'ensemble des routes métier.
11. `GET /health` → healthcheck public.
12. En production uniquement : service statique du bundle client (`client/dist`) avec fallback SPA sur `index.html`.
13. **`errorHandler`** en dernier.

## Enveloppe de réponse standard

Toutes les réponses suivent le contrat `ApiResponse<T>` de `@obliplan/shared` :

```json
{ "success": true, "data": … }
{ "success": false, "error": "message" }
```

- Le gestionnaire d'erreurs (`middleware/errorHandler.ts`) traduit une `AppError(statusCode, message)` en `{ success: false, error }` avec le bon code ; toute autre exception est journalisée (`pino`) et renvoyée en `500 { success: false, error: 'Internal server error' }`.
- La validation Zod échouée renvoie `400 { success: false, error: 'Validation failed', details: { champ: [...] } }`.

## Health check

```http
GET /health  →  200
{ "status": "ok", "version": "<version du serveur>", "timestamp": "<ISO>" }
```

Endpoint **public** (hors `/api`, sans auth), aussi utilisé par le healthcheck Docker (`wget --spider http://localhost:3003/health`) et par la page de login pour afficher la version.

## Démarrage (`index.ts`)

La séquence de boot est :

1. `db.migrate.latest()` — applique les migrations en attente ;
2. `tenantService.ensureMasterTenant()` — crée le tenant maître (id=1) au besoin ;
3. `authService.ensureDefaultAdmin(...)` — provisionne l'admin local (bootstrap) ;
4. démarrage du serveur HTTP et branchement de l'arrêt gracieux (`SIGTERM` / `SIGINT` → fermeture du serveur puis `db.destroy()`).

## Références

- `server/src/app.ts`, `server/src/index.ts`, `server/src/config.ts`
- `server/src/db/index.ts`
- `server/src/routes/index.ts`
- `server/src/middleware/` (`auth.ts`, `tenant.ts`, `module.ts`, `rbac.ts`, `validate.ts`, `errorHandler.ts`, `rateLimiter.ts`)
- `shared/src/types.ts` (`ApiResponse`)
