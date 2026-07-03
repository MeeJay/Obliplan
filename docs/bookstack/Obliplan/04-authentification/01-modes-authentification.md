Obliplan propose deux modes d'authentification qui coexistent : une authentification **locale** (identifiant / mot de passe) et un **SSO délégué à Obligate**. Le mode actif n'est pas figé dans une variable d'environnement mais stocké en base, ce qui permet de basculer l'instance sans redéploiement. Cette page décrit le mode local, la gestion des sessions et le mécanisme de repli `X-Auth-Token` utilisé dans les contextes iframe.

## Deux modes, bascule en base

La bascule entre authentification locale et SSO Obligate est stockée dans la table `app_config`, pas dans l'environnement :

| Clé `app_config` | Contenu | Rôle |
|------------------|---------|------|
| `obligate_enabled` | `'true'` \| `'false'` | Active/désactive le SSO Obligate |
| `obligate_config` | JSON `{ url, apiKey }` | URL de la passerelle + clé API (secret) |

Tant qu'Obligate n'est ni configuré ni activé (`obligate_enabled` différent de `'true'`, ou URL / clé API absentes), l'instance reste en **mode local**. La page de connexion interroge `GET /api/auth/sso-config` pour décider d'afficher, ou non, le bouton SSO.

> La configuration de la passerelle (URL + clé API + activation) se fait dans l'application, via `Administration → Paramètres → Obligate SSO Gateway`. Voir « Enregistrer Obliplan dans Obligate » et « SSO Obligate : flux OAuth détaillé ».

## Mode local : identifiant / mot de passe

L'authentification locale valide le couple `username` / `password` contre la table `users` :

- Seuls les utilisateurs **actifs** (`is_active = true`) peuvent se connecter.
- Les comptes sans empreinte de mot de passe (`password_hash` nul ou vide) sont des comptes **SSO-only** : ils ne peuvent pas se connecter localement.
- Les mots de passe sont hachés avec **bcrypt** (`bcryptjs`, `SALT_ROUNDS = 12`) et comparés via `bcrypt.compare`.

```ts
// server/src/services/auth.service.ts
async authenticate(username, password) {
  const row = await db('users').where({ username, is_active: true }).first();
  if (!row || !row.password_hash) return null; // SSO-only users can't password-login
  const valid = await comparePassword(password, row.password_hash);
  if (!valid) return null;
  return rowToUser(row);
}
```

### Amorçage de l'administrateur local

Au premier démarrage, le serveur crée l'administrateur local si aucun compte `role='admin'` n'existe, à partir des variables `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`. Le compte est rattaché au tenant maître (`MASTER_TENANT_ID = 1`). Un mot de passe faible (`admin123` ou de moins de 12 caractères) déclenche un avertissement dans les logs.

## Sessions PostgreSQL

Les sessions sont persistées dans PostgreSQL via **`connect-pg-simple`** (table `session`), et non en mémoire : elles survivent aux redémarrages du serveur et fonctionnent en multi-instances.

```ts
// server/src/app.ts
const sessionStore = new PgSession({
  conString: config.databaseUrl,
  tableName: 'session',
  createTableIfMissing: false, // la table est créée par une migration
});
```

Options de session : `resave: false`, `saveUninitialized: false`, secret issu de `SESSION_SECRET`.

### Cookie de session

Le cookie `connect.sid` porte l'identifiant de session. Ses attributs dépendent de `FORCE_HTTPS` (variable d'environnement lue dans `config.forceHttps`) :

| Attribut | Valeur | Détail |
|----------|--------|--------|
| `httpOnly` | `true` | Toujours ; le cookie n'est jamais lisible en JavaScript |
| `secure` | `config.forceHttps` | `true` derrière un reverse-proxy HTTPS |
| `sameSite` | `'none'` si `FORCE_HTTPS`, sinon `'lax'` | `None` requis pour l'iframe cross-site / OAuth |
| `partitioned` | `config.forceHttps` | Cookie partitionné (CHIPS) en contexte cross-site |
| `maxAge` | `config.sessionMaxAge` = **7 jours** (`604800000` ms) | Durée de vie de la session |

> `SameSite=None`, `Secure` et `Partitioned` vont de pair : ils ne sont activés qu'avec `FORCE_HTTPS=true`, condition nécessaire pour que le cookie survive dans un iframe cross-site (shell ObliTools) ou pendant la redirection OAuth. Le serveur fait confiance au premier hop du reverse-proxy (`app.set('trust proxy', 1)`) et lit `X-Forwarded-Proto` / `X-Forwarded-Host`.

