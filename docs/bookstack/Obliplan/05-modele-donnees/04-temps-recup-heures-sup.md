Ce domaine regroupe le pointage du temps sur les projets (`time_entries`), les types d'heures paramétrables (`hour_types`), les mouvements de récupération tracés (`recup_mouvements`), la déclaration d'heures supplémentaires (`overtime_natures`, `overtime_declarations`) et les clients (`clients`) auxquels se rattachent les projets.

## `hour_types`

Types d'heures / d'activité paramétrables par tenant (Front, Back, Pause…). Référencés par les shifts et les modèles de shift.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `libelle` | varchar(120) | Libellé. |
| `code` | varchar(16), nullable | Code court (ex. `FRONT`, `BACK`). |
| `color` | varchar(9), nullable | Couleur (hex). |
| `position` | int, défaut `0` | Ordre d'affichage. |
| `is_active` | bool, défaut `true` | Type actif. |
| `bookable` | bool, défaut `false` | Le temps travaillé de ce type est proposé comme créneau réservable (module réservation de rendez-vous). |
| `booking_exclude_projects` | bool, défaut `true` | Si `true`, un créneau de ce type rattaché à un projet n'est **pas** proposé à la réservation. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `023_create_hour_types.ts`, puis `067` (`bookable`, `booking_exclude_projects`).

## `time_entries`

