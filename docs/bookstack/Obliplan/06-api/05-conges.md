Le module congés gère deux ressources : les **types de congés** (référentiel de configuration) et les **demandes** (flux de dépôt, validation et annulation), plus un calendrier d'équipe. Tous les endpoints sont montés sur `/api/leave` et protégés par la barrière de module `conges` (en plus de `requireAuth` + `requireTenant`).

## Types de congés

Configuration lue par tous, gérée via la capacité `leave:types:manage`.

| Méthode | Chemin | Capacité | Corps | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/leave/types` | — (lecture) | — | Types de congés |
| `POST` | `/api/leave/types` | `leave:types:manage` | `createLeaveTypeSchema` | `201` |
| `PUT` | `/api/leave/types/:id` | `leave:types:manage` | corps partiel | Mise à jour |
| `DELETE` | `/api/leave/types/:id` | `leave:types:manage` | — | Suppression |

```ts
createLeaveTypeSchema = {
  libelle: string(1..120),
  code: string(1..16),
  color?: '#rrggbb' | null,
  paid?: boolean,
  reducesAttendu?: boolean,
  requiresJustification?: boolean,
  allowanceDays?: number (0..366) | null,
  isActive?: boolean,
  position?: number (>=0),
  // Acquisition légale (CP 2,5 j/mois) + ancrage de la période
  accrualMode?: 'fixed_annual' | 'monthly',
  accrualRatePerMonth?: number (0..31) | null,
  periodStartMonth?: number (1..12),
}
```

## Demandes de congés

Toute création est validée par `createLeaveRequestSchema` ; les décisions par `decideLeaveRequestSchema`.

| Méthode | Chemin | Capacité | Corps / query | Réponse |
|---------|--------|----------|---------------|---------|
| `GET` | `/api/leave/requests` | soi ou management | `?userId` | Demandes d'un utilisateur |
| `GET` | `/api/leave/requests/balances` | soi ou management | `?userId` | Soldes par type |
| `GET` | `/api/leave/requests/pending` | `leave:validate` | — | En attente pour l'équipe du manager (admin = tout le tenant) |
| `GET` | `/api/leave/calendar` | `leave:validate` | `?month=YYYY-MM` | Absences approuvées + en attente du mois |
| `POST` | `/api/leave/requests` | soi ou management | `createLeaveRequestSchema` | `201` + demande |
| `PATCH` | `/api/leave/requests/:id/decision` | `leave:validate` | `{ decision, comment? }` | Décision appliquée |
| `PATCH` | `/api/leave/requests/:id/cancel` | propriétaire ou management | — | Demande annulée |

### Règles d'accès

- La consultation des demandes et des soldes d'un `userId` autre que soi exige de gérer la cible (`403 « Accès refusé »` sinon).
- **`pending`** et **`calendar`** : un manager voit son équipe ; un admin plateforme (ou rôle `admin`) voit tout le tenant. Le calendrier accepte `?month=YYYY-MM` (défaut : le mois courant).
- **`create`** : un employé demande pour lui-même ; un manager/admin peut déposer pour un subordonné (`userId`). Le manager du demandeur est notifié (best-effort, sans bloquer la réponse).
- **`decision`** : réservée à un manager/admin gérant l'auteur (`403 « Seul le manager peut valider une demande »`). L'auteur est notifié ; l'action est journalisée (`leave.decide`). Contrairement aux heures supplémentaires, le commentaire de refus n'est pas obligatoire ici.
- **`cancel`** : le propriétaire ou un manager gérant l'auteur peut annuler.

### Demi-journées

Le schéma de demande prend en charge les congés à la demi-journée via `halfDay` et les périodes de bornage `startPeriod` / `endPeriod` (`full`, `am`, `pm`) :

```ts
createLeaveRequestSchema = {
  userId?: number,              // dépôt pour un tiers (managers)
  leaveTypeId: number,
  startDate: isoDate,
  endDate: isoDate,             // refine: endDate >= startDate
  halfDay?: boolean,
  startPeriod?: 'full' | 'am' | 'pm',
  endPeriod?: 'full' | 'am' | 'pm',
  motif?: string(<=2000) | null,
}
decideLeaveRequestSchema = {
  decision: 'valide' | 'refuse',
  comment?: string(<=2000) | null,
}
```

> `endDate` doit être supérieure ou égale à `startDate`, sinon la validation renvoie `400 « La date de fin doit être ≥ la date de début »`.

## Références

- `server/src/routes/leave.routes.ts`
- `server/src/controllers/leaveType.controller.ts`
- `server/src/controllers/leaveRequest.controller.ts`
- `server/src/validators/schemas.ts`
