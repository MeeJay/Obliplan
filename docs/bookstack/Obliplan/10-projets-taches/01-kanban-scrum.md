Le module **Projets** d'Obliplan fournit des tableaux Kanban/Scrum par salarié : chaque tableau (board) regroupe des colonnes, des cartes et, en option, des sprints. Cette page décrit la structure d'un tableau, ses colonnes configurables, la gestion des sprints et l'écran `/projets`.

> Le module est activé par le module locataire `projets`. Toutes les routes serveur correspondantes sont montées derrière `requireModule('projets')`. Côté client, l'entrée « Mes projets » de la barre latérale pointe vers `/projets`.

## Tableaux (boards)

Un tableau appartient à un propriétaire (`owner_id`) et peut être rattaché à un client (`client_id`). Il porte les colonnes, cartes, sprints, membres et liens de cartes.

### Colonnes de la table `boards`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant du tableau |
| `tenant_id` | entier | Locataire propriétaire (isolation multi-tenant) |
| `owner_id` | entier | Utilisateur propriétaire du tableau |
| `client_id` | entier \| null | Client rattaché ; `null` = projet interne / non affecté |
| `name` | texte | Nom du projet |
| `description` | texte \| null | Description libre |
| `created_at` / `updated_at` | timestamp | Horodatage |

### Tableaux personnels et d'équipe

Un tableau est créé par un salarié, mais il dispose d'une véritable **équipe** via la table `board_members` (voir « Cartes : contenu, hiérarchie, commentaires & activité »). La visibilité d'un tableau (`boardService.listVisible`) est l'union des sources suivantes :

- les tableaux dont l'utilisateur est propriétaire (`owner_id`) ;
- pour un manager, les tableaux détenus par ses subordonnés directs (`users.manager_id`) ;
- les tableaux où l'utilisateur est membre (`board_members`) ;
- les tableaux couverts par le périmètre d'équipe (Axe C) de l'utilisateur : projets/clients accordés par `team_permissions` (voir « Équipes : membres & permissions ») ;
- pour un administrateur, tous les tableaux du locataire.

Le rattachement à un client (`client_id`) est vérifié : un `clientId` fourni qui n'appartient pas au locataire est ignoré (mis à `null`). Sur l'écran `/projets`, les projets sont regroupés dans des dossiers repliables par client, plus une catégorie « Sans client ».

### Création d'un tableau

À la création (`boardService.create`) :

- trois colonnes par défaut sont insérées : **À faire**, **En cours**, **Terminé** (positions 0, 1, 2) ;
- le créateur devient le premier membre du tableau avec le rôle `owner`.

La création est protégée par le middleware `requireBoardCreate` (Axe C) : sont autorisés les administrateurs, les managers, et les membres d'une équipe dont l'indicateur `can_create` est activé. Les autres reçoivent une erreur `403`.

## Colonnes configurables (board_columns)

Chaque colonne est une voie du tableau. Elle est réordonnable et paramétrable depuis le panneau « Paramètres de la colonne » de la vue tableau.

### Colonnes de la table `board_columns`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant de la colonne |
| `tenant_id` / `board_id` | entier | Locataire / tableau parent |
| `name` | texte (max 120) | Libellé de la colonne |
| `position` | entier | Ordre d'affichage (croissant) |
| `wip_limit` | entier \| null | Limite d'en-cours (WIP) ; `null` = aucune limite |
| `is_done` | booléen | Colonne « terminé » : une carte qui s'y trouve est considérée comme complétée |
| `created_at` / `updated_at` | timestamp | Horodatage |

### Limite WIP

Le champ `wip_limit` fixe un plafond d'en-cours. La vue tableau affiche le compteur `cartes/limite` (par exemple `4/3`) ; lorsque le nombre de cartes dépasse la limite (`cards.length > wip_limit`), le compteur passe en rouge. Il s'agit d'un avertissement visuel : le dépassement n'est pas bloqué côté serveur.

### Colonne « terminé » (is_done)

L'indicateur `is_done` marque une voie de fin de flux. Les cartes qui s'y trouvent sont affichées grisées/barrées et considérées comme complétées. Ce drapeau alimente notamment :

- la vue Timeline (barres marquées « terminé ») ;
- la vue de charge (les cartes des colonnes non terminées comptent dans la charge assignée).

> `is_done` (drapeau de colonne, source de vérité serveur) est distinct de l'heuristique de nom de colonne utilisée côté client pour le décompte des sous-tâches (expression `termin|fini|done|clos|achev`).

### Date de début de carte

La migration qui introduit `is_done` ajoute aussi `cards.start_date` : le début optionnel de l'intervalle `[start_date, due_date]` d'une carte, exploité par la vue Timeline (voir « Vues : tableau, liste, table & timeline »).

