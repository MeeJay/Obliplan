Cette page couvre le travail collaboratif : les tableaux Kanban/Scrum (module `projets`), les listes de tâches personnelles et leurs tâches (module `taches`), la todo-list simple et les équipes (axe C de la matrice de permissions). Les tableaux et les listes/tâches sont protégés par une barrière de module ; la todo et les équipes sont universelles.

## Tableaux Kanban / Scrum (`boards.routes.ts`)

Monté sur `/api/boards`, module `projets`. Chaque utilisateur gère ses propres tableaux ; l'accès repose sur un modèle de rôles de tableau (`owner`, `admin`, `member`, `viewer`) combiné au périmètre d'équipe.

### Tableaux

| Méthode | Chemin | Garde | Corps | Réponse |
|---------|--------|-------|-------|---------|
| `GET` | `/api/boards` | accès | — | Tableaux visibles |
| `GET` | `/api/boards/all` | `users:manage` | — | Tous les tableaux du tenant (`id + name`) |
| `POST` | `/api/boards` | `requireBoardCreate` | `createBoardSchema` | `201` + tableau |
| `GET` | `/api/boards/:id` | accès au tableau | — | Détail du tableau |
| `PUT` | `/api/boards/:id` | manager du tableau | `updateBoardSchema` | Mise à jour |
| `DELETE` | `/api/boards/:id` | manager du tableau | — | `{ message:'Tableau supprimé' }` |

- **`requireBoardCreate`** (axe C) autorise les admins, les managers, ou les membres d'une équipe dont le drapeau `canCreate` est activé ; sinon `403 « Création de projet non autorisée »`.
- **Accès à un tableau** : propriétaire, admin plateforme, manager du propriétaire, membre du tableau, ou périmètre d'équipe.
- **Manager du tableau** (mutations sur le tableau et ses membres) : membre `owner`/`admin` du tableau, ou admin tenant/plateforme.

### Colonnes

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `POST` | `/api/boards/:id/columns` | `createColumnSchema` | `201` + colonne |
| `PUT` | `/api/boards/columns/:id` | `updateColumnSchema` | Mise à jour |
| `DELETE` | `/api/boards/columns/:id` | — | `{ message:'Colonne supprimée' }` |

### Sprints

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `POST` | `/api/boards/:id/sprints` | `createSprintSchema` | `201` + sprint |
| `PUT` | `/api/boards/sprints/:id` | `updateSprintSchema` | Mise à jour |
| `DELETE` | `/api/boards/sprints/:id` | — | `{ message:'Sprint supprimé' }` |

### Cartes

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `POST` | `/api/boards/:id/cards` | `createCardSchema` | `201` + carte |
| `PUT` | `/api/boards/cards/:id` | `updateCardSchema` | Mise à jour |
| `DELETE` | `/api/boards/cards/:id` | — | `{ message:'Carte supprimée' }` |

### Membres du tableau

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/boards/:id/members` | — | Membres |
| `POST` | `/api/boards/:id/members` | `addBoardMemberSchema` | `201` |
| `PUT` | `/api/boards/:id/members/:userId` | `updateBoardMemberSchema` | Rôle mis à jour |
| `DELETE` | `/api/boards/:id/members/:userId` | — | `{ message:'Membre retiré' }` |

### Dépendances entre cartes (liens)

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `POST` | `/api/boards/cards/:id/links` | `addCardLinkSchema` | `201` + lien |
| `DELETE` | `/api/boards/cards/links/:linkId` | — | `{ message:'Lien supprimé' }` |

### Commentaires & activité

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/boards/cards/:id/comments` | — | Commentaires |
| `POST` | `/api/boards/cards/:id/comments` | `addCommentSchema` | `201` + commentaire |
| `DELETE` | `/api/boards/cards/comments/:commentId` | — | `{ message:'Commentaire supprimé' }` |
| `GET` | `/api/boards/cards/:id/activity` | — | Flux d'activité de la carte |

> L'écriture de contenu (cartes, colonnes, sprints, liens, commentaires) est refusée aux membres `viewer` en lecture seule, sauf s'ils sont admin tenant/plateforme (`403 « Accès en lecture seule sur ce tableau »`).

