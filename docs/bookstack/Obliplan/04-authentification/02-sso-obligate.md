Le SSO Obligate est un flux OAuth **délégué** : Obliplan ne gère ni les identifiants ni les mots de passe des utilisateurs SSO, il les fait authentifier par Obligate puis provisionne un compte local à partir de l'assertion reçue. Cette page décrit le flux d'autorisation, l'échange serveur-à-serveur, le provisioning de l'utilisateur, la synchronisation des rôles par tenant, ainsi que les endpoints inverses appelés par Obligate.

## Vue d'ensemble

Trois routes navigateur (hors `/api`, montées sous `/auth`) portent le flux :

| Route | Rôle |
|-------|------|
| `GET /auth/sso-redirect` | Redirection serveur vers la page d'autorisation Obligate |
| `GET /auth/callback` | Réception du `code`, échange, provisioning, ouverture de session |
| `GET /auth/sso-logout` | Déconnexion unique (session locale **et** session Obligate) |

Avant d'afficher le bouton SSO, la page de login appelle `getSsoConfig()`, qui vérifie qu'Obligate est activé et configuré, puis teste la joignabilité de la passerelle via `GET {obligate}/health` (timeout 2 s) :

```ts
// server/src/services/obligate.service.ts
async getSsoConfig(): Promise<SsoConfig> {
  const raw = await appConfigService.getObligateRaw();
  if (!raw.enabled || !raw.url || !raw.apiKey) {
    return { obligateEnabled: false, obligateReachable: false, obligateUrl: raw.url };
  }
  // ping {url}/health (2 s) → obligateReachable
}
```

## Diagramme du flux

```
Navigateur                     Obliplan (server)                 Obligate
    |                                |                               |
 1) |  GET /auth/sso-redirect ------>|                               |
    |                                |  génère state (CSRF)          |
    |                                |  → session.oauthState         |
 2) |  302 vers {obligate}/authorize?client_id=<API_KEY>            |
    |     &redirect_uri=<.../auth/callback>&state=<state> --------->|
    |                                |                               |
 3) |  (l'utilisateur s'authentifie sur Obligate)                   |
    |                                |                               |
 4) |  302 vers {redirect_uri}?code=<code>&state=<state>            |
    |<-----------------------------------------------------------  |
 5) |  GET /auth/callback?code&state->|                             |
    |                                |  vérifie state == oauthState  |
 6) |                                |  POST {obligate}/api/oauth/   |
    |                                |    token/exchange (Bearer     |
    |                                |    API_KEY) ----------------->|
    |                                |<-- TokenExchangeResponse ---- |
 7) |                                |  provisionne/lie l'utilisateur|
    |                                |  synchro rôles par tenant     |
    |                                |  ouvre la session             |
 8) |<-- 302 vers /  ----------------|                               |
```

## Étape 1-2 — Redirection vers l'autorisation

`GET /auth/sso-redirect` :

1. Si un paramètre `?tenant=<slug>` valide (`TENANT_SLUG_RE`) est fourni, il est mémorisé en session (`requestedTenantSlug`) pour un handoff cross-app.
2. Si Obligate n'est pas activé/configuré, redirige vers `/login`.
3. Construit `redirect_uri = {proto}://{host}/auth/callback` (à partir de `X-Forwarded-Proto` / `X-Forwarded-Host`).
4. Génère un `state` aléatoire (`crypto.randomBytes(32).toString('hex')`), le stocke en session (`oauthState`) comme protection anti-CSRF.
5. Après sauvegarde de la session, redirige vers :

```
{obligate}/authorize?client_id=<API_KEY>&redirect_uri=<redirect_uri>&state=<state>
```

> Le `client_id` transmis est la **clé API** Obligate stockée en base. Elle identifie Obliplan auprès d'Obligate.

## Étape 5-6 — Callback et échange du code

`GET /auth/callback?code&state` :

1. Rejette la requête si `code` est absent, ou si `state` ne correspond pas à `session.oauthState` (échec → `/login?error=sso_failed`). Le `state` est ensuite consommé (`delete session.oauthState`).
2. Échange le code contre l'assertion utilisateur, serveur-à-serveur :

