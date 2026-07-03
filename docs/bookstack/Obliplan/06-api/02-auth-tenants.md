Cette page couvre l'authentification (connexion locale et SSO Obligate), les endpoints inverses appelés par Obligate, la gestion des workspaces (tenants) et l'activation des modules. Toutes les réponses suivent l'enveloppe décrite dans « Conventions générales de l'API ».

## Session & compte courant (`auth.routes.ts`)

Monté sur `/api/auth`. Ces routes sont globales (pas de `requireTenant`).

| Méthode | Chemin | Garde | Corps / query | Réponse |
|---------|--------|-------|---------------|---------|
| `GET` | `/api/auth/sso-config` | Public | — | `{ obligateEnabled, obligateReachable, obligateUrl }` |
| `POST` | `/api/auth/login` | Public | `{ username, password }` | `{ user, sessionToken }` |
| `POST` | `/api/auth/logout` | Public | — | `{ success:true, message:'Déconnecté' }` |
| `GET` | `/api/auth/me` | `requireAuth` | — | `SessionInfo` (voir ci-dessous) |
| `GET` | `/api/auth/connected-apps` | `requireAuth` | — | Liste des apps Obli\* joignables via Obligate |

### Détails

- **`login`** authentifie via `authService.authenticate`. En cas d'échec : `401 « Identifiant ou mot de passe invalide »`. En cas de succès, la session est initialisée (`userId`, `username`, `platformAdmin`, tenant courant, rôle effectif) et `sessionToken` (= identifiant de session) est renvoyé pour l'usage `X-Auth-Token`.
- **`me`** renvoie l'état de session consolidé :

```ts
interface SessionInfo {
  user;                 // utilisateur avec son rôle EFFECTIF dans le tenant actif
  currentTenantId;      // tenant actif
  tenants;              // workspaces accessibles
  capabilities;         // capacités résolues dans le tenant actif
  modules;              // clés de modules activés
  platformAdmin;        // vrai pour un administrateur plateforme
}
```

- **`connected-apps`** interroge Obligate pour l'app switcher ; renvoie `[]` si le SSO n'est pas configuré.
- **`sso-config`** est public : il permet à la page de connexion de décider d'afficher ou non le bouton SSO.

## SSO Obligate — redirection & callback (`obligateCallback.routes.ts`)

Ce routeur est monté à la racine sur `/auth` (redirections de navigateur, hors `/api`). Les réponses sont des redirections HTTP `302`, pas du JSON.

| Méthode | Chemin | Query | Comportement |
|---------|--------|-------|--------------|
| `GET` | `/auth/sso-redirect` | `?tenant=<slug>` (optionnel) | Génère un `state` anti-CSRF, mémorise le slug demandé, redirige vers `<obligate>/authorize`. Si le SSO est désactivé/incomplet, redirige vers `/login`. |
| `GET` | `/auth/callback` | `?code&state` | Vérifie le `state`, échange le code contre une assertion, provisionne l'utilisateur local, ouvre la session, redirige vers `/`. En cas d'échec : `/login?error=sso_failed`. |
| `GET` | `/auth/sso-logout` | — | Détruit la session locale puis redirige vers le logout Obligate (single logout), avec repli sur `/login`. |

> Le provisioning (`provisionObligateUser`) crée ou synchronise le compte local à chaque connexion : rôle applicatif calculé depuis l'assertion, thème préféré si Obliplan sait le rendre, avatar, langue, adhésions par tenant (`user_tenants`) et tenant d'atterrissage. Un compte anonymisé (RGPD) est traité comme absent et n'est jamais ressuscité. Le rôle applicatif est `admin` si l'assertion est `admin`, `manager` si l'utilisateur est admin/manager sur au moins un tenant, sinon `employe`.

## Endpoints inverses Obligate (`obligate.routes.ts`)

