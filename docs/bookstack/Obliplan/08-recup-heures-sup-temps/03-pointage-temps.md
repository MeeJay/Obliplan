Le module **temps** permet de pointer le temps de travail : le catégoriser via des **types d'heures**, et l'imputer sur un **projet** (tableau kanban) ou une **tâche** (carte) — projets eux-mêmes rattachés à un **client**. Il s'active par le module de tenant `temps` ; ses saisies sont exposées sous le préfixe `/time-entries`. Les types d'heures et les clients sont des catalogues de configuration partagés avec le reste de l'application.

## Types d'heures

Les **types d'heures** (`hour_types`) sont un catalogue par workspace qui qualifie l'activité : Front, Back, Pause, Projet X, etc. Ils portent une couleur (utilisée notamment sur le planning) et un code court facultatif.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | int | Identifiant. |
| `tenant_id` | int | Workspace propriétaire. |
| `libelle` | string | Libellé affiché (ex. « Back »). |
| `code` | string \| null | Code court facultatif (ex. `FRONT`, `BACK`, `PAUSE`). |
| `color` | string \| null | Couleur d'affichage. |
| `position` | int | Ordre de tri. |
| `is_active` | bool | Type inactif : conservé mais plus proposé. |
| `bookable` | bool | Si vrai, le temps travaillé sous ce type est proposé comme créneau libre sur la page publique de prise de rendez-vous. |
| `booking_exclude_projects` | bool | Si vrai (et `bookable`), un créneau de ce type portant un **projet** est exclu des créneaux réservables (un bloc projet = occupé, pas « libre RDV »). |
| `created_at` / `updated_at` | timestamp | Horodatage. |

### Écran `/types-heures`

La page **Types d'heures** (`HourTypesPage`) liste les types (libellé, code, indicateur « Réservable », actif). Son accès est réservé aux porteurs de la capacité `hourtypes:manage`, qui gouverne aussi la création, l'édition et la suppression. La liste des types elle-même (`GET /hour-types`) reste en revanche ouverte en lecture au reste de l'application, qui s'en sert notamment pour colorer le planning et catégoriser les saisies. Les cases *Réservable pour rendez-vous* et *Sauf si un projet est rattaché* correspondent respectivement à `bookable` et `booking_exclude_projects`.

| Endpoint | Méthode | Capacité |
| --- | --- | --- |
| `/hour-types` | GET | — (lecture ouverte) |
| `/hour-types` | POST | `hourtypes:manage` |
| `/hour-types/:id` | PUT | `hourtypes:manage` |
| `/hour-types/:id` | DELETE | `hourtypes:manage` |

## Saisies de temps

Une saisie (`time_entries`) enregistre un volume de minutes, éventuellement imputé sur un projet (`board_id`) et/ou une tâche (`card_id`). Une saisie sans projet ni tâche est un temps « libre » ; une saisie avec projet mais sans tâche est imputée au niveau du projet.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | int | Identifiant. |
| `tenant_id` | int | Workspace propriétaire. |
| `user_id` | int | Salarié à qui le temps est imputé. |
| `board_id` | int \| null | Projet (tableau kanban) imputé. `null` = aucun projet. |
| `card_id` | int \| null | Tâche (carte) imputée. `null` = au niveau du projet. |
| `minutes` | int | Durée en minutes (0 tant qu'un minuteur tourne). |
| `note` | text \| null | Note libre. |
| `spent_on` | date \| null | Jour d'imputation. |
| `is_running` | bool | Vrai tant qu'un minuteur est en cours pour cette saisie. |
| `started_at` | timestamp \| null | Départ du minuteur (`null` pour une saisie manuelle). |
| `created_at` | timestamp | Date de création. |

### Deux modes de saisie

- **Minuteur** : un seul minuteur peut tourner à la fois par utilisateur — en démarrer un arrête automatiquement le précédent et en fige la durée écoulée. À l'arrêt, les minutes écoulées sont validées.
- **Saisie manuelle** : durée (heures + minutes), date, projet/tâche et note, sans minuteur.

Les références de projet et de tâche sont vérifiées comme appartenant au workspace : une saisie imputée sur un `board_id` ou un `card_id` étranger est rejetée (« Projet introuvable » / « Tâche introuvable »).

### Écran `/temps`

La page **Suivi du temps** (`TimeTrackingPage`) réunit le minuteur en cours, le formulaire de saisie manuelle (qui sert aussi à l'édition), les totaux par projet et le total général, ainsi que la liste « Mes entrées » (éditables et supprimables). La liste des projets est chargée de façon découplée : une indisponibilité du module projets n'empêche pas le pointage.

| Endpoint | Méthode | Rôle |
| --- | --- | --- |
| `/time-entries` | GET | Mes saisies. |
| `/time-entries/running` | GET | Mon minuteur en cours, s'il existe. |
| `/time-entries/board/:boardId` | GET | Saisies d'un projet (enrichies du salarié et de la tâche). |
| `/time-entries/board/:boardId/totals` | GET | Totaux par tâche pour un projet. |
| `/time-entries/start` | POST | Démarrer un minuteur. |
| `/time-entries/:id/stop` | POST | Arrêter un minuteur. |
| `/time-entries` | POST | Créer une saisie manuelle. |
| `/time-entries/:id` | PUT | Modifier une saisie. |
| `/time-entries/:id` | DELETE | Supprimer une saisie. |

> La saisie manuelle accepte un champ `userId` optionnel : un manager peut ainsi pointer du temps pour le compte d'un salarié ; à défaut, le temps est imputé à l'appelant.

## Clients comme axe d'imputation

Les **clients** (`clients`) sont les entités auxquelles se rattachent les projets (tableaux kanban). Ils forment ainsi l'axe d'imputation de plus haut niveau : temps → tâche → projet → client. Un client porte un nom, une couleur, un contact, des notes, un **logo** optionnel (data-URI base64 redimensionné côté client, ou URL externe ; `null` = aucun) et un indicateur d'archivage.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | int | Identifiant. |
| `tenant_id` | int | Workspace propriétaire. |
| `name` | string | Nom du client. |
| `color` | string \| null | Couleur d'affichage. |
| `contact` | string \| null | Contact. |
| `notes` | string \| null | Notes libres. |
| `logo` | string \| null | Logo (data-URI base64 ou URL). |
| `archived` | bool | Client archivé. |
| `created_at` / `updated_at` | timestamp | Horodatage. |

La gestion des clients (module `clients`) est décrite dans « Clients » (administration) : la lecture est ouverte, tandis que la création, la modification et la suppression exigent la capacité `clients:manage`. Le périmètre de visibilité peut être restreint par l'axe des équipes (Axe C) pour les rôles non administrateurs.

## Références

- `server/src/services/timeEntry.service.ts`
- `server/src/services/hourType.service.ts`
- `server/src/services/client.service.ts`
- `server/src/routes/timeEntries.routes.ts`
- `server/src/routes/hourTypes.routes.ts`
- `server/src/routes/clients.routes.ts`
- `server/src/db/migrations/023_create_hour_types.ts`
- `server/src/db/migrations/021_create_clients.ts`
- `server/src/db/migrations/064_add_client_logo.ts`
- `shared/src/timetracking.ts` (`TimeEntry`, `CardTimeTotal`)
- `shared/src/hourtype.ts` (`HourType`)
- `shared/src/client.ts` (`Client`)
- `client/src/pages/TimeTrackingPage.tsx`
- `client/src/pages/HourTypesPage.tsx`
