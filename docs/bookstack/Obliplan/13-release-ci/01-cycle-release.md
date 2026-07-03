Le script Windows `000-RegularUpdate.bat` automatise le cycle de développement quotidien d'Obliplan : préparation des dépôts, incrément des versions `server` / `client`, construction et publication des images Docker `:dev`, puis commit et push sur la branche `dev`. Il s'exécute depuis la racine du dépôt (le script fait `cd /d "%~dp0"`) et reste entièrement local — il n'est pas publié sur GitHub (voir la section « Confidentialité des scripts »).

## Vue d'ensemble

Le script est découpé en phases numérotées. La branche de travail est fixée à `dev`, et toutes les commandes Docker ciblent un **démon Docker distant** via `-H tcp://10.0.0.152:2375`.

| Phase | Rôle |
|-------|------|
| PHASE 0 | Dépôts (git local, GitHub, Docker Hub) + garde-fou secrets |
| PHASE 1 | Questions interactives (type de bump `server` / `client`) |
| PHASE 2 | Écriture des nouvelles versions dans les `package.json` |
| PHASE 3 | Build + push Docker `meejay/obliplan-server:dev` (si `server` bumpé) |
| PHASE 4 | Build + push Docker `meejay/obliplan-client:dev` (si `client` bumpé) |
| PHASE 5 | `git commit` + `git push` sur `origin/dev` |

### Constantes de configuration

Elles sont définies en tête de script :

```bat
set _DH=-H tcp://10.0.0.152:2375
set BRANCH=dev
set GH_OWNER=MeeJay
set GH_REPO=obliplan
set GH_URL=https://github.com/!GH_OWNER!/!GH_REPO!.git
set DOCKERHUB_NS=meejay
```

Le script relit à chaque lancement les versions courantes depuis `server/package.json` et `client/package.json` (via `node -e`) pour les afficher et calculer les incréments.

## PHASE 0 — Dépôts et garde-fou secrets

Cette phase prépare l'environnement de publication. Elle est idempotente : chaque étape ne fait quelque chose que si nécessaire.

### Dépôt git local et identité

- Si le répertoire courant n'est pas déjà un dépôt git (`git rev-parse --is-inside-work-tree`), le script initialise un dépôt sur la branche `dev` (`git init -b dev`, avec repli sur `git init` + `git checkout -b dev`).
- Une identité git **locale** n'est posée que si aucune n'est déjà définie :

| Champ | Valeur par défaut |
|-------|-------------------|
| `user.name` | `MeeJay` |
| `user.email` | `meejayproduction@gmail.com` |

### Garde-fou anti-fuite de secret

Avant toute publication, le script **refuse de continuer** si un fichier `.env` est suivi par git. Il teste, avec `git ls-files --error-unmatch`, les chemins suivants :

```
.env   server\.env   client\.env   shared\.env
```

> **Avertissement** — Si l'un de ces fichiers est suivi, le script affiche une erreur et s'arrête (`exit /b 1`) en indiquant la correction :
>
> ```bat
> git rm --cached .env
> ```
>
> puis relancer. Ce contrôle empêche qu'un fichier d'environnement (mots de passe, `SESSION_SECRET`, etc.) soit committé par mégarde.

### Création des dépôts distants

- **GitHub** — le script appelle `node scripts\ensure-github.mjs`, qui crée le dépôt **public** `MeeJay/obliplan` s'il est absent ; le `.bat` configure ensuite le remote `origin` (`git remote add origin` vers `GH_URL`) s'il n'existe pas encore.
- **Docker Hub** — le script appelle `node scripts\ensure-dockerhub-public.mjs obliplan-server obliplan-client`, qui crée (ou force en public) les dépôts `meejay/obliplan-server` et `meejay/obliplan-client`.

Le détail de ces deux scripts est documenté dans « Images Docker & scripts d'infra ».

## PHASE 1 — Questions interactives

Le script demande successivement s'il faut bumper `server` puis `client` (`Bump? (Y/n)`). Pour chaque composant confirmé, la sous-routine `ASK_BUMP` propose trois types d'incrément (défaut : `patch`) :

