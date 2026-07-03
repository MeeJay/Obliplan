L'écran **Permissions** (`/permissions`, `PermissionsPage`) présente une matrice **capacités × jeux de permissions**. Un jeu de permissions (`permission_sets`) est un ensemble nommé de capacités, identifié par un `slug`. Il est appliqué par tenant via `user_tenants.role`, qui stocke précisément un slug de jeu. La route est réservée au rôle `admin`.

## Le modèle : capacités et jeux de permissions

Cette matrice correspond à l'**axe B** du système RBAC. Le catalogue des capacités est une constante de code (`CAPABILITIES`, source de vérité), tandis que les jeux sont des lignes de la table `permission_sets`, **globales** (non scopées par tenant) mais appliquées par tenant via le rôle porté dans `user_tenants`.

```sql
CREATE TABLE permission_sets (
  id           SERIAL PRIMARY KEY,
  name         VARCHAR(64)  NOT NULL,
  slug         VARCHAR(64)  NOT NULL UNIQUE,
  capabilities JSONB        NOT NULL DEFAULT '[]',
  is_default   BOOLEAN      NOT NULL DEFAULT false,
  ...
);
```

### Catalogue des capacités

| Clé | Libellé | Groupe |
|---|---|---|
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

### Jeux par défaut

Trois jeux sont fournis (`is_default = true`) et correspondent aux rôles intégrés (`admin`, `manager`, `employe`). Ils ne peuvent pas être supprimés.

| Jeu (slug) | Capacités semées à l'installation |
|---|---|
| `admin` | `planning:read_team`, `planning:write`, `recup:manage`, `leave:validate`, `leave:types:manage`, `contrats:manage`, `users:manage`, `tenants:manage`, `settings:manage`, `clients:manage`, `projects:create` |
| `manager` | `planning:read_team`, `planning:write`, `recup:manage`, `leave:validate`, `projects:create` |
| `employe` | `projects:create` |

> Le rôle `admin` **contourne** de toute façon la vérification de capacité (voir plus bas) : les capacités listées pour son jeu servent surtout de référence et de valeur d'affichage.

## Activer / retirer une capacité

Dans la matrice, chaque case coche/décoche une capacité pour un jeu. L'action est **optimiste** côté client puis persistée via `PUT /api/permission-sets/:id` avec la liste complète `{ capabilities }`.

| Endpoint | Garde | Rôle |
|---|---|---|
| `GET /api/permission-sets` | `requireAuth` | Liste des jeux |
| `GET /api/permission-sets/capabilities` | `requireAuth` | Catalogue des capacités |
| `POST /api/permission-sets` | `requireAdmin` | Créer un jeu (slug auto-généré, `is_default=false`) |
| `PUT /api/permission-sets/:id` | `requireAdmin` | Renommer / mettre à jour les capacités |
| `DELETE /api/permission-sets/:id` | `requireAdmin` | Supprimer (refusé si `is_default`) |

Le service filtre les capacités inconnues : seules les clés présentes dans `CAPABILITY_KEYS` sont conservées à l'écriture. La création génère un `slug` à partir du nom (minuscules, tirets, ≤ 64 car.).

## Effet immédiat sur les écrans et l'API

Une capacité modifiée prend effet sans redéploiement :

- **API** : le middleware `requireTenantCapability(cap)` revérifie à chaque requête. L'administrateur plateforme (`session.role = 'admin'`) passe toujours ; sinon la capacité doit figurer dans le jeu résolu de l'utilisateur pour le tenant actif, faute de quoi la réponse est `403 Capacité requise : <cap>`.
- **Client** : la SPA lit les capacités effectives via `/auth/me` (`UserPermissions.tenantCapabilities`) et gère l'affichage avec `can(cap)`. Les routes sensibles sont gardées par `CapabilityRoute`, et les boutons d'action (créer/éditer/supprimer) n'apparaissent que si la capacité est présente.

Ainsi une même capacité garde l'écran côté client **et** l'endpoint côté serveur — retirer une capacité masque le bouton et fait échouer l'appel correspondant.

## Portée équipe (axe C)

La matrice `/permissions` gère l'axe B (capacités par jeu). L'accès **par ressource** (client / projet) relève d'un autre mécanisme, l'**axe C**, matérialisé par la table `team_permissions` : chaque ligne accorde à une équipe un accès en lecture seule ou lecture-écriture à un client, un projet, ou toutes les ressources (`scope ∈ {client, project, all}`, `level ∈ {ro, rw}`). Ces droits se paramètrent sur l'écran Équipes, pas sur Permissions.

Pour la vue d'ensemble du modèle (axes A/B/C, résolution des rôles et des capacités), voir « RBAC : capacités, permission sets & rôles ».

## Références

- `shared/src/permissions.ts` (`CAPABILITIES`, `CAPABILITY_KEYS`, `PermissionSet`, `UserPermissions`)
- `server/src/services/permissionSet.service.ts`
- `server/src/routes/permissionSets.routes.ts`
- `server/src/middleware/rbac.ts` (`requireTenantCapability`, `requireAdmin`)
- `server/src/db/migrations/020_create_permission_sets.ts`
- `server/src/db/migrations/037_create_team_permissions.ts`
- `client/src/pages/PermissionsPage.tsx`
- `client/src/App.tsx` (`CapabilityRoute`)
