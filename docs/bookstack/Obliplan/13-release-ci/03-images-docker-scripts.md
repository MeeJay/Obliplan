Cette page décrit les images Docker publiées par Obliplan, leur construction (Dockerfiles multi-stage), le rôle de la variable `OBLIPLAN_VERSION`, et les deux scripts Node d'infrastructure qui garantissent l'existence des dépôts GitHub et Docker Hub avant publication.

## Images publiées

Deux images sont publiées sous le namespace Docker Hub `meejay` :

| Image | Contenu | Base de production |
|-------|---------|--------------------|
| `meejay/obliplan-server` | API Express + `@obliplan/shared` (Node) | `node:24-alpine` |
| `meejay/obliplan-client` | SPA React buildée, servie par nginx | `nginx:alpine` |

### Tags

| Tag | Posé par | Signification |
|-----|----------|---------------|
| `:dev` | « Cycle de release (000-RegularUpdate.bat) » | Dernière build de développement |
| `:latest` | « Promotion en production (001-PromoteToProd.bat) » | Dernière version promue en production |
| `:<version>` | « Promotion en production (001-PromoteToProd.bat) » | Version figée (ex. `0.1.25`), lue dans le `package.json` du composant |

`:latest` et `:<version>` sont obtenus par **re-tag** de l'image `:dev` (aucune reconstruction lors de la promotion), ce qui garantit que les trois tags désignent une image identique à l'instant de la promotion.

## Dockerfiles

Les deux images sont construites avec un `docker build` dont le **contexte est la racine du dépôt** (`.`) et le `Dockerfile` désigné par `-f`. Le même couple contexte/`Dockerfile` est déclaré dans `docker-compose.yml` (`build.context: .`, `build.dockerfile: server/Dockerfile` / `client/Dockerfile`).

### `server/Dockerfile` (multi-stage)

Deux étapes : un stage `builder` compile `shared` puis `server` (TypeScript → `dist/`), un stage `production` ne conserve que le runtime.

```dockerfile
# ---- Build stage (server + shared) ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY shared/ ./shared/
RUN cd shared && npm install && npm run build
COPY server/package.json ./server/
RUN cd server && npm install
COPY server/tsconfig.json server/knexfile.ts ./server/
COPY server/src/ ./server/src/
RUN cd server && npm run build

# ---- Production stage ----
FROM node:24-alpine AS production
WORKDIR /app
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/shared/dist/ ./shared/dist/
COPY --from=builder /app/server/package.json ./server/
COPY package.json ./
RUN cd server && npm install --omit=dev
COPY --from=builder /app/server/dist/ ./server/dist/
EXPOSE 3003
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1
WORKDIR /app/server
CMD ["node", "dist/src/index.js"]
```

À noter :

- Le stage de production réinstalle les dépendances avec `--omit=dev` (pas d'outillage TypeScript dans l'image finale).
- `knexfile` et migrations sont émis sous `dist/` par `tsc` (rootDir `.`), donc embarqués dans l'image.
- Port exposé : `3003`. Le healthcheck interroge `http://localhost:3003/health`.

### `client/Dockerfile` (multi-stage)

Un stage `builder` (Node) produit le bundle Vite, un stage `production` (nginx) le sert.

```dockerfile
# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json ./
COPY shared/ ./shared/
COPY client/package.json ./client/
RUN npm install --workspace=client
COPY client/ ./client/
RUN cd client && npm run build

# ---- Production stage ----
FROM nginx:alpine AS production
RUN apk add --no-cache curl
COPY --from=builder /app/client/dist/ /usr/share/nginx/html/
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD curl -sf http://localhost/ -o /dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

À noter :

- La configuration nginx provient de `client/nginx.conf` (proxy `/api` vers le serveur).
- `curl` est ajouté uniquement pour le healthcheck. Port exposé : `80`.

## Variable `OBLIPLAN_VERSION`

Au **déploiement**, `docker-compose.yml` sélectionne le tag d'image à tirer via `OBLIPLAN_VERSION` (défaut `latest` si non renseignée) :

```yaml
server:
  image: meejay/obliplan-server:${OBLIPLAN_VERSION:-latest}
client:
  image: meejay/obliplan-client:${OBLIPLAN_VERSION:-latest}
