Le module **temps** permet de pointer le temps de travail : le catégoriser via des **types d'heures**, et l'imputer sur un **projet** (tableau kanban) ou une **tâche** (carte) — projets eux-mêmes rattachés à un **client**. Il s'active par le module de tenant `temps` (routes `/time-entries`). Les types d'heures et les clients sont des catalogues de configuration partagés avec le reste de l'application.

## Types d'heures

Les **types d'heures** (`hour_types`) forment un catalogue par tenant qui permet de qualifier le temps par activité (par exemple Front, Back, Pause…). Un type porte un libellé, un code court optionnel et une couleur, et peut être désactivé sans être supprimé. Un créneau de planning peut se rattacher à un type d'heure (`hourTypeId` sur le shift), ce qui les fait apparaître dans la visualisation du planning.

### Colonnes (`hour_types`)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | entier | Identifiant |
| `tenant_id` | entier | Workspace propriétaire |
| `libelle` | texte | Nom affiché |
| `code` | texte \| null | Code court, ex. `FRONT`, `BACK`, `PAUSE` |
| `color` | texte \| null | Couleur (visualisation planning) |
| `position` | entier | Ordre d'affichage (tri par `position`, puis `libelle`) |
| `is_active` | booléen | Type actif ou archivé |
| `created_at` / `updated_at` | horodatage | Suivi |

### Écran `/types-heures` (`HourTypesPage`)

La page liste les types (libellé, code, actif) et, pour les utilisateurs disposant de `hourtypes:manage`, permet de créer, éditer et supprimer via une fenêtre modale (libellé, couleur, code optionnel, actif). La lecture est ouverte à tous les rôles ; seules les actions de gestion sont gardées par la capacité.

> **Note** — La suppression échoue si le type est utilisé (« Suppression impossible (type utilisé ?) »). La navigation vers la page est elle-même conditionnée à la capacité `hourtypes:manage` côté client.

## Saisies de temps

Une **saisie de temps** (`time_entries`) est un bloc de minutes daté, éventuellement imputé sur un projet et/ou une tâche. La saisie se fait de deux manières : au **minuteur** (chronomètre en direct) ou en **saisie manuelle**.

