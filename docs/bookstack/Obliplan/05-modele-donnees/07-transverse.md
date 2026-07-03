Ce domaine regroupe les tables transverses : la notification in-app (`notifications`), le journal des e-mails (`email_log`), les abonnements Web Push (`push_subscriptions`), le journal d'audit inviolable (`audit_log`), la configuration (`app_config`), l'activation de modules par tenant (`tenant_modules`) et les jeux de capacités (`permission_sets`).

## `notifications`

Centre de notifications in-app : une ligne par destinataire (le fan-out d'un événement est fait par le dispatcher `notify`).

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `user_id` | int FK → `users` (CASCADE) | Destinataire. |
| `type` | varchar(48) | Type d'événement (ex. `leave.submitted`, `card.assigned`). |
| `title` | text | Titre. |
| `body` | text, nullable | Corps. |
| `link` | text, nullable | Route in-app pointée (ex. `/conges`). |
| `entity_type` | varchar(48), nullable | Type d'entité liée. |
| `entity_id` | int, nullable | Id de l'entité liée. |
| `actor_id` | int FK → `users` (SET NULL), nullable | Auteur de l'événement. |
| `read_at` | timestamptz, nullable | Date de lecture ; `NULL` = non lue. |
| `created_at` | timestamptz, défaut `now()` | Horodatage. |

Migration : `046_create_notifications.ts`. Voir « Notifications : in-app, push & e-mail ».

## `email_log`

Journal de chaque e-mail sortant tenté par le mailer.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE), **nullable** | Tenant ; `NULL` pour les mails non liés à un workspace (ex. auto-test SMTP). |
| `recipient` | text | Destinataire. |
| `subject` | text | Objet. |
| `template` | varchar(64), nullable | Gabarit utilisé. |
| `status` | varchar(8) | `sent` \| `failed` (contrainte `email_log_status_chk`). |
| `error` | text, nullable | Message d'échec SMTP quand `status = failed`. |
| `created_at` | timestamp, défaut `now()` | Horodatage. |

Migration : `047_create_email_log.ts`.

## `push_subscriptions`

Abonnements Web Push : une ligne par navigateur/appareil ayant opté-in. L'abonnement appartient à l'**utilisateur** (pas à un tenant) — le même appareil reçoit ses notifications dans tous ses tenants.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `user_id` | int FK → `users` (CASCADE) | Propriétaire de l'abonnement. |
| `endpoint` | text **unique** | URL du service de push (le re-subscribe upsert dessus). |
| `p256dh` | text | Clé de chiffrement client. |
| `auth` | text | Secret d'authentification client. |
| `created_at` | timestamptz, défaut `now()` | Horodatage. |

Migration : `062_create_push_subscriptions.ts`. Voir « Notifications : in-app, push & e-mail ».

## `audit_log`

Journal d'audit **append-only** en chaîne de hachage HMAC, une chaîne par tenant. Chaque ligne porte `hash = HMAC-SHA256(auditSecret, canonical(prev_hash, ligne))` : toute édition, réordonnancement ou rupture de linkage d'une ligne passée fait diverger le hash recalculé.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant (portée de la chaîne). |
| `actor_id` | int, nullable | Id historique immuable de l'acteur — **non-FK** (champ haché). |
| `action` | varchar(64) | Action auditée. |
| `entity_type` | varchar(48), nullable | Type d'entité. |
| `entity_id` | int, nullable | Id d'entité. |
| `meta` | text, nullable | Contexte non secret, en **JSON canonique** (texte, pas jsonb, pour un hachage stable). |
| `prev_hash` | varchar(64), nullable | Hash de la ligne précédente (`NULL` pour la ligne genesis). |
| `hash` | varchar(64) | Hash HMAC de la ligne. |
| `created_at` | timestamptz, défaut `now()` | Horodatage. |

Contrainte : index unique `audit_log_tenant_prevhash_uniq` sur `(tenant_id, COALESCE(prev_hash, ''))` — backstop contre une chaîne forkée (deux genesis inclus). Migration : `060_create_audit_log.ts`.

