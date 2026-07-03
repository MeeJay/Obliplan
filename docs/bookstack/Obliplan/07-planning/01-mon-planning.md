L'écran **Ma semaine** (`/mon-planning`) est la vue personnelle du salarié sur son planning. Elle est accessible à **tout utilisateur authentifié** du tenant, sans capacité particulière : chacun y consulte *son* planning, ses compteurs et ses alertes de conformité, en **lecture seule**.

## Accès et navigation

| Élément | Valeur |
|---|---|
| Route front | `/mon-planning` (composant `MyWeekPage`) |
| Endpoint | `GET /planning/me/month?month=YYYY-MM` |
| Service serveur | `planningService.getUserMonth` → `getUserWeek` par semaine |
| Capacité requise | aucune (route protégée par la simple authentification) |

La page se navigue **par mois**. Les flèches gauche/droite changent de mois, le bouton « Ce mois » revient au mois courant, et le libellé central affiche le mois sélectionné. Le serveur découpe le mois en **semaines du lundi au dimanche** (toute semaine qui recoupe le mois), et l'écran empile **une carte par semaine**.

> Un endpoint `GET /planning/me?week=YYYY-MM-DD` existe aussi pour une semaine isolée, mais l'écran Ma semaine consomme la variante mensuelle.

## La barre de compteurs

En haut de l'écran, la barre de compteurs (`CounterBar`) agrège les **totaux du mois affiché** et rappelle le **solde de récupération** courant. Elle comporte sept cases :

| Case | Contenu | Source (`WeeklyCounter`) |
|---|---|---|
| Réalisé | Heures effectivement travaillées | `realiseMin` |
| Attendu | Heures attendues au contrat | `attenduMin` |
| Écart | Réalisé − Attendu (vert si ≥ 0, rouge sinon) | `ecartMin` |
| Heures sup | Heures supplémentaires | `heuresSupMin` |
| Astreinte | Temps d'astreinte + nombre de déclenchements | `astreinteMin` · `astreinteDeclenchements` |
| Récup éligible | Dépassement éligible à la récupération | `recupEligibleMin` |
| Solde récup | Solde de récupération courant | `recupSoldeMin` |

Le détail de ces règles est décrit dans « Compteurs & règles de calcul ».

Chaque **carte de semaine** répète, dans son en-tête, une version compacte : la plage de dates (lundi → dimanche), le rapport `réalisé / attendu`, l'écart signé, et — seulement s'ils sont non nuls — un badge « sup » (heures supplémentaires) et un badge « récup » (récup éligible).

## Ce que voit l'employé (et ce qu'il ne peut pas modifier)

Le corps de chaque carte affiche les **drapeaux de conformité** de la semaine (`ComplianceFlags`) puis la grille des sept jours (`WeekTable`). Sur cet écran, la grille est rendue **sans les boutons d'ajout ni d'édition** : le salarié ne peut ni créer, ni modifier, ni supprimer un créneau. Toute modification passe par un manager disposant de la capacité `planning:write` (voir « Édition des shifts, modèles & validation »).

Pour chaque semaine, le service renvoie aussi, restreints au tenant et aux seuls créneaux de la semaine :

- les **projets** (`boards`) référencés par les créneaux, avec leur `id` et leur `name` uniquement ;
- les **types d'heures** (`hourTypes`) référencés, avec `id`, `libelle` et `color` (pour colorer chaque créneau travaillé) ;
- les **jours fériés** de la semaine (`holidays`, dates ISO).

> Confidentialité : un projet qu'aucun créneau de la semaine ne référence n'est jamais chargé, et seuls son identifiant et son nom sont exposés. Aucun autre salarié ni aucune donnée d'un autre tenant ne peut fuir par cette vue.

## Types de créneaux affichés

Un créneau porte un **type** (`ShiftType`) qui détermine son libellé et sa couleur (`SHIFT_META`) :

| Type | Libellé | Porte des heures ? |
|---|---|---|
| `travail` | Travail | oui |
| `astreinte` | Astreinte | oui |
| `pause` | Pause déj. | oui |
| `repos` | Repos | non |
| `recup` | Récup | non |
| `conge` | Congé | non |
| `absence` | Absence | non |
| `ecole` | École | non |

Seuls les types `travail`, `astreinte` et `pause` affichent une plage horaire (`TIMED_SHIFT_TYPES`). Un créneau au statut **brouillon** apparaît en pointillés, atténué, avec la mention « brouillon » : il n'est donc pas encore publié et ne compte pas dans le réalisé.

## Jours fériés

Un jour férié est un **marqueur visuel** : la date porte une pastille « Férié » (`HolidayPill`) dans l'en-tête du jour, mais les créneaux continuent de s'y afficher normalement. L'effet d'un férié sur les heures attendues est traité côté calcul (voir « Jours fériés, conformité & charge »).

## Drapeaux de conformité

Sous chaque semaine, un bandeau non bloquant signale les éventuelles alertes de temps de travail (chevauchement, repos insuffisant, dépassement journalier ou hebdomadaire). Le bandeau ne s'affiche que si la semaine comporte au moins une alerte. Le catalogue complet est décrit dans « Jours fériés, conformité & charge ».

## Références

- `client/src/pages/MyWeekPage.tsx`
- `client/src/components/planning/CounterBar.tsx`
- `client/src/components/planning/WeekTable.tsx`
- `client/src/components/planning/ComplianceFlags.tsx`
- `client/src/components/planning/shiftMeta.ts`
- `server/src/services/planning.service.ts` (`getUserWeek`, `getUserMonth`)
- `server/src/controllers/planning.controller.ts` (`me`, `meMonth`)
- `shared/src/types.ts` (`Shift`, `ShiftType`, `WeeklyCounter`)