```

Elle est déclarée dans `.env.example` :

```bash
# ── Image version (Docker Hub tag, e.g. latest, 1.0.0) ──
OBLIPLAN_VERSION=latest
```

> **Note** — Pour un déploiement reproductible, renseigner `OBLIPLAN_VERSION` avec un tag de version figé (ex. `0.1.25`) plutôt que de suivre `latest`. C'est aussi le mécanisme de retour arrière : redéployer avec un tag antérieur.

## Scripts d'infrastructure

Ces deux scripts Node (ESM, exécutés en PHASE 0 par « Cycle de release (000-RegularUpdate.bat) ») garantissent que les dépôts distants existent et sont **publics** avant le premier push. Ils lisent leurs identifiants **depuis l'environnement** — jamais codés en dur, jamais affichés — et sont idempotents.

### `scripts/ensure-github.mjs`

Vérifie l'existence du dépôt GitHub et le crée en **public** s'il est absent.

Entrées (variables d'environnement) :

| Variable | Défaut | Rôle |
|----------|--------|------|
| `GITHUB_TOKEN` | — | PAT avec scope `repo` (requis pour créer) |
| `GITHUB_OWNER` | `MeeJay` | Propriétaire du dépôt |
| `GITHUB_REPO` | `obliplan` | Nom du dépôt |

Logique (API GitHub `2022-11-28`) :

- Sans `GITHUB_TOKEN` : message d'information et sortie `0` (création ignorée, non bloquante).
- `GET /repos/{owner}/{repo}` :
  - `200` et dépôt **privé** → `PATCH { private: false }` (bascule en public).
  - `200` et déjà public → rien à faire.
  - `404` → `POST /user/repos` avec `{ name, private: false, has_issues: true, description }` (création publique).
  - Autre statut → erreur, sortie `2`.

Codes de sortie : `0` = existe / créé / ignoré (non fatal) ; `2` = erreur dure. Le script est sûr à relancer : il n'agit que si le dépôt manque ou est privé.

### `scripts/ensure-dockerhub-public.mjs`

Garantit que les dépôts Docker Hub visés existent et sont **publics**, afin que le premier `docker push` atterrisse dans un dépôt public.

Entrées :

| Variable / argument | Défaut | Rôle |
|---------------------|--------|------|
| `DOCKERHUB_USER` | — | Nom d'utilisateur Docker Hub (requis) |
| `DOCKERHUB_TOKEN` | — | PAT ou mot de passe Docker Hub (requis) |
| `DOCKERHUB_NS` | `meejay` | Namespace |
| arguments CLI | `obliplan-server obliplan-client` | Liste des dépôts à garantir |

Logique (API Docker Hub v2) :

- Sans `DOCKERHUB_USER` / `DOCKERHUB_TOKEN` : message d'information et sortie `0` (les dépôts seront créés au push, avec la visibilité par défaut du compte).
- Login `POST /v2/users/login/` → jeton JWT.
- Pour chaque dépôt : `POST /v2/repositories/` avec `{ is_private: false }` ; si le dépôt existe déjà (statut ≠ `201`), `PATCH /v2/repositories/{ns}/{name}/ { is_private: false }` pour forcer le public.

Codes de sortie : `0` = garanti / ignoré ; `2` = au moins un dépôt n'a pu être assuré public. Idempotent : relançable sans effet de bord.

### Rappel `.dockerignore`

Le contexte de build (racine du dépôt) est filtré par `.dockerignore` pour ne pas embarquer d'artefacts ni de secrets dans les images :

```
**/node_modules
**/dist
**/.env
**/*.log
**/*.tsbuildinfo
.git
```

> **Avertissement** — L'exclusion de `**/.env` empêche qu'un fichier d'environnement soit copié dans une image. C'est complémentaire du garde-fou git de « Cycle de release (000-RegularUpdate.bat) » (refus de committer un `.env` suivi) : ensemble, ils couvrent les fuites de secrets côté image **et** côté dépôt.

## Références

- `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf`
- `docker-compose.yml`
- `.env.example`, `.dockerignore`
- `scripts/ensure-github.mjs`
- `scripts/ensure-dockerhub-public.mjs`
