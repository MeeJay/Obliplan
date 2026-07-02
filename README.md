# Obliplan

Module de **gestion du temps de travail** de la suite Obli (licence ELv2) : planning des
salariés, suivi du temps réalisé vs contrat, et gestion des **récupérations**. Multi-tenant,
SSO délégué à **Obligate**.

> Stack alignée sur l'écosystème Obli (Obliview/Obliance) : **Node 24 + TypeScript + Express +
> PostgreSQL** côté serveur, **React 18 + Vite + Tailwind + Zustand** côté client, monorepo npm
> workspaces, Docker Compose. (Le brief initial mentionnait PHP/Vue/MariaDB ; on s'est aligné sur
> la suite pour réutiliser auth, design system et conventions.)

## Architecture

```
obliplan/
├── shared/        @obliplan/shared — types domaine partagés serveur+client
├── server/        API REST Express + Knex (PostgreSQL)
│   └── src/
│       ├── routes/ controllers/ services/   couches métier
│       ├── middleware/    auth, tenant, rbac, validate, errorHandler
│       └── db/migrations/ db/seeds/          schéma + données de démo
├── client/        SPA React (Vite) — design system Obli (tokens CSS + Tailwind)
└── docker-compose.yml   postgres + server + client
```

## Démarrage rapide (Docker)

```bash
cp .env.example .env          # ajuste SESSION_SECRET, DB_PASSWORD…
docker compose up -d --build
# client : http://localhost:3002   (API proxyfiée sur /api)
```

Au premier démarrage le serveur applique les migrations et crée l'admin local
(`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`).

### Données de démo

```bash
docker compose exec server npm run seed
```

Crée le tenant **Demo SARL** avec (mot de passe : `demo1234`) :

| Login     | Rôle     | Contrat                         | Particularité                         |
|-----------|----------|---------------------------------|---------------------------------------|
| `manager` | manager  | —                               | encadre les 3 salariés                |
| `alice`   | employe  | 35h sans heures sup             | 36h réalisées → 1h **récup éligible** |
| `bob`     | employe  | 39h avec heures sup             | 40h réalisées → 1h **heures sup**     |
| `chloe`   | employe  | Alternance 35h                  | jeu/ven école → attendu **21h**       |

## Développement local

```bash
npm install
npm run build:shared
# Terminal 1 — API (port 3003), nécessite un PostgreSQL accessible via DATABASE_URL
npm run dev:server
# Terminal 2 — front (port 5173, proxy /api → 3003)
npm run dev:client
```

## Authentification

Deux modes, bascule stockée en base (`app_config.obligate_enabled`) — pas en variable d'env :

- **Local** (par défaut tant qu'Obligate n'est pas configuré) : identifiant/mot de passe,
  bcrypt, sessions PostgreSQL (`connect-pg-simple`).
- **SSO Obligate** : flux OAuth délégué.
  1. `GET /auth/sso-redirect` → redirige vers `…/authorize?client_id=<API_KEY>&redirect_uri=…&state=…`
  2. `GET /auth/callback` → échange le code (`POST {obligate}/api/oauth/token/exchange`, `Bearer <API_KEY>`),
     provisionne/lie l'utilisateur local, synchronise les rôles par tenant.
  - Endpoints inverses exposés (Bearer = notre API key) : `GET /api/auth/app-info`,
    `GET /api/auth/dashboard-stats`, `POST /api/auth/sso-user-sync`.
  - Configuration **dans l'app** : `Administration → Paramètres → Obligate SSO Gateway`
    (URL + clé API + activation). Stockée en base (`app_config`), jamais dans le repo.

### Enregistrer Obliplan comme app connectée dans Obligate

1. Dans Obligate : **Connected Apps → Add App** avec
   - `app_type` (slug) : **`obliplan`**
   - `name` : **Obliplan**
   - `base_url` : URL publique de l'instance (ex. `http://localhost:3002`)
   - `color` : **`#7c6cff`** (accent de marque)
2. Récupérer l'`api_key` générée (affichée une seule fois).
3. Dans Obliplan : `Paramètres → Obligate SSO Gateway` → coller l'URL Obligate + la clé API → **Activer le SSO**.
4. Mapper les rôles dans Obligate (Permission Groups) : Obliplan expose `admin`, `manager`, `employe`.

Contrat OAuth vérifié contre `D:\Obligate` : redirection `GET {obligate}/authorize?client_id&redirect_uri&state`,
échange `POST {obligate}/api/oauth/token/exchange` (Bearer api_key) → `TokenExchangeResponse`
`{ obligateUserId, username, email, displayName, role, tenants:[{slug,role}], teams, authSource, linkedLocalUserId }`.

## Rôles

| Rôle      | Périmètre                                                                      |
|-----------|--------------------------------------------------------------------------------|
| `employe` | consulte **son** planning + ses compteurs (réalisé/attendu, écart, solde récup)|
| `manager` | + grille équipe, crée/édite/valide les shifts de ses salariés, attribue récup  |
| `admin`   | + gestion des salariés et des contrats (scope tenant ; god view sur master)    |

## Modèle de données (le contrat est central)

- **contrats** — `heures_hebdo_base_min`, `heures_sup_autorisees`, `seuil_heures_sup_min`, `alternance`.
- **users** — `tenant_id`, `role`, `contrat_id`, `manager_id`, champs SSO.
- **shifts** — `date`, `heure_debut/fin`, `pause_min`, `type` (travail|repos|recup|conge|absence|ecole),
  `statut` (brouillon|valide), traçabilité `created_by/updated_by`.