Chunk de temps pointé sur un board (et optionnellement une carte), par timer ou saisie manuelle. Distinct du planning : sert au suivi du temps passé sur les projets.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Auteur du pointage. |
| `board_id` | int FK → `boards` (CASCADE), **nullable** | Projet ; `NULL` = temps sans projet précis. |
| `card_id` | int FK → `cards` (CASCADE), nullable | Carte ; `NULL` = temps au niveau board. |
| `minutes` | int, défaut `0` | Durée en minutes (`0` tant qu'un timer tourne). |
| `note` | text, nullable | Note. |
| `spent_on` | date, nullable | Jour concerné (`YYYY-MM-DD`). |
| `is_running` | bool, défaut `false` | `true` tant qu'un timer est actif. |
| `started_at` | timestamp, nullable | Départ du timer (`NULL` pour une saisie manuelle). |
| `created_at` | timestamp, défaut `now()` | Horodatage de création. |

Migrations : `024_create_time_entries.ts`, puis `045` qui rend `board_id` **nullable** (pointage sans projet).

## `recup_mouvements`

Mouvements tracés de récupération. `semaine` est le lundi de la semaine cible ; le montant est toujours positif, le sens donnant la direction.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Salarié. |
| `semaine` | date | Lundi de la semaine concernée. |
| `heures_min` | int | Montant en minutes (toujours positif). |
| `sens` | varchar(8) | `credit` \| `debit` (contrainte `recup_sens_chk`). |
| `motif` | text, nullable | Motif libre. |
| `source` | varchar(16), nullable | Provenance du mouvement (voir enum). |
| `overtime_declaration_id` | int FK → `overtime_declarations` (CASCADE), nullable | Déclaration d'heures sup à l'origine du crédit. |
| `shift_id` | int FK → `shifts` (CASCADE), nullable | Shift `recup` à l'origine du débit auto. |
| `created_by` | int FK → `users` (SET NULL), nullable | Auteur du mouvement. |
| `created_at` | timestamp, défaut `now()` | Horodatage de création. |

Migrations : `010_create_recup_mouvements.ts`, puis `025` (`source`, opt-in self-service), `042` (`overtime_declaration_id`), `044` (`shift_id`).

### Enum `sens` (contrainte `recup_sens_chk`)

| Valeur | Sens |
|--------|------|
| `credit` | Crédit de récup (le solde augmente). |
| `debit` | Débit de récup (le solde diminue). |

### Enum `source` (contrainte `recup_source_chk`)

`source` peut être `NULL` ou l'une des valeurs suivantes (l'enum s'est élargi au fil des migrations `025` → `042` → `044`) :

| Valeur | Origine |
|--------|---------|
| `manual` | Attribution manuelle par le manager. |
| `eligible` | Crédit automatique du dépassement éligible d'une semaine validée. |
| `overtime` | Crédit issu de la portion « récup » d'une déclaration d'heures sup. |
| `recup-shift` | Débit automatique lié à un shift planifié `type = 'recup'`. |

> **Note** — Des index uniques partiels rendent ces automatismes idempotents : `recup_eligible_uniq` (un crédit éligible par `tenant_id, user_id, semaine`), `recup_overtime_decl_uniq` (un crédit par déclaration), `recup_shift_uniq` (un débit par shift).

## `overtime_natures`

Natures d'heures supplémentaires paramétrables par tenant (Inter, Astreinte Admin, Jour Férié…).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `libelle` | varchar(120) | Libellé. |
| `color` | varchar(9), nullable | Couleur (hex). |
| `position` | int, défaut `0` | Ordre d'affichage. |
| `is_active` | bool, défaut `true` | Nature active. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `026_create_overtime_natures.ts`.

## `overtime_declarations`

Auto-déclaration d'heures sup par le salarié (contrats avec heures sup autorisées), taguée d'une nature, avec workflow de validation. Une portion peut être convertie en récup.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Salarié déclarant. |
| `nature_id` | int FK → `overtime_natures` (**RESTRICT**) | Nature de l'heure sup. |
| `date` | date | Jour concerné. |
| `minutes` | int | Durée déclarée en minutes. |
| `recup_minutes` | int, défaut `0` | Portion convertie en récup (`0..minutes`). |
| `motif` | text, nullable | Motif libre. |
| `status` | varchar(16), défaut `en_attente` | `en_attente` \| `valide` \| `refuse`. |
| `decided_by` | int FK → `users` (SET NULL), nullable | Manager décideur. |
| `decided_at` | timestamp, nullable | Date de décision. |
| `decision_comment` | text, nullable | Motif de la décision (requis au refus). |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `027_create_overtime_declarations.ts`, puis `042` (`recup_minutes`, `decision_comment`).

### Enum `status` (contrainte `overtime_declarations_status_chk`)

| Valeur | Sens |
|--------|------|
| `en_attente` | Déclaration soumise, en attente de décision. |
| `valide` | Validée par le manager. |
| `refuse` | Refusée (`decision_comment` renseigné). |

> **Note** — La FK `nature_id` est en `ON DELETE RESTRICT` : on ne peut pas supprimer une nature encore référencée par une déclaration.

## `clients`

Clients (customers) d'un tenant. Les boards (projets) leur sont rattachés, offrant une vue par client des projets.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `name` | varchar(200) | Nom du client. |
| `color` | varchar(9), nullable | Couleur (hex). |
| `contact` | varchar(200), nullable | Contact. |
| `notes` | text, nullable | Notes libres. |
| `archived` | bool, défaut `false` | Client archivé. |
| `logo` | text, nullable | Logo (data-URI redimensionné ou URL) ; `NULL` = initiale colorée. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `021_create_clients.ts`, puis `064` (`logo`). Le rattachement d'un board à un client est décrit dans « Projets, tâches & équipes ».

## Références

- `server/src/db/migrations/010_create_recup_mouvements.ts`, `021_create_clients.ts`, `023_create_hour_types.ts`, `024_create_time_entries.ts`, `025_recup_redesign.ts`
- `server/src/db/migrations/026_create_overtime_natures.ts`, `027_create_overtime_declarations.ts`, `042_overtime_recup_and_decision_comment.ts`
- `server/src/db/migrations/044_recup_shift_link.ts`, `045_time_entry_nullable_board.ts`, `064_add_client_logo.ts`
- `shared/src/hourtype.ts`, `shared/src/timetracking.ts`, `shared/src/overtime.ts`, `shared/src/types.ts` (`RecupMouvement`, `RecupSens`)
