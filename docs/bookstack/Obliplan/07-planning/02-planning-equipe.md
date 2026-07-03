Un manager dispose de trois angles de lecture sur le planning de son équipe, plus une vue « qui travaille quand » ouverte à un public plus large. Ces écrans partagent la même donnée hebdomadaire (`getUserWeek` par salarié) mais diffèrent par le niveau de détail exposé et la capacité requise pour y accéder.

## Les quatre vues et leurs capacités

| Vue | Route | Composant | Capacité requise |
|---|---|---|---|
| Tableau planning (grille horaire) | `/planning-equipe` | `PlanningBoardPage` | `planning:read_team` |
| Récap équipe (une ligne par salarié) | `/equipe` | `TeamPage` | `planning:read_team` |
| Charge | `/charge` | `WorkloadPage` | `planning:read_team` |
| Vue équipe (lecture seule) | `/vue-equipe` | `TeamOverviewPage` | `planning:view_team` |

Les trois premières partagent une sous-navigation par onglets (`PlanningTabs` : Grille, Récap, Charge). La vue équipe en lecture seule est distincte et volontairement plus ouverte.

> Portée des lignes : `getTeamWeek` distingue le rôle. Un **admin** voit l'ensemble du tenant ; un **manager** ne voit que ses subordonnés directs (`userService.getTeam`). La capacité `planning:read_team` autorise l'accès à la vue ; le périmètre des salariés listés dépend du rôle.

## Récap équipe — `/equipe` (`TeamPage`)

Endpoint : `GET /planning/team?week=YYYY-MM-DD`. Chaque salarié occupe **une ligne** (une carte). L'en-tête affiche la pastille et le libellé de son contrat, puis ses compteurs de la semaine : `réalisé / attendu`, l'écart signé, les badges « sup » et « récup » s'ils sont non nuls, et le **solde de récupération** (`recupSoldeMin`). Le corps affiche les drapeaux de conformité (`ComplianceFlags`) et la grille des sept jours (`WeekTable`).

- Si l'utilisateur détient `planning:write`, la grille devient **éditable** (bouton d'ajout par jour, clic pour éditer, ouverture de `ShiftEditor`), le gestionnaire de **modèles** (`ShiftTemplatesManager`) s'affiche, et le bouton « Dupliquer la semaine préc. » clone la semaine précédente en brouillons.
- Sans `planning:write`, la vue reste en lecture.

## Vue équipe — `/vue-equipe` (`TeamOverviewPage`)

Endpoint : `GET /planning/team-overview?week=YYYY-MM-DD` (`getTeamOverview`). C'est une projection **« qui travaille quand »** de **tous les salariés actifs** du tenant, sous forme de tableau (colonne « Salarié » + sept jours). Elle est délibérément **non interactive** : pas d'ajout, pas de glisser-déposer, pas de clic pour éditer.

Confidentialité forte, appliquée côté serveur :

- seuls les créneaux **validés** (`statut = 'valide'`) sont renvoyés — les brouillons ne sont jamais interrogés ;
- la **note** libre de chaque créneau est retirée (`note: null`) ;
- **aucun compteur**, aucun écart, aucun drapeau de conformité n'est exposé — uniquement les horaires, le type et le type d'heure.

Les jours fériés de la semaine sont fournis au niveau du tenant, comme marqueur visuel.

## Tableau planning — `/planning-equipe` (`PlanningBoardPage`)

Écran de travail du planning. Il propose deux modes d'affichage :

- **Grille horaire** (`HourGrid`) : chaque créneau se dessine sur une trame d'heures paramétrable (plage `Heures` début → fin, mémorisée). Portée « Semaine » ou « Mois » (4 semaines empilées).
- **Semaine** (`RotaGrid`) : une case par jour et par salarié, avec glisser-déposer de créneaux et de modèles.

Les actions d'écriture (dessin, création, déplacement, redimensionnement, publication, duplication, import, copier/coller, sélection multiple, suppression) ne sont proposées que si l'utilisateur possède `planning:write` (`canWrite`). Un lecteur `planning:read_team` sans `planning:write` consulte la grille sans pouvoir la modifier. La **publication** d'une semaine et l'**import CSV** sont détaillés respectivement dans « Édition des shifts, modèles & validation » et « Import de planning, vues & calendrier ICS ».

## Filtrer par équipe

Les trois écrans (`TeamPage`, `TeamOverviewPage`, `PlanningBoardPage`) partagent le filtre `PlanningTeamFilter`, qui masque/affiche les lignes par **équipe Axis-C** (`user_teams`). La sélection est mémorisée dans le navigateur (clé `localStorage` `obliplan.planning.visibleTeams`). La visibilité est en **OU** : un salarié appartenant à au moins une équipe visible reste affiché (une seule ligne par salarié, jamais dupliquée). Une sélection vide signifie « toutes les équipes ». Les identifiants d'équipe de chaque salarié proviennent de `teamIdsByUser` (champ `teamIds`). Les presets nommés de ce filtre sont décrits dans « Import de planning, vues & calendrier ICS ».

## Lire les shifts et compteurs de chaque salarié

`getTeamWeek` renvoie, pour chaque salarié, le même objet `UserWeek` que la vue personnelle : `shifts`, `counter` (compteur hebdomadaire complet), `recupSoldeMin`, `flags`, `boards`, `hourTypes`, `holidays` et `teamIds`. Le récap (`/equipe`) et la grille (`/planning-equipe`) exploitent ces compteurs ; la vue lecture seule (`/vue-equipe`), non.

## Références

- `client/src/pages/TeamPage.tsx`
- `client/src/pages/TeamOverviewPage.tsx`
- `client/src/pages/PlanningBoardPage.tsx`
- `client/src/components/planning/PlanningTabs.tsx`
- `client/src/components/planning/PlanningTeamFilter.tsx`
- `server/src/services/planning.service.ts` (`getTeamWeek`, `getTeamOverview`, `teamIdsByUser`)
- `server/src/controllers/planning.controller.ts` (`team`, `teamOverview`)
- `server/src/routes/planning.routes.ts`
- `shared/src/permissions.ts`, `shared/src/types.ts` (`TeamOverviewDTO`)
