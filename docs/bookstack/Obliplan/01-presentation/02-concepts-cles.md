Cette page définit précisément le vocabulaire d'Obliplan tel qu'il est implémenté dans le code (types partagés, colonnes de base, énumérations). Les termes sont d'abord expliqués par thème, puis repris dans un glossaire alphabétique en fin de page.

## Tenant (organisation) et isolation

Un **tenant** est une organisation (*workspace*) hébergée sur l'instance. Chaque donnée métier porte une colonne `tenant_id` et l'**isolation est systématique** : le `req.tenantId` provient de la session et filtre chaque requête. Un utilisateur peut appartenir à plusieurs tenants ; son **rôle est porté par tenant** (`user_tenants.role`, un slug de *permission set*) et il bascule de l'un à l'autre (`/api/tenant/switch`).

Un tenant technique **`master`** est créé au premier démarrage ; il sert de périmètre à l'administrateur de plateforme (*god view*).

## Le contrat

Le **contrat** est le modèle central : il porte les règles de calcul du temps de travail. Ses champs :

| Champ (type) | Rôle |
|--------------|------|
| `heuresHebdoBaseMin` (`int`, minutes) | Heures hebdomadaires de base (35 h = 2100 min). |
| `heuresSupAutorisees` (`bool`) | `false` → tout dépassement devient récup ; `true` → dépassement compté en heures sup. |
| `seuilHeuresSupMin` (`int` \| null) | Seuil (minutes) au-delà duquel le dépassement compte en heures sup. |
| `alternance` (`bool`) | Contrat en alternance → utilise les jours d'école pour réduire l'attendu. |
| `workPattern` (`int[7]` \| null) | Minutes attendues par jour `[Lun,Mar,Mer,Jeu,Ven,Sam,Dim]`. `null` = ancien mode uniforme base/5 du lundi au vendredi. Un jour est « travaillé » si son entrée est > 0. |
| `ftePercent` (`int` \| null) | Équivalent temps plein informatif (0–100). |
| `color` (`string` \| null) | Couleur (hex) pour la visualisation du planning. |

## Shift

Un **shift** est un créneau positionné sur une date pour un salarié. Il porte une plage horaire (`heureDebut`/`heureFin`, `HH:mm`, nulles pour les types journée entière), une **pause** non travaillée (`pauseMin`), un **type**, un **statut**, et des liens optionnels vers un type d'heure (`hourTypeId`) et un projet (`boardId`).

### Types de shift (`ShiftType`)

Huit types sont autorisés (contrainte `CHECK` en base) :