Le middleware `helmet` est configuré avec `frameguard: false` afin d'autoriser l'intégration dans un iframe (le shell bureau ObliTools embarque les apps Obli).

## Repli `X-Auth-Token` (contextes iframe cross-site)

Dans un iframe cross-site (shell ObliTools), le navigateur peut **bloquer le cookie** de session. Un mécanisme de repli par en-tête prend alors le relais :

1. À la connexion, `POST /api/auth/login` renvoie `sessionToken`, qui vaut l'identifiant de session (`req.sessionID`).
2. Le client détecte l'exécution en iframe (`window !== window.top`), stocke le jeton en `sessionStorage` (clé `obliplan_auth_token`) et l'envoie à chaque requête dans l'en-tête **`X-Auth-Token`**.
3. Côté serveur, un middleware réhydrate `req.session` depuis le store lorsque le cookie est absent.

```ts
// server/src/app.ts — réhydratation depuis le store
app.use((req, _res, next) => {
  if (req.session?.userId) return next();       // cookie présent : rien à faire
  const token = req.headers['x-auth-token'];
  if (!token || typeof token !== 'string') return next();
  sessionStore.get(token, (err, sessionData) => {
    if (!err && sessionData) {
      // recopie userId, username, role, platformAdmin, currentTenantId
    }
    next();
  });
});
```

Côté client, le jeton n'est stocké et envoyé **que** si l'application tourne en iframe ; sur une réponse `401` en iframe, le jeton est purgé de `sessionStorage`.

```ts
// client/src/api/client.ts
apiClient.interceptors.request.use((config) => {
  if (isInIframe) {
    const token = sessionStorage.getItem(TOKEN_KEY); // 'obliplan_auth_token'
    if (token) config.headers['X-Auth-Token'] = token;
  }
  return config;
});
```

## Endpoints d'authentification

Montés sous `/api/auth` :

| Méthode & route | Auth | Description |
|-----------------|------|-------------|
| `POST /api/auth/login` | — | Auth locale ; renvoie `{ user, sessionToken }` |
| `POST /api/auth/logout` | — | Détruit la session, efface le cookie `connect.sid` |
| `GET /api/auth/me` | requise | Session courante : `SessionInfo` (voir ci-dessous) |
| `GET /api/auth/sso-config` | publique | Indique à la page de login si le SSO est disponible |
| `GET /api/auth/connected-apps` | requise | Apps Obli accessibles (sélecteur d'app d'en-tête) |

La réponse de `GET /api/auth/me` est un objet `SessionInfo` :

```json
{
  "user": { "id": 1, "username": "admin", "role": "admin", "...": "..." },
  "currentTenantId": 1,
  "tenants": [ { "id": 1, "slug": "master", "role": "admin" } ],
  "capabilities": ["planning:read_team", "planning:write", "..."],
  "modules": ["recup", "conges", "..."],
  "platformAdmin": true
}
```

Le champ `user.role` renvoyé par `/me` est le **rôle effectif dans le tenant actif** (voir « RBAC : capacités, permission sets & rôles »), pas nécessairement le rôle global stocké sur `users.role`.

### Contenu de la session

La session côté serveur porte les champs suivants (déclarés dans `middleware/auth.ts`) :

| Champ | Type | Rôle |
|-------|------|------|
| `userId` | number | Utilisateur connecté |
| `username` | string | Identifiant |
| `role` | string | Rôle **effectif** dans le tenant actif (`'admin'` pour un platform admin) |
| `platformAdmin` | boolean | Vrai administrateur de plateforme (`users.role='admin'`) — pilote la God View |
| `currentTenantId` | number | Tenant actif |
| `oauthState` | string ? | Anti-CSRF du flux OAuth Obligate |
| `requestedTenantSlug` | string ? | Tenant demandé lors d'un handoff cross-app |

## Références

- `server/src/app.ts`
- `server/src/config.ts`
- `server/src/services/auth.service.ts`
- `server/src/controllers/auth.controller.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/middleware/auth.ts`
- `server/src/utils/crypto.ts`
- `server/src/services/appConfig.service.ts`
- `client/src/api/client.ts`
- `client/src/store/authStore.ts`
- `shared/src/types.ts` (`SsoConfig`, `SessionInfo`, `LoginRequest`)
