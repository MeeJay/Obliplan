Les salariés et les contrats se gèrent depuis deux écrans d'administration du tenant : **Salariés** (`/utilisateurs`, `UsersPage`) et **Contrats** (`/contrats`, `ContratsPage`). Les deux routes sont réservées au rôle `admin` du tenant côté front (`ProtectedRoute requiredRole="admin"`) ; côté serveur, chaque action de modification est en plus gardée par une capacité précise.

## Salariés

L'écran liste les membres du workspace (scopés par la table d'appartenance `user_tenants`, pas par le tenant d'origine). Un manager n'y voit que ses subordonnés directs ; un administrateur voit tout le tenant.

### Créer un salarié

Le bouton « Nouveau salarié » ouvre un formulaire. La création appelle `POST /api/users`, gardée par la capacité `users:manage`.

| Champ | Contrainte (schéma Zod) |
|---|---|
| `username` | requis, 1–100 car., `^[a-zA-Z0-9._-]+$` |
| `password` | requis, 8–255 car. |
| `displayName` | optionnel, ≤ 200 car. |
| `email` | optionnel, format e-mail |
| `role` | optionnel (défaut `employe`) — un slug de `permission_sets` |
| `contratId` | optionnel, entier > 0 ou null |
| `managerId` | optionnel, entier > 0 ou null |

À la création, l'utilisateur est aussi rattaché au tenant courant avec le rôle choisi (`user_tenants`), et l'action est journalisée (`user.create`).

> Lorsque le SSO Obligate est actif, la création locale est désactivée : l'écran affiche « Comptes gérés dans Obligate (SSO) » à la place du bouton, car les comptes sont provisionnés par la passerelle.

### Éditer un salarié

Les champs se modifient en ligne dans le tableau ; chaque changement déclenche `PUT /api/users/:id` (garde `users:manage`). Les colonnes éditables sont le **rôle**, le **contrat**, le **manager** et l'état **actif**.

| Colonne | Champ modifié | Remarque |
|---|---|---|
| Rôle | `role` | Liste des jeux de permissions ; synchronise aussi `user_tenants.role` |
| Contrat | `contratId` | Pilote le calcul du temps de travail |
| Manager | `managerId` | Responsable du planning (exclut l'utilisateur lui-même) |
| Actif | `isActive` | Désactive le compte sans le supprimer |

Cas des comptes SSO (`foreignSource = 'obligate'`) : l'identité, le rôle et l'activation sont **verrouillés** (gérés dans Obligate), mais le **contrat** et le **manager** restent éditables car ils sont locaux à Obliplan (absents d'Obligate). Le changement de rôle resynchronise `user_tenants.role`, qui est ce qui pilote réellement les capacités dans le tenant.

### Options complémentaires

- **Avatar** (`users.avatar`) : photo de profil, synchronisée depuis Obligate (`profilePhotoUrl`) à la connexion SSO. `null` → avatar à initiales. Champ d'affichage : il n'est pas édité depuis l'écran Salariés.
- **Récup self-service** (`users.recup_self_service`) : opt-in par salarié à la vue de récupération en self-service (`/ma-recup`). Il se bascule depuis l'écran Récupération via `PATCH /api/recup/self-service` (capacité `recup:manage`), et non depuis Salariés.
- **RGPD** : chaque ligne propose « Exporter » (export JSON des données) et « Anonymiser » (irréversible : efface l'identité et le lien SSO côté Obliplan, mais conserve les enregistrements de planning et de paie). Voir « Conformité RGPD ».

## Contrats

Le contrat est le modèle **central** qui porte les règles de calcul du temps de travail : il est affecté à un salarié (`contratId`) et détermine ses heures attendues. L'écran Contrats est réservé au rôle `admin` ; les créations/modifications/suppressions sont gardées par la capacité `contrats:manage` (`POST` / `PUT` / `DELETE` sur `/api/contrats`).

| Champ (`Contrat`) | Colonne SQL | Type | Rôle |
|---|---|---|---|
| `heuresHebdoBaseMin` | `heures_hebdo_base_min` | minutes | Base hebdomadaire (35 h, 39 h…) stockée en minutes |
| `heuresSupAutorisees` | `heures_sup_autorisees` | bool | Si `false`, tout dépassement bascule en récupération |
| `seuilHeuresSupMin` | `seuil_heures_sup_min` | minutes / null | Seuil au-delà duquel le dépassement compte en heures sup |
| `alternance` | `alternance` | bool | Contrat en alternance : les jours d'école réduisent l'attendu |
| `workPattern` | `work_pattern` | `number[7]` / null | Minutes attendues par jour [Lun…Dim] ; `null` = uniforme base/5 (Lun–Ven) |
| `ftePercent` | `fte_percent` | 0–100 / null | Équivalent temps plein (informatif) |
| `color` | `color` | `#rrggbb` / null | Couleur du contrat (visualisation planning) |
| `libelle` | `libelle` | texte | Nom du contrat |

### Répartition par jour (work pattern)

Par défaut, un contrat répartit sa base de façon uniforme sur 5 jours (Lun–Ven). En activant « Répartition par jour » (temps partiel / jours fixes), on saisit 7 valeurs d'heures attendues (Lun…Dim). Points de comportement issus de l'écran :

- Lorsqu'un work pattern est défini, la **base hebdomadaire enregistrée = la somme du pattern** (l'UI passe en heures, le stockage en minutes ; chaque jour est borné 0–24 h).
- Un jour est « travaillé » si sa valeur est `> 0`.
- Des préréglages sont proposés : `35h / 5j` (100 %), `Temps plein 39h` (100 %), `80% / 4j (sans mercredi)` (80 %).
- Le champ `ftePercent` (0–100) n'est retenu que si le work pattern est actif.

### Heures sup et récupération

Le drapeau `heuresSupAutorisees` détermine la destination des dépassements : `Oui` → heures supplémentaires ; `Non` → récupération (l'écran affiche « Non (→ récup) »). Le `seuilHeuresSupMin` optionnel fixe le point à partir duquel un dépassement est comptabilisé en heures sup.

### Suppression

`DELETE /api/contrats/:id` peut échouer si le contrat est référencé par des salariés (l'écran affiche « Suppression impossible (contrat utilisé ?) »).

## Impact sur les compteurs

Les contrats sont la source des règles de calcul : heures attendues (base ou work pattern), bascule heures sup / récupération, réduction de l'attendu pour l'alternance (jours d'école). Le détail du calcul des compteurs (attendu, réalisé, solde de récupération) est traité dans le chapitre consacré aux compteurs et au temps de travail.

## Références

- `server/src/services/user.service.ts`
- `server/src/controllers/user.controller.ts`
- `server/src/routes/users.routes.ts`
- `server/src/services/contrat.service.ts`
- `server/src/routes/contrats.routes.ts`
- `server/src/validators/schemas.ts` (`createUserSchema`, `updateUserSchema`, `createContratSchema`)
- `server/src/db/migrations/065_user_avatar.ts`
- `server/src/db/migrations/025_recup_redesign.ts` (`recup_self_service`)
- `shared/src/types.ts` (`User`, `Contrat`)
- `client/src/pages/UsersPage.tsx`
- `client/src/pages/ContratsPage.tsx`
