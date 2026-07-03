L'API REST d'Obliplan expose l'ensemble des fonctionnalités du serveur sous le préfixe `/api`. Toutes les réponses suivent une enveloppe JSON commune, l'authentification repose sur une session (ou un jeton d'en-tête), et l'accès est filtré par une double barrière : les **modules** activés sur le workspace et les **capacités** de l'utilisateur. Cette page décrit les règles transverses valables pour tous les endpoints ; les pages suivantes détaillent chaque domaine.

## Préfixe et montage des routes

Le routeur principal est monté sur `/api` (`app.use('/api', routes)` dans `app.ts`). Deux exceptions vivent en dehors de ce préfixe :

| Chemin | Rôle |
|--------|------|
| `/health` | Sonde de disponibilité publique (`{ status, version, timestamp }`) |
| `/auth/*` | Redirection et callback SSO Obligate (`sso-redirect`, `callback`, `sso-logout`), servis par un routeur navigateur distinct |

> Le callback SSO (`/auth/callback`) est une redirection de navigateur : il n'est **pas** sous `/api` et ne renvoie pas l'enveloppe JSON, mais un `302`. Ne pas confondre avec les endpoints `/api/auth/*` (login, me, endpoints Bearer).

## Enveloppe JSON

Toutes les réponses applicatives partagent le même contrat :

```json
{ "success": true, "data": { } }
```

```json
{ "success": false, "error": "Message lisible" }
```

- `data` porte la charge utile en cas de succès ; certaines mutations renvoient plutôt `message` (par exemple `{ "success": true, "message": "Shift supprimé" }`).
- En cas d'échec de validation, un champ supplémentaire `details` est ajouté (voir « Validation »).
- Les erreurs métier renvoient `{ success: false, error }` avec un code HTTP adapté (voir « Codes d'erreur »).

## Authentification

Deux mécanismes équivalents sont acceptés, résolus dans cet ordre :

1. **Cookie de session** — `connect.sid`, stocké côté serveur dans PostgreSQL (`connect-pg-simple`, table `session`). Durée de vie 7 jours. Le cookie est `httpOnly` ; ses attributs `secure`, `sameSite` et `partitioned` dépendent de `FORCE_HTTPS` (`sameSite=none` + `secure` + `partitioned` en HTTPS, sinon `sameSite=lax`).
2. **En-tête `X-Auth-Token`** — repli pour les contextes iframe cross-site (shell ObliTools) où le navigateur bloque les cookies. À la connexion, `POST /api/auth/login` renvoie `sessionToken` (= l'identifiant de session) ; le client le renvoie ensuite dans `X-Auth-Token` et le serveur réhydrate `req.session` depuis le store.

Le middleware `requireAuth` rejette toute requête sans session utilisateur avec un `401`.

```bash
# Session par cookie (le navigateur gère connect.sid automatiquement)
curl -c cookies.txt -b cookies.txt https://obliplan.example/api/auth/me

# Session par jeton (contexte iframe)
curl -H "X-Auth-Token: <sessionToken>" https://obliplan.example/api/auth/me
```

## Portée : global vs tenant-scopé

Le routeur distingue deux familles de routes.

### Routes globales (pas de tenant requis)

Montées directement sur le routeur racine, sans `requireTenant` :

| Préfixe | Description | Garde |
|---------|-------------|-------|
| `/api/auth` | Login, logout, me, config SSO ; endpoints inverses Obligate | `requireAuth` sur `me`/`connected-apps` ; Bearer sur les endpoints Obligate ; public sur `login`/`sso-config` |
| `/api/tenants`, `/api/tenant` | Liste des workspaces accessibles, bascule de workspace, gestion des workspaces | `requireAuth` (sans `requireTenant`) |
| `/api/permission-sets` | Matrice permissions × capacités (global) | `requireAuth` |
| `/api/admin/config` | Configuration plateforme (À propos, passerelle Obligate, SMTP) | `requireAuth` + `requirePlatformAdmin` |
| `/api/ics/:token` | Flux calendrier public gardé par jeton | Aucune (public) |

### Routes tenant-scopées

Regroupées sous un sous-routeur qui applique `requireAuth` puis `requireTenant`. Le middleware `requireTenant` résout `req.tenantId` depuis `req.session.currentTenantId` ; en son absence, il renvoie `400 « No tenant selected »`. Toutes les données manipulées sont cloisonnées par `tenant_id`.

## Barrières de modules (`requireModule`)

Chaque workspace peut désactiver des modules. Le middleware `requireModule(key)` renvoie `403 « Module désactivé pour ce workspace »` quand le module est coupé. Les modules sont **actifs par défaut** : un workspace sans ligne explicite laisse tout passer.

| Préfixe monté | Clé de module | Endpoints concernés |
|---------------|---------------|---------------------|
| `/api/recup` | `recup` | Solde et mouvements de récupération |
| `/api/boards` | `projets` | Tableaux Kanban / Scrum |
| `/api/leave` | `conges` | Types et demandes de congés |
| `/api/clients` | `clients` | Clients / donneurs d'ordre |
| `/api/time-entries` | `temps` | Suivi du temps |
| `/api/overtime` | `heures_sup` | Natures et déclarations d'heures sup |
| `/api/task-lists` | `taches` | Listes de tâches personnelles |
| `/api/tasks` | `taches` | Tâches et étapes |

Le catalogue complet des clés de module :

```ts
type ModuleKey =
  | 'conges'
  | 'heures_sup'
  | 'recup'
  | 'projets'
  | 'taches'
  | 'temps'
  | 'clients';
```

> Les préfixes tenant-scopés sans barrière de module (`/users`, `/contrats`, `/shifts`, `/planning`, `/holidays`, `/notifications`, `/dashboard`, etc.) sont universels : ils restent accessibles quels que soient les modules activés.

## Rôles et capacités (RBAC)

Deux axes cohabitent.

- **Rôle de session** (`req.session.role`) — rôle effectif dans le tenant actif, résolu depuis `user_tenants`. Valeurs applicatives : `admin`, `manager`, `employe`. Les gardes `requireRole`, `requireManager` (manager ou admin) et `requireAdmin` s'appuient dessus. `requirePlatformAdmin` vérifie le drapeau plateforme réel `req.session.platformAdmin` (et non le rôle par tenant).
- **Capacités par tenant** (axe B) — `requireTenantCapability(capability)` exige une capacité précise. L'administrateur plateforme (`session.role === 'admin'`) court-circuite la vérification ; sinon la capacité doit figurer dans le jeu de permissions de l'utilisateur pour le tenant actif.

Catalogue des capacités (source de vérité dans `shared/src/permissions.ts`) :

| Capacité | Libellé | Groupe |
|----------|---------|--------|
| `planning:read_team` | Voir le planning de l'équipe | Planning |
| `planning:view_team` | Voir le planning de l'équipe (lecture seule) | Planning |
| `planning:write` | Créer / éditer / valider le planning | Planning |
| `recup:manage` | Gérer la récupération | Planning |
| `hourtypes:manage` | Gérer les types d'heures | Planning |
| `leave:validate` | Valider les congés | Congés |
| `leave:types:manage` | Gérer les types de congés | Congés |
| `contrats:manage` | Gérer les contrats | Administration |
| `users:manage` | Gérer les salariés | Administration |
| `tenants:manage` | Gérer les workspaces | Administration |
| `settings:manage` | Paramètres de l'instance | Administration |
| `clients:manage` | Gérer les clients | Projets |
| `projects:create` | Créer des projets | Projets |
| `overtime:natures:manage` | Gérer les natures d'heures sup | Heures sup |
| `overtime:validate` | Valider les heures supplémentaires | Heures sup |

Le détail des jeux de permissions et de la matrice se trouve dans la page « Auth & tenants ».

## Validation (middleware `validate` + Zod)

Les corps, requêtes et paramètres sont validés par des schémas Zod via le middleware `validate(schema, source)` où `source` vaut `body` (défaut), `query` ou `params`. En cas d'échec, la réponse est un `400` :

```json
{
  "success": false,
  "error": "Validation failed",
  "details": { "champ": ["message d'erreur"] }
}
```

`details` reprend la sortie `error.flatten().fieldErrors` de Zod (une liste de messages par champ). Après succès, la donnée validée (et coercée) remplace la source d'origine sur `req`.

## Codes d'erreur & `errorHandler`

Les erreurs métier lèvent `AppError(statusCode, message)`, capturée par le gestionnaire final `errorHandler`. Une erreur non gérée est journalisée et renvoie un `500` générique.

| Code | Signification usuelle |
|------|-----------------------|
| `400` | Requête invalide (validation, paramètre manquant, période invalide) |
| `401` | Authentification requise ou identifiants invalides |
| `403` | Capacité, module ou périmètre insuffisant |
| `404` | Ressource introuvable |
| `409` | Conflit (identifiant déjà pris, nom de vue en double, suppression d'un élément par défaut) |
| `500` | Erreur interne non gérée (`Internal server error`) |

## Limitation de débit (rate limiting)

Un limiteur grossier `apiLimiter` protège les endpoints **non authentifiés** :

| Paramètre | Valeur |
|-----------|--------|
| Fenêtre | 60 secondes |
| Maximum | 300 requêtes |
| En-têtes | `standardHeaders` (RateLimit-*) activés, `legacyHeaders` désactivés |
| Exclusion | Les utilisateurs authentifiés (`req.session.userId` présent) sont ignorés |

L'exclusion des sessions actives évite les faux positifs derrière un reverse-proxy (adresses IP partagées). Le limiteur s'applique après la réhydratation de session par `X-Auth-Token`.

## Endpoints Bearer inverses (Obligate)

Certains endpoints sont appelés **par** la passerelle Obligate vers Obliplan. Ils n'utilisent pas la session mais un jeton Bearer comparé à la clé API Obligate stockée (`verifyInboundBearer`). Un jeton absent ou invalide renvoie `401 { success:false, error:'Invalid API key' }`.

| Méthode | Chemin | Rôle |
|---------|--------|------|
| `GET` | `/api/auth/app-info` | Rôles, équipes, tenants et jeux de permissions pour l'UI de mapping Obligate |
| `GET` | `/api/auth/dashboard-stats` | Statistiques affichées sur le tableau de bord Obligate |
| `POST` | `/api/auth/sso-user-sync` | Propagation d'un changement d'état utilisateur (désactivation, réactivation, suppression, changement de rôle) |

```bash
curl -H "Authorization: Bearer <cle-api-obligate>" \
  https://obliplan.example/api/auth/app-info
```

Ces endpoints sont détaillés dans la page « Auth & tenants ».

## Références

- `server/src/app.ts`
- `server/src/routes/index.ts`
- `server/src/middleware/auth.ts`
- `server/src/middleware/tenant.ts`
- `server/src/middleware/module.ts`
- `server/src/middleware/rbac.ts`
- `server/src/middleware/validate.ts`
- `server/src/middleware/errorHandler.ts`
- `server/src/middleware/rateLimiter.ts`
- `server/src/services/obligate.service.ts`
- `shared/src/modules.ts`
- `shared/src/permissions.ts`
