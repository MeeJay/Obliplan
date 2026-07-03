Le cœur du modèle porte l'identité et l'organisation : les espaces de travail (`tenants`), les comptes (`users`), et surtout le **contrat** (`contrats`) qui centralise les règles de calcul du temps de travail. S'y ajoutent l'appartenance multi-tenant, la liaison SSO et les sessions.

## `tenants`

Espace de travail isolé. Le tenant `id = 1` (slug `default`) est le tenant maître (« God View »), traité comme immuable par l'application.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `name` | varchar(200) | Nom affiché. |
| `slug` | varchar(64) **unique** | Slug technique (`^[a-z0-9-]{1,64}$`). |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `001_create_tenants.ts`.

## `users`

Compte d'un salarié, manager ou admin. Rattaché à un tenant, éventuellement à un contrat et à un manager. Les comptes SSO n'ont pas de mot de passe local.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant de rattachement principal. |
| `username` | varchar(100) **unique** | Identifiant de connexion. |
| `password_hash` | varchar(255), nullable | Hash bcrypt ; `NULL` = compte SSO uniquement. |
| `display_name` | varchar(200), nullable | Nom affiché. |
| `email` | varchar(255), nullable | Adresse e-mail. |
| `role` | varchar(16), défaut `employe` | Rôle applicatif : `admin` \| `manager` \| `employe`. |
| `is_active` | bool, défaut `true` | Compte actif. |
| `contrat_id` | int FK → `contrats` (SET NULL), nullable | Contrat pilotant le calcul du temps. |
| `manager_id` | int FK → `users` (SET NULL), nullable | Manager responsable du planning (auto-référence). |
| `preferred_language` | varchar(10), défaut `fr` | Langue préférée. |
| `preferences` | jsonb, défaut `{}` | Préférences UI (thème, toasts…). |
| `foreign_source` | varchar(64), nullable | Source SSO (ex. `obligate`). |
| `foreign_id` | int, nullable | Identifiant externe. |
| `foreign_source_url` | varchar(512), nullable | URL de la source externe. |
| `recup_self_service` | bool, défaut `false` | Opt-in à la vue récup en self-service (`/ma-recup`). |
| `ics_token` | varchar(64) **unique**, nullable | Jeton d'abonnement iCalendar (feed `/api/ics/:token.ics`). |
| `anonymized_at` | timestamptz, nullable | RGPD : horodatage de pseudonymisation ; `NULL` = identité vive. |
| `avatar` | text, nullable | Photo de profil (URL Obligate ou data-URI) ; `NULL` = avatar initiales. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `003_create_users.ts`, puis `025` (`recup_self_service`), `058` (`ics_token`), `059` (`anonymized_at`), `065` (`avatar`).

> **Note** — Le type partagé `User` expose `hasPassword` : c'est un booléen **dérivé** de la présence de `password_hash`, pas une colonne stockée.

## `contrats`

Modèle central du domaine : c'est le contrat qui porte les règles de calcul (base hebdomadaire, autorisation d'heures sup, seuil, alternance, pattern de travail).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `libelle` | varchar(200) | Libellé (ex. « Technicien 35h »). |
| `heures_hebdo_base_min` | int | Base hebdomadaire **en minutes** (35 h = 2100). |
| `heures_sup_autorisees` | bool, défaut `false` | `false` → le dépassement devient récup ; `true` → heures sup. |
| `seuil_heures_sup_min` | int, nullable | Seuil (minutes) au-delà duquel le dépassement compte en heures sup. |
| `alternance` | bool, défaut `false` | Contrat en alternance → utilise les jours d'école. |
| `color` | varchar(9), nullable | Couleur (hex) pour la visualisation planning. |
| `work_pattern` | jsonb, nullable | Minutes attendues par jour `[Lun…Dim]` ; `NULL` = base/5 Lun–Ven. |
| `fte_percent` | int, nullable | Équivalent temps plein informatif (0–100). |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migrations : `002_create_contrats.ts`, puis `016` (`color`), `051` (`work_pattern`, `fte_percent`).

> **Note** — Un jour est « travaillé » ssi son entrée dans `work_pattern` est `> 0`. Un `work_pattern` `NULL` correspond au comportement historique : base uniforme répartie du lundi au vendredi.

## `user_tenants`

Appartenance d'un utilisateur à un tenant, avec le rôle porté **par tenant** (slug brut synchronisé depuis Obligate ou rôle applicatif local). C'est cette table qui permet à un compte d'accéder à plusieurs workspaces.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `user_id` | int FK → `users` (CASCADE) | Utilisateur. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `role` | varchar(32), défaut `employe` | Rôle par tenant (slug de `permission_sets`). |

Contrainte : `unique(user_id, tenant_id)`. Pas de colonnes d'horodatage. Migration : `005_create_user_tenants.ts`.

> **Note** — Le `role` référence un slug de jeu de capacités (`permission_sets.slug`), voir « Transverse : notifications, audit, push, configuration ».

## `sso_foreign_users`

Liaison d'un compte local à une identité externe (Obligate). Un même utilisateur local peut être lié à plusieurs sources.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `foreign_source` | varchar(64) | Nom de la source (ex. `obligate`). |
| `foreign_user_id` | int | Identifiant de l'utilisateur dans la source. |
| `local_user_id` | int FK → `users` (CASCADE) | Compte local lié. |

Contrainte : `unique(foreign_source, foreign_user_id)`. Migration : `006_create_sso_foreign_users.ts`.

## `session`

Table technique des sessions HTTP, gérée par `connect-pg-simple` (la création automatique de la table est désactivée, d'où cette migration).

| Colonne | Type | Description |
|---------|------|-------------|
| `sid` | varchar PK | Identifiant de session. |
| `sess` | json | Contenu sérialisé de la session. |
| `expire` | timestamp (sans TZ), **indexée** | Date d'expiration. |

Migration : `004_create_session.ts`.

## `app_config`

Configuration clé/valeur de l'application (URL + clé API Obligate, drapeau `obligate_enabled`…). Non tenant-scopée ; détaillée dans « Transverse : notifications, audit, push, configuration ».

| Colonne | Type | Description |
|---------|------|-------------|
| `key` | varchar(128) PK | Clé de configuration. |
| `value` | text, nullable | Valeur (souvent du JSON). |
| `updated_at` | timestamp, défaut `now()` | Dernière mise à jour. |

Migration : `007_create_app_config.ts`.

> **Note** — Les équipes de tenant (`user_teams`) constituent l'axe C de la matrice de permissions et sont documentées avec `team_memberships` / `team_permissions` dans « Projets, tâches & équipes ».

## Références

- `server/src/db/migrations/001_create_tenants.ts`, `002_create_contrats.ts`, `003_create_users.ts`
- `server/src/db/migrations/004_create_session.ts`, `005_create_user_tenants.ts`, `006_create_sso_foreign_users.ts`, `007_create_app_config.ts`
- `server/src/db/migrations/016_add_contrat_color.ts`, `025_recup_redesign.ts`, `051_contrat_work_pattern.ts`
- `server/src/db/migrations/058_user_ics_token.ts`, `059_user_anonymized_at.ts`, `065_user_avatar.ts`
- `shared/src/types.ts`, `shared/src/tenants.ts`
