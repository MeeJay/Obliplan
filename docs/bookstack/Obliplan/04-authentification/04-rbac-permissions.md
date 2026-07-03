Le contrôle d'accès d'Obliplan combine des **rôles de base** (`employe` / `manager` / `admin`) et des **capacités granulaires** regroupées en *permission sets* appliqués par tenant. Un troisième axe, le périmètre de ressources par équipe, affine encore l'accès aux clients et projets. Cette page décrit le modèle, son application côté serveur et côté client, le contournement des administrateurs, et fournit le tableau capacité → routes/écrans gardés.

## Modèle d'autorisation à trois axes

| Axe | Question | Support | Garde |
|-----|----------|---------|-------|
| A — Rôle de base | Quel niveau global/tenant ? | `users.role`, `user_tenants.role` | `requireRole`, `requireManager`, `requireAdmin`, `requirePlatformAdmin` |
| B — Capacités | Quelle action est autorisée dans le tenant ? | `permission_sets` (via `user_tenants.role`) | `requireTenantCapability` |
| C — Périmètre ressources | Sur quels clients/projets ? | `team_permissions` | `team.service.resolveScope` |

### Deux dimensions de rôle

Il existe trois rôles de base : `type UserRole = 'admin' | 'manager' | 'employe'`. Ils se déclinent en deux dimensions :

- **`users.role`** — rôle global. `users.role === 'admin'` fait de l'utilisateur un **platform admin** (drapeau `session.platformAdmin`), qui pilote la God View et la configuration globale.
- **`user_tenants.role`** — rôle **effectif par tenant**, stocké comme un **slug de permission set**. Il alimente `session.role`, le rôle effectif dans le tenant actif renvoyé par `GET /api/auth/me`.

## Capacités (Axe B)

Le catalogue des capacités est défini en dur dans `shared/src/permissions.ts` (`CAPABILITIES`, dont `CAPABILITY_KEYS` est la source de vérité). Quinze capacités existent :

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

## Permission sets par tenant

Un *permission set* est un ensemble nommé de capacités, global et identifié par un `slug` (table `permission_sets`). La colonne `user_tenants.role` stocke ce slug : le rôle d'un utilisateur dans un tenant **est** un permission set.

Trois jeux par défaut (`is_default = true`) sont créés à la migration initiale, avec des slugs qui correspondent aux rôles de base — `admin`, `manager`, `employe` :

```ts
// server/src/db/migrations/020_create_permission_sets.ts (seed initial)
admin    → planning:read_team, planning:write, recup:manage, leave:validate,
           leave:types:manage, contrats:manage, users:manage, tenants:manage,
           settings:manage, clients:manage, projects:create
manager  → planning:read_team, planning:write, recup:manage, leave:validate, projects:create
employe  → projects:create
```

> Ce sont les capacités **initiales** ; des migrations ultérieures les enrichissent (par ex. `overtime:validate` / `hourtypes:manage` pour `manager`, `overtime:natures:manage` pour `admin`, `planning:view_team`). Les jeux par défaut restent modifiables et de nouveaux jeux peuvent être créés (`POST /api/permission-sets`, réservé à `requireAdmin`).

### Résolution des capacités

`permissionService.listUserTenantCapabilities(userId, tenantId, isPlatformAdmin)` résout les capacités effectives :

1. **Platform admin** (`users.role='admin'`) → **toutes** les capacités (`CAPABILITY_KEYS`).
2. `user_tenants.role === 'admin'` (admin du tenant) → **toutes** les capacités.
3. Sinon → les capacités du permission set dont le slug vaut `user_tenants.role` (ou `[]` si aucun).

> Un administrateur (de plateforme ou de tenant) obtient donc **toutes** les capacités par la vérification du rôle, indépendamment du contenu du permission set `admin`.

### Périmètre de ressources par équipe (Axe C)

La table `team_permissions` accorde à une équipe (`user_teams`) un accès à des ressources : `scope ∈ {client, project, all}`, `scope_id` (0 = « tous » de ce type), `level ∈ {ro, rw}`. `team.service.resolveScope` agrège les appartenances d'équipe et ces droits pour déterminer, dans un tenant, les clients/projets lisibles/modifiables. Les administrateurs (plateforme ou tenant) obtiennent un accès complet (`allClients`, `allProjects`, `rw`).

## Application côté serveur

Les gardes vivent dans `server/src/middleware/rbac.ts` (et `middleware/auth.ts` pour `requireAuth`) :

| Garde | Contrôle | Exemples de routes |
|-------|----------|--------------------|
| `requireManager()` | `session.role ∈ {manager, admin}` | `GET /api/users`, `GET /api/users/:id` |
| `requireAdmin()` | `session.role === 'admin'` (admin du tenant) | `POST/PUT/DELETE /api/permission-sets` |
| `requirePlatformAdmin()` | `session.platformAdmin === true` (vrai drapeau) | `/api/admin/config/*`, `/api/tenants` (CRUD, membres), `/api/tenants/:id/modules` |
| `requireTenantCapability(cap)` | admin bypass, sinon capacité présente dans le tenant | routes capacité-gated (tableau ci-dessous) |

`requireTenantCapability` s'applique **après** `requireAuth` + `requireTenant`. Le contournement admin repose sur `session.role === 'admin'` : il couvre donc à la fois le platform admin et l'admin du tenant.

```ts
// server/src/middleware/rbac.ts — requireTenantCapability
const isPlatformAdmin = req.session.role === 'admin';
if (isPlatformAdmin) return next();               // admin (plateforme OU tenant) → bypass
if (!req.tenantId) return next(new AppError(403, 'Capacité requise'));
const ok = await permissionService.userHasTenantCapability(
  req.session.userId!, req.tenantId, capability, false,
);
if (!ok) return next(new AppError(403, `Capacité requise : ${capability}`));
```

