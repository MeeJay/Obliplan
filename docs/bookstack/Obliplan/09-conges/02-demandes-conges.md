Une *demande de congé* (`leave_requests`) rattache un utilisateur à un type de congé sur une plage de dates, avec une précision à la demi-journée, et suit un workflow de validation par le manager. Cette page décrit le cycle de vie, le calcul des jours, les demi-journées, la décision, l'effet sur le planning et les notifications. Le paramétrage des types est traité dans « Types de congés & acquisition ».

## Structure d'une demande

La table `leave_requests` est créée par la migration `019_create_leave_requests.ts` ; la migration `038_leave_half_periods.ts` ajoute les colonnes de demi-journée `start_period` et `end_period`.

| Colonne (BDD) | Champ (API/TS) | Type | Description |
| --- | --- | --- | --- |
| `id` | `id` | serial | Identifiant |
| `tenant_id` | `tenantId` | int | Tenant |
| `user_id` | `userId` | int | Demandeur |
| `leave_type_id` | `leaveTypeId` | int | Type de congé (`ON DELETE RESTRICT`) |
| `start_date` | `startDate` | date | Date de début (ISO `yyyy-mm-dd`) |
| `end_date` | `endDate` | date | Date de fin |
| `half_day` | `halfDay` | bool | Indicateur demi-journée hérité (compatibilité) |
| `start_period` | `startPeriod` | varchar(4) | `full` / `am` / `pm` (défaut `full`) |
| `end_period` | `endPeriod` | varchar(4) | `full` / `am` / `pm` (défaut `full`) |
| `days` | `days` | decimal(5,1) | Nombre de jours calculé |
| `motif` | `motif` | text, nullable | Motif de la demande |
| `status` | `status` | varchar(16) | Statut (voir ci-dessous, défaut `en_attente`) |
| `decided_by` | `decidedBy` | int, nullable | Décideur (`ON DELETE SET NULL`) |
| `decided_at` | `decidedAt` | timestamp, nullable | Date de décision |
| `decision_comment` | `decisionComment` | text, nullable | Commentaire / motif de refus |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | timestamps | Horodatage |

## Cycle de vie (statuts)

Le type `LeaveStatus` définit cinq statuts, garantis par une contrainte `CHECK` en base :

```ts
// shared/src/leave.ts
type LeaveStatus = 'brouillon' | 'en_attente' | 'valide' | 'refuse' | 'annule';
```

| Statut | Libellé (UI) | Transition |
| --- | --- | --- |
| `brouillon` | Brouillon | Défini dans le modèle, non produit par le flux actuel |
| `en_attente` | En attente | État initial à la création |
| `valide` | Validé | Décision `valide` du manager |
| `refuse` | Refusé | Décision `refuse` du manager |
| `annule` | Annulé | Annulation par le propriétaire ou le manager |

À la création, `leaveRequestService.create` force toujours `status = 'en_attente'`. La validation ou le refus se fait via `decide` ; l'annulation via `cancel`.

> Le statut `brouillon` existe dans l'énumération et la contrainte `CHECK`, mais le parcours actuel crée directement une demande `en_attente` (aucun enregistrement de brouillon n'est produit par l'API).

## Calcul des jours & demi-journées (migration 038)

Le nombre de jours (`days`) est calculé par `computeLeaveDays` à partir de la plage et des périodes de début/fin :

- Un jour est compté s'il s'agit d'un jour de semaine **effectivement travaillé** : les week-ends, les jours fériés du tenant et les jours hors *rythme de travail* du contrat (ex. le jour non travaillé d'un 80 %) comptent 0.
- Les jours travaillés sont dérivés du `workPattern` du contrat de l'utilisateur (`workingDaysFromPattern`) ; à défaut de contrat/motif, la semaine standard lundi–vendredi s'applique.
- **Demi-journées** : une demande d'un seul jour avec une période `am` ou `pm` compte 0,5 jour. Sur une plage de plusieurs jours, le total perd 0,5 quand elle **commence l'après-midi** (`startPeriod = 'pm'`) et 0,5 quand elle **finit le matin** (`endPeriod = 'am'`).

```ts
// server/src/services/leaveRequest.service.ts (extrait de logique)
if (startDate === endDate) {
  // jour non travaillé/férié → 0 ; sinon 0.5 si une période am/pm, 1 sinon
}
if (startPeriod === 'pm' && jour travaillé) days -= 0.5;
if (endPeriod   === 'am' && jour travaillé) days -= 0.5;
```

L'indicateur hérité `half_day` est maintenu synchronisé : il vaut `true` pour une demande d'un seul jour en `am`/`pm`.

## Écran /conges (CongesPage)

L'écran `/conges` regroupe, pour tout utilisateur :

- **Soldes** : cartes par type (restant, acquis, pris, en attente, libellé de période) — voir « Types de congés & acquisition ».
- **Nouvelle demande** : formulaire *Type*, *Du*, *Période* (ou *Début* sur une plage), *Au*, *Fin*, *Motif (optionnel)*. Sur un seul jour, la période de fin reprend celle de début. Les périodes proposées sont *Journée* (`full`), *Matin* (`am`), *Après-midi* (`pm`).
- **Mes demandes** : liste des demandes de l'utilisateur avec badge de statut. Une demande `en_attente` ou `valide` peut être annulée (icône corbeille). Le motif de refus est affiché sous une demande `refuse`.

