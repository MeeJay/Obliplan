Un même tableau peut s'afficher sous plusieurs vues, chacune adaptée à un usage : le tableau Kanban pour le flux, la liste pour la lecture rapide, la table pour le tri, la timeline pour la planification. Cette page décrit ces vues, la bascule entre elles et les métadonnées de carte partagées.

## Bascule entre les vues

Sur `/projets`, un sélecteur de vues (`ProjectsPage`) commute l'affichage du tableau sélectionné. Le type interne `ProjectView` propose cinq entrées :

| Vue | Composant | Objet |
| --- | --- | --- |
| Board | `BoardView` | Tableau Kanban (colonnes + glisser-déposer) |
| Liste | `ListView` | Cartes en lignes, groupées par colonne |
| Table | `TableView` | Tableau trié multi-colonnes |
| Timeline | `TimelineView` | Diagramme temporel (type Gantt) |
| Temps | `TimePanel` | Suivi du temps passé sur le projet |

> La vue « Temps » relève du suivi du temps (temps effectué par carte et par salarié) et non de la gestion des cartes ; elle est documentée avec le module Temps. Les quatre autres vues partagent le même éditeur `CardEditor`.

Un **filtre par assigné** (« Moi » / un salarié / « Tous »), résolu côté client, s'applique aux vues Board, Liste et Table. Il est masqué pour la Timeline (qui a son propre regroupement) et pour la vue Temps.

## Vue Board (BoardView)

Vue Kanban de référence : une colonne par `board_columns`, cartes empilées et triées par `position`. Elle offre le glisser-déposer (réordonnancement et déplacement inter-colonnes), le filtre par sprint (Tous / Backlog / un sprint), la limite WIP, les paramètres de colonne et la création de colonnes/sprints. Voir « Kanban/Scrum : tableaux, colonnes, WIP & sprints ».

Sur chaque carte, la vignette affiche : la pastille de priorité, le titre, l'avatar de l'assigné, le badge « Bloqué » (cible d'un lien `blocks`), le nombre de sous-tâches, le libellé de priorité, les points et l'échéance (mise en évidence si dépassée).

## Vue Liste (ListView)

Présente les colonnes comme des sections repliables ; chaque carte est une ligne compacte. La ligne montre : pastille de priorité, titre, libellé de priorité, échéance (mise en évidence si dépassée) et avatar de l'assigné. Le clic sur une ligne ouvre `CardEditor`. C'est la vue la plus dense pour parcourir rapidement un tableau. Elle applique le filtre par assigné mais n'offre pas le glisser-déposer.

## Vue Table (TableView)

Affiche les cartes dans un tableau triable. Colonnes disponibles :

| Colonne | Clé de tri |
| --- | --- |
| Titre | `title` |
| Assigné | `assignee` |
| Priorité | `priority` |
| Points | `points` |
| Échéance | `dueDate` |
| Sprint | `sprint` |
| Colonne | `column` |

Un clic sur un en-tête bascule le tri croissant/décroissant (`asc`/`desc`). La priorité est triée par rang (`low`=1, `medium`=2, `high`=3). En cas d'égalité, l'ordre de secours est la `position` de la carte, ce qui préserve l'ordre issu du glisser-déposer. Le clic sur une ligne ouvre `CardEditor`.

## Vue Timeline (TimelineView)

Diagramme temporel (type Gantt) qui place les cartes datées sur un axe de jours.

- **Regroupement** : « Par assigné » ou « Par colonne ».
- **Horizon** : 4, 8 ou 12 semaines ; navigation par période précédente/suivante et bouton « Aujourd'hui ».
- **Barre de carte** : couvre l'intervalle `[start_date, due_date]`. Une carte à date unique remplit les deux bornes ; des dates inversées sont permutées. Les cartes des colonnes `is_done` sont stylées « terminé ». La fenêtre initiale s'ancre sur la date de carte la plus ancienne.
- **Voie « Sans date »** : regroupe les cartes sans `start_date` ni `due_date`.

La Timeline est en **lecture seule** pour l'édition directe : elle ne réordonne pas les cartes, mais un clic sur une barre ouvre le `CardEditor` partagé (via `onOpenCard`, hébergé par `ProjectsPage`).

## Métadonnées de carte partagées (cardMeta)

Le module `cardMeta.ts` centralise les métadonnées d'affichage réutilisées par Board, Liste, Table et Timeline, garantissant une présentation cohérente :

| Export | Rôle |
| --- | --- |
| `PRIORITY_META` | Libellé + classes CSS par priorité (Basse / Moyenne / Haute) |
| `PRIORITIES` | Ordre des priorités : `['low', 'medium', 'high']` |
| `PRIORITY_DOT` | Couleur de la pastille pleine par priorité |
| `isOverdue(dueDate)` | Vrai si l'échéance est strictement antérieure au jour courant (ISO local) |

## Références

- `client/src/pages/ProjectsPage.tsx`
- `client/src/components/kanban/BoardView.tsx`
- `client/src/components/kanban/ListView.tsx`
- `client/src/components/kanban/TableView.tsx`
- `client/src/components/kanban/TimelineView.tsx`
- `client/src/components/kanban/cardMeta.ts`
- `shared/src/kanban.ts`