## Application côté client

Le store d'authentification (`client/src/store/authStore.ts`) reçoit les capacités résolues dans `GET /api/auth/me` et expose des helpers, dont `can()` :

```ts
can: (capability) => {
  const s = get();
  if (s.user?.role === 'admin') return true;        // admin → tout
  return s.capabilities.includes(capability);
};
```

Autres helpers : `isAdmin()` (`user.role === 'admin'`), `isPlatformAdmin()` (`platformAdmin`), `isManager()` (`role ∈ {manager, admin}`), `hasModule(key)`. Les écrans conditionnent leurs actions à `can(...)` (par ex. `ClientsPage` sur `clients:manage`, `PlanningBoardPage` sur `planning:write`).

> `can()` est un confort d'affichage : l'autorisation réelle est toujours (re)vérifiée côté serveur par les gardes. Ne jamais s'appuyer sur le seul contrôle client.

## Contournement administrateur : récapitulatif

| Contexte | Qui contourne | Mécanisme |
|----------|---------------|-----------|
| Résolution des capacités | Platform admin **et** admin du tenant | `listUserTenantCapabilities` renvoie toutes les capacités |
| `requireTenantCapability` | Platform admin **et** admin du tenant | bypass si `session.role === 'admin'` |
| `requirePlatformAdmin` | Platform admin **uniquement** | `session.platformAdmin` (le vrai drapeau, pas le rôle effectif) |
| Périmètre ressources (Axe C) | Platform admin **et** admin du tenant | `resolveScope` renvoie un accès complet |

> `requirePlatformAdmin` vérifie le **vrai** drapeau `session.platformAdmin`, et non le rôle effectif par tenant : un simple admin de tenant ne peut donc pas atteindre la configuration globale non tenant-scopée (SMTP, passerelle Obligate, gestion tous-tenants).

## Capacité → routes / écrans gardés

| Capacité | Description | Routes serveur (`requireTenantCapability`) | Écrans client |
|----------|-------------|---------------------------------------------|---------------|
| `planning:read_team` | Voir le planning de l'équipe | `GET /api/planning/team` ; `GET /api/reports/{workload,summary,by-project,by-user,astreinte}` | élément de menu « équipe » (Sidebar) |
| `planning:view_team` | Vue équipe en lecture seule | `GET /api/planning/team-overview`, `GET /api/planning/teams` ; `GET/POST/PUT/DELETE /api/planning/views` | — |
| `planning:write` | Créer / éditer / valider le planning | `POST/PUT/DELETE /api/shifts`, `/api/shift-templates`, `/api/jours-ecole`, `/api/holidays` ; `POST /api/planning/{copy-week,clone-shifts,publish,import/preview,import/apply}` | `PlanningBoardPage`, `TeamPage`, jours fériés (`SettingsPage`) |
| `recup:manage` | Gérer la récupération | `GET /api/recup/week-preview`, `POST /api/recup/validate-week`, `PATCH /api/recup/self-service`, `POST /api/recup`, `DELETE /api/recup/:id` | — |
| `hourtypes:manage` | Gérer les types d'heures | `POST/PUT/DELETE /api/hour-types` | `HourTypesPage` |
| `leave:validate` | Valider les congés | `GET /api/leave/calendar`, `GET /api/leave/requests/pending`, `PATCH /api/leave/requests/:id/decision` | `CongesPage` |
| `leave:types:manage` | Gérer les types de congés | `POST/PUT/DELETE /api/leave/types` | `CongesPage` |
| `contrats:manage` | Gérer les contrats | `POST/PUT/DELETE /api/contrats` | `ContratsPage` |
| `users:manage` | Gérer les salariés | `POST /api/users`, `PUT /api/users/:id` ; `/api/teams` (gestion) ; `GET /api/gdpr/export/:id`, `POST /api/gdpr/anonymize/:id` ; `GET /api/audit`, `/api/audit/verify` ; `GET /api/boards/all` | `UsersPage`, `TeamsPage` |
| `tenants:manage` | Gérer les workspaces (modules) | `PATCH /api/modules` | — |
| `settings:manage` | Paramètres de l'instance | catalogue + jeu `admin` ; la config globale est en pratique gardée par `requirePlatformAdmin` | — |
| `clients:manage` | Gérer les clients | `POST/PUT/DELETE /api/clients` | `ClientsPage` |
| `projects:create` | Créer des projets | catalogue + jeux par défaut (aucune route ne l'impose actuellement via `requireTenantCapability`) | — |
| `overtime:natures:manage` | Gérer les natures d'heures sup | `POST/PUT/DELETE /api/overtime/natures` | — |
| `overtime:validate` | Valider les heures supplémentaires | `GET /api/overtime/declarations/pending`, `/team-summary`, `PATCH /api/overtime/declarations/:id/decision` | `OvertimePage` |

## Références

- `shared/src/permissions.ts` (`CAPABILITIES`, `CAPABILITY_KEYS`, `PermissionSet`)
- `server/src/middleware/rbac.ts`
- `server/src/middleware/auth.ts`, `server/src/middleware/tenant.ts`
- `server/src/services/permission.service.ts`
- `server/src/services/permissionSet.service.ts`
- `server/src/services/team.service.ts`
- `server/src/db/migrations/020_create_permission_sets.ts`
- `server/src/db/migrations/037_create_team_permissions.ts`
- `client/src/store/authStore.ts`