- **jours_ecole** — date ponctuelle **ou** weekday récurrent (alternance).
- **recup_mouvements** — `semaine`, `heures_min`, `sens` (credit|debit), `motif`, tracé.
- Compteurs **calculés** (jamais stockés), cf. `services/calc.service.ts`.

### Règles métier

- Réalisé = Σ(fin − début − pause) des shifts `type=travail` **validés**.
- Attendu = base du contrat − (jours d'école de la semaine × base/5).
- Dépassement (réalisé > attendu) :
  - contrat **sans** heures sup → **récup éligible** (attribution **manuelle** par le manager, tracée).
  - contrat **avec** heures sup → comptabilisé en **heures sup** (au-delà du seuil si défini).
- `type=ecole` neutre sur le réalisé, réduit l'attendu ; `recup`/`repos` n'est pas du travail.
- Isolation tenant systématique (`req.tenantId` issu de la session) sur chaque requête.

## API (tenant-scopée sauf `/auth` et `/tenants`)

| Méthode & route                    | Rôle min | Description                              |
|------------------------------------|----------|------------------------------------------|
| `POST /api/auth/login` `/logout`   | —        | auth locale                              |
| `GET  /api/auth/me`                | auth     | session + tenants                        |
| `GET  /api/tenants` · `POST /api/tenant/switch` | auth | tenants accessibles / bascule |
| `GET  /api/planning/me?week=`      | employe  | ma semaine + compteur + solde            |
| `GET  /api/planning/week?userId=&week=` | self/mgr | semaine d'un salarié               |
| `GET  /api/planning/team?week=`    | manager  | grille équipe (1 salarié/ligne)          |
| `GET/POST/PUT/DELETE /api/shifts`  | manager  | CRUD shifts (création/validation)        |
| `GET/POST/DELETE /api/jours-ecole` | manager  | jours d'école                            |
| `GET/POST/DELETE /api/recup`       | manager  | mouvements + solde, attribution          |
| `GET/POST/PUT/DELETE /api/contrats`| admin    | paramétrage des contrats                 |
| `GET/PUT /api/users`               | mgr/admin| salariés (contrat, manager, rôle)        |
| `GET/POST/PUT/DELETE /api/boards`  | auth     | Kanban/Scrum perso (colonnes, sprints, cartes) |
| `GET/POST/PUT/DELETE /api/todos`   | auth     | todo list personnelle                    |

Enveloppe JSON : `{ "success": true, "data": … }` / `{ "success": false, "error": … }`.

## Hors-scope MVP (prévu architecturalement, non implémenté)

- Annualisation / modulation pluri-hebdomadaire.
- Valorisation € des heures sup (on compte, on ne valorise pas).
- Notifications / emails.

## Gestion de projet interne (par équipier)

Chaque utilisateur dispose, en plus du planning, d'un espace de gestion de projet :

- **Kanban/Scrum** (`Mes projets`) : tableaux personnels avec colonnes (À faire / En cours /
  Terminé par défaut), cartes (priorité, points, échéance, description), **drag-and-drop** entre
  colonnes, limites WIP, et **sprints** (filtre backlog / sprint).
- **Todo list** (`Mes tâches`) : liste personnelle simple (échéance, coché/décoché).

Données scopées tenant + utilisateur ; accès restreint au propriétaire (ou admin du tenant).

## Variables d'environnement

Voir `.env.example`. Principales : `DATABASE_URL`, `SESSION_SECRET`, `CLIENT_ORIGIN`,
`FORCE_HTTPS`, `DEFAULT_ADMIN_USERNAME/PASSWORD`, `PORT` (3003).

## Release (`000-RegularUpdate.bat` / `001-PromoteToProd.bat`)

`000-RegularUpdate.bat` (Windows) automatise le cycle dev :

1. **PHASE 0** — initialise le dépôt git local au besoin, **refuse de continuer si un
   `.env` est suivi par git** (garde-fou anti-fuite), crée le dépôt **GitHub public** et les
   dépôts **Docker Hub publics** s'ils n'existent pas, configure `origin`.
2. Bump des versions `server` / `client` (patch/minor/major).
3. `docker build` + `push` des images `meejay/obliplan-{server,client}:dev` (daemon distant).
4. `git commit` + `push` sur `origin/dev`.

`001-PromoteToProd.bat` : merge `dev` → `main` (fast-forward), retag `:dev` → `:latest` +
`:version`, push.

### Identifiants (jamais stockés dans le dépôt)

La création automatique des dépôts lit ces variables **depuis ton shell** (rien n'est écrit
dans les scripts ni committé) ; sans elles, l'étape de création est simplement ignorée :

```bat
set GITHUB_TOKEN=ghp_...           REM PAT scope "repo" — crée le dépôt GitHub public
set DOCKERHUB_USER=meejay
set DOCKERHUB_TOKEN=dckr_pat_...    REM PAT/mot de passe — force les dépôts Docker Hub en public
```

Les `git push` / `docker push` réutilisent tes identifiants déjà configurés (Git Credential
Manager / `docker login`). `.env` est dans `.gitignore` **et** `.dockerignore` ; l'API key
Obligate vit en base (`app_config`), jamais dans le dépôt ni dans les images.