| Choix | Type | Effet |
|-------|------|-------|
| `1` (ou Entrée) | `patch` | `+0.0.1` |
| `2` | `minor` | `+0.1.0` |
| `3` | `major` | `+1.0.0` |

La nouvelle version est calculée en JavaScript à partir de la version courante (majeure/mineure/patch remises à zéro selon la règle SemVer). Un choix invalide retombe sur `patch`. Un récapitulatif est affiché, puis une confirmation finale est demandée (`Continuer ? (Y/n)`) — répondre `n` annule sans rien modifier.

> **Note** — Un composant non bumpé (`skip`) ne sera **ni** réécrit **ni** reconstruit en image Docker : les phases de build (3 et 4) sont conditionnées à un bump effectif de ce composant.

## PHASE 2 — Application des bumps

Pour chaque composant bumpé, le script réécrit le champ `version` du `package.json` correspondant :

```bat
node -e "const fs=require('fs'),f='./server/package.json',p=JSON.parse(fs.readFileSync(f,'utf8'));p.version='!SERVER_NEW!';fs.writeFileSync(f,JSON.stringify(p,null,2)+'\n')"
```

(idem pour `client/package.json`). Seuls ces deux fichiers portent la version des images ; la version de la racine (`package.json`) n'est pas touchée par ce script.

## PHASE 3 & 4 — Build et push des images `:dev`

Chaque composant bumpé est construit et poussé sur le démon distant, avec le tag `:dev` :

```bash
docker -H tcp://10.0.0.152:2375 build -f server/Dockerfile -t meejay/obliplan-server:dev .
docker -H tcp://10.0.0.152:2375 push meejay/obliplan-server:dev

docker -H tcp://10.0.0.152:2375 build -f client/Dockerfile -t meejay/obliplan-client:dev .
docker -H tcp://10.0.0.152:2375 push meejay/obliplan-client:dev
```

Points à retenir :

- Le **contexte de build est la racine du dépôt** (`.`), avec le `Dockerfile` désigné explicitement par `-f`.
- Seul le tag `:dev` est produit ici. Les tags `:latest` et `:version` sont posés plus tard par « Promotion en production (001-PromoteToProd.bat) ».
- En cas d'échec de build ou de push, le composant est marqué `Docker:ECHEC` dans le résumé et le script passe à l'étape suivante sans s'interrompre.

## PHASE 5 — Commit et push git

Enfin, le script committe et pousse automatiquement l'ensemble des changements (bumps de version inclus) sur `origin/dev` :

```bash
git add -A
git commit -m "Regular update [dev]"
git push -u origin HEAD:dev
```

Si `git commit` ne trouve rien à committer, le résumé indique « rien à committer » et le push est ignoré.

## Identifiants (jamais committés)

La création automatique des dépôts (PHASE 0) lit ses identifiants **depuis l'environnement du shell** ; rien n'est écrit dans les scripts ni committé.

| Variable | Rôle |
|----------|------|
| `GITHUB_TOKEN` | PAT GitHub (scope `repo`) — création du dépôt GitHub public |
| `DOCKERHUB_USER` | Nom d'utilisateur Docker Hub |
| `DOCKERHUB_TOKEN` | PAT / mot de passe Docker Hub — force les dépôts en public |

À exporter avant de lancer le script, par exemple :

```bat
set GITHUB_TOKEN=ghp_...
set DOCKERHUB_USER=meejay
set DOCKERHUB_TOKEN=dckr_pat_...
```

> **Note** — Sans ces variables, l'étape de **création** des dépôts est simplement ignorée (elle n'est pas bloquante). Les `git push` et `docker push` réutilisent alors les identifiants déjà configurés sur la machine (Git Credential Manager, `docker login`).

## Confidentialité des scripts

Le fichier `.gitignore` exclut les outils de release afin qu'ils restent sur disque sans être publiés sur GitHub :

```
*.bat
*.ps1
/scripts/ensure-github.mjs
/scripts/ensure-dockerhub-public.mjs
```

## Références

- `000-RegularUpdate.bat`
- `scripts/ensure-github.mjs`
- `scripts/ensure-dockerhub-public.mjs`
- `server/package.json`, `client/package.json`
- `.gitignore`
