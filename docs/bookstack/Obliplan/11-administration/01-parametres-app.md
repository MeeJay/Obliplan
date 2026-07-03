La configuration globale d'Obliplan (à propos, e-mail SMTP, passerelle SSO Obligate) est regroupée dans deux écrans réservés à l'administrateur **de la plateforme** : **Paramètres** (`/settings`) et **Espaces de travail** (`/workspaces`). Ces réglages ne sont **jamais** stockés dans le dépôt : ils vivent en base, dans la table `app_config`.

## Qui peut y accéder

Ces deux écrans sont réservés au **platform admin** (system admin), et non au simple administrateur de tenant.

- **Côté client**, les routes `/settings` et `/workspaces` sont enveloppées dans `PlatformAdminRoute`, qui redirige vers l'accueil si `isPlatformAdmin()` est faux. Les entrées « Paramètres » et « Workspaces » de la barre latérale ne s'affichent qu'à ce profil (`platform: true`).
- **Côté serveur**, le routeur `admin/config` applique `requireAuth` puis `requirePlatformAdmin()`. Ce garde vérifie le drapeau réel `session.platformAdmin` (et non le rôle effectif par tenant), afin qu'un simple administrateur de tenant ne puisse pas lire ni modifier des réglages inter-tenants. En cas d'échec : `403 « Réservé aux administrateurs de la plateforme »`.

> Un administrateur de tenant gère ses salariés, contrats, permissions, modules et clients (voir les autres pages de ce chapitre), mais pas la configuration globale de l'instance.

## Écran « Paramètres » (`/settings`)

La page `SettingsPage` regroupe quatre sections : À propos, Serveur SMTP, Obligate SSO Gateway et Jours fériés.

### À propos / informations système

La section « À propos » affiche l'état de l'instance, fourni par `systemInfoService.get()` (endpoint `GET /admin/config/system`). Aucune de ces valeurs n'est configurable : ce sont des mesures lues au moment de l'appel.

| Champ | Source | Détail |
|-------|--------|--------|
| `appVersion` | `package.json` du serveur (`version`) | Version du serveur ; repli sur `dev` si illisible |
| `nodeVersion` | `process.version` | Version de Node.js |
| `uptimeSeconds` | `process.uptime()` | Durée de fonctionnement du process |
| `environment.isDocker` | présence de `/.dockerenv` | Affiché `Docker` ou `Natif` |
| `environment.platform` | `os.type()` / `os.release()` / `process.arch` | Système et architecture |
| `environment.dbStatus` | `select 1` sur PostgreSQL | `ok` (connectée) ou `error` |
| `cpu.cores` | `os.cpus().length` | Nombre de cœurs |
| `cpu.loadAvg1` / `loadAvg5` / `loadAvg15` | `os.loadavg()` | Charge moyenne 1 / 5 / 15 min |
| `memory.processRssMb` / `processHeapMb` | `process.memoryUsage()` | RSS et heap utilisé du process (Mo) |
| `memory.systemFreeMb` / `systemTotalMb` | `os.freemem()` / `os.totalmem()` | Mémoire système libre / totale (Mo) |

> La version du client est affichée séparément à partir de la constante de build `__APP_VERSION__`, indépendamment du serveur.

### Passerelle Obligate SSO

Connecte l'instance à une passerelle SSO Obligate (authentification centralisée et navigation inter-applications). La configuration se compose de trois éléments : l'URL de la passerelle, la clé API et l'activation.