### Schémas (extraits de `schemas.ts`)

```ts
createBoardSchema  = { name: string(1..200), description?: string(<=2000)|null, clientId?: number|null }
createColumnSchema = { name: string(1..120), wipLimit?: number(>=0)|null }
createSprintSchema = { name: string(1..160), goal?, startDate?, endDate?, status?: 'planned'|'active'|'done' }
createCardSchema = {
  columnId: number, sprintId?: number|null,
  title: string(1..300), description?: string(<=10000)|null,
  points?: number(0..999)|null, estimateMin?: number(0..100000)|null,
  priority?: 'low'|'medium'|'high'|null,
  startDate?, dueDate?, assigneeId?: number|null,
  parentCardId?: number|null,     // sous-tâche
}
updateCardSchema   = createCardSchema.partial() + { position?: number(>=0) }
addBoardMemberSchema   = { userId: number, role?: 'owner'|'admin'|'member'|'viewer' }
updateBoardMemberSchema = { role: 'owner'|'admin'|'member'|'viewer' }
addCardLinkSchema  = { targetCardId: number, type: 'blocks'|'relates'|'duplicates' }
addCommentSchema   = { body: string(1..5000), mentions?: number[] }
```

## Listes de tâches (`taskLists.routes.ts`)

Monté sur `/api/task-lists`, module `taches`. Chaque utilisateur gère ses listes et celles partagées avec lui. Le renommage, la suppression, le partage et le réordonnancement exigent d'être **propriétaire** de la liste (`403 « Accès refusé »` sinon).

### Groupes (chemins littéraux avant `/:id`)

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/task-lists/groups` | — | Groupes de l'utilisateur |
| `POST` | `/api/task-lists/groups` | `createListGroupSchema` | `201` |
| `PUT` | `/api/task-lists/groups/:id` | `updateListGroupSchema` | Mise à jour |
| `DELETE` | `/api/task-lists/groups/:id` | — | `{ message:'Groupe supprimé' }` |

### Pool de membres

| Méthode | Chemin | Réponse |
|---------|--------|---------|
| `GET` | `/api/task-lists/members-pool` | Membres du tenant (sélecteur de partage / assignation) |

### Listes

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/task-lists` | — | Listes de l'utilisateur (garantit l'existence de l'« Inbox ») |
| `POST` | `/api/task-lists` | `createTaskListSchema` | `201` |
| `PUT` | `/api/task-lists/reorder` | `reorderListsSchema` | `{ message:'Ordre mis à jour' }` |
| `PUT` | `/api/task-lists/:id` | `updateTaskListSchema` | Mise à jour |
| `DELETE` | `/api/task-lists/:id` | — | `{ message:'Liste supprimée' }` |

