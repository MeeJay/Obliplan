Cette page regroupe les endpoints d'administration et les services transverses : salariés, contrats, clients, jeux de permissions, configuration plateforme, notifications, tableau de bord, rapports, RGPD, journal d'audit et notifications push. Sauf mention contraire, tous sont tenant-scopés (`requireAuth` + `requireTenant`). Seuls `/api/permission-sets` et `/api/admin/config` sont globaux.

## Salariés (`users.routes.ts`)

Monté sur `/api/users`. Universel (aucune barrière de module).

| Méthode | Chemin | Garde | Corps | Réponse |
|---------|--------|-------|-------|---------|
| `GET` | `/api/users` | `requireManager` | — | Manager → ses subordonnés ; admin → tout le tenant (ou tous les tenants en God View) |
| `GET` | `/api/users/assignable` | authentifié | — | Annuaire minimal (sélecteurs d'assignation) |
| `GET` | `/api/users/manageable` | authentifié | — | Utilisateurs sur lesquels l'appelant peut agir (admin → tenant, manager → subordonnés) |
| `POST` | `/api/users` | `users:manage` | `createUserSchema` | `201` + salarié |
| `GET` | `/api/users/:id` | `requireManager` | — | Salarié |
| `PUT` | `/api/users/:id` | `users:manage` | `updateUserSchema` | Salarié mis à jour |

- Les chemins `/assignable` et `/manageable` précèdent `/:id` pour ne pas être capturés par la route paramétrée.
- **`create`** : un identifiant déjà utilisé renvoie `409 « Identifiant déjà utilisé »`. Le salarié est ajouté au tenant avec son rôle, et l'action est journalisée (`user.create`).
- **`update`** : la modification du rôle synchronise `user_tenants.role` (qui pilote les capacités) ; l'action est journalisée (`user.update`).

```ts
createUserSchema = {
  username: string(1..100, /^[a-zA-Z0-9._-]+$/),
  password: string(8..255),
  displayName?: string(<=200)|null, email?: email|null,
  role?: string, contratId?: number|null, managerId?: number|null,
}
updateUserSchema = { displayName?, email?, role?, isActive?, contratId?, managerId? }
```

## Contrats (`contrats.routes.ts`)

Monté sur `/api/contrats`. Universel. Lecture ouverte à tout utilisateur du tenant ; écriture via `contrats:manage`.

| Méthode | Chemin | Capacité | Corps | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/contrats` | — (lecture) | — | Contrats |
| `GET` | `/api/contrats/:id` | — (lecture) | — | Contrat |
| `POST` | `/api/contrats` | `contrats:manage` | `createContratSchema` | `201` |
| `PUT` | `/api/contrats/:id` | `contrats:manage` | corps partiel | Mise à jour |
| `DELETE` | `/api/contrats/:id` | `contrats:manage` | — | `{ message:'Contrat supprimé' }` |

```ts
createContratSchema = {
  libelle: string(1..200),
  heuresHebdoBaseMin: number (0..10080),
  heuresSupAutorisees: boolean,
  seuilHeuresSupMin?: number(>=0)|null,
  alternance: boolean,
  color?: '#rrggbb'|null,
  workPattern?: number[7] (0..1440 chacun) | null,   // minutes attendues Lun..Dim ; null = base/5
  ftePercent?: number(0..100)|null,
}
```

## Clients (`clients.routes.ts`)

Monté sur `/api/clients`, module `clients`. Lecture ouverte (filtrée par périmètre), écriture via `clients:manage`.

| Méthode | Chemin | Capacité | Corps | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/clients` | — (lecture) | — | Clients (selon le périmètre de l'appelant) |
| `GET` | `/api/clients/:id` | — (lecture) | — | Client |
| `POST` | `/api/clients` | `clients:manage` | `createClientSchema` | `201` |
| `PUT` | `/api/clients/:id` | `clients:manage` | corps partiel | Mise à jour |
| `DELETE` | `/api/clients/:id` | `clients:manage` | — | `{ message:'Client supprimé' }` |

```ts
createClientSchema = {
  name: string(1..200),
  color?: '#rrggbb'|null, contact?: string(<=200)|null, notes?: string(<=2000)|null,
  logo?: string(<=200000)|null,   // data-URI ou URL (redimensionné côté client)
  archived?: boolean,
}
```

## Jeux de permissions (`permissionSets.routes.ts`)

Monté sur `/api/permission-sets`. **Global** (`requireAuth`, sans `requireTenant`). Définit la matrice slug × capacités appliquée par tenant via `user_tenants.role`.

| Méthode | Chemin | Garde | Corps | Réponse |
|---------|--------|-------|-------|---------|
| `GET` | `/api/permission-sets` | `requireAuth` | — | Tous les jeux de permissions |
| `GET` | `/api/permission-sets/capabilities` | `requireAuth` | — | Catalogue des capacités (`CAPABILITIES`) |
| `POST` | `/api/permission-sets` | `requireAdmin` | `{ name, capabilities? }` | `201` + jeu créé |
| `PUT` | `/api/permission-sets/:id` | `requireAdmin` | corps partiel | Jeu mis à jour |
| `DELETE` | `/api/permission-sets/:id` | `requireAdmin` | — | `{ message:'Set supprimé' }` |

> La suppression d'un jeu marqué par défaut renvoie `409 « Un set par défaut ne peut pas être supprimé »` ; un identifiant inexistant renvoie `404`. Le catalogue des capacités est listé dans « Conventions générales de l'API ».

## Configuration plateforme (`appConfig.routes.ts`)

Monté sur `/api/admin/config`. **Global** et réservé à l'admin plateforme (`requireAuth` + `requirePlatformAdmin`). Concerne la configuration non tenant-scopée : À propos, passerelle SSO Obligate, SMTP.

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/admin/config/system` | — | Informations système (À propos) |
| `GET` | `/api/admin/config/obligate` | — | Config passerelle Obligate |
| `PATCH` | `/api/admin/config/obligate` | `patchObligateSchema` | Config mise à jour |
| `GET` | `/api/admin/config/smtp` | — | Config SMTP |
| `PATCH` | `/api/admin/config/smtp` | `patchSmtpSchema` | Config mise à jour |
| `POST` | `/api/admin/config/smtp/test` | `{ to: email }` | Résultat d'envoi de test |

- **`patchObligate`** refuse une URL de passerelle qui pointe vers l'application elle-même (`400 « L'URL Obligate ne peut pas pointer vers cette application. »`, évite une boucle de redirection).

```ts
patchObligateSchema = { url?: url|null, apiKey?: string|null, enabled?: boolean }
patchSmtpSchema = { host?, port?: number(1..65535)|null, secure?: boolean, user?, pass?, fromAddress? }
```

## Notifications (`notifications.routes.ts`)

Monté sur `/api/notifications`. Universel. Le destinataire est toujours l'appelant (`req.session.userId`) ; aucune capacité supplémentaire.

| Méthode | Chemin | Query | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/notifications` | `?limit&offset` | Notifications de l'appelant (plus récentes d'abord) |
| `GET` | `/api/notifications/unread-count` | — | `{ count }` |
| `PATCH` | `/api/notifications/:id/read` | — | `{ success:true }` |
| `POST` | `/api/notifications/read-all` | — | `{ success:true }` |

## Tableau de bord (`dashboard.routes.ts`)

Monté sur `/api/dashboard`. Universel. Agrégateur d'accueil en lecture seule pour l'appelant.

| Méthode | Chemin | Réponse |
|---------|--------|---------|
| `GET` | `/api/dashboard/me` | Widgets d'accueil agrégés pour l'appelant |

## Rapports (`reports.routes.ts`)

Monté sur `/api/reports`. Universel côté module, mais **tous** les endpoints sont gardés par `planning:read_team`. La fenêtre par défaut est le mois calendaire courant ; `?from=YYYY-MM-DD&to=YYYY-MM-DD` (borne `to` exclusive) la surcharge.

| Méthode | Chemin | Capacité | Query | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/reports/workload` | `planning:read_team` | — | Charge par salarié vs capacité hebdomadaire |
| `GET` | `/api/reports/summary` | `planning:read_team` | `?from&to` | Synthèse KPI sur le périmètre |
| `GET` | `/api/reports/by-project` | `planning:read_team` | `?from&to` | Temps suivi groupé par projet |
| `GET` | `/api/reports/by-user` | `planning:read_team` | `?from&to` | Temps suivi vs planifié par employé |
| `GET` | `/api/reports/astreinte` | `planning:read_team` | `?from&to` | Minutes d'astreinte + déclenchements par quinzaine |

> Le périmètre (manager → subordonnés, admin → tenant) est appliqué dans le service. Une fenêtre invalide (`to <= from`) renvoie `400 « Période invalide… »`.

## RGPD (`gdpr.routes.ts`)

Monté sur `/api/gdpr`. Universel.

| Méthode | Chemin | Capacité | Réponse |
|---------|--------|----------|---------|
| `GET` | `/api/gdpr/export/me` | — (soi) | Export des données personnelles de l'appelant (droit d'accès, toutes adhésions) |
| `GET` | `/api/gdpr/export/:id` | `users:manage` | Export d'un salarié du tenant |
| `POST` | `/api/gdpr/anonymize/:id` | `users:manage` | Pseudonymisation d'un salarié (droit à l'effacement) |

