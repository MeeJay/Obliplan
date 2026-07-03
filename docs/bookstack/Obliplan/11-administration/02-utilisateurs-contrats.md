Les salariés et les contrats se gèrent depuis deux écrans d'administration du tenant : **Salariés** (`/utilisateurs`, `UsersPage`) et **Contrats** (`/contrats`, `ContratsPage`). Les deux routes sont réservées au rôle `admin` du tenant côté client (`ProtectedRoute requiredRole="admin"`) ; côté serveur, chaque écriture est gardée par une capacité précise.

## Salariés (`/utilisateurs`)

L'écran liste les membres du tenant (résolus par la table d'appartenance `user_tenants`, et non par le tenant d'origine `users.tenant_id`) et permet de créer et d'éditer un salarié. La colonne « Actions » et les commandes d'édition ne sont visibles que si la capacité `users:manage` est accordée (`can('users:manage')`).

### Endpoints

| Méthode | Route | Garde | Rôle |
|---------|-------|-------|------|
| `GET` | `/users` | `requireManager()` | Liste des membres du tenant |
| `POST` | `/users` | `requireTenantCapability('users:manage')` | Créer un salarié |
| `PUT` | `/users/:id` | `requireTenantCapability('users:manage')` | Mettre à jour un salarié |

### Créer un salarié

Le formulaire de création envoie `POST /users`. Champs disponibles :

| Champ | Contenu |
|-------|---------|
| `username` | Identifiant de connexion (obligatoire) |
| `password` | Mot de passe local, **≥ 8 caractères** (validé côté client) |
| `displayName` | Nom affiché (optionnel) |
| `email` | Adresse e-mail (optionnel) |
| `role` | Slug d'un jeu de permissions (`employe` par défaut) |
| `contratId` | Contrat affecté (optionnel) |
| `managerId` | Manager responsable (optionnel) |

### Éditer un salarié

L'édition en ligne appelle `PUT /users/:id` (méthode `userService.update`), protégée par un garde d'appartenance : la mise à jour n'aboutit que si l'utilisateur est bien membre du tenant. Champs modifiables : `displayName`, `email`, `role`, `isActive`, `contratId`, `managerId`.

- **Affecter un contrat** (`contratId`) : liste déroulante des contrats du tenant.
- **Affecter un manager** (`managerId`) : liste des utilisateurs de rôle `manager` ou `admin`, en excluant le salarié lui-même.
- **Rôle** (`role`) : liste des jeux de permissions ; définit les capacités de la personne (voir « Jeux de permissions & capacités »).
- **Actif** (`isActive`) : désactive le compte sans le supprimer.

### Comptes gérés par le SSO Obligate

Quand le SSO Obligate est activé, l'en-tête affiche « Comptes gérés dans Obligate (SSO) » et le bouton de création disparaît. Pour un compte dont `foreignSource === 'obligate'` :

- l'**identité, le rôle et l'état actif** sont verrouillés (gérés dans Obligate) ;
- le **contrat** et le **manager** restent éditables (données locales à Obliplan, absentes d'Obligate).

### Options du salarié (attributs)

Deux attributs figurent sur l'objet `User` mais ne se règlent **pas** sur cet écran :

- `recupSelfService` — opt-in par salarié à la vue self-service de récupération (`/ma-recup`). Il se bascule depuis l'écran d'administration de la récupération (voir « Récupération : règles, attribution & solde »), via `recupApi.setSelfService`.
- `avatar` — photo de profil synchronisée depuis Obligate (repli sur les initiales).

### RGPD

Pour les gestionnaires (`users:manage`), chaque ligne propose l'**export** des données (`GET /gdpr/export/:id`) et l'**anonymisation** (`POST /gdpr/anonymize/:id`, irréversible : efface l'identité mais conserve les enregistrements de planning et de paie). L'anonymisation n'est pas proposée pour un compte déjà anonymisé ni pour soi-même. Le compte Obligate de la personne n'est pas affecté.

## Contrats (`/contrats`)

Un contrat porte les paramètres de temps de travail d'un salarié. Les boutons de création/édition/suppression n'apparaissent qu'avec la capacité `contrats:manage`.

### Endpoints

| Méthode | Route | Garde |
|---------|-------|-------|
| `GET` | `/contrats` | (lecture) |
| `POST` | `/contrats` | `requireTenantCapability('contrats:manage')` |
| `PUT` | `/contrats/:id` | `requireTenantCapability('contrats:manage')` |
| `DELETE` | `/contrats/:id` | `requireTenantCapability('contrats:manage')` |

### Champs d'un contrat

| Champ (API) | Colonne | Type | Rôle |
|-------------|---------|------|------|
| `libelle` | `libelle` | chaîne | Nom du contrat |
| `heuresHebdoBaseMin` | `heures_hebdo_base_min` | entier (minutes) | Base hebdomadaire attendue |
| `heuresSupAutorisees` | `heures_sup_autorisees` | booléen | Autorise les heures sup (sinon → récupération) |
| `seuilHeuresSupMin` | `seuil_heures_sup_min` | entier (minutes) ou `null` | Seuil de déclenchement des heures sup |
| `alternance` | `alternance` | booléen | Alternance : les jours d'école réduisent l'attendu |
| `workPattern` | `work_pattern` | tableau de 7 entiers (minutes) ou `null` | Répartition par jour Lun→Dim |
| `ftePercent` | `fte_percent` | entier 0–100 ou `null` | Équivalent temps plein (%) |
| `color` | `color` | chaîne ou `null` | Couleur (visualisation planning) |

> Les durées sont stockées en **minutes** en base ; l'interface les saisit en heures et convertit (p. ex. 35 h → 2100 min). `work_pattern` est sérialisé en JSON.

### Répartition par jour (work pattern) et FTE

Par défaut, l'attendu est réparti uniformément sur la base hebdomadaire. En activant « Répartition par jour » (temps partiel / jours fixes), on définit un tableau de 7 valeurs horaires (Lundi → Dimanche). Dans ce cas, `heuresHebdoBaseMin` est recalculé comme la **somme du pattern** (base, liste et calcul restent cohérents), et `ftePercent` peut être renseigné (0–100). L'interface propose des préréglages : `35h / 5j`, `Temps plein 39h`, `80% / 4j (sans mercredi)`. Sans pattern, `ftePercent` reste `null`.

### Heures sup et seuil

Lorsque `heuresSupAutorisees` est faux, l'interface indique « Non (→ récup) » : le dépassement bascule en récupération au lieu d'être compté en heures supplémentaires. `seuilHeuresSupMin` fixe, en option, le seuil de déclenchement.

### Suppression

`DELETE /contrats/:id` échoue si le contrat est encore utilisé (référencé par un salarié) ; l'interface affiche alors « Suppression impossible (contrat utilisé ?) ».

## Impact des contrats sur les compteurs

Les paramètres du contrat (base hebdomadaire, répartition par jour, alternance, seuil et autorisation d'heures sup) alimentent le calcul de l'attendu, des heures supplémentaires et de la récupération. Voir « Récupération : règles, attribution & solde » et « Heures supplémentaires : natures, déclarations & décision » pour le détail des compteurs.

## Références

- `server/src/services/user.service.ts`
- `server/src/services/contrat.service.ts`
- `server/src/routes/users.routes.ts`
- `server/src/routes/contrats.routes.ts`
- `client/src/pages/UsersPage.tsx`
- `client/src/pages/ContratsPage.tsx`
- `shared/src/types.ts` (`User`), `shared/src/*` (`Contrat`)
