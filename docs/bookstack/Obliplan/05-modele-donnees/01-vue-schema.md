Le schéma PostgreSQL d'Obliplan est décrit intégralement par les migrations Knex versionnées du serveur, et reflété côté applicatif par les types partagés de `@obliplan/shared`. Cette page donne le panorama des tables par domaine, rappelle les conventions transversales et explique comment lire puis faire évoluer le schéma.

## Panorama des tables par domaine

Le schéma compte 43 tables métier (hors tables internes de Knex `knex_migrations` / `knex_migrations_lock`). Elles sont regroupées ci-dessous selon les six domaines qui structurent le reste de ce chapitre.

### Cœur (identité & organisation)

| Table | Rôle |
|-------|------|
| `tenants` | Espaces de travail (workspaces) isolés les uns des autres. |
| `users` | Comptes salariés/managers/admins, rattachés à un tenant et à un contrat. |
| `contrats` | Modèle central portant les règles de calcul du temps de travail. |
| `user_tenants` | Appartenance d'un utilisateur à un tenant, avec son rôle par tenant. |
| `sso_foreign_users` | Liaison d'un compte local à une identité externe (Obligate). |
| `session` | Sessions PostgreSQL (`connect-pg-simple`). |

Détail : « Cœur : tenants, users, contrats ».

### Planning

