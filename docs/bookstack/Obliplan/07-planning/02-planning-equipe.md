Un manager dispose de plusieurs angles de lecture sur le planning de son équipe, plus une vue « qui travaille quand » ouverte à un public plus large. Ces écrans partagent la même donnée hebdomadaire (`getUserWeek` par salarié) mais diffèrent par le niveau de détail exposé et la capacité requise.

## Les vues et leurs capacités

| Vue | Route | Composant | Capacité requise |
| --- | --- | --- | --- |
| Récap équipe (une ligne par salarié) | `/equipe` | `TeamPage` | `planning:read_team` |
| Tableau planning (grille horaire / rota) | `/planning-equipe` | `PlanningBoardPage` | `planning:read_team` |
| Vue d'ensemble (lecture seule) | `/vue-equipe` | `TeamOverviewPage` | `planning:view_team` |

Les onglets `PlanningTabs` relient la **Grille** (`/planning-equipe`), le **Récap** (`/equipe`) et la **Charge** (`/charge`). La navigation latérale expose « Planning équipe » sous la capacité `planning:read_team`.

> `planning:read_team` donne accès aux compteurs, écarts et drapeaux de conformité de chaque salarié. `planning:view_team` n'ouvre que la vue d'ensemble anonymisée (créneaux validés, sans compteur ni note). Cette dernière est semée par défaut à l'administrateur, au manager **et** au salarié.

## Portée des données (manager vs admin)

Le service `getTeamWeek` sélectionne les membres selon le rôle : un **admin** voit tout le tenant (`getByTenant`), un **manager** voit ses subordonnés directs (`getTeam`). Chaque salarié produit **une seule ligne** par employé (jamais dupliquée par équipe), enrichie des `teamIds` (équipes Axis-C `user_teams`) pour permettre le filtrage.

## Récap équipe (`/equipe`, `TeamPage`)

Endpoint : `GET /planning/team?monday=YYYY-MM-DD` (`planningApi.team`). Une carte par salarié, avec :

- le **contrat** (pastille de couleur + libellé) ;
- le résumé chiffré : `réalisé / attendu`, écart, badges « sup » et « récup », et le **solde récup** (`recupSoldeMin`) ;
- les **drapeaux de conformité** (`ComplianceFlags`) ;
- la table hebdomadaire (`WeekTable`) rendue en mode `editable` si l'utilisateur possède `planning:write`.

Le bouton **Dupliquer la semaine précédente** (visible avec `planning:write`) clone les créneaux de la semaine `-7 jours` en brouillon, pour les seuls salariés actuellement visibles (`planningApi.copyWeek`). Le gestionnaire de **modèles de créneaux** (`ShiftTemplatesManager`) n'apparaît qu'avec `planning:write`.

## Tableau planning (`/planning-equipe`, `PlanningBoardPage`)

Même endpoint `GET /planning/team`. Deux modes d'affichage :

- **Grille horaire** (`HourGrid`) : chaque salarié en ligne, une trame horaire configurable (bornes `Heures` début → fin, mémorisées en `localStorage`). Portée **Semaine** ou **Mois** (4 semaines empilées, chargées via 4 appels `planningApi.team`).
- **Semaine** (`RotaGrid`) : grille jour × salarié, glisser-déposer d'un créneau ou d'un **modèle**.

Actions réservées à `planning:write` : dessin d'un créneau (`shiftApi.create`, type `travail`, statut `brouillon`), redimensionnement/déplacement (`shiftApi.update`), copier/coller d'une journée ou d'une sélection (`planningApi.cloneShifts`), suppression multiple, **duplication** de la semaine précédente, **import CSV** (bouton vers `/import-planning`) et **publication**.

La **publication** (`planningApi.publish`, `POST /planning/publish`) bascule tous les brouillons des semaines et salariés visibles en `valide` et notifie chaque salarié concerné. Le bouton affiche le nombre de brouillons en attente (`Publier (N)`).

## Vue d'ensemble (`/vue-equipe`, `TeamOverviewPage`)

Endpoint : `GET /planning/team-overview?monday=YYYY-MM-DD` (`planningApi.teamOverview`), capacité `planning:view_team`. Vue **délibérément non interactive** : ni ajout, ni glisser, ni clic d'édition.

Confidentialité (imposée côté serveur par `getTeamOverview`) :

- seuls les créneaux **validés** (`statut='valide'`) sont exposés — les brouillons ne sont jamais requêtés ;
- la **note** en texte libre est retirée de chaque créneau ;
- **aucun** compteur, écart ni drapeau de conformité n'est exposé — uniquement l'horaire + le type + le type d'heure ;
- les rendez-vous apparaissent **anonymisés** (bloc « Rendez-vous » sans nom ni e-mail).

Les membres sont triés par nom d'affichage (`displayName ?? username`).

## Filtrer par équipe

Toutes ces vues partagent le composant `PlanningTeamFilter` : des puces d'équipes (Axis-C `user_teams`) permettent de restreindre l'affichage. Le filtre est en **OU** (une ligne reste visible si elle appartient à au moins une équipe cochée) et n'entraîne jamais de duplication de ligne. La sélection est persistée en `localStorage` (clé `obliplan.planning.visibleTeams`) ; un id d'équipe absent de la vue courante est ignoré pour ne pas vider la liste. Les **vues** enregistrées (presets d'équipes) sont décrites dans « Import de planning, vues & calendrier ICS ».

## Références

- `server/src/services/planning.service.ts` (`getTeamWeek`, `getTeamOverview`, `teamIdsByUser`, `publishWeek`, `copyWeek`, `cloneShifts`)
- `server/src/routes/planning.routes.ts`
- `client/src/pages/TeamPage.tsx`, `PlanningBoardPage.tsx`, `TeamOverviewPage.tsx`
- `client/src/components/planning/PlanningTabs.tsx`, `PlanningTeamFilter.tsx`, `HourGrid.tsx`, `RotaGrid.tsx`
