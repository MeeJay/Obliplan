L'écran **Permissions** (`/permissions`, `PermissionsPage`) présente une matrice **capacités × jeux de permissions**. Un jeu de permissions (`permission_sets`) est un ensemble nommé de capacités, identifié par un `slug`. Il est appliqué par tenant via `user_tenants.role`, qui stocke précisément un slug de jeu. La route est réservée au rôle `admin` du tenant.

## Le modèle : capacités et jeux de permissions

Le catalogue des capacités est une constante de code (`CAPABILITIES` dans `shared/src/permissions.ts`) : c'est la source de vérité des clés valides. Chaque capacité a une clé (`key`), un libellé (`label`) et un groupe (`group`).

| Clé | Groupe | Libellé |
|-----|--------|---------|
| `planning:read_team` | Planning | Voir le planning de l'équipe |
| `planning:view_team` | Planning | Voir le planning de l'équipe (lecture seule) |
| `planning:write` | Planning | Créer / éditer / valider le planning |
| `recup:manage` | Planning | Gérer la récupération |
| `hourtypes:manage` | Planning | Gérer les types d'heures |
| `leave:validate` | Congés | Valider les congés |
| `leave:types:manage` | Congés | Gérer les types de congés |
| `contrats:manage` | Administration | Gérer les contrats |
| `users:manage` | Administration | Gérer les salariés |
| `tenants:manage` | Administration | Gérer les workspaces |
| `settings:manage` | Administration | Paramètres de l'instance |
| `clients:manage` | Projets | Gérer les clients |
| `projects:create` | Projets | Créer des projets |
| `overtime:natures:manage` | Heures sup | Gérer les natures d'heures sup |
| `overtime:validate` | Heures sup | Valider les heures supplémentaires |

Un **jeu de permissions** est une ligne de `permission_sets` : `{ id, name, slug, capabilities[], isDefault, … }`. Le slug est dérivé du nom (`slugify`). Un jeu marqué `isDefault` ne peut pas être supprimé.

> Le rôle `admin` de plateforme possède **toutes** les capacités : `requireTenantCapability` court-circuite le contrôle lorsque `session.role === 'admin'`. La matrice ne s'applique donc qu'aux rôles non-admin.

## L'écran Permissions

La page charge en parallèle les jeux (`GET /permission-sets`) et le catalogue des capacités (`GET /permission-sets/capabilities`), puis dessine une grille : une ligne par capacité (regroupée par `group`), une colonne par jeu de permissions.

### Endpoints

| Méthode | Route | Garde | Rôle |
|---------|-------|-------|------|
| `GET` | `/permission-sets` | (lecture) | Liste des jeux |
| `GET` | `/permission-sets/capabilities` | (lecture) | Catalogue des capacités |
| `POST` | `/permission-sets` | `requireAdmin()` | Créer un jeu |
| `PUT` | `/permission-sets/:id` | `requireAdmin()` | Mettre à jour nom/capacités |
| `DELETE` | `/permission-sets/:id` | `requireAdmin()` | Supprimer (refusé si `isDefault`) |

### Activer / retirer une capacité

Cocher ou décocher une case bascule l'appartenance de la capacité au jeu. L'interface applique la mise à jour de façon **optimiste** (la case change tout de suite) puis envoie `PUT /permission-sets/:id` avec la nouvelle liste `capabilities`. En cas d'échec, elle recharge l'état réel.

Côté serveur, la liste soumise est **filtrée sur le catalogue** : seules les clés présentes dans `CAPABILITY_KEYS` sont conservées (`data.capabilities.filter((c) => CAPABILITY_KEYS.includes(c))`). Une clé inconnue est silencieusement ignorée.

```ts
// permissionSetService.update — filtrage sur le catalogue
patch.capabilities = JSON.stringify(
  data.capabilities.filter((c) => CAPABILITY_KEYS.includes(c)),
);
```

### Créer / supprimer un jeu

Le champ « Nouveau jeu de permissions » crée un jeu vide (`POST`, `slug` auto-généré, `isDefault=false`). Les jeux non par défaut portent une icône de suppression ; supprimer un jeu marqué par défaut est refusé côté serveur (`reason: 'default'`).

## Effet immédiat sur les écrans et l'API

Les capacités effectives d'un utilisateur dans le tenant actif sont renvoyées par `/auth/me` (`UserPermissions`, `tenantCapabilities[]`). Elles pilotent à la fois :

- **le client** — le store d'authentification expose `can(capability)`. Les routes et les commandes sensibles sont conditionnées (p. ex. `CapabilityRoute capability="recup:manage"`, affichage des boutons « Nouveau salarié », « Nouveau contrat », « Nouveau client »).
- **le serveur** — chaque écriture est gardée par `requireTenantCapability('...')`, qui interroge le service de permissions pour le tenant courant et renvoie `403` si la capacité manque.

Modifier un jeu affecte donc tous les utilisateurs auxquels ce slug est attribué via `user_tenants.role`. Le rôle `admin` reste au-dessus de la matrice (toutes capacités).

> **Axe équipe.** L'attribution de capacités par équipe (`team_permissions`, migration `037_create_team_permissions`) constitue un axe distinct (Axis C), utilisé notamment pour restreindre le périmètre des clients visibles. Il ne se règle pas sur cet écran. Voir « RBAC : capacités, permission sets & rôles » pour l'articulation complète des axes.

## Références

- `shared/src/permissions.ts` (`CAPABILITIES`, `CAPABILITY_KEYS`, `PermissionSet`, `UserPermissions`)
- `server/src/services/permissionSet.service.ts`
- `server/src/routes/permissionSets.routes.ts`
- `server/src/middleware/rbac.ts` (`requireAdmin`, `requireTenantCapability`)
- `client/src/pages/PermissionsPage.tsx`
