L'écran **Ma semaine** (`/mon-planning`, composant `MyWeekPage`) est la vue personnelle du salarié sur son planning. Elle est accessible à **tout utilisateur authentifié** du tenant, sans capacité particulière : chacun y consulte *son* planning, ses compteurs et ses alertes de conformité, en **lecture seule**.

## Accès et navigation

| Élément | Valeur |
| --- | --- |
| Route client | `/mon-planning` |
| Composant | `MyWeekPage` (`client/src/pages/MyWeekPage.tsx`) |
| Endpoint | `GET /planning/me/month?month=YYYY-MM` (`planningApi.meMonth`) |
| Capacité requise | aucune (self-service) |

La page se pilote **au mois** : les flèches gauche/droite naviguent d'un mois à l'autre, et le bouton **Ce mois** revient au mois courant. Le serveur renvoie chaque semaine (lundi → dimanche) intersectant le mois via `planningService.getUserMonth`, qui appelle `getUserWeek` pour chaque lundi.

Chaque semaine est affichée dans une carte : en-tête avec les bornes de la semaine et un résumé chiffré, puis les éventuelles alertes de conformité et le détail des créneaux (`WeekTable`).

## La barre de compteurs

En tête de page, `CounterBar` agrège les totaux du mois (somme des compteurs hebdomadaires). Chaque en-tête de semaine reprend en plus le détail hebdomadaire.

| Compteur | Champ (`WeeklyCounter`) | Signification |
| --- | --- | --- |
| Réalisé | `realiseMin` | Σ des minutes travaillées des créneaux `travail` **validés** |
| Attendu | `attenduMin` | Heures dues de la semaine (base contrat, moins école/fériés/congés) |
| Écart | `ecartMin` | `réalisé − attendu` (peut être négatif) |
| Heures sup | `heuresSupMin` | Dépassement compté en heures sup + temps d'astreinte |
| Astreinte | `astreinteMin` · `astreinteDeclenchements` | Temps d'astreinte et nombre de déclenchements |
| Récup éligible | `recupEligibleMin` | Dépassement éligible à une récup (contrat sans heures sup) |
| Solde récup | `recupSoldeMin` (`UserWeek`) | Solde courant du compteur de récupération |

> L'écart est affiché en vert lorsqu'il est positif ou nul (`text-status-up`), en rouge sinon. Les badges « sup » et « récup » n'apparaissent que lorsque la valeur correspondante est strictement positive.

> Le **solde récup** n'appartient pas à `WeeklyCounter` : il provient de `UserWeek.recupSoldeMin`, passé à `CounterBar` via la prop `soldeMin`. Dans la barre mensuelle, il reprend le solde de la **première** semaine affichée (c'est un solde courant, pas une somme), alors que les autres compteurs (réalisé, attendu, heures sup, récup éligible, astreinte) sont bien la somme des semaines du mois.

Le détail du calcul de chaque grandeur est décrit dans « Compteurs & règles de calcul ».

## Ce que voit l'employé — et ce qu'il ne peut pas faire

`WeekTable` est rendu **sans** la propriété `editable` sur cette page : aucun bouton d'ajout, aucun clic d'édition, aucun glisser-déposer. Le salarié **ne peut pas** créer, modifier ni supprimer un créneau depuis Ma semaine ; toute écriture passe par un manager disposant de `planning:write` (voir « Édition des shifts, modèles & validation »).

Pour chaque semaine, le serveur expose :

- les **créneaux** de la semaine (`shifts`), tous statuts confondus (brouillon et validé), y compris le nom du **projet** (board) et le **type d'heure** rattachés — mais uniquement l'`id` + le nom du projet et l'`id` + libellé + couleur du type d'heure des créneaux réellement concernés ;
- les **jours fériés** de la semaine (`holidays`), simple marqueur visuel qui ne bloque pas les créneaux ;
- les **rendez-vous** réservés sur son agenda (`appointments`, statuts `confirmed`/`pending`), en lecture seule, avec le nom et l'e-mail du demandeur externe.

## Types de créneaux affichés

Les créneaux sont typés (`ShiftType`) et rendus avec un libellé et une couleur (`SHIFT_META`).

| Type | Libellé | Porté par des heures |
| --- | --- | --- |
| `travail` | Travail | oui |
| `astreinte` | Astreinte | oui |
| `pause` | Pause déj. | oui |
| `repos` | Repos | non |
| `recup` | Récup | non |
| `conge` | Congé | non |
| `absence` | Absence | non |
| `ecole` | École | non |

Seuls `travail`, `astreinte` et `pause` portent une plage horaire (`TIMED_SHIFT_TYPES`) ; les autres sont des marqueurs de journée.

## Jours fériés

Un jour férié de la semaine est signalé visuellement (pastille « Férié », composant `HolidayPill`). Il **n'empêche pas** l'existence d'un créneau ce jour-là, mais il **réduit** les heures attendues quand il tombe sur un jour normalement travaillé (voir « Jours fériés, conformité & charge »).

## Drapeaux de conformité

Sous l'en-tête de chaque semaine, `ComplianceFlags` affiche les alertes de temps de travail calculées par `compliance.service` (chevauchement, dépassement journalier/hebdomadaire, repos insuffisant). Ce sont des **signalements non bloquants** : ils informent mais n'empêchent aucune saisie. La liste des règles contrôlées figure dans « Jours fériés, conformité & charge ».

## Références

- `server/src/services/planning.service.ts` (`getUserWeek`, `getUserMonth`)
- `server/src/services/calc.service.ts` (`computeWeeklyCounter`)
- `server/src/routes/planning.routes.ts` (`GET /me`, `GET /me/month`)
- `client/src/pages/MyWeekPage.tsx`
- `client/src/components/planning/CounterBar.tsx`, `WeekTable.tsx`, `ComplianceFlags.tsx`, `shiftMeta.ts`
