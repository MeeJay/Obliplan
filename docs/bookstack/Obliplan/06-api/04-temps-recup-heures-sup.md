Cette page couvre les domaines liés au temps de travail : la récupération (solde et mouvements), le suivi du temps (minuteurs et saisies manuelles), le référentiel des types d'heures et les heures supplémentaires (natures et déclarations). Trois de ces domaines sont protégés par une barrière de module ; les types d'heures sont universels.

| Domaine | Préfixe | Barrière de module |
|---------|---------|--------------------|
| Récupération | `/api/recup` | `recup` |
| Suivi du temps | `/api/time-entries` | `temps` |
| Types d'heures | `/api/hour-types` | — (universel) |
| Heures supplémentaires | `/api/overtime` | `heures_sup` |

## Récupération (`recup.routes.ts`)

Module `recup`. La récupération n'est jamais automatique : elle est attribuée par un manager/admin, ou créditée à la validation d'une semaine.

| Méthode | Chemin | Capacité | Corps / query | Réponse |
|---------|--------|----------|---------------|---------|
| `GET` | `/api/recup` | soi ou management | `?userId` | `{ movements, soldeMin }` |
| `GET` | `/api/recup/week-preview` | `recup:manage` | `?userId&semaine` | Aperçu du crédit d'une semaine |
| `POST` | `/api/recup/validate-week` | `recup:manage` | `{ userId, semaine }` | `{ soldeMin }` |
| `PATCH` | `/api/recup/self-service` | `recup:manage` | `{ userId, enabled }` | Utilisateur mis à jour |
| `POST` | `/api/recup` | `recup:manage` | `createRecupSchema` | `201` + mouvement |
| `DELETE` | `/api/recup/:id` | `recup:manage` | — | `{ message:'Mouvement supprimé' }` |

### Règles

- **`GET /recup`** : un manager/admin voit n'importe quel utilisateur qu'il gère. La consultation de son **propre** solde par un employé est conditionnée à l'option self-service activée pour lui (`403 « Accès self-service récup non activé »` sinon).
- **`week-preview`** renvoie ce que créditerait la validation de la semaine : `{ eligibleMin, soldeMin, alreadyCreditedMin, projectedSoldeMin, negative }`. Le crédit est idempotent (il remplace le montant déjà crédité pour cette semaine).
- **`validate-week`** crédite idempotemment la récup éligible de la semaine et renvoie le solde recalculé.
- **`create`** exige que l'appelant gère la cible (`403 « Seul le manager peut attribuer de la récupération »`).

Schémas :

```ts
createRecupSchema = {
  userId: number,
  semaine: isoDate,
  heuresMin: number (>0, <=10080),
  sens: 'credit' | 'debit',
  motif?: string(<=2000) | null,
}
// recup.schema.ts
validateWeekSchema  = { userId: number, semaine: isoDate }
selfServiceSchema   = { userId: number, enabled: boolean }
weekPreviewQuery    = { userId: coerce number, semaine: isoDate }  // query
```

## Suivi du temps (`timeEntries.routes.ts`)

Module `temps`. Le suivi combine des minuteurs en cours et des saisies manuelles, rattachables à un tableau (`boardId`) et à une carte (`cardId`).

| Méthode | Chemin | Corps / query | Réponse |
|---------|--------|---------------|---------|
| `GET` | `/api/time-entries` | `?userId` | Saisies d'un utilisateur (soi ou management) |
| `GET` | `/api/time-entries/running` | — | Minuteur en cours de l'appelant (ou `null`) |
| `GET` | `/api/time-entries/board/:boardId` | — | Toutes les saisies d'un tableau |
| `GET` | `/api/time-entries/board/:boardId/totals` | — | Minutes totales par carte |
| `POST` | `/api/time-entries/start` | `startTimerSchema` | `201` + minuteur (arrête tout autre) |
| `POST` | `/api/time-entries/:id/stop` | — | Minuteur arrêté |
| `POST` | `/api/time-entries` | `createTimeEntrySchema` | `201` + saisie manuelle |
| `PUT` | `/api/time-entries/:id` | `updateTimeEntrySchema` | Saisie mise à jour |
| `DELETE` | `/api/time-entries/:id` | — | `{ message:'Entrée supprimée' }` |

### Règles

- La lecture d'un `userId` autre que soi, ainsi que l'édition/suppression d'une saisie dont on n'est pas propriétaire, exigent le management de la cible (`403 « Accès refusé »` sinon).
- La création pour un tiers (`userId`) exige que la cible soit membre du tenant **et** gérée par l'appelant.

Schémas (`timeEntry.schema.ts`) :

```ts
startTimerSchema = { boardId?, cardId?, note? }
createTimeEntrySchema = {
  boardId?, cardId?,
  minutes: number (>0, <=10080),
  note?, spentOn?: isoDate,
  userId?: number,          // saisie pour un tiers (managers)
}
updateTimeEntrySchema = { boardId?, cardId?, minutes?, note?, spentOn? }
```

## Types d'heures (`hourTypes.routes.ts`)

