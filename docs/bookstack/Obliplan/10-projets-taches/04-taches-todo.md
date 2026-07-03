Le module **Tâches** d'Obliplan fournit un gestionnaire de tâches personnel de type « To Do » : des listes personnalisées regroupées en dossiers, partageables entre collègues, avec des tâches détaillées (notes, échéance, rappel, étapes) et des listes intelligentes calculées. Cette page décrit ce système ainsi que l'API de todo personnelle simple, et clarifie la différence entre les deux.

> Les listes et tâches sont activées par le module locataire `taches` (routes `task-lists` et `tasks` montées derrière `requireModule('taches')`). L'écran `/taches` (« Mes tâches ») en est l'interface. La table `todos` (todo simple), elle, n'est pas soumise à ce module (voir plus bas).

## Listes de tâches (task_lists)

Une liste appartient à un propriétaire ; elle peut être rangée dans un dossier et partagée.

### Colonnes de la table `task_lists`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant de la liste |
| `tenant_id` / `owner_id` | entier | Locataire / propriétaire |
| `name` | texte (max 200) | Nom |
| `color` | texte hex `#rrggbb` | Couleur (défaut `#4f9cf9`) |
| `icon` | texte \| null | Clé d'icône lucide ; `null` = icône par défaut |
| `group_id` | entier \| null | Dossier parent ; `null` = liste hors dossier |
| `position` | entier | Ordre d'affichage |
| `created_at` / `updated_at` | timestamp | Horodatage |

