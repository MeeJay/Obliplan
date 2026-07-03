Obliplan est un dépôt **monorepo npm workspaces** organisé en trois paquets — `shared/`, `server/` et `client/` — orchestrés par Docker Compose. La stack est délibérément alignée sur l'écosystème Obli (Obliview / Obliance) afin de réutiliser l'authentification, le design system et les conventions de la suite.

## Vue d'ensemble

```
obliplan/
├── shared/        @obliplan/shared — types domaine partagés serveur + client
├── server/        API REST Express + Knex (PostgreSQL)
├── client/        SPA React (Vite) — design system Obli (tokens CSS + Tailwind)
└── docker-compose.yml   postgres + server + client
```

Le dépôt racine (`package.json`) déclare le champ `workspaces` :

```json
"workspaces": ["shared", "server", "client"]
```

Chaque paquet a sa propre version (`server` et `client` sont versionnés ensemble, `shared` séparément) ; le paquet racine est privé et sert de point d'entrée aux scripts et à Docker.

## Stack serveur

| Élément | Choix | Version (package.json) |
|---|---|---|
| Runtime | Node.js | 24 (image Docker `node:24-alpine`) |
| Langage | TypeScript | `^5.4.0` |
| Framework HTTP | Express | `^4.18.2` |
| Query builder / migrations | Knex | `^3.1.0` |
| Base de données | PostgreSQL (driver `pg`) | `^8.12.0` |
| Sessions | `express-session` + `connect-pg-simple` | `^1.18.0` / `^9.0.1` |
| Sécurité HTTP | `helmet`, `cors`, `cookie-parser` | `^7.1.0` / `^2.8.5` / `^1.4.6` |
| Limitation de débit | `express-rate-limit` | `^7.2.0` |
| Validation | `zod` | `^3.22.4` |
| Hachage mots de passe | `bcryptjs` | `^2.4.3` |
| E-mail | `nodemailer` | `^9.0.3` |
| Notifications Web Push | `web-push` | `^3.6.7` |
| Journalisation | `pino` / `pino-pretty` | `^8.19.0` / `^11.0.0` |
| Env | `dotenv` | `^17.3.0` |

> En développement, le serveur tourne via `tsx watch src/index.ts` (rechargement à chaud) ; en production, `tsc` compile vers `dist/` et le point d'entrée est `dist/src/index.js`.

## Stack client

| Élément | Choix | Version (package.json) |
|---|---|---|
| Bibliothèque UI | React | `^18.3.1` |
| Bundler / dev server | Vite | `^5.1.0` |
| CSS utilitaire | Tailwind CSS | `^3.4.1` |
| État global | Zustand | `^4.5.0` |
| Routage | `react-router-dom` | `^6.22.0` |
| Client HTTP | `axios` | `^1.6.7` |
| Notifications (toasts) | `react-hot-toast` | `^2.4.1` |
| Icônes | `lucide-react` | `^0.344.0` |
| Fusion de classes | `clsx` / `tailwind-merge` | `^2.1.0` / `^2.2.0` |

Le client est une **SPA** : Vite construit un bundle statique servi par Nginx en production, avec les appels `/api` proxyfiés vers le serveur (voir « Architecture serveur (couches & middleware) »).

## Le paquet partagé `@obliplan/shared`

`@obliplan/shared` centralise les **types du domaine** consommés par le serveur *et* le client (mêmes formes camelCase de part et d'autre). Le serveur mappe les lignes SQL `snake_case` vers ces types via des helpers `rowToX`.

- `shared/src/index.ts` réexporte les modules du domaine : `types`, `tenants`, `kanban`, `tasks`, `client`, `config`, `leave`, `hourtype`, `timetracking`, `overtime`, `permissions`, `teams`, `modules`, `notification`, `compliance`, `holiday`, `reporting`, `planningImport`, `planningViews`, `booking`.
- Le paquet est compilé avec `tsc` (`main: dist/index.js`, `types: dist/index.d.ts`).
- En dev, le client résout `@obliplan/shared` directement vers les sources (`../shared/src`) via un alias Vite ; le serveur consomme le `dist/` compilé (`npm run build:shared` requis avant `dev:server`).

Exemples de contrats partagés clés : l'enveloppe `ApiResponse<T>`, l'énumération `UserRole` (`admin | manager | employe`), `ModuleKey` (catalogue des modules) et `SessionInfo` (charge utile de `/auth/me`).

## Scripts npm racine

```bash
# Build (ordre imposé : shared d'abord, car server et client en dépendent)
npm run build            # = build:shared && build:server && build:client
npm run build:shared
npm run build:server
npm run build:client

# Développement (deux terminaux)
npm run dev:server       # API sur le port 3003 (tsx watch)
npm run dev:client       # front sur le port 5173 (proxy /api → 3003)

# Base de données
npm run migrate          # knex migrate:latest
npm run seed             # données de démo (tenant « Demo SARL »)

# Docker
npm run docker:up        # docker compose up -d --build
npm run docker:down      # docker compose down
npm run docker:logs      # docker compose logs -f
```

## Docker Compose

Trois services (`docker-compose.yml`) :

| Service | Image | Rôle |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Base de données (volume `postgres_data`), healthcheck `pg_isready` |
| `server` | `meejay/obliplan-server` | API Node/Express, `PORT=3003`, healthcheck sur `/health` |
| `client` | `meejay/obliplan-client` | Nginx servant le bundle React, exposé sur `${LISTEN_PORT:-3002}:80` |

Le service `client` dépend du `server` (condition `service_healthy`), lui-même dépendant de `postgres`. Au premier démarrage, le serveur applique automatiquement les migrations puis provisionne le tenant maître et l'admin local (`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`). Les images de production sont bâties en multi-étapes à partir de `node:24-alpine` (voir `server/Dockerfile` et `client/Dockerfile`).

## Note : pivot depuis le brief initial

Le brief d'origine évoquait une stack **PHP / Vue / MariaDB**. Le projet s'est finalement aligné sur l'écosystème Obli (Node / TypeScript / Express / PostgreSQL côté serveur, React / Vite / Tailwind / Zustand côté client) afin de **réutiliser l'authentification (SSO Obligate), le design system et les conventions** de la suite. Ce choix est documenté en tête du `README.md` :

> Stack alignée sur l'écosystème Obli (Obliview / Obliance) […]. (Le brief initial mentionnait PHP/Vue/MariaDB ; on s'est aligné sur la suite pour réutiliser auth, design system et conventions.)

## Références

- `package.json` (workspaces + scripts racine)
- `docker-compose.yml`
- `server/package.json`, `server/Dockerfile`
- `client/package.json`, `client/Dockerfile`, `client/vite.config.ts`
- `shared/package.json`, `shared/src/index.ts`
- `README.md` (note de pivot)
