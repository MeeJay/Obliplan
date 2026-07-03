Obliplan est le module de **gestion du temps de travail** de la suite Obli. Il répond à une question simple mais récurrente en gestion RH : *un salarié a-t-il fait ses heures, en a-t-il fait trop, et que fait-on du surplus ?* L'outil compare le temps **réalisé** au **contrat**, calcule l'**écart**, et pilote les **récupérations** et **heures supplémentaires** qui en découlent.

## Ce qu'est Obliplan

Obliplan est une application web **multi-tenant** (plusieurs organisations isolées sur une même instance) qui gère :

- le **planning** des salariés (shifts saisis à la semaine, en brouillon puis validés) ;
- le suivi du **temps réalisé** par rapport aux **heures prévues par le contrat** ;
- la **récupération** (crédit/débit d'un solde d'heures) et les **heures supplémentaires**.

Autour de ce cœur métier, l'application embarque des fonctions connexes : congés et absences, pointage du temps sur des projets, clients, tableaux Kanban/Scrum, tâches et todo, équipes, jours fériés, notifications, flux calendrier ICS, rapports, audit et RGPD (voir « Panorama des fonctionnalités & modules »).

L'authentification est **déléguée à Obligate** (SSO OAuth) lorsqu'elle est configurée, avec un repli sur une authentification **locale** (identifiant / mot de passe, sessions PostgreSQL).

## Le problème métier résolu

Le **contrat** est le modèle central : il porte les règles de calcul. À partir des shifts et du contrat, Obliplan dérive des **compteurs hebdomadaires calculés** (jamais stockés), toutes durées en minutes :

| Compteur | Définition |
|----------|------------|
| Réalisé | Σ(fin − début − pause) des shifts de type `travail` **validés**. |
| Attendu | Base du contrat (ou somme du *work pattern*) − jours d'école, jours fériés et congés approuvés tombant sur des jours travaillés. |
| Écart | Réalisé − attendu (peut être négatif). |
| Heures sup | Dépassement compté en heures supplémentaires, pour un contrat **avec** heures sup autorisées (au-delà du seuil si défini). |
| Récup éligible | Dépassement ouvrant droit à récupération, pour un contrat **sans** heures sup. |

La règle de dépassement (réalisé > attendu) est le nœud du produit :

- contrat **sans** heures sup autorisées → le surplus devient de la **récupération éligible** (attribuée **manuellement** par le manager, avec traçabilité) ;
- contrat **avec** heures sup autorisées → le surplus est comptabilisé en **heures supplémentaires** (au-delà du seuil, si un seuil est défini).

> Obliplan **compte** les heures supplémentaires ; il ne les **valorise pas** en euros (voir « Périmètre MVP et hors-scope »).

## Place dans la suite Obli

Obliplan n'est pas une application isolée : elle s'insère dans l'écosystème Obli et en réutilise l'authentification, le design system et les conventions.

### Obligate — le fournisseur d'identité (SSO)

Le SSO est **délégué à Obligate** via un flux OAuth. L'activation se fait **dans l'application** (`Administration → Paramètres → Obligate SSO Gateway`) et l'état est stocké **en base** (`app_config.obligate_enabled`), jamais dans une variable d'environnement ni dans le dépôt. Tant qu'Obligate n'est pas configuré, l'authentification **locale** reste active par défaut. Obliplan se déclare auprès d'Obligate comme *Connected App* (slug `obliplan`) et synchronise les rôles **par tenant** à chaque connexion.

### ObliTools — le shell qui embarque l'application

Le shell de bureau **ObliTools** intègre les applications Obli **dans une iframe**. Obliplan est conçu pour ce contexte d'intégration *cross-site* :

- le *frameguard* est désactivé côté serveur (Helmet `frameguard: false`) pour autoriser l'affichage en iframe ;
- lorsque le navigateur bloque les cookies tiers dans l'iframe, un repli **`X-Auth-Token`** prend le relais : la connexion renvoie un `sessionToken` (= identifiant de session) que le client stocke et renvoie en en-tête pour réhydrater la session serveur ;
- la présente documentation est elle-même publiée dans l'étagère BookStack **ObliTools**.

### Alignement de stack (Obliview / Obliance)

Pour réutiliser l'authentification, le design system et les conventions de la suite, Obliplan s'aligne sur la stack Obliview/Obliance :

- **Serveur** : Node 24 + TypeScript + Express + PostgreSQL (Knex) ;
- **Client** : React 18 + Vite + Tailwind + Zustand ;
- **Monorepo** npm workspaces (`shared/`, `server/`, `client/`), Docker Compose.

Le modèle d'autorisation (capacités × *permission sets* par tenant) et les **équipes** *reprennent explicitement le modèle d'Obliance* (voir « Rôles, capacités & périmètres »).

## Licence

Obliplan est distribué sous **licence ELv2** (Elastic License 2.0), conformément au `README.md` et à la description du paquet racine.

## Publics visés

Trois rôles applicatifs couvrent les usages, du salarié à l'administrateur du tenant :

| Public | Rôle | Ce qu'il fait dans Obliplan |
|--------|------|------------------------------|
| Employé | `employe` | Consulte **son** planning et ses compteurs (réalisé/attendu, écart, solde récup). |
| Manager | `manager` | Encadre son équipe : grille d'équipe, création/édition/validation des shifts, attribution de récup, validation des congés et heures sup. |
| Administrateur | `admin` | Administre le tenant : salariés, contrats, permissions, clients, équipes. |

À ces rôles s'ajoute une notion transverse d'**administrateur de plateforme** (*platform / god view* sur le tenant `master`), distincte de l'admin d'un tenant, réservée à la configuration globale de l'instance (voir « Rôles, capacités & périmètres »).

## Périmètre MVP et hors-scope

Le cœur du MVP couvre le cycle **planning → compteurs → récup / heures sup**, ainsi que les fonctions connexes listées dans « Panorama des fonctionnalités & modules ».

Certaines capacités sont **prévues architecturalement mais hors-scope** (non implémentées) :

- **Annualisation / modulation** pluri-hebdomadaire du temps de travail ;
- **Valorisation en euros** des heures supplémentaires (Obliplan compte les heures, il ne les chiffre pas financièrement).

> Le `README.md` listait aussi, au démarrage du projet, les *notifications / emails* comme hors-scope. Elles ont depuis été **implémentées** (centre de notifications in-app, Web Push et envoi d'emails best-effort) — voir « Panorama des fonctionnalités & modules ».

## Références

- `README.md`
- `package.json`
- `shared/src/types.ts` (compteurs hebdomadaires, contrat, shifts)
- `server/src/app.ts` (iframe ObliTools : `frameguard`, repli `X-Auth-Token`)
- `client/src/api/client.ts` (détection iframe *cross-site*)
- `.env.example` (contextes OAuth Obligate et iframe ObliTools)