> **Avertissement** — Le nom de l'acteur n'est jamais figé dans la trace : il est résolu à la lecture via un `leftJoin` (acteur manquant → `-`, acteur anonymisé → « Salarié anonymisé »). Le mécanisme, ses garanties et ses limites (troncature de queue, attaquant détenant la clé) sont détaillés dans « Journal d'audit inviolable (HMAC) ».

## `app_config`

Configuration clé/valeur globale de l'application (non tenant-scopée) : URL + clé API Obligate, drapeau `obligate_enabled`, etc. L'activation du SSO est stockée ici, jamais en variable d'environnement ni dans le dépôt.

| Colonne | Type | Description |
|---------|------|-------------|
| `key` | varchar(128) PK | Clé de configuration. |
| `value` | text, nullable | Valeur (souvent du JSON). |
| `updated_at` | timestamp, défaut `now()` | Dernière mise à jour. |

Migration : `007_create_app_config.ts`.

## `tenant_modules`

Activation/désactivation des modules par workspace. Un tenant sans aucune ligne a **tous** les modules activés (défaut-tout-actif) ; une ligne `enabled = false` masque le module dans la nav et fait rejeter ses routes côté serveur.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `tenant_id` | int FK → `tenants` (CASCADE) | Tenant. |
| `module_key` | varchar(32) | Clé du catalogue de modules. |
| `enabled` | bool, défaut `true` | Module activé. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Contrainte : `unique(tenant_id, module_key)`. Migration : `040_create_tenant_modules.ts`.

Les `module_key` valides sont fixés dans `shared/src/modules.ts` :

| Clé | Libellé |
|-----|---------|
| `conges` | Congés |
| `heures_sup` | Heures sup |
| `recup` | Récupération |
| `projets` | Projets |
| `taches` | Tâches |
| `temps` | Suivi du temps |
| `clients` | Clients |

## `permission_sets`

Jeu de capacités nommé, **global** (non tenant-scopé), keyé par slug. `user_tenants.role` stocke un slug qui résout les droits d'un utilisateur dans un tenant.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | serial PK | Identifiant. |
| `name` | varchar(64) | Nom lisible. |
| `slug` | varchar(64) **unique** | Slug référencé par `user_tenants.role`. |
| `capabilities` | jsonb, défaut `[]` | Tableau de capacités (ex. `planning:write`, `leave:validate`). |
| `is_default` | bool, défaut `false` | Jeu par défaut correspondant à un rôle applicatif. |
| `created_at` / `updated_at` | timestamptz | Horodatage. |

Migration : `020_create_permission_sets.ts`, qui seede trois jeux par défaut correspondant aux rôles applicatifs :

| Slug | Nom | Capacités initiales |
|------|-----|---------------------|
| `admin` | Admin | `planning:read_team`, `planning:write`, `recup:manage`, `leave:validate`, `leave:types:manage`, `contrats:manage`, `users:manage`, `tenants:manage`, `settings:manage`, `clients:manage`, `projects:create` |
| `manager` | Manager | `planning:read_team`, `planning:write`, `recup:manage`, `leave:validate`, `projects:create` |
| `employe` | Salarié | `projects:create` |

> **Note** — Les capacités sont **additives** : des migrations ultérieures fusionnent de nouvelles capacités dans ces jeux par défaut de façon idempotente — `041` et `043` ajoutent `overtime:validate` / `overtime:natures:manage` / `hourtypes:manage` (manager & admin), et `061` ajoute `planning:view_team` aux trois jeux (vue équipe en lecture seule pour tout salarié).

## Références

- `server/src/db/migrations/007_create_app_config.ts`, `020_create_permission_sets.ts`
- `server/src/db/migrations/040_create_tenant_modules.ts`, `041_backfill_permission_caps.ts`, `043_seed_validate_caps.ts`
- `server/src/db/migrations/046_create_notifications.ts`, `047_create_email_log.ts`
- `server/src/db/migrations/060_create_audit_log.ts`, `061_seed_view_team_cap.ts`, `062_create_push_subscriptions.ts`
- `shared/src/notification.ts`, `shared/src/modules.ts`, `shared/src/types.ts` (`AuditEntry`, `AuditVerifyResult`)
