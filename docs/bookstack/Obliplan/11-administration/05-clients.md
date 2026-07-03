Le module **Clients** fournit un référentiel de clients par workspace, utilisé comme axe d'imputation du temps et de rattachement des tableaux (boards). L'écran **Clients** (`/clients`, `ClientsPage`) est réservé au rôle `admin` du tenant (côté client), et l'accès aux routes suppose que le module `clients` soit activé pour le workspace (`requireModule('clients')`).

## Gestion des clients

L'écran liste les clients du tenant et permet de les créer, éditer et supprimer. Les commandes d'édition n'apparaissent qu'avec la capacité `clients:manage` (`can('clients:manage')`).

### Endpoints

| Méthode | Route | Garde |
|---------|-------|-------|
| `GET` | `/clients` | module `clients` actif |
| `GET` | `/clients/:id` | module `clients` actif |
| `POST` | `/clients` | `requireTenantCapability('clients:manage')` |
| `PUT` | `/clients/:id` | `requireTenantCapability('clients:manage')` |
| `DELETE` | `/clients/:id` | `requireTenantCapability('clients:manage')` |

Toutes ces routes sont montées derrière `requireModule('clients')` : si le module est désactivé pour le workspace, l'API répond `403 « Module désactivé pour ce workspace »`.

### Champs d'un client

| Champ (API) | Colonne | Type | Rôle |
|-------------|---------|------|------|
| `name` | `name` | chaîne | Nom du client |
| `color` | `color` | chaîne ou `null` | Couleur (visualisation projets) |
| `contact` | `contact` | chaîne ou `null` | Contact (optionnel) |
| `notes` | `notes` | chaîne ou `null` | Notes libres (optionnel) |
| `logo` | `logo` | chaîne ou `null` | Logo en data-URI (optionnel) |
| `archived` | `archived` | booléen | Archivé (masqué des nouveaux projets) |

### Logo

Le logo est importé côté client puis redimensionné dans un canvas de sorte que son plus grand côté soit ≤ 96 px, et exporté en WebP (repli PNG). Le résultat, un data-URI de quelques Ko, est stocké tel quel dans la colonne texte `logo`. L'import est refusé si le fichier n'est pas une image ou si le data-URI dépasse 200 000 caractères. À défaut de logo, une pastille de couleur (ou l'initiale du nom) est affichée.

### Portée de la liste (Axis C)

`clientService.getAll` applique le périmètre par équipe : un platform admin, un `admin` de tenant ou un appel god-view (tenant `null`) obtiennent la liste **non filtrée**. Pour les autres, la liste est restreinte aux clients accordés par les équipes de l'utilisateur (résolues via `teamService.resolveScope`) ; sans périmètre, la liste est vide. Voir « Jeux de permissions & capacités » pour l'axe équipe.

### Archivage et suppression

`archived` masque le client des nouveaux projets sans le supprimer. `DELETE /clients/:id` supprime définitivement le client ; l'interface affiche « Suppression impossible » en cas d'échec.

## Usage comme axe d'imputation

Le client sert de dimension transverse :

- **Imputation du temps** — les saisies de temps peuvent être rattachées à un client, qui devient un axe d'analyse. Voir « Pointage : types d'heures, clients & saisies ».
- **Rattachement des boards** — un tableau Kanban/Scrum peut être rattaché à un client (l'écran invite d'ailleurs à créer un client « pour rattacher vos projets »). Voir « Kanban/Scrum : tableaux, colonnes, WIP & sprints ».

## Références

- `server/src/services/client.service.ts`
- `server/src/routes/clients.routes.ts`
- `server/src/routes/index.ts` (`requireModule('clients')`)
- `client/src/pages/ClientsPage.tsx`
- `client/src/api/index.ts` (`clientApi`)
