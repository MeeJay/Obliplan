La gestion des congés repose sur deux tables : `leave_types` (types paramétrables avec logique d'acquisition) et `leave_requests` (demandes avec workflow de validation et précision à la demi-journée).

## `leave_types`

Type de congé/absence paramétrable par tenant (CP, RTT, maladie, sans solde…). Porte la logique d'acquisition du solde.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `libelle` | varchar(120) | Libellé. |
| `code` | varchar(16) | Code court (ex. `CP`, `RTT`, `MAL`). |
| `color` | varchar(9), nullable | Couleur (hex). |
| `paid` | bool, défaut `true` | Congé payé (informatif). |
| `reduces_attendu` | bool, défaut `true` | Si `true`, un congé validé sur un jour travaillé réduit l'attendu. |
| `requires_justification` | bool, défaut `false` | Nécessite un justificatif (ex. arrêt maladie). |
| `allowance_days` | decimal(5,1), nullable | Droit annuel en jours ; `NULL` = pas de suivi de solde. |
| `accrual_mode` | varchar(16), défaut `fixed_annual` | Mode d'acquisition (voir enum). |
| `accrual_rate_per_month` | decimal(5,2), nullable | Taux mensuel en jours (ex. `2.50` pour les CP) ; utilisé si `monthly`. |
| `period_start_month` | int, défaut `1` | Mois d'ancrage de la période d'acquisition (1–12, ex. 6 = juin). |
| `is_active` | bool, défaut `true` | Type actif. |
| `position` | int, défaut `0` | Ordre d'affichage. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `018_create_leave_types.ts`, puis `050` (`accrual_mode`, `accrual_rate_per_month`, `period_start_month`).

### Enum `accrual_mode` (contrainte `leave_types_accrual_mode_chk`)

| Valeur | Acquisition du solde |
|--------|----------------------|
| `fixed_annual` | La totalité de `allowance_days` est disponible pour la période (comportement historique). |
| `monthly` | Le solde s'acquiert au rythme de `accrual_rate_per_month` par mois de la période. |

> **Note** — Les soldes (acquis, consommé, en attente, restant) sont **calculés à la volée** : aucune table de solde, aucun cron. Le type partagé `LeaveBalance` décrit cette projection dérivée.

## `leave_requests`

Demande de congé avec workflow de validation. La précision à la demi-journée s'exprime via `start_period` / `end_period`.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Demandeur. |
| `leave_type_id` | int FK → `leave_types` (**RESTRICT**) | Type de congé. |
| `start_date` | date | Début de la demande. |
| `end_date` | date | Fin de la demande. |
| `half_day` | bool, défaut `false` | Drapeau demi-journée (conservé pour compatibilité). |
| `start_period` | varchar(4), défaut `full` | Période du jour de début : `full` \| `am` \| `pm`. |
| `end_period` | varchar(4), défaut `full` | Période du jour de fin : `full` \| `am` \| `pm`. |
| `days` | decimal(5,1), défaut `0` | Nombre de jours calculé (`0.5` pour une seule demi-journée). |
| `motif` | text, nullable | Motif libre. |
| `status` | varchar(16), défaut `en_attente` | Statut du workflow (voir enum). |
| `decided_by` | int FK → `users` (SET NULL), nullable | Décideur. |
| `decided_at` | timestamp, nullable | Date de décision. |
| `decision_comment` | text, nullable | Commentaire de décision. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `019_create_leave_requests.ts`, puis `038` (`start_period`, `end_period`).

### Enum `status` (contrainte `leave_requests_status_chk`)

| Valeur | Sens |
|--------|------|
| `brouillon` | Demande en cours de saisie. |
| `en_attente` | Soumise, en attente de validation. |
| `valide` | Validée. |
| `refuse` | Refusée. |
| `annule` | Annulée. |

### Logique de la demi-journée

`start_period` et `end_period` (contraintes `leave_requests_start_period_chk` / `_end_period_chk`, valeurs `full` \| `am` \| `pm`) portent la précision demi-journée :

- une seule journée en `am` ou `pm` compte **0,5 jour** ;
- sur une plage de plusieurs jours, on retranche 0,5 lorsque la demande **commence l'après-midi** (`start_period = pm`) et/ou **se termine le matin** (`end_period = am`).

Le champ `half_day` est conservé pour compatibilité, mais `days` est désormais dérivé des périodes. Le décompte ne porte que sur les jours ouvrés de la plage.

> **Note** — La FK `leave_type_id` est en `ON DELETE RESTRICT` : un type encore utilisé par une demande ne peut pas être supprimé.

## Références

- `server/src/db/migrations/018_create_leave_types.ts`, `019_create_leave_requests.ts`
- `server/src/db/migrations/038_leave_half_periods.ts`, `050_leave_type_accrual.ts`
- `shared/src/leave.ts` (`LeaveType`, `LeaveRequest`, `LeaveStatus`, `LeavePeriod`, `LeaveBalance`)
