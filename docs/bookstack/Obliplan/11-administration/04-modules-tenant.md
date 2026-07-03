Chaque workspace (tenant) peut activer ou désactiver un sous-ensemble de **modules fonctionnels**. Le catalogue est figé dans `shared/src/modules.ts` ; l'état d'activation est stocké par workspace dans la table `tenant_modules`. Le principe est **tout-activé-par-défaut** : un workspace sans ligne a tous ses modules actifs.

## Catalogue des modules

Les clés (`ModuleKey`) sont fixes et reflètent la colonne `module_key` de `tenant_modules`.

| Slug (`module_key`) | Libellé |
|---|---|
| `conges` | Congés |
| `heures_sup` | Heures sup |
| `recup` | Récupération |
| `projets` | Projets |
| `taches` | Tâches |
| `temps` | Suivi du temps |
| `clients` | Clients |

## Stockage et logique par défaut

```sql
CREATE TABLE tenant_modules (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key VARCHAR(32) NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  ...
  UNIQUE (tenant_id, module_key)
);
```

`tenantModuleService.getEnabled()` part de la liste complète `MODULE_KEYS` et **retire** uniquement les modules ayant une ligne explicite `enabled = false`. Autrement dit, un module est actif tant qu'aucune ligne ne le désactive (`isEnabled` renvoie `true` par défaut). Basculer un module fait un upsert sur `(tenant_id, module_key)`.

## Effet d'activation / désactivation

Désactiver un module a un double effet :

- **Gate serveur** — le middleware `requireModule(key)` protège les routes concernées. Appliqué après `requireAuth` + `requireTenant`, il renvoie `403 Module désactivé pour ce workspace` quand la clé est désactivée pour le tenant actif (et `400 No tenant selected` s'il n'y a pas de tenant).
- **Affichage client** — la SPA charge la liste des modules actifs et masque les entrées de navigation correspondantes ; l'état est tenu à jour dans le store lorsqu'on édite le workspace courant.

### Modules → fonctionnalité → routes gardées

Le montage des routes (`server/src/routes/index.ts`) applique `requireModule(...)` sur les familles suivantes :

| Module | Fonctionnalité | Routes gardées (`requireModule`) |
|---|---|---|
| `recup` | Récupération | `/api/recup` |
| `projets` | Tableaux (Kanban/Scrum) | `/api/boards` |
| `conges` | Congés & absences | `/api/leave` |
| `clients` | Clients | `/api/clients` |
| `temps` | Suivi du temps | `/api/time-entries` |
| `heures_sup` | Heures supplémentaires | `/api/overtime` |
| `taches` | Tâches | `/api/task-lists`, `/api/tasks` |

> Certaines familles ne sont **jamais** gardées par un module car elles sont universelles : planning, salariés, contrats, shifts, jours fériés, notifications, tableau de bord, équipes, types d'heures.

## Qui peut modifier l'activation

Deux surfaces distinctes existent, avec des gardes différentes :

| Portée | Endpoint | Garde | Écran |
|---|---|---|---|
| Workspace **actif** | `GET /api/modules` | `requireAuth` + `requireTenant` | (lecture, tout membre) |
| Workspace **actif** | `PATCH /api/modules` | capacité `tenants:manage` | — |
| Workspace **arbitraire** | `GET /api/tenants/:id/modules` | `requirePlatformAdmin` | Espaces de travail |
| Workspace **arbitraire** | `PATCH /api/tenants/:id/modules` | `requirePlatformAdmin` | Espaces de travail |

L'écran **Espaces de travail** (`/workspaces`, réservé à l'administrateur plateforme) permet d'activer/désactiver les modules de **n'importe quel** workspace : c'est une opération transverse, d'où la garde `requirePlatformAdmin`. La bascule sur le workspace **actif** via `/api/modules` requiert, elle, la capacité de tenant `tenants:manage`. Le corps attendu par un `PATCH` est `{ key, enabled }` ; une clé hors catalogue renvoie `400 Module inconnu`.

## Références

- `shared/src/modules.ts` (`MODULES`, `MODULE_KEYS`, `isModuleKey`)
- `server/src/services/tenantModule.service.ts`
- `server/src/controllers/tenantModule.controller.ts`
- `server/src/routes/tenantModules.routes.ts`
- `server/src/middleware/module.ts` (`requireModule`)
- `server/src/routes/index.ts` (montage des gates)
- `server/src/db/migrations/040_create_tenant_modules.ts`
- `client/src/pages/WorkspacesPage.tsx`