```ts
// server/src/services/obligate.service.ts — exchangeCode()
const res = await fetch(`${raw.url}/api/oauth/token/exchange`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${raw.apiKey}` },
  body: JSON.stringify({ code, redirect_uri: redirectUri }),
});
// data.success && data.data → ObligateUserAssertion
```

### Réponse : `TokenExchangeResponse`

Le champ `data` de la réponse est l'assertion utilisateur (`ObligateUserAssertion`) :

| Champ | Type | Description |
|-------|------|-------------|
| `obligateUserId` | number | Identifiant Obligate de l'utilisateur |
| `username` | string | Identifiant Obligate |
| `email` | string \| null | Adresse e-mail |
| `displayName` | string \| null | Nom affiché |
| `role` | string | `'admin'` (tous tenants) \| `'user'` \| rôle custom |
| `tenants` | `{ slug, role }[]` | Appartenances tenant + rôle par tenant |
| `teams` | string[] | Équipes Obligate |
| `authSource` | `'local'` \| `'ldap'` | Source d'authentification côté Obligate |
| `linkedLocalUserId` | number \| null | Id local déjà lié, si connu |
| `preferences` | objet ? | `preferredTheme`, `preferredLanguage`, `profilePhotoUrl` |

## Étape 7 — Provisioning et synchronisation

`provisionObligateUser()` transforme l'assertion en compte local et ouvre la session.

### Rôle applicatif

Le rôle Obligate est réduit à l'un des trois rôles Obliplan (`users.role`) :

```ts
// server/src/routes/obligateCallback.routes.ts — computeAppRole()
if (assertion.role === 'admin') return 'admin';
const roles = assertion.tenants.map((t) => t.role);
if (roles.includes('admin') || roles.includes('manager')) return 'manager';
return 'employe';
```

### Résolution / liaison du compte local

1. Si `linkedLocalUserId` désigne un compte **non anonymisé**, il est réutilisé.
2. Sinon, on cherche une liaison dans `sso_foreign_users` (`foreign_source='obligate'`, `foreign_user_id=obligateUserId`).
3. Sinon, un nouveau compte est créé.

> Un compte **anonymisé** (effacé RGPD) est traité comme absent : il n'est jamais ré-provisionné silencieusement. Un salarié qui revient obtient un compte neuf plutôt que la résurrection du compte effacé.

À la **création**, l'utilisateur reçoit `username = og_<username>`, `password_hash = null` (compte SSO-only), `foreign_source='obligate'`, `foreign_id=obligateUserId`, le rôle calculé, la langue et l'avatar issus des préférences. Une liaison est écrite dans `sso_foreign_users`, et Obliplan notifie Obligate en best-effort (`POST {obligate}/api/apps/report-provision`).

À chaque **connexion ultérieure**, Obligate reste propriétaire de l'identité : `email`, `display_name` et `role` sont resynchronisés (**promotion ET rétrogradation**). L'avatar n'est touché que si l'assertion en fournit un ; le thème n'est appliqué que s'il fait partie des thèmes rendus par Obliplan (`obli-operator`, `obli-daylight`, `modern`, `neon`).

### Synchronisation des rôles par tenant

Pour chaque entrée `assertion.tenants[]` dont le `slug` correspond à un tenant existant, la table `user_tenants` est mise à jour (upsert) avec le rôle fourni (à défaut, `employe`). Un administrateur tous-tenants (`appRole === 'admin'`) se voit en plus garantir une appartenance `admin` au tenant maître (atterrissage God View).

Le tenant actif de la session est résolu ainsi : `requestedTenantSlug` (handoff cross-app) → sinon premier tenant accessible → sinon tenant maître. Le rôle effectif de session est calculé pour ce tenant (`'admin'` si platform admin).

## Déconnexion unique

`GET /auth/sso-logout` détruit la session locale, efface le cookie `connect.sid`, puis redirige vers `{obligate}/logout?redirect_uri=<.../login>` afin de fermer aussi la session Obligate. Côté client, la déconnexion d'un utilisateur SSO (`foreignSource === 'obligate'`) passe systématiquement par cette route.

## Endpoints inverses (Obligate → Obliplan)

Obligate appelle Obliplan sur des endpoints protégés par la **même clé API**, présentée en `Bearer` et validée contre la clé stockée (`verifyInboundBearer`). Ils sont montés sous `/api/auth`.

| Méthode & route | Description |
|-----------------|-------------|
| `GET /api/auth/app-info` | Rôles, équipes, tenants et permission sets pour l'UI de mapping Obligate |
| `GET /api/auth/dashboard-stats` | Statistiques affichées sur le tableau de bord Obligate |
| `POST /api/auth/sso-user-sync` | Obligate pousse un changement d'état utilisateur |

`GET /api/auth/app-info` renvoie notamment `roles: ['admin', 'manager', 'employe']`, la liste des tenants (`slug`, `name`) et celle des permission sets (`slug`, `name`).

`GET /api/auth/dashboard-stats` renvoie deux compteurs : nombre de salariés actifs et nombre de shifts.

`POST /api/auth/sso-user-sync` attend `{ remoteUserId, action, role? }` où `action` vaut :

| `action` | Effet sur le compte local |
|----------|---------------------------|
| `deactivate` | `is_active = false` |
| `reactivate` | `is_active = true` |
| `delete` | Supprime la liaison `sso_foreign_users` puis le compte `users` |
| `update-role` | Met à jour `users.role` (mappé sur `admin` / `manager` / `employe`) |

> En sens sortant, Obliplan appelle aussi `GET {obligate}/api/apps/connected` (avec `Bearer <API_KEY>`) pour alimenter le sélecteur d'applications Obli de l'en-tête, en le restreignant aux permissions Obligate de l'utilisateur lorsqu'un `obligateUserId` est connu.

## Références

- `server/src/routes/obligateCallback.routes.ts`
- `server/src/routes/obligate.routes.ts`
- `server/src/services/obligate.service.ts`
- `server/src/services/appConfig.service.ts`
- `server/src/app.ts` (montage `/auth` du callback)
- `server/src/routes/index.ts` (montage `/api/auth` des endpoints inverses)
- `shared/src/types.ts` (`SsoConfig`), `shared/src/tenants.ts` (`TENANT_SLUG_RE`, `MASTER_TENANT_ID`)
