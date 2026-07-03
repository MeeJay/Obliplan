Chaque workspace (tenant) peut activer ou désactiver un sous-ensemble de **modules fonctionnels**. Le catalogue est figé dans `shared/src/modules.ts` ; l'état d'activation est stocké par workspace dans la table `tenant_modules` (colonne `module_key`). Le principe est **tout-activé-par-défaut** : un workspace sans ligne a tous ses modules actifs.

## Catalogue des modules

Le catalogue `MODULES` définit sept modules. Les clés (`module_key`) sont figées.

| Slug (`ModuleKey`) | Libellé |
|--------------------|---------|
| `conges` | Congés |
| `heures_sup` | Heures sup |
| `recup` | Récupération |
| `projets` | Projets |
| `taches` | Tâches |
| `temps` | Suivi du temps |
| `clients` | Clients |

`isModuleKey(key)` valide qu'une chaîne appartient bien au catalogue.

## Effet de l'activation / désactivation

Désactiver un module a deux effets complémentaires.

- **Gate serveur** — le middleware `requireModule(key)` protège les familles de routes concernées. Monté après `requireAuth` + `requireTenant`, il renvoie `403 « Module désactivé pour ce workspace »` quand la clé est désactivée pour le tenant actif. Le service `tenantModuleService.isEnabled` est **default-on** : sans ligne explicite `enabled=false`, le module est considéré actif.
- **Affichage client** — les modules actifs du tenant courant sont exposés par la session ; la barre latérale masque les entrées dont le module est désactivé. Lorsqu'on modifie le workspace actif, le store est resynchronisé pour que la barre latérale reflète immédiatement le changement.

`tenantModuleService.getEnabled(tenantId)` renvoie la liste des clés actives en partant du catalogue et en retirant celles dont une ligne porte `enabled=false`.

## Qui peut modifier

Deux surfaces distinctes pilotent l'activation :

| Contexte | Endpoint | Garde | Portée |
|----------|----------|-------|--------|
| Workspace **actif** | `GET /modules` | (lecture) | Modules actifs du tenant courant |
| Workspace **actif** | `PATCH /modules` | `requireTenantCapability('tenants:manage')` | Bascule une clé sur le tenant courant |
| Workspace **arbitraire** | `GET /tenants/:id/modules` | `requirePlatformAdmin()` | Lire les modules d'un tenant ciblé |
| Workspace **arbitraire** | `PATCH /tenants/:id/modules` | `requirePlatformAdmin()` | Bascule une clé sur un tenant ciblé |

L'écran **Espaces de travail** (`/workspaces`, `WorkspacesPage`, platform admin) utilise les routes `/tenants/:id/modules` : c'est une opération inter-tenants (elle vise n'importe quel tenant), donc réservée au platform admin. La bascule par clé fait un upsert dans `tenant_modules` (`onConflict(['tenant_id','module_key']).merge({ enabled })`).

## Module → fonctionnalité → routes gardées

Le montage des routes (`server/src/routes/index.ts`) applique `requireModule(...)` sur les familles suivantes :

| Module | Fonctionnalité | Routes gardées (`requireModule`) |
|--------|----------------|----------------------------------|
| `recup` | Récupération | `/recup` |
| `projets` | Tableaux / boards Kanban-Scrum | `/boards` |
| `conges` | Congés | `/leave` |
| `clients` | Clients | `/clients` |
| `temps` | Suivi du temps | `/time-entries` |
| `heures_sup` | Heures supplémentaires | `/overtime` |
| `taches` | Listes et tâches | `/task-lists`, `/tasks` |

> **Modules sans gate.** `MODULES` liste sept clés, mais toutes ne conditionnent pas une famille de routes distincte. Certaines routes restent universelles (non gardées par un module), par exemple `/holidays` (jours fériés), `/notifications`, `/dashboard`, ainsi que `/todos` (todo simple), `/planning`, `/shifts` et l'administration (`/users`, `/contrats`, `/modules`).

## Références

- `shared/src/modules.ts` (`MODULES`, `MODULE_KEYS`, `isModuleKey`)
- `server/src/services/tenantModule.service.ts`
- `server/src/routes/tenantModules.routes.ts`
- `server/src/routes/index.ts` (montage `requireModule`)
- `server/src/middleware/module.ts` (`requireModule`)
- `client/src/pages/WorkspacesPage.tsx`
- `client/src/api/index.ts` (`moduleApi`)