| Table | Rôle |
|-------|------|
| `shifts` | Créneaux planifiés (travail, repos, récup, congé, école, astreinte, pause…). |
| `shift_templates` | Modèles de créneaux réutilisables appliqués à une journée. |
| `jours_ecole` | Jours d'école des contrats en alternance (date ponctuelle ou weekday récurrent). |
| `public_holidays` | Jours fériés (jeu national FR global + surcharges par tenant). |
| `planning_views` | Vues de planning sauvegardées par utilisateur (filtres d'équipes). |

Détail : « Planning : shifts, modèles, jours d'école, jours fériés, vues ».

### Temps (pointage, récup, heures sup)

| Table | Rôle |
|-------|------|
| `hour_types` | Types d'heures / d'activité paramétrables par tenant (Front, Back…). |
| `time_entries` | Pointage du temps passé sur un projet/une carte (timer + saisie manuelle). |
| `recup_mouvements` | Mouvements tracés de récupération (crédit/débit par semaine). |
| `overtime_natures` | Natures d'heures supplémentaires paramétrables par tenant. |
| `overtime_declarations` | Déclarations d'heures sup par le salarié, avec workflow de validation. |
| `clients` | Clients du tenant auxquels sont rattachés les projets (boards). |

Détail : « Temps : pointage, types d'heures, récup, heures sup ».

### Congés

| Table | Rôle |
|-------|------|
| `leave_types` | Types de congés/absences paramétrables (CP, RTT, maladie…) avec acquisition. |
| `leave_requests` | Demandes de congé avec workflow de validation et gestion des demi-journées. |

Détail : « Congés : types & demandes ».

### Projets, tâches & équipes

| Table | Rôle |
|-------|------|
| `boards` | Tableaux Kanban/Scrum (projets), rattachables à un client. |
| `board_columns` | Colonnes d'un tableau (position, limite WIP, colonne « terminé »). |
| `board_members` | Membres d'un projet avec leur rôle (owner/admin/member/viewer). |
| `sprints` | Sprints d'un tableau (planned/active/done). |
| `cards` | Cartes (priorité, points, estimation, échéance, assignation, hiérarchie). |
| `card_links` | Dépendances entre cartes (blocks/relates/duplicates). |
| `card_comments` | Fil de discussion d'une carte. |
| `card_activity` | Historique d'activité append-only d'une carte. |
| `todos` | Todo-list personnelle simple par utilisateur. |
| `list_groups` | Groupes repliables de listes de tâches (« Mes tâches »). |
| `task_lists` | Listes de tâches personnalisées. |
| `list_shares` | Partage d'une liste de tâches avec d'autres utilisateurs. |
| `tasks` | Tâches d'une liste (importance, échéance, rappel, « Ma journée »). |
| `task_steps` | Étapes (sous-cases) d'une tâche. |
| `user_teams` | Équipes de tenant — axe C de la matrice de permissions. |
| `team_memberships` | Table de jointure membre ↔ équipe. |
| `team_permissions` | Portées de ressources (client/projet/tout) accordées à une équipe. |

Détail : « Projets, tâches & équipes ».

### Transverse

| Table | Rôle |
|-------|------|
| `notifications` | Centre de notifications in-app (une ligne par destinataire). |
| `email_log` | Journal des e-mails sortants (envoyés/échoués). |
| `push_subscriptions` | Abonnements Web Push (une ligne par navigateur/appareil). |
| `audit_log` | Journal d'audit inviolable en chaîne de hachage HMAC par tenant. |
| `app_config` | Configuration clé/valeur de l'application (SSO Obligate…). |
| `tenant_modules` | Activation/désactivation de modules par tenant. |
| `permission_sets` | Jeux de capacités nommés (globaux), résolus par `user_tenants.role`. |

Détail : « Transverse : notifications, audit, push, configuration ».

## Conventions du schéma

### Migrations Knex numérotées

Le schéma se construit uniquement par les migrations Knex, dans `server/src/db/migrations/`, numérotées séquentiellement de `001` à `066` (le préfixe `039` n'est pas utilisé). Chaque fichier exporte une paire `up` / `down` :

```ts
export async function up(knex: Knex): Promise<void> { /* création / altération */ }
export async function down(knex: Knex): Promise<void> { /* rollback */ }
```

L'ordre lexicographique du préfixe fixe l'ordre d'application. Une modification de schéma ne se fait **jamais** en éditant une migration déjà publiée : on ajoute un nouveau fichier numéroté.

### Horodatage (timestamps)

La majorité des tables utilisent l'assistant `t.timestamps(true, true)`, qui crée `created_at` et `updated_at` (avec valeur par défaut `now()`). Certaines tables append-only ne portent qu'un `created_at` (ex. `recup_mouvements`, `card_comments`, `card_activity`, `notifications`, `audit_log`, `push_subscriptions`).

### Clés étrangères et politiques de suppression

Deux politiques dominent :

- **`ON DELETE CASCADE`** pour les liens de possession forts — en particulier `tenant_id` sur presque toutes les tables (supprimer un tenant efface ses données) et les liens parent → enfant (colonnes d'un board, cartes d'une colonne, etc.).
- **`ON DELETE SET NULL`** pour les liens de traçabilité ou d'affectation qui doivent survivre à la suppression de la cible : `contrat_id`, `manager_id`, `created_by` / `updated_by`, `assignee_id`, `decided_by`, `author_id`, `actor_id`…

> **Note** — `audit_log.actor_id` est une exception délibérée : c'est un entier immuable **non-FK** (il est intégré au hachage), voir « Journal d'audit inviolable (HMAC) ».

### Isolation par tenant (`tenant_id`)

L'isolation multi-tenant repose sur une colonne `tenant_id` (FK `tenants` `ON DELETE CASCADE`) présente sur quasiment toutes les tables métier, filtrée systématiquement à partir de la session (`req.tenantId`). Quelques tables font exception par nature :

- `session` — technique, hors périmètre métier ;
- `permission_sets` — **globale** (partagée par tous les tenants) ;
- `push_subscriptions` — rattachée à l'**utilisateur** (le même appareil reçoit ses notifications dans tous ses tenants) ;
- `sso_foreign_users` — rattachée à l'utilisateur local ;
- `team_memberships` — rattachée à l'équipe (elle-même tenant-scopée) ;
- `public_holidays` et `email_log` — `tenant_id` **nullable** (`NULL` = jeu global / non lié à un workspace).

### Traçabilité `created_by` / `updated_by`

Les entités mutées par un manager portent une traçabilité applicative via des FK `users` (`ON DELETE SET NULL`) : `shifts.created_by` / `updated_by`, `cards.created_by`, `tasks.created_by`, `recup_mouvements.created_by`. La traçabilité inviolable des mutations sensibles est assurée séparément par `audit_log`.

## Compteurs calculés, jamais stockés

Les compteurs hebdomadaires (réalisé, attendu, écart, heures sup, récup éligible, astreinte, jours d'école, jours de congé) **ne sont jamais persistés**. Ils sont recalculés à la volée par `server/src/services/calc.service.ts` à partir des shifts validés, du contrat, des jours d'école, des jours fériés et des congés approuvés.

> **Avertissement** — Aucune table ne contient de colonne « réalisé » ou « attendu ». Le type partagé `WeeklyCounter` décrit cette projection dérivée ; l'unique source persistée du temps effectué reste `shifts` (`type = 'travail'`, `statut = 'valide'`).

## Lire et faire évoluer le schéma

Les migrations sont exécutées au premier démarrage du serveur, et manuellement via les scripts npm workspaces :

```bash
# Appliquer toutes les migrations en attente
npm run migrate            # racine → cd server && knex migrate:latest

# Créer une nouvelle migration
cd server && npm run migrate:make -- 067_ma_nouvelle_table

# Annuler le dernier lot
cd server && npm run migrate:rollback
```

La configuration (répertoire des migrations, connexion, `searchPath`) vit dans `server/knexfile.ts`. La connexion Knex applicative est initialisée dans `server/src/db/index.ts`, qui force notamment le décodage des colonnes `date` (OID 1082) en chaînes `YYYY-MM-DD` brutes pour rester stable quel que soit le fuseau du serveur.

## Références

- `server/src/db/migrations/` (fichiers `001` à `066`)
- `server/knexfile.ts`
- `server/src/db/index.ts`
- `server/src/services/calc.service.ts`
- `shared/src/types.ts`, `shared/src/modules.ts`
