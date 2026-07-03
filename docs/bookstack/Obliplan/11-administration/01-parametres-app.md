Obliplan sépare la configuration **globale de l'instance** (partagée par tous les workspaces) de la configuration propre à chaque tenant. Deux écrans sont réservés à l'**administrateur de plateforme** (system admin), et non au simple administrateur de tenant : **Paramètres** (`/settings`) et **Espaces de travail** (`/workspaces`). Tous les réglages sont persistés en base de données — jamais dans le dépôt.

## Écrans et contrôle d'accès

| Écran | Route front | Garde front | Contenu |
|---|---|---|---|
| Paramètres | `/settings` | `PlatformAdminRoute` | À propos / infos système, SMTP, passerelle Obligate SSO, jours fériés |
| Espaces de travail | `/workspaces` | `PlatformAdminRoute` | Création / renommage / suppression de workspaces, membres, modules |

La garde front `PlatformAdminRoute` s'appuie sur `isPlatformAdmin()` : elle vérifie le **vrai drapeau plateforme** de la session, pas le rôle effectif dans le tenant courant. Un administrateur de tenant (rôle `admin` dans son workspace) n'atteint donc pas ces écrans.

Côté serveur, les routes de configuration globale sont montées sous `/api/admin/config` et protégées par `requireAuth` + `requirePlatformAdmin()`. Ce dernier renvoie `403 Réservé aux administrateurs de la plateforme` si `session.platformAdmin` est faux — un administrateur de tenant ne peut donc ni lire ni modifier des réglages transverses.

> La distinction est volontaire : SMTP et passerelle Obligate sont des réglages d'instance (cross-tenant). Les confier au seul administrateur plateforme évite qu'un administrateur d'un workspace n'altère la configuration vue par les autres.

## À propos / infos système

La section « À propos » de `/settings` affiche un instantané renvoyé par `systemInfoService.get()` via `GET /api/admin/config/system`. Aucune de ces valeurs n'est stockée : elles sont calculées à la volée à chaque appel.

| Bloc | Champ (`SystemInfo`) | Source |
|---|---|---|
| Versions | `appVersion` | `version` du `package.json` serveur (`dev` en repli) |
| Versions | `nodeVersion` | `process.version` |
| Instance | `uptimeSeconds` | `process.uptime()` |
| Instance | `environment.isDocker` | présence de `/.dockerenv` |
| Instance | `environment.platform` | `os.type()`, `os.release()`, `process.arch` |
| CPU | `cpu.cores` | `os.cpus().length` |
| CPU | `cpu.loadAvg1` / `loadAvg5` / `loadAvg15` | `os.loadavg()` |
| Mémoire | `memory.processRssMb` / `processHeapMb` | `process.memoryUsage()` |
| Mémoire | `memory.systemFreeMb` / `systemTotalMb` | `os.freemem()` / `os.totalmem()` |
| Base de données | `environment.dbStatus` | `select 1` (→ `ok` ou `error`) |

La version du **client** affichée à côté de celle du serveur provient de la constante de build `__APP_VERSION__` injectée par Vite (elle n'est pas dans `SystemInfo`).

## Passerelle Obligate SSO

La passerelle connecte Obliplan à un serveur SSO Obligate (authentification centralisée + navigation inter-applications). Le réglage comporte trois champs : **URL**, **clé API** et un interrupteur **activation**.

| Endpoint | Rôle |
|---|---|
| `GET /api/admin/config/obligate` | Vue publique (`ObligateConfig`) |
| `PATCH /api/admin/config/obligate` | Mise à jour partielle (`url`, `apiKey`, `enabled`) |

La vue publique ne divulgue **jamais** la clé API : `ObligateConfig` expose `url`, un booléen `apiKeySet` (« clé définie ») et `enabled`. Le secret n'existe qu'en interne (`getObligateRaw()`, usage serveur uniquement).

Règles de fonctionnement observables :

- Un `PATCH` sans nouvelle valeur de clé conserve la clé existante (une chaîne vide n'écrase pas le secret).
- Le serveur **refuse** une URL qui pointerait vers l'application elle-même (`400`), pour éviter une boucle de redirection.
- Une fois le SSO **activé**, la page de connexion redirige vers Obligate et l'authentification locale est désactivée ; les utilisateurs sont provisionnés à la première connexion.
- Si la passerelle devient injoignable, l'authentification locale est automatiquement rétablie en secours.

L'interrupteur d'activation n'apparaît dans l'UI que lorsque l'URL **et** la clé API sont renseignées.

```json
// app_config → key = 'obligate_config'
{ "url": "https://obligate.example.com", "apiKey": "•••" }
// app_config → key = 'obligate_enabled'  ⇒ value 'true' | 'false'
```

## Serveur SMTP / e-mail

Le serveur SMTP sert à l'envoi des notifications (demandes de congé, validations, affectations…). Un seul serveur est configuré.

| Endpoint | Rôle |
|---|---|
| `GET /api/admin/config/smtp` | Vue publique (`SmtpConfig`) |
| `PATCH /api/admin/config/smtp` | Mise à jour partielle |
| `POST /api/admin/config/smtp/test` | Envoi d'un e-mail de test à `{ to }` |

Champs de `SmtpConfig` (vue publique) : `host`, `port`, `secure`, `user`, `fromAddress`, et le booléen `passSet`. Comme pour Obligate, le **mot de passe n'est jamais renvoyé** : seul `passSet` indique qu'il est défini, et un `PATCH` avec un mot de passe vide conserve l'ancien. L'écran propose un bouton « Envoyer un test » qui appelle `smtp/test` avec la configuration enregistrée.

```json
// app_config → key = 'smtp_config'
{ "host": "smtp.example.com", "port": 587, "secure": false,
  "user": "no-reply", "pass": "•••", "fromAddress": "no-reply@example.com" }
```

## Jours fériés

L'écran `/settings` héberge aussi la gestion des jours fériés (nationaux et personnalisés). Contrairement au reste de la page, l'**ajout / suppression** d'un jour férié personnalisé n'est pas gardé par le rôle plateforme mais par la capacité `planning:write` (`canManageHolidays`). Ces jours ne consomment pas de congé et sont déduits des heures attendues.

## Où sont stockés les réglages

Toute la configuration globale vit dans la table **`app_config`**, un simple magasin clé/valeur :

```sql
CREATE TABLE app_config (
  key        VARCHAR(128) PRIMARY KEY,
  value      TEXT NULL,
  updated_at TIMESTAMP DEFAULT now()
);
```

Trois clés sont utilisées : `obligate_config` (JSON), `obligate_enabled` (`'true'`/`'false'`), `smtp_config` (JSON). Les secrets (clé API Obligate, mot de passe SMTP) sont donc conservés **en base**, jamais dans le dépôt ni dans un fichier de configuration versionné, et ne transitent jamais vers le client.

## Références

- `server/src/services/appConfig.service.ts`
- `server/src/services/systemInfo.service.ts`
- `server/src/controllers/appConfig.controller.ts`
- `server/src/routes/appConfig.routes.ts`
- `server/src/middleware/rbac.ts` (`requirePlatformAdmin`)
- `server/src/db/migrations/007_create_app_config.ts`
- `shared/src/config.ts`
- `client/src/pages/SettingsPage.tsx`
- `client/src/pages/WorkspacesPage.tsx`
- `client/src/App.tsx` (`PlatformAdminRoute`)
