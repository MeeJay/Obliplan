Obliplan combine trois **rôles applicatifs** simples avec un modèle d'autorisation plus fin — des **capacités** regroupées en **permission sets** appliqués par tenant. Cette page présente les périmètres ; le détail technique du RBAC (résolution, matrice, équipes) est traité dans « RBAC : capacités, permission sets & rôles ».

## Les trois rôles applicatifs

Le rôle (`users.role`, énum `admin` / `manager` / `employe`) pilote le périmètre de base et hérite en cascade :

| Rôle | Périmètre |
|------|-----------|
| `employe` | Consulte **son** planning et ses compteurs (réalisé/attendu, écart, solde récup). |
| `manager` | + grille d'équipe, création/édition/**validation** des shifts de ses salariés, **attribution** de récup. |
| `admin` | + gestion des salariés et des contrats (périmètre tenant ; *god view* sur `master`). |

Dans l'interface, ces rôles sont libellés **Salarié**, **Manager**, **Admin**.

## Tenant admin vs administrateur de plateforme

Deux notions d'« admin » coexistent et ne doivent pas être confondues :

- **Admin de tenant** — `users.role = 'admin'`. Administre **son** organisation : salariés, contrats, permissions, clients, équipes. Dans un tenant donné, un admin **contourne** les vérifications de capacité (il a toutes les capacités du tenant).
- **Administrateur de plateforme** (*platform / god view*) — indicateur `platformAdmin` **distinct** du rôle de tenant, résolu dans `/auth/me`. Il ouvre la configuration **globale** de l'instance, transverse aux tenants : pages **Workspaces** et **Paramètres**. Cet admin correspond à la cible d'un mapping Obligate « admin tous tenants » sur le tenant `master`.

> Côté client, `can(cap)` renvoie toujours vrai pour un `role === 'admin'` (admin de tenant), tandis que les pages **Workspaces**/**Paramètres** sont gardées séparément par `isPlatformAdmin()`. Un admin de tenant n'a donc **pas** accès à la configuration de plateforme s'il n'est pas administrateur de plateforme.

## Capacités (permissions granulaires)

Une **capacité** est une permission fine identifiée par une clé `domaine:action`. Le catalogue (source de vérité dans `shared/src/permissions.ts`) compte 15 capacités, groupées :

| Clé | Libellé | Groupe |
|-----|---------|--------|
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

Exemples d'usage observables dans l'application :

- `planning:read_team` garde la grille d'équipe, les rapports et la charge ;
- `planning:view_team` garde la **vue équipe** en lecture seule (pour les salariés qui ne gèrent pas le planning) ;
- `planning:write` garde l'import de planning et l'écriture des shifts ;
- `recup:manage` garde l'attribution de récup ; `hourtypes:manage` les types d'heures ;
- `users:manage` garde les équipes, le journal d'audit et l'export/anonymisation RGPD.

## Permission sets par tenant

Un **permission set** est un ensemble nommé de capacités identifié par un **slug** (table `permission_sets`, globale). Le rôle d'un utilisateur **dans un tenant** (`user_tenants.role`) **est** ce slug : il résout les capacités effectives de cet utilisateur dans ce tenant, renvoyées dans `/auth/me` (`capabilities`).

Trois *permission sets* par défaut reprennent les rôles applicatifs :

| Slug | Nom | Capacités par défaut (seed initial) |
|------|-----|--------------------------------------|
| `admin` | Admin | `planning:read_team`, `planning:write`, `recup:manage`, `leave:validate`, `leave:types:manage`, `contrats:manage`, `users:manage`, `tenants:manage`, `settings:manage`, `clients:manage`, `projects:create` |
| `manager` | Manager | `planning:read_team`, `planning:write`, `recup:manage`, `leave:validate`, `projects:create` |
| `employe` | Salarié | `projects:create` |

> Ce tableau reflète le *seed* initial des *permission sets*. Des capacités introduites plus tard (ex. `planning:view_team`, `hourtypes:manage`, `overtime:validate`) sont ajoutées par des migrations de complément. La composition exacte, la résolution des droits et la troisième dimension (les **équipes**, périmètre de ressources) sont détaillées dans « RBAC : capacités, permission sets & rôles ».

## Références

- `shared/src/permissions.ts` (catalogue des capacités, `PermissionSet`, `UserPermissions`)
- `shared/src/types.ts` (`UserRole`, `TenantRole`, `SessionInfo.platformAdmin`)
- `server/src/db/migrations/020_create_permission_sets.ts` (permission sets par défaut)
- `client/src/store/authStore.ts` (`can`, `isAdmin`, `isPlatformAdmin`, `isManager`)
- `client/src/App.tsx` (`CapabilityRoute`, `PlatformAdminRoute`)
- `client/src/components/layout/Sidebar.tsx` (visibilité par capacité / rôle / plateforme)