| Type | Nature |
|------|--------|
| `travail` | Temps travaillé — seul type compté dans le réalisé. |
| `pause` | Pause déjeuner/coupure : porte une plage horaire mais **non travaillée** (exclue du réalisé et des plafonds). |
| `repos` | Repos (jour non travaillé). |
| `recup` | Récupération posée (n'est pas du travail ; peut générer un débit de solde). |
| `conge` | Congé. |
| `absence` | Absence. |
| `ecole` | Jour d'école (alternance) : neutre sur le réalisé, réduit l'attendu. |
| `astreinte` | Astreinte (*on-call*) : comptée en heures sup ; chaque événement est un **déclenchement**. |

### Statut de shift (`ShiftStatus`)

| Statut | Sens |
|--------|------|
| `brouillon` | Saisi mais non validé — **non compté** dans le réalisé. |
| `valide` | Validé — pris en compte dans les compteurs. |

## Réalisé, attendu, écart

Ces trois notions sont des **compteurs calculés** (jamais stockés), en minutes :

- **Réalisé** — Σ(fin − début − pause) des shifts `travail` **validés** de la semaine.
- **Attendu** — base du contrat (ou somme du *work pattern*) diminuée des **jours d'école**, **jours fériés** et **congés approuvés** tombant sur des jours travaillés.
- **Écart** — réalisé − attendu (peut être négatif).

## Récupération

La **récupération** est un solde d'heures suivi par des **mouvements** (`recup_mouvements`) :

| Champ | Rôle |
|-------|------|
| `semaine` | Lundi (ISO) de la semaine concernée. |
| `heuresMin` | Montant en minutes (toujours positif ; le signe vient de `sens`). |
| `sens` | `credit` ou `debit`. |
| `motif` | Libellé libre. |
| `source` | Origine : `manual`, `eligible`, `overtime`, `recup-shift`… |

Le **solde de récup** d'un utilisateur est la somme des crédits moins les débits.

## Heures supplémentaires

Pour un contrat **avec** heures sup autorisées, le dépassement est comptabilisé en **heures supplémentaires** (au-delà du seuil éventuel). Les salariés concernés peuvent en outre **déclarer** leurs heures sup, tagguées d'une **nature** paramétrable par tenant (Inter, Astreinte, Jour férié…), avec un circuit de validation (`en_attente` / `valide` / `refuse`) et une conversion partielle possible en récup.

## Jour d'école (alternance)

Un **jour d'école** (`jours_ecole`) traduit l'alternance : il est soit une **date ponctuelle**, soit un **jour de semaine récurrent** (`weekday` 0 = dimanche … 6 = samedi) borné par une période optionnelle. Chaque jour d'école de la semaine **réduit l'attendu** et est neutre sur le réalisé.

## Module

Un **module** est un domaine fonctionnel **activable par tenant**. Catalogue fixe de 7 clés : `conges`, `heures_sup`, `recup`, `projets`, `taches`, `temps`, `clients`. Par défaut **tous les modules sont activés** (un tenant sans ligne `tenant_modules` a tout d'actif) ; un module désactivé est masqué dans la navigation **et rejeté par le serveur** (HTTP 403).

## Capacité (RBAC) et permission set

- Une **capacité** (*capability*) est une permission granulaire identifiée par une clé, ex. `planning:read_team`, `planning:write`, `recup:manage`, `users:manage`.
- Un **permission set** est un ensemble nommé de capacités, identifié par un **slug**. Le rôle d'un utilisateur dans un tenant (`user_tenants.role`) **est** un slug de *permission set* ; il résout les droits effectifs dans ce tenant. Les *permission sets* par défaut reprennent les rôles applicatifs (`admin`, `manager`, `employe`).

Le détail complet est traité dans « Rôles, capacités & périmètres » et « RBAC : capacités, permission sets & rôles ».

## Glossaire

| Terme | Définition |
|-------|------------|
| Alternance | Contrat dont l'attendu est réduit par les jours d'école (`contrats.alternance`). |
| Astreinte | Type de shift *on-call* compté en heures sup ; chaque événement est un déclenchement. |
| Attendu | Heures attendues d'une semaine : base du contrat (ou *work pattern*) − jours d'école, fériés et congés approuvés. |
| Brouillon | Statut d'un shift saisi mais non validé (non compté). |
| Capacité | Permission granulaire (clé) évaluée par tenant, ex. `planning:write`. |
| Compteur | Agrégat hebdomadaire calculé (réalisé, attendu, écart, heures sup, récup éligible…), jamais stocké. |
| Contrat | Modèle central portant les règles de calcul (base, heures sup, seuil, alternance, *work pattern*). |
| Déclenchement | Une occurrence d'astreinte (call-out) sur la semaine. |
| Écart | Réalisé − attendu (peut être négatif). |
| Heures supplémentaires | Dépassement compté comme heures sup pour un contrat les autorisant. |
| Jour d'école | Date ou jour de semaine récurrent d'alternance qui réduit l'attendu. |
| Master | Tenant technique créé au démarrage, périmètre de l'administrateur de plateforme. |
| Module | Domaine fonctionnel activable par tenant (7 clés), actif par défaut. |
| Permission set | Ensemble nommé de capacités (slug) ; le rôle par tenant en est un. |
| Réalisé | Σ(fin − début − pause) des shifts `travail` validés de la semaine. |
| Récupération | Solde d'heures suivi par des mouvements (crédit/débit). |
| Récup éligible | Dépassement ouvrant droit à récup (contrat sans heures sup), attribué manuellement. |
| Shift | Créneau daté d'un salarié (type + statut + horaires). |
| Solde de récup | Σ crédits − Σ débits des mouvements de récup d'un utilisateur. |
| Tenant | Organisation/workspace isolé ; chaque donnée porte `tenant_id`. |
| Validé | Statut d'un shift pris en compte dans les compteurs. |
| Work pattern | Répartition des minutes attendues par jour de la semaine (7 entrées). |

## Références

- `shared/src/types.ts` (contrat, shift, `ShiftType`, `ShiftStatus`, compteurs, récup, jours d'école)
- `shared/src/modules.ts` (catalogue des modules)
- `shared/src/permissions.ts` (capacités, *permission set*)
- `shared/src/overtime.ts` (déclaration et natures d'heures sup)
- `server/src/db/migrations/002_create_contrats.ts`, `051_contrat_work_pattern.ts`
- `server/src/db/migrations/009_create_shifts.ts`, `017_add_astreinte_type.ts`, `063_add_pause_type.ts`
- `server/src/db/migrations/010_create_recup_mouvements.ts`
- `server/src/db/migrations/040_create_tenant_modules.ts`
