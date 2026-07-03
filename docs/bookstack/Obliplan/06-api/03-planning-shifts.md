Cette page documente le cœur planning d'Obliplan : consultation des semaines individuelles et d'équipe, vues sauvegardées, opérations de masse (copie, publication, import CSV), CRUD des shifts, modèles de shift, jours d'école et jours fériés, ainsi que le flux calendrier ICS. Tous ces endpoints sont tenant-scopés (`requireAuth` + `requireTenant`) sauf le flux ICS public. Aucun n'est gardé par une barrière de module.

## Planning (`planning.routes.ts`)

Monté sur `/api/planning`. Les paramètres `week` acceptent une date ISO `yyyy-mm-dd` (ramenée au lundi de la semaine) ; par défaut la semaine courante. Le paramètre `month` attend `yyyy-mm`.

| Méthode | Chemin | Capacité | Query | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/planning/me` | — (soi) | `?week` | Semaine du compte courant (shifts + compteur) |
| `GET` | `/api/planning/me/month` | — (soi) | `?month` | Mois complet du compte courant (semaines empilées) |
| `GET` | `/api/planning/week` | soi ou management | `?userId&week` | Semaine d'un utilisateur |
| `GET` | `/api/planning/team` | `planning:read_team` | `?week` | Grille manager (une ligne par subordonné ; admin = tout le tenant) |
| `GET` | `/api/planning/team-overview` | `planning:view_team` | `?week` | Vue lecture seule « qui travaille quand » (shifts validés, note retirée) |
| `GET` | `/api/planning/teams` | `planning:view_team` | — | Équipes (axe C) du tenant `{ id, name }` pour le filtre de visibilité |
| `GET` | `/api/planning/views` | `planning:view_team` | — | Vues sauvegardées de l'utilisateur (propriétaire) |
| `POST` | `/api/planning/views` | `planning:view_team` | `{ name, teamIds }` | `201` + vue créée |
| `PUT` | `/api/planning/views/:id` | `planning:view_team` | `{ name, teamIds }` | Vue renommée / re-scopée |
| `DELETE` | `/api/planning/views/:id` | `planning:view_team` | — | `{ success:true }` |
| `POST` | `/api/planning/copy-week` | `planning:write` | `{ fromMonday, toMonday, userIds }` | `{ count }` |
| `POST` | `/api/planning/clone-shifts` | `planning:write` | `{ shiftIds, toUserId, toDate }` | Shifts clonés |
| `POST` | `/api/planning/publish` | `planning:write` | `{ monday, userIds }` | Résultat de publication |
| `POST` | `/api/planning/import/preview` | `planning:write` | `{ csvText }` | Détection + auto-mapping |
| `POST` | `/api/planning/import/apply` | `planning:write` | voir ci-dessous | Shifts créés |

### Règles d'accès

- **`/planning/week`** et **`/shifts`** : l'accès à un `userId` autre que soi exige que l'appelant « gère » la cible (`userService.canManage`), sinon `403 « Accès refusé »`.
- **`/planning/team`** : le périmètre manager/admin est appliqué dans le service (manager → ses subordonnés, admin → tout le tenant).

### Vues sauvegardées

Le corps est validé en ligne (pas de schéma Zod) : `name` (chaîne 1..80 après trim) et `teamIds` (tableau d'entiers positifs, dédupliqués). Chaque `teamId` doit appartenir aux équipes du tenant (vérifié dans le service). Un nom déjà utilisé renvoie `409 « Une vue portant ce nom existe déjà. »`.

### Opérations de masse (schémas `schemas.ts`)

```ts
copyWeekSchema   = { fromMonday: isoDate, toMonday: isoDate, userIds: number[] (>=1) }
cloneShiftsSchema = { shiftIds: number[] (>=1), toUserId: number, toDate: isoDate }
publishWeekSchema = { monday: isoDate, userIds: number[] (>=1) }
```

- **`copy-week`** clone les shifts d'une semaine vers une autre (en brouillons) et renvoie `{ count }`.
- **`publish`** bascule les brouillons d'une semaine en « validé » et notifie chaque salarié concerné ; l'action est journalisée (`planning.publish`).

### Import CSV

- **`import/preview`** attend `{ csvText }` (chaîne non vide, sinon `400 « Fichier CSV vide ou illisible. »`) et renvoie la détection + le mapping automatique.
- **`import/apply`** attend un corps plus riche :

| Champ | Type | Notes |
|-------|------|-------|
| `csvText` | string | Non vide |
| `year` | number | Entier 2000..2100, sinon `400 « Année invalide. »` |
| `employeeMap` | objet `Record<string, number\|null>` | Association libellé → userId |
| `labelMap` | objet `Record<string, ImportLabelMapping>` | Association libellé → type de shift |
| `statut` | `'valide'` \| `'brouillon'` | Défaut `brouillon` |
| `mode` | `'merge'` \| `'add'` \| `'replace'` | Défaut `replace` |

## Shifts (`shifts.routes.ts`)

Monté sur `/api/shifts`.

| Méthode | Chemin | Capacité | Corps / query | Réponse |
|---------|--------|----------|---------------|---------|
| `GET` | `/api/shifts` | soi ou management | `?userId&week` | Shifts de la semaine |
| `POST` | `/api/shifts` | `planning:write` | `createShiftSchema` | `201` + shift |
| `PUT` | `/api/shifts/:id` | `planning:write` | `updateShiftSchema` | Shift mis à jour |
| `DELETE` | `/api/shifts/:id` | `planning:write` | — | `{ message:'Shift supprimé' }` |

En plus de la capacité `planning:write`, le contrôleur exige que l'appelant gère l'employé cible (`canManage`) : création, réassignation (drag-move) et suppression sont bloquées sinon (`403`).

Schéma de création (`schemas.ts`) :

```ts
createShiftSchema = {
  userId: number,
  date: isoDate,
  heureDebut?: 'HH:mm' | null,
  heureFin?:   'HH:mm' | null,
  pauseMin?: number (0..1440),
  type: 'travail'|'pause'|'repos'|'recup'|'conge'|'absence'|'ecole',
  statut?: 'brouillon'|'valide',
  note?: string(<=2000) | null,
  hourTypeId?: number | null,
  boardId?: number | null,
}
// updateShiftSchema = createShiftSchema.partial() (userId reste modifiable pour la réassignation)
```

> Le type `astreinte` existe pour les modèles de shift (`shiftTypeFull`) mais **pas** pour la création directe d'un shift (`shiftType`).

## Modèles de shift (`shiftTemplates.routes.ts`)

Monté sur `/api/shift-templates`.

| Méthode | Chemin | Capacité | Corps | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/shift-templates` | — (lecture) | — | Modèles du tenant |
| `POST` | `/api/shift-templates` | `planning:write` | `createShiftTemplateSchema` | `201` + modèle |
| `PUT` | `/api/shift-templates/:id` | `planning:write` | corps partiel | Modèle mis à jour |
| `DELETE` | `/api/shift-templates/:id` | `planning:write` | — | Suppression |

