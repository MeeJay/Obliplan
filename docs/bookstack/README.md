# Documentation Obliplan pour BookStack

Ce dossier contient la documentation complète du projet **Obliplan**, prête à être
publiée dans **BookStack**, dans l'étagère **ObliTools**.

La documentation est structurée exactement selon la hiérarchie BookStack :

```
Étagère : ObliTools
└── Livre : Obliplan
    ├── Chapitre  → Page(s) Markdown
    └── …
```

## Contenu du dossier

| Fichier / dossier          | Rôle                                                                 |
|----------------------------|----------------------------------------------------------------------|
| `Obliplan/`                | Les pages Markdown, un sous-dossier par chapitre, un fichier par page |
| `manifest.json`            | Arborescence étagère → livre → chapitres → pages (ordre + titres)     |
| `push-to-bookstack.mjs`    | Script de publication **idempotent** via l'API BookStack             |
| `README.md`                | Ce fichier                                                           |

> Les fichiers `.md` ne contiennent volontairement **pas** de titre de niveau 1 :
> le nom de la page dans BookStack (défini dans `manifest.json`) fait office de titre.

## Plan de la documentation

Le livre **Obliplan** est organisé en 13 chapitres :

1. **Présentation** — vue d'ensemble, concepts, rôles, panorama fonctionnel
2. **Architecture technique** — stack, monorepo, serveur, client, multi-tenant & modules
3. **Installation & configuration** — Docker, dev local, variables d'environnement, seed
4. **Authentification & SSO Obligate** — modes, flux OAuth, enregistrement, RBAC
5. **Modèle de données** — schéma PostgreSQL (migrations Knex), par domaine
6. **Référence API REST** — endpoints exhaustifs par domaine
7. **Guide fonctionnel — Planning & temps** — ma semaine, équipe, shifts, compteurs, import, ICS
8. **Guide fonctionnel — Récup, heures sup & pointage**
9. **Guide fonctionnel — Congés & absences**
10. **Guide fonctionnel — Projets, tâches & équipes** — Kanban/Scrum, todo
11. **Administration** — paramètres, utilisateurs, contrats, permissions, modules, clients
12. **Exploitation, sécurité & RGPD** — notifications, audit, RGPD, sécurité, supervision
13. **Release & CI/CD** — cycle de release, promotion prod, images Docker

Le détail exact (titres et ordre des pages) fait foi dans `manifest.json`.

## Publier dans BookStack (recommandé — via l'API)

1. Dans BookStack, crée un **jeton d'API** : *Profil utilisateur → Jetons d'API →
   Créer un jeton*. Note l'**identifiant** et le **secret**. Le compte doit avoir le
   droit de créer étagères / livres / chapitres / pages.
2. Renseigne les variables d'environnement et lance le script (Node 18+) :

   **PowerShell**
   ```powershell
   $env:BOOKSTACK_URL      = 'https://wiki.mondomaine.fr'
   $env:BOOKSTACK_TOKEN_ID = 'votre_token_id'
   $env:BOOKSTACK_TOKEN_SECRET = 'votre_token_secret'
   node .\push-to-bookstack.mjs --dry-run   # simulation d'abord
   node .\push-to-bookstack.mjs             # publication réelle
   ```

   **bash**
   ```bash
   BOOKSTACK_URL=https://wiki.mondomaine.fr \
   BOOKSTACK_TOKEN_ID=votre_token_id \
   BOOKSTACK_TOKEN_SECRET=votre_token_secret \
   node push-to-bookstack.mjs
   ```

Le script est **idempotent** : il crée l'étagère, le livre, les chapitres et les
pages s'ils n'existent pas, et met à jour titres/contenus/ordre à chaque exécution
(correspondance **par nom**). Aucun doublon n'est créé si on le relance.

## Publier manuellement (sans API)

Dans BookStack : crée l'étagère **ObliTools**, puis un livre **Obliplan**, puis un
chapitre par entrée du plan ci-dessus, et pour chaque page utilise l'éditeur en mode
**Markdown** en collant le contenu du fichier `.md` correspondant (le nom de la page
est donné par `manifest.json`).

---

*Documentation générée à partir du code source (`D:\obliplan`). Pour la régénérer
après une évolution du code, relancer la génération puis republier avec le script.*
