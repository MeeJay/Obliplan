Une carte (card) est l'unité de travail d'un tableau : elle porte un contenu (titre, description, priorité, estimation, échéance, assigné), s'organise en hiérarchie (sous-tâches) et en dépendances (liens), et accumule des commentaires et un journal d'activité. Cette page décrit ces éléments et l'équipe du tableau (membres).

## Contenu d'une carte (cards, CardEditor)

L'éditeur `CardEditor` (ouvert au clic sur une carte, dans toutes les vues) édite les champs suivants.

### Colonnes de la table `cards`

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant de la carte |
| `tenant_id` / `board_id` | entier | Locataire / tableau parent |
| `column_id` | entier | Colonne courante |
| `sprint_id` | entier \| null | Sprint ; `null` = backlog |
| `title` | texte (max 300) | Titre |
| `description` | texte \| null (max 10000) | Description |
| `position` | entier | Ordre dans la colonne |
| `points` | entier \| null (0–999) | Points (estimation Scrum) |
| `estimate_min` | entier \| null (0–100000) | Effort planifié en **minutes** ; alimente la vue de charge |
| `priority` | enum \| null | `low` \| `medium` \| `high` |
| `start_date` | date \| null | Début de l'intervalle `[start, due]` |
| `due_date` | date \| null | Échéance |
| `assignee_id` | entier \| null | Salarié assigné ; `null` = non assigné |
| `parent_card_id` | entier \| null | Carte parente (sous-tâche) ; `null` = carte de premier niveau |
| `created_by` | entier \| null | Auteur de la carte |
| `created_at` / `updated_at` | timestamp | Horodatage |

### Priorité

Trois niveaux, avec libellés d'affichage :

| Valeur | Libellé |
| --- | --- |
| `low` | Basse |
| `medium` | Moyenne |
| `high` | Haute |

### Points et estimation

- `points` : entier facultatif (0 à 999), affiché sous la forme `n pts`.
- `estimate_min` : effort planifié stocké en **minutes**. Dans `CardEditor`, la saisie se fait en **heures** (champ « Estimation (h) ») et est convertie en minutes à l'enregistrement (`Math.round(heures × 60)`). Cette estimation nourrit la vue de charge (somme des estimations des cartes assignées dans les colonnes non terminées).

### Échéance et assigné

- L'échéance (`due_date`) apparaît sur la carte ; une échéance strictement antérieure à aujourd'hui est mise en évidence (fonction `isOverdue`).
- L'assigné est choisi parmi les **membres du tableau** ; si la liste des membres est vide, l'éditeur retombe sur le vivier global des utilisateurs assignables. Un assigné qui n'est plus membre reste visible et sélectionnable.
- Assigner une carte à un nouveau salarié déclenche une notification `card.assigned` (« Une carte vous a été assignée »).

## Hiérarchie et liens entre cartes

> La migration correspondante est nommée `053_card_hierarchy_links.ts`, mais elle crée en base **la colonne `cards.parent_card_id`** (hiérarchie) et **la table `card_links`** (dépendances). Il n'existe pas de table nommée `card_hierarchy_links`.

### Hiérarchie (sous-tâches via parent_card_id)

`parent_card_id` est une clé étrangère auto-référente vers `cards.id`, en `ON DELETE SET NULL` : supprimer une carte parente conserve ses enfants, qui redeviennent des cartes de premier niveau. Une sous-tâche doit appartenir au même tableau que son parent, et une carte ne peut pas être sa propre sous-tâche (contrôles serveur).

Dans `CardEditor`, la section « Sous-tâches » liste les enfants et permet d'en créer. Le compteur « x/y terminées » utilise une heuristique de nom de colonne (`termin|fini|done|clos|achev`) pour estimer l'achèvement d'une sous-tâche. Sur le tableau, une carte parente affiche un badge du nombre de sous-tâches.

### Dépendances (card_links)

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant du lien |
| `tenant_id` / `board_id` | entier | Locataire / tableau |
| `source_card_id` | entier | Carte source |
| `target_card_id` | entier | Carte cible |
| `type` | enum | `blocks` \| `relates` \| `duplicates` |
| `created_at` | timestamp | Horodatage |

Contraintes : un lien relie deux cartes **du même tableau**, l'auto-lien est refusé, et le triplet (`source_card_id`, `target_card_id`, `type`) est unique. Libellés directionnels dans l'éditeur (source → cible) :

| Type | Côté source | Côté cible |
| --- | --- | --- |
| `blocks` | Bloque | Bloqué par |
| `relates` | Lié à | Lié à |
| `duplicates` | Duplique | Dupliqué par |

Une carte qui est la **cible** d'un lien `blocks` est signalée « Bloqué » sur le tableau.

## Commentaires (card_comments)

