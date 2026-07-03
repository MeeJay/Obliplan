Obliplan se déploie en une commande avec Docker Compose : trois conteneurs (PostgreSQL, API, client web) démarrent ensemble, les migrations et l'administrateur local sont créés automatiquement au premier lancement. Cette page décrit la procédure complète pour une mise en route sur un poste ou un serveur.

## Prérequis

- Docker et le plugin Docker Compose installés.
- Le dépôt Obliplan cloné localement (contenant `docker-compose.yml` et `.env.example`).

## Procédure

### 1. Créer le fichier `.env`

Le fichier de configuration n'est pas versionné : il faut le dériver de l'exemple fourni.

```bash
cp .env.example .env
```

### 2. Ajuster les valeurs minimales

Deux variables doivent impérativement être modifiées avant tout démarrage réel :

| Variable         | Rôle                                             | Recommandation                                   |
|------------------|--------------------------------------------------|--------------------------------------------------|
| `SESSION_SECRET` | Signe les cookies de session (et, par défaut, le journal d'audit). | Chaîne aléatoire d'au moins 32 caractères.       |
| `DB_PASSWORD`    | Mot de passe du conteneur PostgreSQL intégré.    | Mot de passe fort (repris dans `DATABASE_URL`).  |

> La liste exhaustive des variables est décrite dans la page « Référence des variables d'environnement ».

### 3. Démarrer la pile

```bash
docker compose up -d --build
```

Le raccourci `npm run docker:up` exécute la même commande. Les journaux se suivent avec `npm run docker:logs` (`docker compose logs -f`) et la pile s'arrête avec `npm run docker:down` (`docker compose down`).

### 4. Accéder à l'application

Une fois les conteneurs sains, l'application est disponible sur :

```
http://localhost:3002
```

L'API n'est pas exposée directement sur l'hôte : le conteneur client (Nginx) fait office de reverse proxy et transmet les requêtes `/api` et `/auth` vers le serveur (voir « Réseau et accès »).

## Services et images

`docker-compose.yml` définit trois services.

| Service    | Image                                             | Rôle                                   | Port hôte → conteneur |
|------------|---------------------------------------------------|----------------------------------------|-----------------------|
| `postgres` | `postgres:16-alpine`                              | Base de données PostgreSQL             | non publié            |
| `server`   | `meejay/obliplan-server:${OBLIPLAN_VERSION:-latest}` | API REST Express + Knex             | non publié (3003 interne) |
| `client`   | `meejay/obliplan-client:${OBLIPLAN_VERSION:-latest}` | SPA React servie par Nginx          | `${LISTEN_PORT:-3002}` → `80` |

Les images `server` et `client` sont soit tirées depuis Docker Hub (`meejay/obliplan-server` et `meejay/obliplan-client`), soit reconstruites localement via l'option `--build` à partir de `server/Dockerfile` et `client/Dockerfile`. Le tag utilisé est contrôlé par la variable `OBLIPLAN_VERSION` (`latest` par défaut).

### Base de données PostgreSQL

Le conteneur `postgres` est initialisé avec la base `obliplan`, l'utilisateur `obliplan` et le mot de passe issu de `DB_PASSWORD`. Le port `5432` n'est pas publié par défaut ; il peut être exposé sur le réseau local en décommentant la section `ports` du service (utile pour pgAdmin ou pour lancer les migrations depuis l'hôte).

## Réseau et accès

Le conteneur `client` publie le port `80` de Nginx sur le port hôte défini par `LISTEN_PORT` (3002 par défaut). Nginx sert la SPA et proxifie les routes serveur :

| Route entrante | Destination interne | Usage                                   |
|----------------|---------------------|-----------------------------------------|
| `/api/`        | `server:3003`       | API REST (enveloppe JSON `success`)     |
| `/auth/`       | `server:3003`       | Redirection et callback SSO Obligate    |
| `/health`      | `server:3003`       | Sonde de disponibilité du serveur       |
| `/` (autres)   | fichiers statiques  | SPA React (`try_files … /index.html`)   |

Le serveur écoute sur le port `3003` uniquement à l'intérieur du réseau Compose ; il n'est jamais joignable directement depuis l'hôte dans la configuration par défaut.

## Healthchecks et dépendances de démarrage

Chaque service dispose d'une sonde de santé, et les dépendances imposent un ordre de démarrage.

| Service    | Sonde                                                        | Intervalle | Timeout | Essais | Démarrage |
|------------|-------------------------------------------------------------|------------|---------|--------|-----------|
| `postgres` | `pg_isready -U obliplan`                                     | 5 s        | 5 s     | 10     | 60 s      |
| `server`   | `wget --spider http://localhost:3003/health`                | 30 s       | 5 s     | 5      | 20 s      |
| `client`   | `curl -sf http://localhost/` (défini dans `client/Dockerfile`) | 30 s     | 5 s     | 3 (défaut) | 15 s      |

- `server` attend que `postgres` soit `service_healthy` avant de démarrer.
- `client` attend que `server` soit `service_healthy`.

Tous les services utilisent `restart: unless-stopped`.

## Persistance des données

Les données PostgreSQL sont stockées dans le volume nommé `postgres_data`, monté sur `/var/lib/postgresql/data`. Ce volume survit aux redémarrages et aux reconstructions d'images ; il n'est supprimé que par une action explicite (`docker compose down -v`).

## Premier démarrage : migrations et administrateur

Au lancement, le serveur exécute automatiquement, dans l'ordre :

1. **Migrations de schéma** : `db.migrate.latest()` applique toutes les migrations en attente.
2. **Tenant maître** : création du tenant `master` s'il n'existe pas.
3. **Administrateur local** : création d'un compte administrateur à partir de `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD`.

> L'administrateur n'est créé **que si aucun utilisateur avec le rôle `admin` n'existe déjà**. Si le mot de passe vaut `admin123` ou fait moins de 12 caractères, un avertissement est journalisé : pensez à définir `DEFAULT_ADMIN_PASSWORD` et à le changer après la première connexion.

Aucune commande manuelle de migration n'est nécessaire en Docker : elles sont appliquées à chaque démarrage du conteneur `server`.

## Étapes suivantes

- Pour peupler une instance de test, voir « Données de démonstration (seed) ».
- Pour un déploiement derrière un reverse proxy HTTPS, voir la variable `FORCE_HTTPS` dans « Référence des variables d'environnement ».

## Références

- `docker-compose.yml`
- `.env.example`
- `server/Dockerfile`
- `client/Dockerfile`
- `client/nginx.conf`
- `server/src/index.ts`
- `server/src/services/auth.service.ts`
- `package.json`