### Colonnes (`time_entries`)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | entier | Identifiant |
| `tenant_id` | entier | Workspace propriétaire |
| `user_id` | entier | Salarié concerné |
| `board_id` | entier \| null | Projet (board) imputé ; `null` = sans projet |
| `card_id` | entier \| null | Tâche (carte) imputée ; `null` = sans tâche |
| `minutes` | entier | Durée en minutes (`0` tant qu'un minuteur tourne) |
| `note` | texte \| null | Note libre |
| `spent_on` | date ISO \| null | Jour où le temps a été passé |
| `is_running` | booléen | Vrai tant qu'un minuteur est actif |
| `started_at` | horodatage \| null | Départ du minuteur (`null` pour une saisie manuelle) |
| `created_at` | horodatage | Date de création |

### Minuteur

- **Un seul minuteur actif par salarié** : démarrer un minuteur arrête d'abord tout autre minuteur en cours (les minutes écoulées y sont figées).
- Au démarrage : `is_running = true`, `started_at = maintenant`, `minutes = 0`, `spent_on = aujourd'hui`.
- À l'arrêt : les minutes engrangées valent `floor((maintenant − started_at) / 60000)`, jamais négatives.

### Saisie manuelle

Création directe d'une entrée terminée (sans minuteur) : durée, note, date et imputation projet/tâche. Un manager peut saisir **pour le compte d'un salarié** (champ `userId`, à défaut l'appelant). Les références `board_id` / `card_id` sont validées dans le tenant (`400 « Projet introuvable »` ou `400 « Tâche introuvable »` si elles n'appartiennent pas au workspace).

### Écran `/temps` (`TimeTrackingPage`)

La page réunit le minuteur en cours, le formulaire de saisie manuelle (qui sert aussi de formulaire d'édition), les totaux par projet et le total général, puis la liste « Mes entrées ». Les sélecteurs de projet et de tâche alimentent l'imputation ; le libellé du minuteur se rafraîchit périodiquement tant qu'il tourne.

## Clients comme axe d'imputation

Les **clients** (module `clients`) sont l'axe d'imputation de plus haut niveau : un projet (board kanban) porte un `clientId` (`null` = projet interne / non assigné), si bien qu'imputer une saisie sur un projet la rattache indirectement à son client. Un client porte un nom, une couleur, un contact, des notes, un état d'archivage et un **logo** optionnel.

### Colonnes (`clients`)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | entier | Identifiant |
| `tenant_id` | entier | Workspace propriétaire |
| `name` | texte | Nom du client |
| `color` | texte \| null | Couleur d'affichage |
| `contact` | texte \| null | Contact |
| `notes` | texte \| null | Notes libres |
| `logo` | texte \| null | Logo : data-URI base64 (redimensionné côté client) ou URL externe ; `null` = aucun |
| `archived` | booléen | Client archivé |
| `created_at` / `updated_at` | horodatage | Suivi |

> **Note** — La liste des clients est filtrée par périmètre pour les rôles non-administrateurs (portée des équipes, axe C) ; un administrateur ou un platform admin voit l'ensemble. La gestion complète des clients (création, édition, archivage) est décrite dans « Clients ».

## Capacités & modules

| Élément | Valeur | Portée |
|---------|--------|--------|
| Module de tenant | `temps` | Active les routes `/time-entries` |
| Module de tenant | `clients` | Active les routes `/clients` |
| Capacité | `hourtypes:manage` | « Gérer les types d'heures » (groupe Planning) |
| Capacité | `clients:manage` | « Gérer les clients » (groupe Projets) |

> **Note** — Les routes `/hour-types` ne sont **pas** gardées par un module de tenant : le catalogue des types d'heures est universel. La lecture y est ouverte à tous ; seules les mutations exigent `hourtypes:manage`.

## Endpoints

### Saisies de temps (`/time-entries`, module `temps`)

Ces routes sont gardées par le module `temps` et l'authentification, sans capacité dédiée.

| Méthode & chemin | Rôle |
|------------------|------|
| `GET /time-entries` | Mes entrées |
| `GET /time-entries/running` | Mon minuteur en cours |
| `GET /time-entries/board/:boardId` | Entrées d'un projet (enrichies : nom du salarié, titre de la carte) |
| `GET /time-entries/board/:boardId/totals` | Totaux par carte d'un projet |
| `POST /time-entries/start` | Démarrer un minuteur |
| `POST /time-entries/:id/stop` | Arrêter un minuteur |
| `POST /time-entries` | Créer une saisie manuelle |
| `PUT /time-entries/:id` | Modifier une saisie |
| `DELETE /time-entries/:id` | Supprimer une saisie |

### Types d'heures (`/hour-types`, sans module)

| Méthode & chemin | Capacité |
|------------------|----------|
| `GET /hour-types` | lecture par tous |
| `POST /hour-types` | `hourtypes:manage` |
| `PUT /hour-types/:id` | `hourtypes:manage` |
| `DELETE /hour-types/:id` | `hourtypes:manage` |

### Clients (`/clients`, module `clients`)

| Méthode & chemin | Capacité |
|------------------|----------|
| `GET /clients` | lecture (filtrée par périmètre) |
| `GET /clients/:id` | lecture |
| `POST /clients` | `clients:manage` |
| `PUT /clients/:id` | `clients:manage` |
| `DELETE /clients/:id` | `clients:manage` |

## Références

- `server/src/services/timeEntry.service.ts`, `server/src/routes/timeEntries.routes.ts`
- `server/src/services/hourType.service.ts`, `server/src/routes/hourTypes.routes.ts`
- `server/src/services/client.service.ts`, `server/src/routes/clients.routes.ts`
- `shared/src/timetracking.ts` (`TimeEntry`, `CardTimeTotal`)
- `shared/src/hourtype.ts` (`HourType`)
- `shared/src/client.ts` (`Client`), `shared/src/kanban.ts` (`clientId` sur le board)
- `client/src/pages/TimeTrackingPage.tsx`, `client/src/pages/HourTypesPage.tsx`
- `server/src/routes/index.ts` (montage des modules `temps`, `clients`)
