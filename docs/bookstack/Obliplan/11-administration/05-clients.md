Le module **Clients** fournit un référentiel de clients par workspace, utilisé comme axe d'imputation du temps et de rattachement des tableaux (boards). L'écran **Clients** (`/clients`, `ClientsPage`) est réservé au rôle `admin` du tenant, et l'accès aux routes suppose que le module `clients` soit activé pour le workspace (`requireModule('clients')`).

## Gestion des clients

Les créations, modifications et suppressions sont gardées par la capacité `clients:manage` ; la lecture est ouverte aux membres du tenant (avec restriction de portée, voir plus bas).

| Endpoint | Garde |
|---|---|
| `GET /api/clients` | module `clients` + `requireTenant` |
| `GET /api/clients/:id` | module `clients` |
| `POST /api/clients` | capacité `clients:manage` |
| `PUT /api/clients/:id` | capacité `clients:manage` |
| `DELETE /api/clients/:id` | capacité `clients:manage` |

### Champs d'un client

| Champ (`Client`) | Colonne SQL | Type | Rôle |
|---|---|---|---|
| `name` | `name` | texte | Nom du client |
| `color` | `color` | `#rrggbb` / null | Couleur (pastille par défaut, visu projets) |
| `contact` | `contact` | texte / null | Contact (optionnel) |
| `notes` | `notes` | texte / null | Notes libres |
| `logo` | `logo` | texte / null | Logo encodé en data-URI (optionnel) |
| `archived` | `archived` | bool | Archivé : masqué des nouveaux projets |

### Logo

Le logo est importé depuis l'écran (bouton « Importer une image »). L'image est **redimensionnée côté client** de sorte que son plus grand côté soit ≤ 96 px, puis exportée en WebP (repli PNG), ce qui donne un data-URI de quelques kilo-octets stocké tel quel dans la colonne texte `logo`. Un data-URI dépassant 200 000 caractères est refusé (« Image trop lourde »). En l'absence de logo, une pastille aux initiales colorée par `color` est affichée.

## Portée de visibilité (axe C)

La liste des clients dépend du profil de l'appelant. Un administrateur (ou l'administrateur plateforme) voit **tous** les clients du tenant. Sinon, la visibilité est restreinte par la portée des équipes de l'utilisateur (axe C) : si la portée n'accorde pas « tous les clients », seuls les identifiants de clients accordés sont retournés (aucun → liste vide). Ce filtrage s'appuie sur `teamService.resolveScope` et la table `team_permissions` décrite dans « RBAC : capacités, permission sets & rôles ».

## Usage : imputation du temps et rattachement des boards

Le client sert de **rattachement** aux tableaux et, par ricochet, d'axe d'imputation du temps :

- **Rattachement des boards** — un tableau porte un `clientId` optionnel (`createBoardSchema.clientId`). C'est ce qui relie un projet Kanban/Scrum à un client.
- **Imputation du temps** — une saisie de temps (`time_entries`) est rattachée à un board (`board_id`), non directement au client. L'imputation par client se fait donc **via le board** : les agrégats de reporting regroupent le temps par tableau et joignent le nom du client (`clients.name`) pour restituer le temps par client.

Un client `archived` reste exploitable pour l'historique mais est masqué des nouveaux projets.

Pour la saisie et l'agrégation du temps, voir « Pointage ». Pour le rattachement d'un tableau à un client et la gestion des projets, voir « Kanban/Scrum ».

## Références

- `server/src/services/client.service.ts`
- `server/src/controllers/client.controller.ts`
- `server/src/routes/clients.routes.ts`
- `server/src/validators/client.schema.ts`
- `server/src/db/migrations/022_add_client_to_boards.ts`
- `server/src/services/reporting.service.ts` (agrégat temps par board → client)
- `shared/src/types.ts` (`Client`)
- `client/src/pages/ClientsPage.tsx`