Montés sur `/api/auth`. Authentifiés par **jeton Bearer** (clé API Obligate stockée), pas par session. Jeton absent ou invalide : `401 { success:false, error:'Invalid API key' }`.

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/auth/app-info` | — | `{ roles, teams, tenants, permissionSets }` |
| `GET` | `/api/auth/dashboard-stats` | — | `{ stats: [{ label, value, color }] }` |
| `POST` | `/api/auth/sso-user-sync` | `{ remoteUserId, action, role? }` | `{ success:true }` |

### Détails

- **`app-info`** expose les rôles applicatifs (`['admin','manager','employe']`), la liste des tenants (`slug`, `name`) et les jeux de permissions (`slug`, `name`) qu'Obligate peut mapper par (groupe, tenant).
- **`dashboard-stats`** renvoie deux compteurs (salariés actifs, shifts). En cas d'erreur, renvoie `{ success:true, data:null }`.
- **`sso-user-sync`** applique une transition d'état sur le compte local :

| `action` | Effet |
|----------|-------|
| `deactivate` | `is_active = false` |
| `reactivate` | `is_active = true` |
| `delete` | Supprime le lien SSO puis le compte |
| `update-role` | Force `users.role` sur `admin` / `manager` / `employe` |

Un `remoteUserId` inconnu renvoie `{ success:true }` sans effet. Champs manquants : `400 « Missing fields »`.

## Workspaces / tenants (`tenant.routes.ts`)

Monté à la fois sur `/api/tenants` et `/api/tenant`. Le routeur applique `requireAuth` (mais pas `requireTenant` : la sélection du workspace précède la résolution du tenant).

| Méthode | Chemin | Garde | Corps | Réponse |
|---------|--------|-------|-------|---------|
| `GET` | `/api/tenants` | `requireAuth` | — | Workspaces accessibles au compte courant |
| `POST` | `/api/tenant/switch` | `requireAuth` | `{ tenantId }` | `{ currentTenantId }` |
| `GET` | `/api/tenants/all` | `requirePlatformAdmin` | — | Tous les workspaces |
| `POST` | `/api/tenants` | `requirePlatformAdmin` | `{ name, slug? }` | `201` + tenant créé |
| `PUT` | `/api/tenants/:id` | `requirePlatformAdmin` | `{ name?, slug? }` | Tenant mis à jour |
| `DELETE` | `/api/tenants/:id` | `requirePlatformAdmin` | — | `{ message:'Workspace supprimé' }` |
| `GET` | `/api/tenants/:id/members` | `requirePlatformAdmin` | — | Membres du workspace |
| `POST` | `/api/tenants/:id/members` | `requirePlatformAdmin` | `{ userId, role? }` | `201` |
| `DELETE` | `/api/tenants/:id/members/:userId` | `requirePlatformAdmin` | — | `{ message:'Membre retiré' }` |

### Détails et règles

- **`switch`** exige un `tenantId` ; sinon `400`. L'admin plateforme accède à tout, sinon l'accès au tenant est vérifié (`403 « Accès au tenant refusé »`). Un tenant introuvable renvoie `404`. Le rôle effectif est ré-résolu pour le nouveau workspace.
- **`create`** normalise le slug (`slugify`) et garantit son unicité ; l'admin créateur devient membre `admin`. Réponse `201`.
- **`remove`** refuse la suppression du workspace par défaut (`MASTER_TENANT_ID = 1`) avec `400`.
- **`addMember`** exige `userId` (`400` sinon) et attribue le rôle demandé, `employe` par défaut.

Schémas de validation (`schemas.ts`) :

```ts
createTenantSchema = { name: string(1..200), slug?: /^[a-z0-9-]{1,64}$/ }
updateTenantSchema = { name?: string(1..200), slug?: /^[a-z0-9-]{1,64}$/ }
```

## Modules du workspace (`tenantModules.routes.ts`)

Deux routeurs distincts.

### Workspace actif

Monté sur le routeur tenant à `/api/modules` (`requireAuth` + `requireTenant` déjà appliqués).

| Méthode | Chemin | Garde | Corps | Réponse |
|---------|--------|-------|-------|---------|
| `GET` | `/api/modules` | tenant | — | Liste des clés de modules activés |
| `PATCH` | `/api/modules` | `requireTenantCapability('tenants:manage')` | `{ key, enabled }` | Liste mise à jour des clés activées |

### Workspace arbitraire (administration plateforme)

Monté sur `/api/tenants` (`requireAuth` + `requirePlatformAdmin`). Cible n'importe quel tenant par `:id` — opération cross-tenant, donc réservée à l'admin plateforme.

| Méthode | Chemin | Garde | Corps | Réponse |
|---------|--------|-------|-------|---------|
| `GET` | `/api/tenants/:id/modules` | `requirePlatformAdmin` | — | Clés de modules activés du workspace ciblé |
| `PATCH` | `/api/tenants/:id/modules` | `requirePlatformAdmin` | `{ key, enabled }` | Liste mise à jour |

> `key` doit être une clé de module valide (`isModuleKey`), sinon `400 « Module inconnu »` ; `enabled` doit être un booléen, sinon `400 « enabled requis »`.

> Les jeux de permissions globaux (`/api/permission-sets`, slug × capacités) sont documentés dans la page « Administration & endpoints transverses ».

## Références

- `server/src/routes/auth.routes.ts`
- `server/src/routes/obligate.routes.ts`
- `server/src/routes/obligateCallback.routes.ts`
- `server/src/routes/tenant.routes.ts`
- `server/src/routes/tenantModules.routes.ts`
- `server/src/controllers/auth.controller.ts`
- `server/src/controllers/tenant.controller.ts`
- `server/src/controllers/tenantModule.controller.ts`
- `server/src/services/obligate.service.ts`
