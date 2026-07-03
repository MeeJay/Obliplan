Cette page recense toutes les variables d'environnement lues par Obliplan, avec leur rôle, leur valeur par défaut et leur caractère requis ou optionnel. Les sources faisant foi sont `.env.example`, `docker-compose.yml`, `server/src/config.ts` (lecture applicative) et `server/src/env.ts` (chargement du fichier `.env`).

## Comment les variables sont chargées

Le serveur charge le fichier `.env` au démarrage (`server/src/env.ts`) : d'abord depuis le répertoire de travail courant, puis depuis le dossier parent. Les valeurs sont ensuite normalisées dans `server/src/config.ts`, qui définit les valeurs de repli côté code. En Docker, `docker-compose.yml` injecte ses propres valeurs (parfois différentes des valeurs de repli du code).

> Certaines valeurs par défaut diffèrent entre le code (`config.ts`) et Compose. Les colonnes ci-dessous indiquent la valeur de repli **du code** ; les écarts notables sont signalés en notes.

## Tableau de référence

| Variable                 | Rôle                                                                 | Défaut (code)                       | Requis        |
|--------------------------|----------------------------------------------------------------------|-------------------------------------|---------------|
| `OBLIPLAN_VERSION`       | Tag des images Docker Hub `meejay/obliplan-{server,client}`.         | `latest`                            | Non (Compose) |
| `DB_PASSWORD`            | Mot de passe du conteneur PostgreSQL intégré ; injecté dans `DATABASE_URL` côté Compose. | `changeme`         | Recommandé (Compose) |
| `DATABASE_URL`           | Chaîne de connexion PostgreSQL utilisée par le serveur et Knex.      | `postgres://obliplan:changeme@localhost:5432/obliplan` | Oui (hors Compose) |
| `PORT`                   | Port d'écoute HTTP du serveur.                                        | `3003`                              | Non           |
| `NODE_ENV`               | Environnement d'exécution ; `development` active le mode dev (`isDev`). | `development`                     | Non           |
| `SESSION_SECRET`         | Secret de signature des sessions ; sert aussi de repli au journal d'audit. | `dev-secret-change-me`         | Oui (à changer) |
| `CLIENT_ORIGIN`          | Origine autorisée pour CORS.                                          | `http://localhost:5173`             | Recommandé    |
| `LISTEN_PORT`            | Port hôte publié pour le client Nginx (mappé sur le port 80).        | `3002`                              | Non (Compose) |
| `FORCE_HTTPS`            | `true` active les cookies `Secure` + `SameSite=None` + `Partitioned`. | `false`                            | Selon déploiement |
| `APP_NAME`               | Nom d'affichage de l'application.                                     | `Obliplan`                          | Non           |
| `APP_URL`                | URL publique de base (liens ICS, push, e-mails).                     | `http://localhost:5173`             | Recommandé    |
| `DEFAULT_ADMIN_USERNAME` | Identifiant de l'administrateur créé au premier démarrage.           | `admin`                             | Non           |
| `DEFAULT_ADMIN_PASSWORD` | Mot de passe de cet administrateur.                                  | `admin123`                          | Recommandé (à changer) |
| `VAPID_PUBLIC_KEY`       | Clé publique VAPID des notifications Web Push.                       | `''` (vide)                         | Optionnel     |
| `VAPID_PRIVATE_KEY`      | Clé privée VAPID des notifications Web Push.                         | `''` (vide)                         | Optionnel     |
| `VAPID_SUBJECT`          | Contact `mailto:` / `https:` associé aux envois push.               | `mailto:contact@obliplan.app`       | Optionnel     |
| `AUDIT_LOG_SECRET`       | Clé HMAC dédiée au journal d'audit inviolable.                       | `''` → repli sur `SESSION_SECRET`   | Optionnel     |

### Écarts de valeurs par défaut (Compose et `.env.example`)

- `SESSION_SECRET` : repli `dev-secret-change-me` dans le code, `change-this-in-production` dans Compose, exemple `change-this-to-a-random-32-char-secret` dans `.env.example`. À remplacer par un secret aléatoire d'au moins 32 caractères dans tous les cas.
- `CLIENT_ORIGIN` et `APP_URL` : `http://localhost:5173` dans le code (contexte dev Vite), `http://localhost` dans Compose et `.env.example`.
- `VAPID_SUBJECT` : `mailto:contact@obliplan.app` dans le code, `mailto:admin@obliplan.local` dans Compose.
- `APP_NAME` : la valeur est figée à `Obliplan` dans `docker-compose.yml`.

## Variables qui activent ou désactivent une fonctionnalité

### Notifications Web Push (`VAPID_*`)

Les notifications Web Push restent **désactivées** tant que `VAPID_PUBLIC_KEY` **et** `VAPID_PRIVATE_KEY` ne sont pas toutes deux renseignées (`server/src/services/push.service.ts` : `enabled = Boolean(vapidPublicKey && vapidPrivateKey)`).

- Seul le **serveur** a besoin de ces clés ; le navigateur récupère la clé publique à l'exécution via `GET /api/push/public-key`, sans reconstruction du client.
- L'endpoint renvoie `{ publicKey, enabled }` ; quand le push est désactivé, `publicKey` vaut `null` et le client masque l'option d'abonnement.
- Une clé ou un sujet VAPID malformé ne fait pas planter le démarrage : le push est simplement désactivé.
- Générer une paire de clés : `npx web-push generate-vapid-keys`.

### Déploiement HTTPS (`FORCE_HTTPS`)

`FORCE_HTTPS=true` bascule la configuration des cookies de session (`server/src/app.ts`) :

| Attribut du cookie | `FORCE_HTTPS=false` | `FORCE_HTTPS=true` |
|--------------------|---------------------|--------------------|
| `secure`           | `false`             | `true`             |
| `sameSite`         | `lax`               | `none`             |
| `partitioned`      | `false`             | `true`             |
| `httpOnly`         | `true`              | `true`             |

Cette bascule est **requise derrière un reverse proxy HTTPS** : le trio `Secure` + `SameSite=None` + `Partitioned` est nécessaire au callback OAuth Obligate et aux contextes d'iframe ObliTools servis en HTTPS.

### Journal d'audit (`AUDIT_LOG_SECRET`)

Le journal d'audit utilise une chaîne de hachage HMAC pour être inviolable. La clé est prise dans `AUDIT_LOG_SECRET`, avec repli sur `SESSION_SECRET` si elle est vide.

> Cette clé doit rester **stable entre les redémarrages** : si elle change, la vérification d'intégrité des entrées d'audit existantes échoue.

## Note de sécurité

- Le fichier `.env` n'est jamais versionné : il figure dans `.gitignore` **et** dans `.dockerignore` (`**/.env`). Il n'est donc pas embarqué dans les images Docker.
- La **clé API Obligate** (SSO) n'est pas une variable d'environnement : elle est stockée en base de données (`app_config`) et se configure dans l'application (`Administration → Paramètres → Obligate SSO Gateway`). Elle ne vit ni dans le dépôt ni dans les images.
- Changez systématiquement `SESSION_SECRET`, `DB_PASSWORD` et `DEFAULT_ADMIN_PASSWORD` avant tout usage réel.

## Références

- `.env.example`
- `docker-compose.yml`
- `.dockerignore`
- `server/src/config.ts`
- `server/src/env.ts`
- `server/src/app.ts`
- `server/src/services/push.service.ts`
