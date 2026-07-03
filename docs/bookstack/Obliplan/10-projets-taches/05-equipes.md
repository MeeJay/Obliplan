Les **équipes** regroupent des utilisateurs du locataire et leur attribuent un périmètre de ressources (clients / projets, en lecture ou lecture-écriture). Elles constituent l'**Axe C** de la matrice de permissions d'Obliplan et pilotent la visibilité des projets, la création de projets, l'affectation et le filtrage du planning. Cette page décrit leur structure, l'écran `/equipes` et leur articulation avec le RBAC.

## Équipes (user_teams / team_memberships)

### Colonnes de la table `user_teams`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant de l'équipe |
| `tenant_id` | entier | Locataire |
| `name` | texte (max 120) | Nom de l'équipe |
| `description` | texte \| null (max 2000) | Description |
| `can_create` | booléen | Les membres peuvent créer des projets |

### Table `team_memberships`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `team_id` | entier | Équipe |
| `user_id` | entier | Membre |

L'appartenance est gérée en **remplacement total** (`setMembers`) : la liste fournie devient l'exacte composition de l'équipe. Seuls les utilisateurs du locataire sont retenus.

## Permissions par équipe (team_permissions)

Le périmètre de ressources d'une équipe est une liste de règles.

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant de la règle |
| `tenant_id` / `team_id` | entier | Locataire / équipe |
| `scope` | enum | `client` \| `project` \| `all` |
| `scope_id` | entier | Cible : id du client/projet ; `0` = « tout de ce type » |
| `level` | enum | `ro` (lecture) \| `rw` (lecture-écriture) |

Sémantique (`scope` × `scope_id`) :

- `all` → toutes les ressources (tous clients et tous projets) ;
- `client` avec `scope_id = 0` → tous les clients ; sinon le client visé ;
- `project` avec `scope_id = 0` → tous les projets ; sinon le projet visé.

Comme l'appartenance, le périmètre est géré en **remplacement total** (`setPermissions`). Pour une règle `all`, `scope_id` est forcé à `0`.

### Périmètre effectif (resolveScope)

`teamService.resolveScope` agrège les règles de **toutes** les équipes d'un utilisateur en un périmètre effectif (`ResolvedScope`) :

| Champ | Rôle |
| --- | --- |
| `allClients` / `allProjects` | Accès à tous les clients / projets |
| `clientIds` / `projectIds` | Ensembles d'identifiants précis atteignables |
| `canCreate` | Vrai si au moins une équipe autorise la création de projets |
| `level` | Niveau le plus élevé accordé (`rw` prime sur `ro`) |

> Un administrateur du locataire (ou administrateur plateforme) court-circuite ce calcul : il obtient un accès complet (`allClients`, `allProjects`, `canCreate`, `level: 'rw'`).

## Rôle des équipes

### Visibilité et création de projets

Le périmètre d'équipe est l'une des sources de visibilité des tableaux (`boardService.listVisible` / `canAccess`) : un membre voit les projets couverts par `projectIds`/`allProjects`, ainsi que les tableaux du/des clients atteints via `clientIds`/`allClients`. L'indicateur `can_create` (résolu en `canCreate`) autorise la création de projets pour les non-managers (garde `requireBoardCreate`). Voir « Kanban/Scrum : tableaux, colonnes, WIP & sprints ».

### Attribution des ressources

L'« attribution » d'une équipe est précisément l'ensemble de ses règles `team_permissions` : elles déterminent quels clients et projets ses membres peuvent atteindre, et à quel niveau (`ro`/`rw`). Modifier ces règles réattribue immédiatement l'accès à toutes les personnes de l'équipe.

### Filtrage du planning (PlanningTeamFilter)

Chaque ligne de planning porte la liste des équipes (`teamIds` = les `user_teams` auxquelles le salarié appartient, résolues par `planningService.teamIdsByUser`). Le composant `PlanningTeamFilter` affiche une rangée de puces (une par équipe présente) permettant de montrer/masquer les plannings par équipe :

- une sélection **vide** signifie « aucun filtre » (tout le monde est affiché) ;
- une ligne est visible si elle partage au moins une équipe avec la sélection ;
- la pseudo-équipe **« Sans équipe »** (`0`) cible les salariés rattachés à aucune équipe.

La sélection active est mémorisée en `localStorage` (clé `obliplan.planning.visibleTeams`) et restaurée au rechargement. Des **vues** enregistrées (presets d'identifiants d'équipes, par utilisateur) permettent de rappeler un filtre nommé ; une vue vide (`[]`) signifie « toutes les équipes ».

## Écran /equipes (TeamsPage)

`TeamsPage` liste les équipes (Nom, Description, Membres, Création projets) et ouvre un modal d'édition. La gestion est réservée aux profils disposant de la capacité `users:manage` (les administrateurs y accèdent d'office) ; l'entrée de barre latérale « Équipes » est réservée aux administrateurs.

Le modal permet de :

- saisir le nom, la description et l'indicateur « Les membres peuvent créer des projets » ;
- cocher les membres de l'équipe ;
- définir le **périmètre des ressources** : ajouter des règles (portée « Toutes les ressources » / « Client » / « Projet », cible client ou projet, niveau « Lecture » ou « Lecture / écriture »).

> Une équipe **sans règle de périmètre** n'a accès à aucune ressource (message : « Sans règle, l'équipe n'a accès à aucune ressource »).

À l'enregistrement, la page appelle successivement la création/mise à jour de l'équipe, puis `setMembers` et `setPermissions` (remplacements totaux).

## Endpoints

Toutes ces routes exigent la capacité `users:manage`.

| Méthode & chemin | Rôle |
| --- | --- |
| `GET /api/teams` | Lister les équipes |
| `POST /api/teams` | Créer une équipe |
| `PUT /api/teams/:id` | Modifier une équipe |
| `DELETE /api/teams/:id` | Supprimer une équipe |
| `GET /api/teams/:id/members` | Membres de l'équipe |
| `PUT /api/teams/:id/members` | Remplacer les membres (`userIds[]`) |
| `GET /api/teams/:id/permissions` | Règles de périmètre |
| `PUT /api/teams/:id/permissions` | Remplacer les règles (`permissions[]`) |

## Lien avec le RBAC

Les équipes sont l'**Axe C** de la matrice de permissions : elles portent le périmètre de ressources (quels clients/projets, à quel niveau). Les capacités fonctionnelles, les ensembles de permissions et les rôles (les autres axes de la matrice) sont décrits dans la page « RBAC : capacités, permission sets & rôles ». La capacité `users:manage` qui protège l'écran `/equipes` y est définie.

## Références

- `server/src/services/team.service.ts`
- `shared/src/teams.ts`
- `server/src/controllers/team.controller.ts`
- `server/src/routes/teams.routes.ts`
- `server/src/validators/team.schema.ts`
- `server/src/db/migrations/035_create_user_teams.ts`, `037_create_team_permissions.ts`
- `server/src/services/planning.service.ts` (résolution `teamIds` par salarié)
- `client/src/pages/TeamsPage.tsx`
- `client/src/components/planning/PlanningTeamFilter.tsx`
