Trois mécanismes transverses encadrent le planning : les **jours fériés** (qui allègent les heures attendues), les **drapeaux de conformité** (qui signalent un planning à risque sans le bloquer) et la vue **Charge** (qui compare travail assigné et capacité).

## Jours fériés

Les jours fériés vivent dans la table `public_holidays` (`holiday.service.ts`). Deux origines coexistent :

- le **jeu national FR** global, partagé par tous les tenants (`tenant_id` NULL) ;
- des **jours personnalisés** propres à un tenant.

| Champ (`PublicHoliday`) | Rôle |
| --- | --- |
| `tenantId` | `null` = jeu global national ; sinon tenant propriétaire |
| `date` | Date ISO `yyyy-mm-dd` |
| `label` | Libellé |
| `regionCode` | Portée régionale optionnelle (ex. Alsace-Moselle) ; `null` = national |

### Gestion

| Action | Endpoint | Capacité |
| --- | --- | --- |
| Lister (global ∪ tenant) | `GET /holidays` | tout utilisateur authentifié |
| Ajouter un férié tenant | `POST /holidays` | `planning:write` |
| Supprimer un férié tenant | `DELETE /holidays/:id` | `planning:write` |

`addCustom` **rejette** (409) une date déjà couverte par un férié global ou tenant. `deleteCustom` ne supprime **jamais** le jeu global (il est `tenant_id`-scopé).

### Effet sur le planning

- **Visuel** : un férié est un simple marqueur de journée (pastille `HolidayPill`) ; les créneaux restent affichés, ajoutables et modifiables ce jour-là.
- **Calcul** : un férié tombant sur un **jour travaillé** réduit les heures attendues de la semaine, à hauteur d'une journée travaillée (`feriesInWeek` + `attenduMinutes`). Un férié sur un jour structurellement non travaillé (pattern à 0) n'est pas décompté. Voir « Compteurs & règles de calcul ».

`getUserWeek` récupère l'ensemble des fériés de la semaine via `holidayService.getSet(tenantId, monday, monday+7)` et le passe au calcul.

## Drapeaux de conformité

`compliance.service.ts` calcule des **drapeaux non bloquants** de temps de travail pour la semaine d'un salarié (`computeFlags`), à partir des seuls créneaux — sans écriture ni changement de schéma. Ils sont affichés par `ComplianceFlags` (Ma semaine, Récap équipe) mais **n'empêchent aucune saisie**.

| Code (`ComplianceCode`) | Sévérité | Seuil | Déclencheur |
| --- | --- | --- | --- |
| `OVERLAP` | error | — | Deux créneaux se chevauchent le même jour |
| `MAX_DAY_10H` | error | 10 h/jour | Total **travaillé** d'une journée > 10 h |
| `MAX_WEEK_48H` | error | 48 h/semaine | Total **travaillé** de la semaine > 48 h |
| `REST_DAILY_11H` | error | 11 h | Repos entre deux jours consécutifs < 11 h |
| `REST_WEEKLY_35H` | warn | 35 h | Aucun repos hebdomadaire continu de 35 h détecté |

Points de calcul à retenir :

- les créneaux `pause`, `repos`, `conge` et `absence` sont **ignorés** (ni travail, ni occupation gênant le repos) ;
- seuls les créneaux `travail` comptent pour les **plafonds travaillés** (10 h/jour, 48 h/semaine) ; l'`astreinte`, elle, est une occupation prise en compte pour le calcul du **repos** (chevauchement, repos quotidien/hebdomadaire) mais pas dans les heures travaillées ;
- le repos hebdomadaire considère aussi le temps **avant** le premier créneau et **après** le dernier de la fenêtre Lun 00:00 → Dim 24:00, si bien qu'une semaine normale Lun–Ven avec week-end libre est conforme.

Chaque drapeau porte un message français et, le cas échéant, la date concernée.

## Charge / workload (`/charge`)

L'écran **Charge de l'équipe** (`/charge`, `WorkloadPage`) compare le **travail actif assigné** à la **capacité hebdomadaire** de chaque salarié. Il s'appuie sur `workload.service.ts`.

| Élément | Endpoint | Capacité |
| --- | --- | --- |
| Charge d'équipe | `GET /reports/workload` | `planning:read_team` |

Portée (`teamWorkload`) : un **admin** (ou platform admin) voit tout le tenant ; un **manager** voit ses subordonnés directs. Pour chaque membre :

| Grandeur (`WorkloadRow`) | Définition |
| --- | --- |
| `assignedMin` | Σ des `estimate_min` des cartes **assignées** au membre dans une colonne **non terminée**, restreint aux boards visibles par l'acteur |
| `capacityMin` | `base contrat − (jours ouvrés de congé validé cette semaine) × (base/5)`, borné à `≥ 0` (congés plafonnés à 5 jours) |
| `cardCount` | Nombre de cartes actives assignées |
| `overCount` | Cartes actives **sans estimation** (honnêteté de la barre) |

L'affichage calcule un ratio `assigné / capacité` : vert (ok), ambre (proche du plein, ≥ 0,9) puis rouge (au-delà de la capacité, ou du travail sans capacité). Les lignes sont triées du plus chargé au moins chargé.

> La capacité de la vue Charge se fonde uniquement sur `heuresHebdoBaseMin` et les congés validés de la semaine courante ; elle ne prend pas en compte le `workPattern` ni les jours fériés, contrairement à l'attendu du planning.

## Références

- `server/src/services/holiday.service.ts`, `shared/src/holiday.ts`
- `server/src/services/compliance.service.ts`, `shared/src/compliance.ts`
- `server/src/services/workload.service.ts`, `shared/src/kanban.ts` (`WorkloadRow`)
- `server/src/services/calc.service.ts` (`feriesInWeek`)
- `client/src/pages/WorkloadPage.tsx`
- `client/src/components/planning/ComplianceFlags.tsx`, `HolidayPill.tsx`
