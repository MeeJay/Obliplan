Le module **Congés** repose sur un catalogue de *types de congés* propre à chaque tenant (CP, RTT, maladie, sans solde…). Chaque type décrit un mode d'acquisition du solde et la façon dont il affecte le planning. Cette page décrit leur paramétrage et le calcul des soldes ; les demandes elles-mêmes sont traitées dans « Demandes, validation & demi-journées ».

> Le module doit être activé pour le tenant : toutes les routes `/leave` sont montées derrière `requireModule('conges')`. Sans ce module, les écrans et l'API de congés sont indisponibles.

## Qui configure les types de congés

La lecture du catalogue est ouverte à tous les utilisateurs du tenant (la liste alimente le formulaire de demande). La création, la modification et la suppression sont réservées à la capacité **`leave:types:manage`** (« Gérer les types de congés », groupe *Congés*).

Côté interface, la gestion s'effectue depuis l'écran `/conges` : le bloc **« Types de congés (admin) »** (composant `LeaveTypesManager`) ne s'affiche que si l'utilisateur possède `leave:types:manage`.

| Endpoint | Capacité requise | Rôle |
| --- | --- | --- |
| `GET /leave/types` | aucune (tenant) | Lister les types |
| `POST /leave/types` | `leave:types:manage` | Créer un type |
| `PUT /leave/types/:id` | `leave:types:manage` | Modifier un type |
| `DELETE /leave/types/:id` | `leave:types:manage` | Supprimer un type |

> La suppression échoue avec un code `409` si le type est référencé par des demandes (la clé étrangère `leave_type_id` est en `ON DELETE RESTRICT`). Le message renvoyé est « Suppression impossible (type utilisé par des demandes ?) ».

## Attributs d'un type de congé

La table `leave_types` est créée par la migration `018_create_leave_types.ts` ; la migration `050_leave_type_accrual.ts` ajoute les trois colonnes d'acquisition (`accrual_mode`, `accrual_rate_per_month`, `period_start_month`).

| Colonne (BDD) | Champ (API/TS) | Type | Défaut | Description |
| --- | --- | --- | --- | --- |
| `id` | `id` | serial | — | Identifiant |
| `tenant_id` | `tenantId` | int | — | Tenant propriétaire |
| `libelle` | `libelle` | varchar(120) | — | Libellé affiché (ex. « Congés payés ») |
| `code` | `code` | varchar(16) | — | Code court (ex. `CP`, `RTT`, `MAL`) ; mis en majuscules à la création via l'interface |
| `color` | `color` | varchar(9), nullable | `null` | Couleur hexadécimale `#rrggbb` (pastille, calendrier) |
| `paid` | `paid` | bool | `true` | Congé payé (indicatif) |
| `reduces_attendu` | `reducesAttendu` | bool | `true` | Si vrai, un congé validé sur ce type réduit les heures attendues de la semaine |
| `requires_justification` | `requiresJustification` | bool | `false` | Justificatif requis (ex. arrêt maladie) |
| `allowance_days` | `allowanceDays` | decimal(5,1), nullable | `null` | Droit annuel en jours ; `null` = pas de suivi de solde (maladie, sans solde…) |
| `accrual_mode` | `accrualMode` | varchar(16) | `fixed_annual` | Mode d'acquisition : `fixed_annual` ou `monthly` |
| `accrual_rate_per_month` | `accrualRatePerMonth` | decimal(5,2), nullable | `null` | Taux mensuel en jours (ex. `2.50` pour les CP) ; utilisé uniquement en mode `monthly` |
| `period_start_month` | `periodStartMonth` | int | `1` | Mois d'ancrage de la période d'acquisition (1–12, ex. 6 = juin) |
| `is_active` | `isActive` | bool | `true` | Type actif |
| `position` | `position` | int | `0` | Ordre d'affichage (tri par `position` puis `libelle`) |
| `created_at` / `updated_at` | `createdAt` / `updatedAt` | timestamps | — | Horodatage |

Le schéma de validation (Zod) borne les valeurs à la création et à la modification :

