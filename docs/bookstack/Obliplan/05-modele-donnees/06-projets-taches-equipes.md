Ce domaine couvre trois espaces : les projets Kanban/Scrum (`boards` et leurs satellites), le gestionnaire de tâches personnel « Mes tâches » (`list_groups`, `task_lists`, `tasks`…) et les équipes de tenant (`user_teams`) qui forment l'axe C de la matrice de permissions.

## Projets Kanban/Scrum

### `boards`

Tableau Kanban/Scrum (projet), possédé par un utilisateur et rattachable à un client.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `owner_id` | int FK → `users` (CASCADE) | Propriétaire. |
| `client_id` | int FK → `clients` (SET NULL), nullable | Client possédant le projet ; `NULL` = interne/non assigné. |
| `name` | varchar(200) | Nom du projet. |
| `description` | text, nullable | Description. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `011_create_boards.ts`, puis `022` (`client_id`).

### `board_columns`

Colonne d'un tableau. `is_done` marque une colonne « terminé » (une carte qui s'y trouve est considérée achevée).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `board_id` | int FK → `boards` (CASCADE) | Tableau. |
| `name` | varchar(120) | Nom de la colonne. |
| `position` | int, défaut `0` | Ordre. |
| `wip_limit` | int, nullable | Limite work-in-progress (`NULL` = aucune). |
| `is_done` | bool, défaut `false` | Colonne « terminé ». |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `012_create_board_columns.ts`, puis `056` (`is_done`).

### `board_members`

Membre d'un projet, avec un rôle qui pilote la visibilité et la gestion des membres. À la création de la table, chaque board existant a été back-fillé avec son propriétaire comme unique membre `owner`.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `board_id` | int FK → `boards` (CASCADE) | Tableau. |
| `user_id` | int FK → `users` (CASCADE) | Membre. |
| `role` | varchar(8), défaut `member` | `owner` \| `admin` \| `member` \| `viewer` (contrainte `board_members_role_chk`). |
| `created_at` | timestamp, défaut `now()` | Horodatage de création. |

Contrainte : `unique(board_id, user_id)`. Migration : `052_create_board_members.ts`.

### `sprints`

Sprint d'un tableau.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `board_id` | int FK → `boards` (CASCADE) | Tableau. |
| `name` | varchar(160) | Nom du sprint. |
| `goal` | text, nullable | Objectif. |
| `start_date` | date, nullable | Début. |
| `end_date` | date, nullable | Fin. |
| `status` | varchar(16), défaut `planned` | `planned` \| `active` \| `done` (contrainte `sprints_status_chk`). |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `013_create_sprints.ts`.

### `cards`

Carte d'un tableau. Porte la priorité, les points, l'estimation d'effort, l'échéance, l'assignation, et la hiérarchie (sous-tâches via `parent_card_id`).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `board_id` | int FK → `boards` (CASCADE) | Tableau. |
| `column_id` | int FK → `board_columns` (CASCADE) | Colonne courante. |
| `sprint_id` | int FK → `sprints` (SET NULL), nullable | Sprint ; `NULL` = backlog. |
| `title` | varchar(300) | Titre. |
| `description` | text, nullable | Description. |
| `position` | int, défaut `0` | Ordre dans la colonne. |
| `points` | int, nullable | Points (estimation Scrum). |
| `estimate_min` | int, nullable | Effort planifié en minutes (vue Charge). |
| `priority` | varchar(8), nullable | `low` \| `medium` \| `high` (contrainte `cards_priority_chk`). |
| `start_date` | date, nullable | Début du span `[start, due]` (vue Gantt/Timeline). |
| `due_date` | date, nullable | Échéance. |
| `assignee_id` | int FK → `users` (SET NULL), nullable | Équipier assigné. |
| `parent_card_id` | int FK → `cards` (SET NULL), nullable | Carte parente (sous-tâche) ; auto-référence. |
| `created_by` | int FK → `users` (SET NULL), nullable | Auteur de la création. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `014_create_cards.ts`, puis `029` (`assignee_id`), `053` (`parent_card_id`), `056` (`start_date`), `057` (`estimate_min`).

### `card_links`

Dépendances entre deux cartes d'un même tableau.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `board_id` | int FK → `boards` (CASCADE) | Tableau. |
| `source_card_id` | int FK → `cards` (CASCADE) | Carte source. |
| `target_card_id` | int FK → `cards` (CASCADE) | Carte cible. |
| `type` | varchar(12) | `blocks` \| `relates` \| `duplicates` (contrainte `card_links_type_chk`). |
| `created_at` | timestamp, défaut `now()` | Horodatage. |

Contrainte : `unique(source_card_id, target_card_id, type)`. Migration : `053_card_hierarchy_links.ts`.

### `card_comments`

Fil de discussion d'une carte. `author_id` est en `SET NULL` afin que les commentaires d'un utilisateur supprimé survivent.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `card_id` | int FK → `cards` (CASCADE) | Carte. |
| `author_id` | int FK → `users` (SET NULL), nullable | Auteur. |
| `body` | text | Contenu. |
| `created_at` | timestamp, défaut `now()` | Horodatage. |

Migration : `054_create_card_comments.ts`.

### `card_activity`

Historique d'activité append-only d'une carte (`created` / `assigned` / `moved` / `status` / `commented` / `updated`).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `card_id` | int FK → `cards` (CASCADE) | Carte. |
| `actor_id` | int FK → `users` (SET NULL), nullable | Acteur. |
| `type` | varchar(24) | Type d'entrée (voir liste ci-dessus). |
| `meta` | jsonb, nullable | Détails par type (ex. `{ from, to }` pour un déplacement). |
| `created_at` | timestamp, défaut `now()` | Horodatage. |

