Obliplan est **multi-tenant** : chaque requête opère dans le périmètre d'un workspace (tenant) résolu depuis la session. L'isolation est systématique, l'appartenance et le rôle sont portés par workspace, et un catalogue de modules peut être activé ou désactivé tenant par tenant.

## Modèle multi-tenant

Le tenant actif est porté par la session (`session.currentTenantId`). Le middleware `requireTenant` le copie sur `req.tenantId`, sur lequel s'appuient tous les services scopés :

```ts
// middleware/tenant.ts
export function requireTenant(req, _res, next) {
  const tid = req.session?.currentTenantId;
  if (!tid) return next(new AppError(400, 'No tenant selected'));
  req.tenantId = tid;
  next();
}
```

Chaque service filtre alors ses requêtes par `tenant_id`, de sorte qu'un utilisateur ne voit jamais les données d'un autre workspace. Cette isolation par `req.tenantId` s'applique à **chaque** requête tenant-scopée (voir « Architecture serveur (couches & middleware) »).

### Utilitaire `tenantScope`

Pour les endpoints de listing, `getEffectiveTenantScope(req)` (`utils/tenantScope.ts`) résout le périmètre effectif :

- **admin plateforme** connecté sur le **tenant maître** ⇒ renvoie `null` = fan-out cross-tenant (God View) ; les méthodes de listing acceptent `number | null` et omettent alors la clause `WHERE tenant_id = ?` ;
- **tout autre cas** ⇒ renvoie `req.tenantId`, scopé au workspace actif.

`isGodView(req)` expose le même prédicat sous forme booléenne.

## Appartenance & rôle par tenant (`user_tenants`)

La table `user_tenants` matérialise l'appartenance d'un utilisateur à un workspace **avec son rôle dans ce workspace** (le slug de rôle est synchronisé depuis Obligate). Le service `tenant.service.ts` en dérive notamment :

| Méthode | Rôle |
|---|---|
| `getTenantsForUser(userId)` | tous les workspaces accessibles + rôle par tenant (`TenantWithRole`) |
| `getUserTenantRole(userId, tenantId)` | rôle effectif de l'utilisateur dans un tenant donné |
| `userHasAccess(userId, tenantId)` | l'utilisateur est-il membre du tenant |
| `addUser` / `removeUser` | ajout/retrait d'un membre (upsert du rôle) |

Le rôle effectif ainsi résolu alimente `req.session.role` et la matrice de permissions — voir « RBAC : capacités, permission sets & rôles ».

## Bascule de tenant

Un utilisateur membre de plusieurs workspaces bascule via :

```http
POST /api/tenant/switch   { "tenantId": <n> }
```

Le contrôleur (`tenant.controller.ts`) vérifie l'accès (`userHasAccess`, ou admin), positionne `session.currentTenantId`, puis **re-résout le rôle effectif** pour le nouveau workspace :

```ts
req.session.role = req.session.platformAdmin
  ? 'admin'
  : (await tenantService.getUserTenantRole(userId, tenantId)) ?? 'employe';
```

Côté client, `authStore.switchTenant(tenantId)` appelle cet endpoint et met à jour `currentTenantId` (composant `TenantSwitcher` dans le `Header`).

## Modules activables par tenant

Un catalogue de **modules** peut être activé ou désactivé par workspace. Les clés sont fixes et reflètent la colonne `module_key` de la table `tenant_modules`.

### Catalogue (`shared/src/modules.ts`)

| Slug (`ModuleKey`) | Libellé |
|---|---|
| `conges` | Congés |
| `heures_sup` | Heures sup |
| `recup` | Récupération |
| `projets` | Projets |
| `taches` | Tâches |
| `temps` | Suivi du temps |
| `clients` | Clients |

> **Default-on** : un workspace sans ligne explicite a tous les modules activés. Seule une ligne `enabled = false` désactive un module.

### Gate serveur `requireModule`

`requireModule(key)` (`middleware/module.ts`) rejette la requête en `403 « Module désactivé pour ce workspace »` quand le module est désactivé pour `req.tenantId`. Il est monté sur les sous-routeurs concernés dans `routes/index.ts` :

| Module | Routes gardées |
|---|---|
| `recup` | `/api/recup` |
| `projets` | `/api/boards` |
| `conges` | `/api/leave` |
| `clients` | `/api/clients` |
| `temps` | `/api/time-entries` |
| `heures_sup` | `/api/overtime` |
| `taches` | `/api/task-lists`, `/api/tasks` |

Les domaines universels (planning, shifts, jours fériés, notifications, tableau de bord, équipes, contrats, salariés, audit…) ne sont pas gardés par un module.

La résolution du statut passe par `tenantModule.service.ts` : `isEnabled(tenantId, key)` renvoie la valeur de la ligne `tenant_modules` ou `true` par défaut ; `getEnabled(tenantId)` liste les modules actifs du catalogue.

### Affichage conditionnel côté client

La liste des modules actifs du tenant est renvoyée dans `/auth/me` (`SessionInfo.modules`) et exposée par `authStore` (`modules`, `hasModule(key)`). La `Sidebar` et la `MobileTabBar` masquent toute entrée dont le module est désactivé (attribut `module` sur les items de navigation).

### Endpoints de gestion des modules

| Endpoint | Portée | Garde |
|---|---|---|
| `GET /api/modules` | modules du workspace **actif** | `requireAuth` + `requireTenant` |
| `PATCH /api/modules` | active/désactive un module du workspace actif | capacité `tenants:manage` |
| `GET /api/tenants/:id/modules` | modules d'un workspace **arbitraire** | admin plateforme |
| `PATCH /api/tenants/:id/modules` | active/désactive un module d'un workspace arbitraire | admin plateforme |

La configuration détaillée est traitée dans « Activation des modules par tenant ».

## Admin plateforme & tenant maître

Deux notions d'administration coexistent, volontairement distinctes :

- **Admin de tenant** — rôle `admin` *dans un workspace* (via `user_tenants.role`). Il administre les données de son tenant (salariés, contrats, permissions…).
- **Admin plateforme (système)** — vrai flag `session.platformAdmin` (dérivé de `users.role = 'admin'`). Il seul accède à la configuration **globale, non scopée tenant** (passerelle Obligate, SMTP, gestion des workspaces), gardée par `requirePlatformAdmin`. Un simple admin de tenant ne peut pas l'atteindre.

Le **tenant maître** (`MASTER_TENANT_ID = 1`, slug `default`, défini dans `shared/src/tenants.ts`) est le workspace par défaut, provisionné au démarrage par `ensureMasterTenant()`. Un admin plateforme connecté à ce tenant obtient le **God View** (fan-out cross-tenant sur les listings, via `tenantScope`) ; un non-admin n'y bénéficie d'aucun privilège particulier.

## Pages liées

- « Activation des modules par tenant » — procédure d'activation/désactivation des modules.
- « RBAC : capacités, permission sets & rôles » — résolution des rôles par tenant et de la matrice de capacités.

## Références

- `server/src/middleware/tenant.ts`, `server/src/middleware/module.ts`
- `server/src/utils/tenantScope.ts`
- `server/src/routes/index.ts`, `server/src/routes/tenant.routes.ts`, `server/src/routes/tenantModules.routes.ts`
- `server/src/controllers/tenant.controller.ts`
- `server/src/services/tenant.service.ts`, `server/src/services/tenantModule.service.ts`
- `shared/src/modules.ts`, `shared/src/tenants.ts`, `shared/src/types.ts` (`SessionInfo`)
