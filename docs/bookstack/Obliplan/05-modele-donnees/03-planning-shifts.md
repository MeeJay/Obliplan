Le domaine planning modélise les créneaux du salarié (`shifts`), leurs modèles réutilisables (`shift_templates`), les jours d'école de l'alternance (`jours_ecole`), les jours fériés (`public_holidays`) et les vues de planning sauvegardées (`planning_views`).

## `shifts`

Créneau planifié d'un salarié pour une date donnée. C'est la seule source persistée du temps effectué : seuls les shifts `type = 'travail'` **et** `statut = 'valide'` alimentent le réalisé calculé.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Salarié concerné. |
| `date` | date | Jour du créneau (`YYYY-MM-DD`). |
| `heure_debut` | varchar(5), nullable | Heure de début `HH:mm` ; `NULL` pour les types pleine journée. |
| `heure_fin` | varchar(5), nullable | Heure de fin `HH:mm`. |
| `pause_min` | int, défaut `0` | Pause non payée, en minutes. |
| `type` | varchar(16), défaut `travail` | Type de créneau (voir enum ci-dessous). |
| `statut` | varchar(16), défaut `brouillon` | `brouillon` \| `valide`. |
| `note` | text, nullable | Note libre. |
| `hour_type_id` | int FK → `hour_types` (SET NULL), nullable | Type d'heure/activité imputé. |
| `board_id` | int FK → `boards` (SET NULL), nullable | Projet (board) sur lequel le créneau est travaillé. |
| `created_by` | int FK → `users` (SET NULL), nullable | Auteur de la création. |
| `updated_by` | int FK → `users` (SET NULL), nullable | Auteur de la dernière modification. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `009_create_shifts.ts`, puis `028` (`hour_type_id`, `board_id`).

### Enum `type` (contrainte `shifts_type_chk`)

La contrainte CHECK a évolué au fil des migrations ; son état final autorise huit valeurs :

| Valeur | Sens | Impact sur le calcul |
|--------|------|----------------------|
| `travail` | Créneau travaillé | Compte dans le réalisé (si validé). |
| `pause` | Pause (déjeuner…) | Temps **non** travaillé, exclu du réalisé, mais porte une plage horaire. |
| `repos` | Repos | Non travaillé. |
| `recup` | Récupération posée | Débit de récup ; non travaillé. |
| `conge` | Congé | Pleine journée non travaillée. |
| `absence` | Absence | Non travaillée. |
| `ecole` | Jour d'école (alternance) | Neutre sur le réalisé, réduit l'attendu. |
| `astreinte` | Astreinte (on-call) | Comptée en heures sup ; chaque astreinte = un déclenchement. |

- `astreinte` a été ajouté en migration `017`.
- `pause` a été ajouté en migration `063`.

### Enum `statut` (contrainte `shifts_statut_chk`)

| Valeur | Sens |
|--------|------|
| `brouillon` | Créneau en cours de saisie, non pris en compte dans les compteurs. |
| `valide` | Créneau validé — seul état qui alimente le réalisé / l'astreinte. |

> **Note** — La récup posée via un shift `type = 'recup'` est reliée à un mouvement de récup auto-généré : `recup_mouvements.shift_id` FK → `shifts` `ON DELETE CASCADE` (supprimer le shift supprime le débit). Voir « Temps : pointage, types d'heures, récup, heures sup ».

## `shift_templates`

Modèles de créneaux nommés et réutilisables (style Skello/Combo) qu'un manager applique à une journée.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `name` | varchar(80) | Nom du modèle. |
| `heure_debut` | varchar(5) | Heure de début `HH:mm`. |
| `heure_fin` | varchar(5) | Heure de fin `HH:mm`. |
| `pause_min` | int, défaut `0` | Pause en minutes. |
| `type` | varchar(16), défaut `travail` | Type de créneau appliqué. |
| `hour_type_id` | int FK → `hour_types` (SET NULL), nullable | Type d'heure imputé. |
| `board_id` | int FK → `boards` (SET NULL), nullable | Projet imputé. |
| `color` | varchar(7), nullable | Couleur du modèle. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `048_create_shift_templates.ts`.

## `jours_ecole`

Jours d'école des contrats en alternance. Une ligne représente **soit** une date concrète, **soit** un weekday récurrent optionnellement borné par une période.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Salarié en alternance. |
| `date` | date, nullable | Date ponctuelle ; `NULL` si récurrent. |
| `weekday` | smallint, nullable | Jour récurrent (0 = dimanche … 6 = samedi) ; `NULL` si ponctuel. |
| `period_start` | date, nullable | Début de la période de récurrence. |
| `period_end` | date, nullable | Fin de la période de récurrence. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `008_create_jours_ecole.ts`. Les jours d'école tombant sur un jour travaillé réduisent l'attendu hebdomadaire (calcul dans `calc.service`).

## `public_holidays`

Jours fériés : le jeu national FR global (`tenant_id` `NULL`) plus des lignes personnalisées par tenant. Un férié tombant sur un jour travaillé est déduit de l'attendu et ne consomme pas de congé.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE), **nullable** | `NULL` = jeu national global ; sinon férié propre au tenant. |
| `date` | date | Date du férié. |
| `label` | text | Libellé. |
| `region_code` | varchar(8), nullable | Code région (jours fériés régionaux). |
| `created_at` | timestamptz, défaut `now()` | Horodatage de création. |

Contrainte : index unique partiel `public_holidays_global_date_uniq` (`date` où `tenant_id IS NULL`) garantissant au plus une ligne globale par date. La migration seede le jeu FR pour `annéeCourante-1 … annéeCourante+2`. Migration : `049_create_public_holidays.ts`.

## `planning_views`

Vues de planning sauvegardées par utilisateur : des presets nommés des équipes (axe C) restant visibles dans les vues d'équipe. Scopée à un utilisateur dans un tenant.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Propriétaire de la vue. |
| `name` | varchar(80) | Nom de la vue. |
| `team_ids` | jsonb, défaut `[]` | Tableau d'ids `user_teams` visibles (`[]` = toutes les équipes). |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Contrainte : `unique(tenant_id, user_id, name)`. Migration : `066_planning_views.ts`.

## Références

- `server/src/db/migrations/008_create_jours_ecole.ts`, `009_create_shifts.ts`
- `server/src/db/migrations/017_add_astreinte_type.ts`, `028_add_hourtype_project_to_shifts.ts`, `063_add_pause_type.ts`
- `server/src/db/migrations/044_recup_shift_link.ts`, `048_create_shift_templates.ts`, `049_create_public_holidays.ts`, `066_planning_views.ts`
- `shared/src/types.ts` (`Shift`, `ShiftType`, `ShiftStatus`, `ShiftTemplate`, `JourEcole`)
- `server/src/services/calc.service.ts`