Champs calculés côté service (non stockés) : `shared` (la liste est partagée avec l'utilisateur courant, pas détenue par lui), `taskCount` (tâches non terminées, badge de la barre latérale) et `memberCount` (nombre de partages).

Une **boîte de réception** par défaut est garantie à la demande (`ensureInbox`) : la première liste de l'utilisateur, ou à défaut une liste « Tâches » (`#4f9cf9`, position 0). Elle sert de destination à la liste intelligente « Tâches ».

## Dossiers (list_groups)

Les listes se rangent dans des dossiers repliables.

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant du dossier |
| `tenant_id` / `owner_id` | entier | Locataire / propriétaire |
| `name` | texte (max 200) | Nom du dossier |
| `position` | entier | Ordre |
| `collapsed` | booléen | Dossier replié |

> Supprimer un dossier ne supprime pas ses listes : celles-ci sont détachées (`group_id` remis à `null`) avant la suppression du dossier.

## Partage (list_shares)

Le partage donne accès à une liste à d'autres utilisateurs du locataire.

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant du partage |
| `tenant_id` / `list_id` | entier | Locataire / liste |
| `user_id` | entier | Bénéficiaire du partage |
| `can_edit` | booléen | Droit d'écriture (sinon lecture seule) |

Résolution d'accès (`taskListService.access`) : le **propriétaire** peut toujours écrire ; un **bénéficiaire** peut lire, et écrire seulement si `can_edit` est vrai. Le modal de partage (réservé au propriétaire) bascule le partage par membre (créé avec `canEdit: true`).

## Tâches (tasks)

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant |
| `tenant_id` / `list_id` | entier | Locataire / liste |
| `title` | texte (max 500) | Titre |
| `note` | texte \| null (max 10000) | Note |
| `is_important` | booléen | Marquée importante (étoile) |
| `is_completed` | booléen | Terminée |
| `completed_at` | timestamp \| null | Date d'achèvement |
| `due_date` | date \| null | Échéance |
| `reminder_at` | timestamptz \| null | Rappel (date + heure) |
| `my_day_date` | date \| null | Épinglée à « Ma journée » ce jour ; `null` = non |
| `position` | entier | Ordre dans la liste |
| `assignee_id` | entier \| null | Salarié affecté (listes partagées) |
| `created_by` | entier \| null | Auteur |
| `created_at` / `updated_at` | timestamp | Horodatage |

Champs calculés : `stepCount` / `doneStepCount` (progression des étapes). Affecter une tâche à un nouveau salarié déclenche une notification `task.assigned` (« Une tâche vous a été assignée »). L'affectation n'est proposée que pour les **listes partagées** (panneau de détail).

### Listes intelligentes

Vues calculées qui agrègent les tâches de toutes les listes accessibles (`SmartList`) :

| Clé | Libellé | Contenu |
| --- | --- | --- |
| `my_day` | Ma journée | Tâches dont `my_day_date` = aujourd'hui |
| `important` | Important | Tâches `is_important` |
| `planned` | Planifié | Tâches avec une `due_date` |
| `assigned` | Affectées à moi | Tâches dont `assignee_id` = utilisateur courant |
| `tasks` | Tâches | Boîte de réception (`ensureInbox`) |

L'endpoint de comptage renvoie le nombre de tâches non terminées par liste intelligente, plus l'identifiant de la boîte de réception.

## Étapes (task_steps)

Une tâche se décompose en étapes (sous-cases à cocher).

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant |
| `tenant_id` / `task_id` | entier | Locataire / tâche |
| `title` | texte (max 500) | Libellé de l'étape |
| `done` | booléen | Cochée |
| `position` | entier | Ordre |

## Todo personnelle simple (todos)

En parallèle du système « Mes tâches », le backend expose une **todo personnelle simple**, propre à chaque utilisateur.

### Colonnes de la table `todos`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant |
| `tenant_id` / `user_id` | entier | Locataire / propriétaire |
| `title` | texte (max 300) | Titre |
| `done` | booléen | Cochée / décochée |
| `position` | entier | Ordre |
| `due_date` | date \| null | Échéance |

Endpoints (préfixe `/api`, **sans** garde de module) :

| Méthode & chemin | Rôle |
| --- | --- |
| `GET /api/todos` | Lister mes todos (triées par `done`, `position`, `id`) |
| `POST /api/todos` | Créer une todo (`title`, `dueDate?`) |
| `PUT /api/todos/:id` | Modifier (`title`, `done`, `dueDate`, `position`) |
| `DELETE /api/todos/:id` | Supprimer |

> **Distinguer les deux systèmes.** La table `todos` (échéance, coché/décoché) est un modèle simple, strictement personnel, sans listes, étapes, partage ni affectation. Elle est distincte des **listes de tâches partagées** (`task_lists` / `tasks` / `task_steps` / `list_shares`) qui alimentent l'écran `/taches`. Le wrapper client `todoApi` existe (`client/src/api/index.ts`), mais l'écran `/taches` (`TodoPage`) s'appuie sur le système de listes de tâches, pas sur la table `todos`.

## Écran /taches (TodoPage)

`TodoPage` orchestre trois panneaux :

- **`TodoSidebar`** : listes intelligentes en haut, puis les listes personnalisées (hors dossier et par dossier), avec menus contextuels (renommer, recolorer, déplacer vers un dossier, partager, supprimer), création de listes et de dossiers, et le modal de partage.
- **`TaskListPane`** : en-tête (titre/couleur/icône de la vue active), champ d'ajout rapide, tâches actives puis section « Terminées » repliable, bascule « importante » (étoile) et « terminée » (rond), méta par tâche (Ma journée, échéance, progression des étapes).
- **`TaskDetailPane`** : détail de la tâche sélectionnée — étapes (ajout/coche/suppression), bouton « Ajouter à Ma journée », échéance et rappel, sélecteur d'affectation (listes partagées uniquement), note, suppression.

L'ajout depuis une liste intelligente pré-remplit le contexte : `my_day` épingle à aujourd'hui, `important` marque importante, `planned` fixe l'échéance à aujourd'hui, `assigned` affecte à l'utilisateur courant ; sinon la tâche est créée dans la boîte de réception.

## Endpoints (listes, tâches, étapes)

| Méthode & chemin | Rôle |
| --- | --- |
| `GET /api/tasks?listId=` ou `?smart=` | Tâches d'une liste, ou d'une liste intelligente |
| `GET /api/tasks/counts` | Compteurs des listes intelligentes + id de la boîte de réception |
| `POST /api/tasks` | Créer une tâche |
| `PUT /api/tasks/:id` | Modifier une tâche (déplacement de liste re-vérifié) |
| `DELETE /api/tasks/:id` | Supprimer une tâche |
| `GET /api/tasks/:id/steps` · `POST /api/tasks/:id/steps` | Étapes (lister / créer) |
| `PUT /api/tasks/steps/:id` · `DELETE /api/tasks/steps/:id` | Étapes (modifier / supprimer) |
| `GET /api/task-lists` · `POST /api/task-lists` | Listes (lister / créer) |
| `PUT /api/task-lists/reorder` | Réordonner / déplacer des listes |
| `PUT /api/task-lists/:id` · `DELETE /api/task-lists/:id` | Modifier / supprimer une liste |
| `GET/POST/PUT/DELETE /api/task-lists/groups...` | Dossiers |
| `GET /api/task-lists/:id/shares` · `POST /api/task-lists/:id/shares` · `DELETE /api/task-lists/:id/shares/:userId` | Partage |
| `GET /api/task-lists/members-pool` | Vivier de collègues (partage + affectation) |

## Références

- `server/src/services/task.service.ts`
- `server/src/services/taskList.service.ts`
- `server/src/services/todo.service.ts`
- `shared/src/tasks.ts`, `shared/src/kanban.ts` (interface `Todo`)
- `server/src/controllers/task.controller.ts`
- `server/src/routes/tasks.routes.ts`, `taskLists.routes.ts`, `todos.routes.ts`
- `server/src/validators/tasks.schema.ts`, `server/src/validators/schemas.ts` (schémas `todo`)
- `server/src/db/migrations/030_create_list_groups.ts`, `031_create_task_lists.ts`, `032_create_list_shares.ts`, `033_create_tasks.ts`, `034_create_task_steps.ts`, `015_create_todos.ts`
- `client/src/pages/TodoPage.tsx`
- `client/src/components/todo/TodoSidebar.tsx`, `TaskListPane.tsx`, `TaskDetailPane.tsx`, `todoMeta.ts`