### Partage (imbriqué sous une liste)

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/task-lists/:id/shares` | — | Partages de la liste |
| `POST` | `/api/task-lists/:id/shares` | `shareListSchema` | `201` |
| `DELETE` | `/api/task-lists/:id/shares/:userId` | — | `{ message:'Partage retiré' }` |

```ts
createTaskListSchema = { name: string(1..200), color?: '#rrggbb', icon?: string(<=40)|null, groupId?: number|null }
createListGroupSchema = { name: string(1..200) }
shareListSchema = { userId: number, canEdit?: boolean }   // partager avec soi-même => 400
reorderListsSchema = { items: [{ id, position, groupId? }] }
```

## Tâches (`tasks.routes.ts`)

Monté sur `/api/tasks`, module `taches`. Le listage accepte `?listId=` (une liste) **ou** `?smart=` (une vue calculée). L'accès à chaque tâche est vérifié via l'accès à sa liste ; l'écriture requiert le droit `canEdit`.

| Méthode | Chemin | Corps / query | Réponse |
|---------|--------|---------------|---------|
| `GET` | `/api/tasks/counts` | — | Compteurs des vues intelligentes |
| `GET` | `/api/tasks` | `?listId` ou `?smart` | Tâches |
| `POST` | `/api/tasks` | `createTaskSchema` | `201` + tâche |
| `GET` | `/api/tasks/:id/steps` | — | Étapes d'une tâche |
| `POST` | `/api/tasks/:id/steps` | `createTaskStepSchema` | `201` + étape |
| `PUT` | `/api/tasks/steps/:id` | `updateTaskStepSchema` | Étape mise à jour |
| `DELETE` | `/api/tasks/steps/:id` | — | `{ message:'Étape supprimée' }` |
| `PUT` | `/api/tasks/:id` | `updateTaskSchema` | Tâche mise à jour |
| `DELETE` | `/api/tasks/:id` | — | `{ message:'Tâche supprimée' }` |

- Le paramètre `smart` doit appartenir à `my_day`, `important`, `planned`, `assigned`, `tasks` (sinon `400 « Liste intelligente inconnue »`). En l'absence de `smart`, `listId` est requis (`400 « listId ou smart requis »`).
- Déplacer une tâche vers une autre liste requiert le droit d'écriture sur la liste de destination.

```ts
createTaskSchema = {
  listId: number, title: string(1..500), note?: string(<=10000)|null,
  isImportant?: boolean, dueDate?: isoDate|null, reminderAt?: isoDateTime|null,
  myDayDate?: isoDate|null, assigneeId?: number|null,
}
updateTaskSchema = { title?, note?, isImportant?, isCompleted?, dueDate?, reminderAt?, myDayDate?, assigneeId?, listId?, position? }
createTaskStepSchema = { title: string(1..500) }
updateTaskStepSchema = { title?, done?, position? }
```

## Todo (`todos.routes.ts`)

Monté sur `/api/todos`. Universel (aucune barrière de module). Todo-list simple propre à l'appelant.

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/todos` | — | Todos |
| `POST` | `/api/todos` | `createTodoSchema` | `201` |
| `PUT` | `/api/todos/:id` | `updateTodoSchema` | Mise à jour |
| `DELETE` | `/api/todos/:id` | — | Suppression |

```ts
createTodoSchema = { title: string(1..300), dueDate?: isoDate|null }
updateTodoSchema = { title?: string(1..300), done?: boolean, dueDate?: isoDate|null, position?: number(>=0) }
```

## Équipes (`teams.routes.ts`)

Monté sur `/api/teams`. Universel (aucune barrière de module). Les équipes constituent l'axe C de la matrice de permissions ; **tous** les endpoints sont gardés par la capacité `users:manage` (les admins la court-circuitent).

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/teams` | — | Équipes |
| `POST` | `/api/teams` | `createTeamSchema` | `201` |
| `PUT` | `/api/teams/:id` | `updateTeamSchema` | Mise à jour |
| `DELETE` | `/api/teams/:id` | — | Suppression |
| `GET` | `/api/teams/:id/members` | — | Membres |
| `PUT` | `/api/teams/:id/members` | `setTeamMembersSchema` | Membres redéfinis |
| `GET` | `/api/teams/:id/permissions` | — | Permissions de périmètre |
| `PUT` | `/api/teams/:id/permissions` | `setTeamPermissionsSchema` | Permissions redéfinies |

```ts
createTeamSchema = { name: string(1..120), description?: string(<=2000)|null, canCreate?: boolean }
setTeamMembersSchema = { userIds: number[] }
setTeamPermissionsSchema = {
  permissions: [{ scope: 'client'|'project'|'all', scopeId?: number(>=0), level?: 'ro'|'rw' }]
}
```

Le drapeau `canCreate` d'une équipe alimente la garde `requireBoardCreate` des tableaux (voir plus haut).

## Références

- `server/src/routes/boards.routes.ts`
- `server/src/routes/taskLists.routes.ts`
- `server/src/routes/tasks.routes.ts`
- `server/src/routes/todos.routes.ts`
- `server/src/routes/teams.routes.ts`
- `server/src/controllers/kanban.controller.ts`
- `server/src/controllers/taskList.controller.ts`
- `server/src/controllers/task.controller.ts`
- `server/src/controllers/todo.controller.ts`
- `server/src/controllers/team.controller.ts`
- `server/src/validators/schemas.ts`
- `server/src/validators/tasks.schema.ts`
- `server/src/validators/team.schema.ts`