Les blocs réservés aux valideurs (`leave:validate`) :

- **À valider (n)** : demandes en attente de l'équipe, avec bouton *Valider* et *Refuser*. Le refus impose la saisie d'un **motif obligatoire** avant confirmation.
- **Calendrier d'équipe** : voir « Calendrier des congés ».

## Workflow de validation / refus

| Endpoint | Capacité / contrôle d'accès | Effet |
| --- | --- | --- |
| `GET /leave/requests` | Soi-même, ou manager/admin sur la cible (`canManage`) | Lister les demandes d'un utilisateur |
| `GET /leave/requests/balances` | Idem `GET /requests` | Soldes par type |
| `GET /leave/requests/pending` | `leave:validate` | Demandes en attente de l'équipe |
| `POST /leave/requests` | Soi-même, ou manager/admin pour un rapporté | Créer une demande (→ `en_attente`) |
| `PATCH /leave/requests/:id/decision` | `leave:validate` **et** `canManage` sur le demandeur | Valider / refuser |
| `PATCH /leave/requests/:id/cancel` | Propriétaire ou manager | Annuler (→ `annule`) |

Portée des listes de validation : un manager ne voit que ses **rapportés** (via `manager_id`) ; un administrateur ou un *platform admin* voit **tout le tenant** (`managerId = null`).

Le corps de la décision est validé par `decideLeaveRequestSchema` : `decision` ∈ `{ 'valide', 'refuse' }`, `comment` optionnel (max 2000 caractères). La création est validée par `createLeaveRequestSchema`, qui exige notamment `endDate >= startDate`.

> Le contrôleur de décision vérifie `canManage(actor, demandeur)` : « Seul le manager peut valider une demande ». La décision est aussi tracée dans le journal d'audit (`auditService.record`, action `leave.decide`).

## Effet sur le planning

Une demande **validée** (`status = 'valide'`) portée par un type dont `reducesAttendu = true` réduit les **heures attendues** de la semaine :

- Dans `planning.service.ts`, les jours de congé validés tombant sur des jours réellement travaillés (jour de semaine, hors férié, dans le rythme du contrat) sont comptés (demi-journées incluses) et injectés dans le compteur hebdomadaire (`computeWeeklyCounter`), exposé via le champ `congeJours`.
- Dans `workload.service.ts`, la **capacité** hebdomadaire est réduite par les congés validés, mais selon un calcul distinct : il compte les jours ouvrés *lundi–vendredi* de la plage (plafonnés à 5 par semaine), **sans filtrer sur `reducesAttendu`** ni tenir compte du rythme de travail, des jours fériés ou des demi-journées, puis retranche `base/5` d'heures par jour.
- Dans `reporting.service.ts`, ils réduisent l'attendu sur la période du rapport.

Seules les demandes validées sont prises en compte (`getApprovedOverlapping` filtre sur `status = 'valide'`). Les demandes `en_attente` n'affectent pas encore le calcul.

> À distinguer des **types de créneaux** `conge` et `absence` de l'énumération `ShiftType` (`shared/src/types.ts`) : ce sont des créneaux de planning « journée entière » sans horaire, ignorés par le moteur de conformité (`compliance.service.ts`). Une demande de congé validée agit sur le planning par la **réduction de l'attendu** décrite ci-dessus, elle ne génère pas automatiquement de créneau de ce type.

## Notifications associées

Les notifications sont émises en « best-effort » (elles ne bloquent jamais la réponse HTTP) par le service `notify`, qui crée une notification in-app, envoie un e-mail aux destinataires disposant d'une adresse, et pousse une notification web (si configuré).

| Événement | `type` | Destinataire | Titre | Lien |
| --- | --- | --- | --- | --- |
| Création d'une demande | `leave.submitted` | Manager du demandeur | « Nouvelle demande de congé » | `/conges` |
| Décision (validation) | `leave.decided` | Demandeur | « Demande de congé validée » | `/conges` |
| Décision (refus) | `leave.decided` | Demandeur | « Demande de congé refusée » (avec le motif du refus) | `/conges` |

> La notification de création n'est envoyée que si le demandeur a un manager et que celui-ci n'est pas l'auteur de l'action. La notification de décision n'est pas envoyée si le décideur est aussi le demandeur.

## Références

- `server/src/services/leaveRequest.service.ts`
- `server/src/controllers/leaveRequest.controller.ts`
- `server/src/routes/leave.routes.ts`
- `server/src/db/migrations/019_create_leave_requests.ts`
- `server/src/db/migrations/038_leave_half_periods.ts`
- `server/src/validators/schemas.ts` (`createLeaveRequestSchema`, `decideLeaveRequestSchema`)
- `shared/src/leave.ts` (`LeaveRequest`, `LeaveStatus`, `LeavePeriod`)
- `client/src/pages/CongesPage.tsx`
- `server/src/services/planning.service.ts`, `server/src/services/workload.service.ts`, `server/src/services/reporting.service.ts`
- `server/src/services/notify.ts`