## Sprints

Un sprint regroupe les cartes d'une itération. Les cartes sans sprint (`sprint_id = null`) constituent le **backlog**.

### Colonnes de la table `sprints`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant du sprint |
| `tenant_id` / `board_id` | entier | Locataire / tableau parent |
| `name` | texte | Nom du sprint |
| `goal` | texte \| null | Objectif du sprint |
| `start_date` / `end_date` | date \| null | Bornes du sprint |
| `status` | enum | `planned` \| `active` \| `done` |

Libellés d'état affichés : `planned` → « Planifié », `active` → « En cours », `done` → « Terminé ». La création par défaut se fait avec le statut `planned`. L'éditeur de sprint propose des transitions rapides « Démarrer » (`active`) et « Terminer » (`done`).

### Filtre backlog / sprint

Dans la vue tableau, un sélecteur « Sprint » filtre les cartes affichées :

- **Tous** : toutes les cartes ;
- **Backlog** : uniquement les cartes sans sprint (`sprint_id = null`) ;
- un sprint précis : uniquement les cartes de ce sprint.

## Écran /projets (ProjectsPage, BoardView)

`ProjectsPage` est composé d'un rail gauche (dossiers par client, recherche, création de projet) et d'une zone droite qui affiche le tableau sélectionné via un sélecteur de vues : **Board**, **Liste**, **Table**, **Timeline**, **Temps**.

`BoardView` rend le Kanban proprement dit :

- une colonne par `board_columns`, triée par `position`, avec compteur de cartes et badge « terminé » ;
- un panneau de paramètres par colonne (renommer, définir la limite WIP, basculer « terminé », supprimer) ;
- l'ajout de colonnes (« Nouvelle colonne ») et de sprints (« Nouveau sprint ») en ligne ;
- un filtre par assigné (« Moi » / un salarié / « Tous ») appliqué côté client.

### Glisser-déposer entre colonnes

Les cartes se déplacent par glisser-déposer, à l'intérieur d'une colonne (réordonnancement) comme d'une colonne à l'autre. Au dépôt, `BoardView.reorder` recalcule les positions de la colonne de destination (et de la colonne source lors d'un déplacement inter-colonnes) puis persiste chaque changement via `PUT /api/boards/cards/:id` (champs `columnId` et/ou `position`). Un déplacement inter-colonnes journalise une activité `moved` sur la carte.

> Les membres au rôle `viewer` sont en lecture seule sur le contenu (colonnes, cartes, sprints, liens) : la garde `requireBoardWrite` du serveur refuse leurs écritures, sauf s'ils sont par ailleurs administrateurs du locataire.

## Endpoints

Toutes les routes sont préfixées par `/api` et exigent une session authentifiée + un locataire actif.

| Méthode & chemin | Rôle |
| --- | --- |
| `GET /api/boards` | Tableaux visibles par l'utilisateur |
| `GET /api/boards/all` | Tous les tableaux du locataire (sélecteur de périmètre d'équipe ; capacité `users:manage`) |
| `POST /api/boards` | Créer un tableau (garde `requireBoardCreate`) |
| `GET /api/boards/:id` | Détail complet (colonnes, cartes, sprints, membres, liens) |
| `PUT /api/boards/:id` | Modifier le tableau (gestionnaire du tableau) |
| `DELETE /api/boards/:id` | Supprimer le tableau (gestionnaire du tableau) |
| `POST /api/boards/:id/columns` | Créer une colonne |
| `PUT /api/boards/columns/:id` | Modifier une colonne (nom, position, `wipLimit`, `isDone`) |
| `DELETE /api/boards/columns/:id` | Supprimer une colonne |
| `POST /api/boards/:id/sprints` | Créer un sprint |
| `PUT /api/boards/sprints/:id` | Modifier un sprint |
| `DELETE /api/boards/sprints/:id` | Supprimer un sprint |

### Exemple de création de colonne

```bash
curl -X POST /api/boards/42/columns \
  -H 'Content-Type: application/json' \
  -d '{ "name": "En revue", "wipLimit": 3 }'
```

## Références

- `server/src/services/kanban.service.ts`
- `shared/src/kanban.ts`
- `server/src/controllers/kanban.controller.ts`
- `server/src/routes/boards.routes.ts`
- `server/src/validators/schemas.ts`
- `server/src/db/migrations/011_create_boards.ts`, `012_create_board_columns.ts`, `013_create_sprints.ts`, `022_add_client_to_boards.ts`, `056_column_done_card_start.ts`
- `client/src/pages/ProjectsPage.tsx`
- `client/src/components/kanban/BoardView.tsx`