Universel (aucune barrière de module). Configuration lue par tous, gérée via `hourtypes:manage`.

| Méthode | Chemin | Capacité | Corps | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/hour-types` | — (lecture) | — | Types d'heures |
| `POST` | `/api/hour-types` | `hourtypes:manage` | `createHourTypeSchema` | `201` |
| `PUT` | `/api/hour-types/:id` | `hourtypes:manage` | corps partiel | Mise à jour |
| `DELETE` | `/api/hour-types/:id` | `hourtypes:manage` | — | Suppression |

```ts
createHourTypeSchema = {
  libelle: string(1..120),
  code?: string(1..16) | null,
  color?: '#rrggbb' | null,
  position?: number (>=0),
  isActive?: boolean,
  bookable?: boolean,                // réservable via le module de prise de rendez-vous
  bookingExcludeProjects?: boolean,  // exclut les projets de la réservation
}
```

## Heures supplémentaires (`overtime.routes.ts`)

Module `heures_sup`. Deux ressources : les **natures** (référentiel de configuration) et les **déclarations** (flux de validation).

### Natures

| Méthode | Chemin | Capacité | Corps | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/overtime/natures` | — (lecture) | — | Natures |
| `POST` | `/api/overtime/natures` | `overtime:natures:manage` | `createOvertimeNatureSchema` | `201` |
| `PUT` | `/api/overtime/natures/:id` | `overtime:natures:manage` | corps partiel | Mise à jour |
| `DELETE` | `/api/overtime/natures/:id` | `overtime:natures:manage` | — | Suppression |

```ts
createOvertimeNatureSchema = {
  libelle: string(1..120),
  color?: '#rrggbb' | null,
  position?: number (>=0),
  isActive?: boolean,
}
```

### Déclarations

| Méthode | Chemin | Capacité | Corps / query | Réponse |
|---------|--------|----------|---------------|---------|
| `GET` | `/api/overtime/declarations` | soi ou management | `?userId` | Déclarations d'un utilisateur |
| `GET` | `/api/overtime/declarations/pending` | `overtime:validate` | — | En attente pour l'équipe du manager (admin = tout le tenant) |
| `GET` | `/api/overtime/declarations/team-summary` | `overtime:validate` | `?month=YYYY-MM` | Agrégat mensuel par employé |
| `POST` | `/api/overtime/declarations` | soi ou management | `createOvertimeDeclarationSchema` | `201` |
| `PATCH` | `/api/overtime/declarations/:id/decision` | `overtime:validate` | `{ decision, comment? }` | Décision appliquée |
| `PUT` | `/api/overtime/declarations/:id` | propriétaire (en attente) ou management | corps partiel | Déclaration mise à jour |
| `PATCH` | `/api/overtime/declarations/:id/request-change` | propriétaire | corps partiel | Renvoyée en attente |
| `DELETE` | `/api/overtime/declarations/:id` | propriétaire (en attente) ou `overtime:validate` | — | `{ message:'Déclaration supprimée' }` |

### Règles

- N'importe quel employé déclare pour lui-même ; un manager/admin déclare pour un subordonné (`403 « Accès refusé »` sinon).
- **`decision`** : la validation ou le refus exigent de gérer l'auteur. Un refus **exige** un commentaire non vide (`400 « Un motif de refus est requis »`).
- **`update`** : le propriétaire ne peut éditer qu'une déclaration **en attente** (`409` sinon) ; un manager peut corriger n'importe quel statut (l'édition la repasse en attente).
- **`request-change`** : réservé à l'auteur, soumet des valeurs corrigées sur une déclaration déjà décidée et la repasse en attente.
- Invariant : la récup ne peut excéder les minutes déclarées, vérifié sur les valeurs effectives fusionnées (`400 « La récup ne peut excéder les heures déclarées »`).

Schémas (`overtime.schema.ts`) :

```ts
createOvertimeDeclarationSchema = {
  userId?: number,
  natureId: number,
  date: isoDate,
  minutes: number (>0, <=10080),
  recupMinutes?: number (>=0),   // <= minutes
  motif?: string(<=2000) | null,
}
decideOvertimeDeclarationSchema = {
  decision: 'valide' | 'refuse',
  comment?: string(<=2000) | null,   // requis (non vide) au refus
}
// update / request-change = version partielle (tous champs optionnels)
```

## Références

- `server/src/routes/recup.routes.ts`
- `server/src/routes/timeEntries.routes.ts`
- `server/src/routes/hourTypes.routes.ts`
- `server/src/routes/overtime.routes.ts`
- `server/src/controllers/recup.controller.ts`
- `server/src/controllers/timeEntry.controller.ts`
- `server/src/controllers/hourType.controller.ts`
- `server/src/controllers/overtimeNature.controller.ts`
- `server/src/controllers/overtimeDeclaration.controller.ts`
- `server/src/validators/recup.schema.ts`
- `server/src/validators/timeEntry.schema.ts`
- `server/src/validators/hourType.schema.ts`
- `server/src/validators/overtime.schema.ts`