Endpoints (platform admin) :

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/admin/config/obligate` | Vue publique : `{ url, apiKeySet, enabled }` |
| `PATCH` | `/admin/config/obligate` | Met à jour l'URL, la clé API et/ou l'activation |

La vue publique ne renvoie **jamais** la clé en clair : elle expose seulement `apiKeySet` (booléen). Dans l'interface, l'URL est enregistrée à la perte de focus si elle a changé ; la clé API n'est enregistrée que lorsqu'une valeur non vide est saisie (la précédente est conservée sinon) ; l'interrupteur d'activation n'apparaît qu'une fois l'URL et la clé renseignées.

Stockage en base (`app_config`) :

| Clé `app_config` | Valeur | Contenu |
|------------------|--------|---------|
| `obligate_config` | JSON `{ url, apiKey }` | URL de la passerelle et clé API (secret) |
| `obligate_enabled` | `'true'` / `'false'` | Activation du SSO |

> Une fois le SSO activé, la page de connexion redirige vers Obligate et l'authentification locale est désactivée ; les utilisateurs sont provisionnés à la première connexion. Si la passerelle devient injoignable, l'authentification locale est automatiquement rétablie en secours. La clé se génère dans Obligate (**Connected Apps → Add App**).

### SMTP / e-mail

Serveur d'envoi utilisé pour les notifications (demandes de congé, validations, affectations…).

Endpoints (platform admin) :

| Méthode | Route | Rôle |
|---------|-------|------|
| `GET` | `/admin/config/smtp` | Vue publique : `{ host, port, secure, user, fromAddress, passSet }` |
| `PATCH` | `/admin/config/smtp` | Met à jour la configuration SMTP |
| `POST` | `/admin/config/smtp/test` | Envoie un e-mail de test à `{ to }` |

Comme pour Obligate, la vue publique n'expose jamais le mot de passe : seul `passSet` (booléen) indique qu'il est défini. Un `PATCH` ne remplace le mot de passe que si une valeur non vide est fournie. Le test d'envoi renvoie `{ ok, error? }`.

Champs de configuration :

| Champ | Type | Note |
|-------|------|------|
| `host` | chaîne | Hôte SMTP (p. ex. `smtp.example.com`) |
| `port` | entier | Port (587 par défaut dans le formulaire) |
| `secure` | booléen | TLS |
| `user` | chaîne | Utilisateur d'authentification |
| `pass` | secret | Mot de passe (jamais renvoyé) |
| `fromAddress` | chaîne | Adresse d'expéditeur (p. ex. `no-reply@example.com`) |

Stockage en base : clé `smtp_config` de `app_config`, au format JSON `{ host, port, secure, user, pass, fromAddress }`.

> La section « Jours fériés » du même écran ne relève pas de la configuration de plateforme : elle est pilotée par la capacité `planning:write` et gère les jours fériés nationaux et personnalisés. Voir le chapitre « Congés ».

## Écran « Espaces de travail » (`/workspaces`)

La page `WorkspacesPage` (platform admin) permet de créer, renommer et supprimer des espaces de travail (tenants), de gérer leurs membres et d'activer/désactiver leurs modules. Les endpoints correspondants (`/tenants/all`, `/tenants`, `/tenants/:id/members`, `/tenants/:id/modules`) sont tous protégés par `requirePlatformAdmin()`. L'espace de travail dont le `slug` est `default` ne peut pas être supprimé.

L'activation des modules par tenant est détaillée dans « Activation des modules par tenant ».

## Où sont stockés les réglages

Tous ces réglages persistent dans la table `app_config` (paire clé/valeur, `insert(...).onConflict('key').merge(...)`), accessible via `appConfigService.get(key)` / `set(key, value)`. Les secrets (clé API Obligate, mot de passe SMTP) sont conservés en base et ne sont jamais renvoyés en clair par l'API ni versionnés dans le dépôt.

## Références

- `server/src/services/appConfig.service.ts`
- `server/src/services/systemInfo.service.ts`
- `server/src/routes/appConfig.routes.ts`
- `server/src/middleware/rbac.ts` (`requirePlatformAdmin`)
- `shared/src/config.ts` (`ObligateConfig`, `SmtpConfig`, `SystemInfo`)
- `client/src/pages/SettingsPage.tsx`
- `client/src/pages/WorkspacesPage.tsx`
- `client/src/api/index.ts` (`appConfigApi`, `tenantApi`, `moduleApi`)
