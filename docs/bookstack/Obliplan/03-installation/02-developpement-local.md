Pour développer sur Obliplan sans Docker, on lance séparément l'API (tsx en watch) et le front (serveur de développement Vite), chacun avec rechargement à chaud. Cette page décrit l'installation du monorepo, l'ordre de build imposé par le paquet partagé, et les scripts de base de données. Une instance PostgreSQL accessible est le seul prérequis d'infrastructure.

## Prérequis

- Node 24 (aligné sur les images Docker `node:24-alpine`).
- Un PostgreSQL accessible, dont l'URL de connexion est fournie via `DATABASE_URL`.

## Installation du monorepo

Obliplan est un monorepo npm workspaces regroupant trois paquets : `shared`, `server` et `client`. Une seule installation à la racine suffit à hydrater les trois.

```bash
npm install
```

### Construire le paquet partagé en premier

Le paquet `@obliplan/shared` expose les types de domaine consommés par le serveur et le client. Le serveur l'importe via son point d'entrée compilé (`dist/index.js`), il faut donc le construire avant de lancer l'API :

```bash
npm run build:shared
```

> `npm run build:shared` exécute `tsc` dans `shared/`. Le client, lui, référence directement les sources de `shared` via un alias Vite (`@obliplan/shared` → `../shared/src`), mais il reste prudent de construire `shared` d'abord pour que le serveur dispose de types à jour.

## Configuration de la base de données

Définissez `DATABASE_URL` dans un fichier `.env` (chargé automatiquement, voir « Chargement du `.env` »). Exemple :

```bash
DATABASE_URL=postgres://obliplan:changeme@localhost:5432/obliplan
```

En l'absence de cette variable, le serveur et Knex utilisent la valeur de repli `postgres://obliplan:changeme@localhost:5432/obliplan`.

### Migrations et données de démo

Les scripts de la racine délèguent aux scripts du paquet `server` (basés sur Knex et `knexfile.ts`).

| Commande (racine)   | Effet                                              |
|---------------------|----------------------------------------------------|
| `npm run migrate`   | `knex migrate:latest` — applique les migrations en attente. |
| `npm run seed`      | `knex seed:run` — insère le jeu de données de démonstration. |

> En développement local, contrairement au conteneur Docker, les migrations ne sont **pas** rejouées automatiquement à chaque commande : lancez `npm run migrate` au moins une fois avant de démarrer l'API sur une base neuve. (Le serveur exécute néanmoins `migrate.latest()` à son propre démarrage — voir `server/src/index.ts`.)

Pour le contenu créé par le seed, voir « Données de démonstration (seed) ».

## Lancer l'API

```bash
npm run dev:server
```

- Exécute `tsx watch src/index.ts` dans `server/` (rechargement à chaud).
- Écoute sur le port **3003** (`PORT`, valeur par défaut `3003`).
- Nécessite un PostgreSQL joignable via `DATABASE_URL`.
- Au démarrage : applique les migrations, garantit le tenant maître et l'administrateur local (`DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`).

## Lancer le front

Dans un second terminal :

```bash
npm run dev:client
```

- Exécute `vite` dans `client/`.
- Sert la SPA sur le port **5173**.
- Proxifie les appels vers l'API (configuration `vite.config.ts`) :

| Préfixe | Cible                   |
|---------|-------------------------|
| `/api`  | `http://localhost:3003` |
| `/auth` | `http://localhost:3003` |

Le front est donc à ouvrir sur `http://localhost:5173`, et l'API doit tourner en parallèle sur `3003` pour que le proxy fonctionne.

## Chargement du `.env`

Le serveur charge les variables d'environnement au démarrage (`server/src/env.ts`) via `dotenv`, en cherchant le fichier `.env` dans cet ordre :

1. `.env` du répertoire de travail courant (`process.cwd()`), qui correspond au dossier `server/` en dev (tsx) comme en Docker.
2. `.env` du dossier parent (racine du dépôt).

Un `.env` placé à la racine du dépôt est donc pris en compte pour le développement local.

## Rappels TypeScript / workspaces

- Chaque paquet possède son propre `tsconfig.json` ; `build:shared`, `build:server` et `build:client` compilent respectivement `shared/`, `server/` et `client/`.
- `npm run build` (racine) enchaîne `build:shared` → `build:server` → `build:client`.
- Le serveur compile avec `tsc` (`rootDir '.'`), ce qui émet aussi `knexfile.ts` et les migrations sous `dist/` (nécessaire pour Knex en production).
- Le client vérifie ses types séparément avec `npm run typecheck` (`tsc --noEmit`) dans `client/`.
- Les versions des paquets `@obliplan/server` et `@obliplan/client` sont liées ; `@obliplan/shared` est résolu en interne via le protocole `*` des workspaces.

## Références

- `package.json`
- `server/package.json`
- `client/package.json`
- `shared/package.json`
- `client/vite.config.ts`
- `server/knexfile.ts`
- `server/src/env.ts`
- `server/src/config.ts`
- `server/src/index.ts`