Migration : `055_create_card_activity.ts`.

## Gestionnaire de tâches personnel (« Mes tâches »)

### `list_groups`

Groupe repliable de listes dans la barre latérale.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `owner_id` | int FK → `users` (CASCADE) | Propriétaire. |
| `name` | varchar(200) | Nom du groupe. |
| `position` | int, défaut `0` | Ordre. |
| `collapsed` | bool, défaut `false` | Groupe replié. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `030_create_list_groups.ts`.

### `task_lists`

Liste de tâches personnalisée, éventuellement rangée dans un groupe.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `owner_id` | int FK → `users` (CASCADE) | Propriétaire. |
| `name` | varchar(200) | Nom de la liste. |
| `color` | varchar(16), défaut `#4f9cf9` | Couleur du titre/icône. |
| `icon` | varchar(40), nullable | Clé d'icône lucide (`NULL` = icône par défaut). |
| `group_id` | int FK → `list_groups` (SET NULL), nullable | Groupe parent ; `NULL` = non groupée. |
| `position` | int, défaut `0` | Ordre. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `031_create_task_lists.ts`.

### `list_shares`

Partage d'une liste avec un autre utilisateur.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `list_id` | int FK → `task_lists` (CASCADE) | Liste partagée. |
| `user_id` | int FK → `users` (CASCADE) | Bénéficiaire du partage. |
| `can_edit` | bool, défaut `true` | Droit d'édition. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Contrainte : `unique(list_id, user_id)`. Migration : `032_create_list_shares.ts`.

### `tasks`

Tâche d'une liste (importance, achèvement, échéance, rappel, épinglage à « Ma journée », assignation).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `list_id` | int FK → `task_lists` (CASCADE) | Liste. |
| `title` | varchar(500) | Titre. |
| `note` | text, nullable | Note. |
| `is_important` | bool, défaut `false` | Marquée importante. |
| `is_completed` | bool, défaut `false` | Achevée. |
| `completed_at` | timestamptz, nullable | Date d'achèvement. |
| `due_date` | date, nullable | Échéance. |
| `reminder_at` | timestamptz, nullable | Rappel. |
| `my_day_date` | date, nullable | Jour d'épinglage à « Ma journée » ; `NULL` = non épinglée. |
| `position` | int, défaut `0` | Ordre. |
| `assignee_id` | int FK → `users` (SET NULL), nullable | Assigné. |
| `created_by` | int FK → `users` (SET NULL), nullable | Auteur. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `033_create_tasks.ts`.

### `task_steps`

Étapes (sous-cases) d'une tâche.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `task_id` | int FK → `tasks` (CASCADE) | Tâche parente. |
| `title` | varchar(500) | Titre de l'étape. |
| `done` | bool, défaut `false` | Étape faite. |
| `position` | int, défaut `0` | Ordre. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `034_create_task_steps.ts`.

### `todos`

Todo-list personnelle simple (distincte de « Mes tâches »).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Propriétaire. |
| `title` | varchar(300) | Intitulé. |
| `done` | bool, défaut `false` | Coché. |
| `position` | int, défaut `0` | Ordre. |
| `due_date` | date, nullable | Échéance. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `015_create_todos.ts`.

## Équipes (axe C des permissions)

### `user_teams`

Équipe nommée regroupant des utilisateurs d'un tenant. L'appartenance conditionne les clients/projets visibles ; `can_create` accorde le droit de créer de nouveaux projets. (Cette table est aussi listée au chapitre « Cœur : tenants, users, contrats ».)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `name` | varchar(120) | Nom de l'équipe. |
| `description` | text, nullable | Description. |
| `can_create` | bool, défaut `false` | Autorise la création de projets. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `035_create_user_teams.ts`.

### `team_memberships`

Jointure membre ↔ équipe. Clé primaire composite `(team_id, user_id)` : un utilisateur apparaît une seule fois par équipe.

| Colonne | Type | Description |
|---------|------|-------------|
| `team_id` | int FK → `user_teams` (CASCADE) | Équipe. |
| `user_id` | int FK → `users` (CASCADE) | Membre. |

Clé primaire : `(team_id, user_id)`. Migration : `036_create_team_memberships.ts`.

### `team_permissions`

Portée de ressources accordée à une équipe : chaque ligne donne un accès lecture seule ou lecture-écriture à un client, un projet, ou toutes les ressources.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `team_id` | int FK → `user_teams` (CASCADE) | Équipe. |
| `scope` | varchar(16) | `client` \| `project` \| `all` (contrainte `team_permissions_scope_chk`). |
| `scope_id` | int, défaut `0` | Id du client/projet ciblé ; `0` = « tout de ce type ». |
| `level` | varchar(8), défaut `ro` | `ro` \| `rw` (contrainte `team_permissions_level_chk`). |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `037_create_team_permissions.ts`.

## Références

- `server/src/db/migrations/011_create_boards.ts` … `015_create_todos.ts`, `022_add_client_to_boards.ts`
- `server/src/db/migrations/029_add_assignee_to_cards.ts` … `037_create_team_permissions.ts`
- `server/src/db/migrations/052_create_board_members.ts`, `053_card_hierarchy_links.ts`, `054_create_card_comments.ts`, `055_create_card_activity.ts`, `056_column_done_card_start.ts`, `057_card_estimate.ts`
- `shared/src/kanban.ts`, `shared/src/tasks.ts`, `shared/src/teams.ts`