- Un admin confiné ne voit que l'adhésion au tenant courant ; un admin plateforme obtient la liste complète.
- Les exports et anonymisations administratifs sont journalisés (`gdpr.export`, `gdpr.anonymize`). Un salarié introuvable renvoie `404`.

## Journal d'audit (`audit.routes.ts`)

Monté sur `/api/audit`. Universel. Journal en ajout seul (aucune route de création/modification/suppression) ; les deux endpoints sont gardés par `users:manage`.

| Méthode | Chemin | Capacité | Query | Réponse |
|---------|--------|----------|-------|---------|
| `GET` | `/api/audit` | `users:manage` | `?action&limit&offset` | Journal du tenant (plus récent d'abord) |
| `GET` | `/api/audit/verify` | `users:manage` | — | Recalcul de la chaîne de hachage (intégrité) |

> `limit` est borné à `[1, 500]` (défaut 100) et `offset` à `>= 0` (défaut 0) pour éviter tout `LIMIT` non borné/négatif.

## Notifications push (`push.routes.ts`)

Monté sur `/api/push`. Universel. L'utilisateur gère ses propres abonnements d'appareil ; aucune capacité (action personnelle).

| Méthode | Chemin | Corps | Réponse |
|---------|--------|-------|---------|
| `GET` | `/api/push/public-key` | — | `{ publicKey, enabled }` (clé VAPID + push actif côté serveur) |
| `POST` | `/api/push/subscribe` | `{ endpoint, keys:{ p256dh, auth } }` | `{ ok:true }` |
| `POST` | `/api/push/unsubscribe` | `{ endpoint }` | `{ ok:true }` |

> Un abonnement incomplet renvoie `400 « Abonnement push invalide. »` ; un désabonnement sans `endpoint` renvoie `400 « Endpoint requis. »`.

## Références

- `server/src/routes/users.routes.ts`
- `server/src/routes/contrats.routes.ts`
- `server/src/routes/clients.routes.ts`
- `server/src/routes/permissionSets.routes.ts`
- `server/src/routes/appConfig.routes.ts`
- `server/src/routes/notifications.routes.ts`
- `server/src/routes/dashboard.routes.ts`
- `server/src/routes/reports.routes.ts`
- `server/src/routes/gdpr.routes.ts`
- `server/src/routes/audit.routes.ts`
- `server/src/routes/push.routes.ts`
- `server/src/controllers/user.controller.ts`
- `server/src/controllers/contrat.controller.ts`
- `server/src/controllers/client.controller.ts`
- `server/src/controllers/permissionSet.controller.ts`
- `server/src/controllers/appConfig.controller.ts`
- `server/src/controllers/notification.controller.ts`
- `server/src/controllers/dashboard.controller.ts`
- `server/src/controllers/report.controller.ts`
- `server/src/controllers/gdpr.controller.ts`
- `server/src/controllers/audit.controller.ts`
- `server/src/controllers/push.controller.ts`
- `server/src/validators/schemas.ts`
- `server/src/validators/client.schema.ts`