```ts
// server/src/validators/schemas.ts
createLeaveTypeSchema = z.object({
  libelle: z.string().min(1).max(120),
  code: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  paid: z.boolean().optional(),
  reducesAttendu: z.boolean().optional(),
  requiresJustification: z.boolean().optional(),
  allowanceDays: z.number().min(0).max(366).nullable().optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  accrualMode: z.enum(['fixed_annual', 'monthly']).optional(),
  accrualRatePerMonth: z.number().min(0).max(31).nullable().optional(),
  periodStartMonth: z.number().int().min(1).max(12).optional(),
});
// updateLeaveTypeSchema = createLeaveTypeSchema.partial()
```

> Le formulaire d'administration `LeaveTypesManager` ne saisit qu'une partie de ces attributs : *libellé*, *code*, *mode d'acquisition*, *jours/an* ou *jours/mois*, *mois de début de période*, *couleur* et *réduit l'attendu*. Il envoie aussi `paid` figé à `true` (aucun contrôle dédié dans l'écran). Les champs `requiresJustification`, `isActive` et `position` ne sont pas transmis lors d'une création via cet écran et prennent les valeurs par défaut de l'API (`false`, `true`, `0`).

## Acquisition & accrual (migration 050)

Un type peut octroyer son solde de deux manières, définies par `accrual_mode` :

- **`fixed_annual`** (comportement historique) : la totalité de `allowance_days` est disponible pour la période. Si `allowance_days` est `null`, le type n'est pas suivi en solde (cas typique de la maladie ou du sans solde).
- **`monthly`** : les jours s'acquièrent au rythme de `accrual_rate_per_month` par mois écoulé de la **période d'acquisition** (ex. CP à 2,5 j/mois).

La période d'acquisition est ancrée sur `period_start_month`. Les soldes sont **calculés à la volée** : la migration 050 ne crée aucune table ni tâche planifiée (« no new tables, no cron »).

### Calcul du solde (`balancesForUser`)

Pour chaque type, `leaveRequestService.balancesForUser` calcule la période active `[periodStart, periodEnd)` : `periodStart` est le 1er du mois `period_start_month` le plus récent à la date du jour (année en cours si le mois courant ≥ `period_start_month`, sinon année précédente) ; `periodEnd` = `periodStart + 12 mois`.

| Grandeur | Champ TS | Calcul |
| --- | --- | --- |
| Acquis | `acquiredDays` | Mode `monthly` : `min(12, moisÉcoulés) × taux`, arrondi à 0,1 j. Mode `fixed_annual` : `allowanceDays`. `null` si non suivi |
| Consommé | `consumedDays` | Σ des `days` des demandes **validées** dont la `start_date` tombe dans la période |
| En attente | `pendingDays` | Σ des `days` des demandes **en attente** dont la `start_date` tombe dans la période |
| Restant | `remainingDays` | `acquis − consommé`, arrondi à 0,1 j (`null` si non suivi) |
| Libellé de période | `periodLabel` | `« 2026 »` si ancrage en janvier, sinon `« 2026/2027 »` |

> Le décompte des mois inclut le mois d'ancrage lui-même (qui crédite déjà un taux) et est plafonné à 12 mois : un type à 2,5 j/mois atteint donc 30 jours sur une période complète.

> Limitations connues du calcul actuel : l'acquisition démarre à `periodStart` **sans proratisation par date d'embauche**, et le **report N-1** (reliquat de la période précédente) n'est pas encore géré.

Les soldes sont exposés par `GET /leave/requests/balances` (voir « Demandes, validation & demi-journées ») et affichés sous forme de cartes en haut de l'écran `/conges`. Une carte d'un type non suivi (`acquiredDays === null`) n'affiche que le nombre de jours pris.

## Références

- `server/src/services/leaveType.service.ts`
- `server/src/controllers/leaveType.controller.ts`
- `server/src/routes/leave.routes.ts`
- `server/src/db/migrations/018_create_leave_types.ts`
- `server/src/db/migrations/050_leave_type_accrual.ts`
- `server/src/services/leaveRequest.service.ts` (méthode `balancesForUser`)
- `server/src/validators/schemas.ts` (`createLeaveTypeSchema`)
- `shared/src/leave.ts` (`LeaveType`, `LeaveBalance`)
- `client/src/pages/CongesPage.tsx` (composant `LeaveTypesManager`)
