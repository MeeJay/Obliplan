Le script Windows `001-PromoteToProd.bat` promeut en production ce qui a été validé sur `dev` : il fusionne `dev` dans `main` en fast-forward, retague les images Docker `:dev` en `:latest` et `:version`, pousse le tout, puis revient sur `dev`. Il s'exécute depuis la racine du dépôt et cible le même démon Docker distant que le cycle de release (`-H tcp://10.0.0.152:2375`).

## Enchaînement

Après affichage des versions courantes (relues dans `server/package.json` et `client/package.json`) et confirmation de l'opérateur, le script exécute :

| Étape | Action |
|-------|--------|
| 1 | Merge `dev` dans `main` (fast-forward) |
| 2 | Re-tag des images Docker `:dev` en `:latest` + `:version` |
| 3 | Push des images Docker |
| 4 | Push de `main` sur `origin` |
| 5 | Retour sur `dev` |

## Conditions préalables (vérifications de sécurité)

Le script s'arrête (`exit /b 1`) si l'une de ces conditions n'est pas remplie :

- **Branche courante = `dev`** — la branche active est lue via `git rev-parse --abbrev-ref HEAD` ; si ce n'est pas `dev`, le script refuse de promouvoir et invite à basculer sur `dev`.
- **Aucun changement non committé** — `git diff --quiet --exit-code` doit être propre (arbre de travail).
- **Aucun changement stagé non committé** — `git diff --cached --quiet --exit-code` doit également être propre.

> **Avertissement** — Ces contrôles garantissent que l'on ne promeut que ce qui est déjà committé et poussé sur `dev`. La promotion ne construit **aucune** image : elle se contente de retaguer les images `:dev` déjà présentes sur le démon distant. Pour publier du code neuf, exécuter d'abord « Cycle de release (000-RegularUpdate.bat) ».

## PHASE 1 — Merge `dev` → `main`

```bash
git switch main
git merge dev --ff-only
git push origin main
```

Le merge est **fast-forward strict** (`--ff-only`) : `main` doit être un ancêtre direct de `dev`. Si `main` a divergé, le merge échoue, le script rebascule sur `dev` et s'arrête en demandant une résolution manuelle. Cette contrainte garantit un historique linéaire et empêche toute promotion accidentelle par-dessus des commits présents uniquement sur `main`.

## PHASE 2 — Re-tag et push des images

Pour chaque composant, l'image `:dev` **déjà construite** est retaguée en `:latest` et en tag de version (la version courante lue dans le `package.json`), puis les deux tags sont poussés :

```bash
# Server
docker -H tcp://10.0.0.152:2375 tag  meejay/obliplan-server:dev meejay/obliplan-server:latest
docker -H tcp://10.0.0.152:2375 tag  meejay/obliplan-server:dev meejay/obliplan-server:<SERVER_VER>
docker -H tcp://10.0.0.152:2375 push meejay/obliplan-server:latest
docker -H tcp://10.0.0.152:2375 push meejay/obliplan-server:<SERVER_VER>

# Client
docker -H tcp://10.0.0.152:2375 tag  meejay/obliplan-client:dev meejay/obliplan-client:latest
docker -H tcp://10.0.0.152:2375 tag  meejay/obliplan-client:dev meejay/obliplan-client:<CLIENT_VER>
docker -H tcp://10.0.0.152:2375 push meejay/obliplan-client:latest
docker -H tcp://10.0.0.152:2375 push meejay/obliplan-client:<CLIENT_VER>
```

Comme il s'agit d'un simple re-tag, `:latest` et `:version` pointent sur **exactement la même image** que `:dev` au moment de la promotion — aucune reconstruction, donc aucun risque de divergence entre ce qui a été testé et ce qui part en production.

> **Note** — Les échecs de push individuels (`push server:latest`, `push server:version`, etc.) sont signalés à l'écran mais n'interrompent pas la suite du script.

## PHASE 3 — Retour sur `dev`

```bash
git switch dev
```

Le script se termine toujours en ramenant l'opérateur sur la branche de travail `dev`. La sous-routine `:ABORT`, atteinte en cas d'échec d'une étape git critique (switch ou push de `main`), tente elle aussi de revenir sur `dev` avant de sortir en erreur.

## Réversibilité et bonnes pratiques

- **Historique git** — le merge étant fast-forward, `main` avance simplement jusqu'au commit de `dev`. Aucune information n'est perdue ; en cas de besoin, `main` peut être ramené sur le commit précédent (`git reset` / re-push), mais cela reste une opération manuelle hors script.
- **Images Docker** — `:latest` et les tags de version poussés restent disponibles sur Docker Hub. Un retour arrière consiste à redéployer un tag de version antérieur (`OBLIPLAN_VERSION=<ancienne-version>` dans le `.env` du déploiement, voir « Images Docker & scripts d'infra »).
- **Toujours promouvoir depuis un `dev` propre et poussé** — les vérifications préalables l'imposent, mais il est prudent d'avoir lancé « Cycle de release (000-RegularUpdate.bat) » juste avant, pour que les images `:dev` sur le démon distant correspondent bien à l'état de `dev`.
- **Épingler la version en production** — plutôt que de suivre `:latest`, renseigner `OBLIPLAN_VERSION` avec le tag de version exact publié, pour un déploiement reproductible.

## Références

- `001-PromoteToProd.bat`
- `docker-compose.yml`
- `server/package.json`, `client/package.json`