```ts
createShiftTemplateSchema = {
  name: string(1..80),
  heureDebut: 'HH:mm',
  heureFin: 'HH:mm',
  pauseMin?: number (0..1440),
  type?: 'travail'|'pause'|'repos'|'recup'|'conge'|'absence'|'ecole'|'astreinte',
  hourTypeId?: number | null,
  boardId?: number | null,
  color?: '#rrggbb' | null,
}
```

## Jours d'école (`joursEcole.routes.ts`)

Monté sur `/api/jours-ecole`.

| Méthode | Chemin | Capacité | Corps / query | Réponse |
|---------|--------|----------|---------------|---------|
| `GET` | `/api/jours-ecole` | soi ou management | `?userId` | Jours d'école de l'utilisateur |
| `POST` | `/api/jours-ecole` | `planning:write` | `createJourEcoleSchema` | `201` |
| `DELETE` | `/api/jours-ecole/:id` | `planning:write` | — | `{ message:'Supprimé' }` |

Le contrôleur exige aussi que l'appelant gère l'utilisateur cible. Le schéma impose de fournir **soit** une date, **soit** un jour de semaine récurrent :

```ts
createJourEcoleSchema = {
  userId: number,
  date?: isoDate | null,
  weekday?: number (0..6) | null,     // récurrent
  periodStart?: isoDate | null,
  periodEnd?: isoDate | null,
} // refine: date != null OU weekday != null
```

## Jours fériés (`holidays.routes.ts`)

Monté sur `/api/holidays`. Universel (aucune barrière de module). La lecture est ouverte à tout utilisateur authentifié du tenant ; les entrées personnalisées sont gérées via `planning:write`.

| Méthode | Chemin | Capacité | Corps / query | Réponse |
|---------|--------|----------|---------------|---------|
| `GET` | `/api/holidays` | — (lecture) | `?year` (optionnel) | Jours fériés (filtrés par année si fournie) |
| `POST` | `/api/holidays` | `planning:write` | `{ date, label }` | `201` + jour férié personnalisé |
| `DELETE` | `/api/holidays/:id` | `planning:write` | — | `{ message:'Jour férié supprimé' }` |

```ts
createHolidaySchema = { date: isoDate, label: string(1..160) }
```

## Flux calendrier ICS (`ics.routes.ts`)

Deux routeurs distincts. Le flux public est monté au niveau global (pas d'auth/tenant) ; la gestion du jeton est tenant-scopée.

| Méthode | Chemin | Garde | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/ics/:token` | Public (jeton) | `text/calendar` du planning du propriétaire du jeton, ou `404` texte brut |
| `GET` | `/api/ics/me` | tenant | `{ url, token }` (crée le jeton au besoin) |
| `POST` | `/api/ics/regenerate` | tenant | `{ url, token }` (rotation du jeton) |

> Le flux public `/api/ics/:token` est un catch-all monté **avant** le routeur authentifié. Les mots réservés `me` et `regenerate` sont laissés passer vers les routes authentifiées ; un vrai jeton est une chaîne base64url de 32 caractères. Le suffixe `.ics` est accepté et retiré. Un jeton inconnu renvoie un `404` `text/plain`.

## Références

- `server/src/routes/planning.routes.ts`
- `server/src/routes/shifts.routes.ts`
- `server/src/routes/shiftTemplates.routes.ts`
- `server/src/routes/joursEcole.routes.ts`
- `server/src/routes/holidays.routes.ts`
- `server/src/routes/ics.routes.ts`
- `server/src/controllers/planning.controller.ts`
- `server/src/controllers/planningView.controller.ts`
- `server/src/controllers/planningImport.controller.ts`
- `server/src/controllers/shift.controller.ts`
- `server/src/controllers/jourEcole.controller.ts`
- `server/src/controllers/holiday.controller.ts`
- `server/src/controllers/ics.controller.ts`
- `server/src/validators/schemas.ts`