Chaque carte porte un fil de discussion.

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant du commentaire |
| `tenant_id` / `card_id` | entier | Locataire / carte |
| `author_id` | entier \| null | Auteur ; `null` = utilisateur supprimé |
| `body` | texte (1–5000) | Contenu |
| `created_at` | timestamp | Horodatage |

Les commentaires sont retournés du plus ancien au plus récent, avec le nom d'affichage de l'auteur (`COALESCE(display_name, username)`). Le compositeur gère les **mentions** `@Nom` avec autocomplétion sur les membres du tableau. À la publication :

- une entrée d'activité `commented` est journalisée (au mieux, sans bloquer) ;
- les destinataires sont notifiés : les membres mentionnés reçoivent `card.comment.mention` (« Vous avez été mentionné »), l'assigné et l'auteur de la carte reçoivent `card.comment` (« Nouveau commentaire »). Seuls les membres ayant accès au tableau peuvent être notifiés, pour éviter toute fuite via une mention forgée.

Un commentaire peut être supprimé par son **auteur** ou par un **gestionnaire du tableau** (voir plus bas).

## Journal d'activité (card_activity)

Historique append-only des changements d'une carte, retourné du plus récent au plus ancien.

| Colonne | Type | Rôle |
| --- | --- | --- |
| `id` | entier | Identifiant de l'entrée |
| `tenant_id` / `card_id` | entier | Locataire / carte |
| `actor_id` | entier \| null | Acteur ; `null` = utilisateur supprimé |
| `type` | enum | Type d'événement (voir ci-dessous) |
| `meta` | JSON \| null | Détails selon le type (ex. `{ from, to }` pour un déplacement) |
| `created_at` | timestamp | Horodatage |

Types d'événement (`CardActivityType`) : `created`, `assigned`, `moved`, `status`, `commented`, `updated`. À la mise à jour d'une carte, le service choisit l'événement le plus pertinent : `moved` (changement de colonne, avec `{ from, to }`), `assigned` (changement d'assigné, avec `{ assigneeId }`), sinon `updated`. La journalisation est **au mieux** : un échec n'interrompt jamais la mutation.

## Membres du tableau (board_members)

L'équipe d'un tableau est matérialisée par `board_members`. Chaque membre a un rôle :

| Rôle | Portée |
| --- | --- |
| `owner` | Propriétaire ; gestion complète du tableau et de l'équipe |
| `admin` | Gestion du tableau et de l'équipe |
| `member` | Écriture sur le contenu |
| `viewer` | Lecture seule sur le contenu |

Règles principales :

- l'ajout d'un membre exige que l'utilisateur appartienne au locataire ; le rôle par défaut est `member` ;
- une garde « dernier propriétaire » (`assertNotLastOwner`) empêche de rétrograder ou retirer le seul `owner` restant ;
- un **gestionnaire du tableau** (`isBoardManager`) est un membre `owner`/`admin` ou un administrateur du locataire ; c'est ce rôle qui autorise la gestion des membres et la suppression de tout commentaire.

La gestion de l'équipe se fait via le panneau « Équipe » de `ProjectsPage` (ajout, changement de rôle, retrait), visible pour l'administrateur, le propriétaire du tableau ou un membre `owner`/`admin`.

## Endpoints

| Méthode & chemin | Rôle |
| --- | --- |
| `POST /api/boards/:id/cards` | Créer une carte |
| `PUT /api/boards/cards/:id` | Modifier / déplacer une carte |
| `DELETE /api/boards/cards/:id` | Supprimer une carte |
| `POST /api/boards/cards/:id/links` | Créer un lien de dépendance |
| `DELETE /api/boards/cards/links/:linkId` | Supprimer un lien |
| `GET /api/boards/cards/:id/comments` | Lister les commentaires |
| `POST /api/boards/cards/:id/comments` | Publier un commentaire (`body`, `mentions[]`) |
| `DELETE /api/boards/cards/comments/:commentId` | Supprimer un commentaire (auteur ou gestionnaire) |
| `GET /api/boards/cards/:id/activity` | Journal d'activité de la carte |
| `GET /api/boards/:id/members` | Lister les membres |
| `POST /api/boards/:id/members` | Ajouter un membre (gestionnaire du tableau) |
| `PUT /api/boards/:id/members/:userId` | Changer le rôle d'un membre |
| `DELETE /api/boards/:id/members/:userId` | Retirer un membre |

## Références

- `server/src/services/kanban.service.ts`
- `shared/src/kanban.ts`
- `server/src/controllers/kanban.controller.ts`
- `server/src/routes/boards.routes.ts`
- `server/src/validators/schemas.ts`
- `server/src/db/migrations/014_create_cards.ts`, `029_add_assignee_to_cards.ts`, `052_create_board_members.ts`, `053_card_hierarchy_links.ts`, `055_create_card_activity.ts`, `057_card_estimate.ts`
- `client/src/components/kanban/CardEditor.tsx`
- `client/src/components/kanban/cardMeta.ts`
