Le module **heures_sup** couvre les heures supplémentaires : leur comptage automatique sur les contrats qui les autorisent, leur déclaration par les salariés selon une nature configurable, et le circuit de validation par le manager. Une déclaration validée peut, en tout ou partie, **basculer en récupération**. Le module s'active par le module de tenant `heures_sup` (routes `/overtime`).

## Principe : comptabiliser le dépassement

Lorsque le contrat **autorise** les heures supplémentaires (`heuresSupAutorisees = true`), le dépassement d'horaire hebdomadaire est comptabilisé en heures supplémentaires, au-delà d'un **seuil** optionnel s'il est défini :

```ts
// server/src/services/calc.service.ts (extrait)
if (contrat.heuresSupAutorisees) {
  const floor = contrat.seuilHeuresSupMin ?? attenduMin;
  heuresSupMin = Math.max(0, realiseMin - Math.max(attenduMin, floor));
}
// Le temps d'astreinte est compté en heures sup quel que soit le contrat.
heuresSupMin += astreinteMin;
```

- Sans seuil (`seuilHeuresSupMin = null`), tout ce qui dépasse l'attendu compte comme heures sup.
- Avec seuil, seul ce qui dépasse le plus haut des deux (attendu, seuil) compte.
- Le temps d'**astreinte** est toujours ajouté aux heures sup, indépendamment du contrat.

> **À noter** — À l'inverse, un contrat **sans** heures sup renvoie le dépassement vers la récupération (voir « Récupération : règles, attribution & solde »). Le détail du calcul de `heuresSupMin` figure dans « Compteurs & règles de calcul ».

> **Périmètre (MVP)** — Le module **compte** les heures (en minutes) et n'assure **aucune valorisation monétaire**. Il n'existe ni taux, ni montant, ni majoration en euros dans les déclarations : la conversion en paie est hors périmètre du MVP.

## Natures d'heures sup

Chaque déclaration est étiquetée par une **nature**, catalogue configurable par tenant (par exemple Inter, Astreinte Admin, Jour Férié…). Les natures portent une couleur et un ordre d'affichage, et peuvent être désactivées sans être supprimées.

### Colonnes (`overtime_natures`)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | entier | Identifiant |
| `tenant_id` | entier | Workspace propriétaire |
| `libelle` | texte | Nom affiché |
| `color` | texte \| null | Couleur (pastille et récap) |
| `position` | entier | Ordre d'affichage (tri par `position`, puis `libelle`) |
| `is_active` | booléen | Nature active (proposée à la déclaration) ou archivée |
| `created_at` / `updated_at` | horodatage | Suivi |

> **Note** — Une nature désactivée reste rattachée aux déclarations passées : dans le récapitulatif d'équipe, ses minutes sont regroupées dans une colonne « Autres » pour que chaque ligne se réconcilie avec son total d'heures sup.

## Déclarations

Une déclaration est une saisie datée d'un volume d'heures sup, portée par une nature, soumise à un circuit de validation.

### Colonnes (`overtime_declarations`)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | entier | Identifiant |
| `tenant_id` | entier | Workspace propriétaire |
| `user_id` | entier | Salarié déclarant |
| `nature_id` | entier | Nature (FK `overtime_natures`) |
| `date` | date ISO | Jour concerné |
| `minutes` | entier | Heures sup déclarées (en minutes) |
| `recup_minutes` | entier | Part convertie en récup, dans `[0..minutes]` |
| `motif` | texte \| null | Descriptif (intervention, contexte…) |
| `status` | enum | `en_attente`, `valide` ou `refuse` |
| `decided_by` | entier \| null | Auteur de la décision |
| `decided_at` | horodatage \| null | Date de décision |
| `decision_comment` | texte \| null | Motif du manager (**obligatoire au refus**) |
| `created_at` / `updated_at` | horodatage | Suivi |

### Statuts

| `status` | Libellé (UI) | Signification |
|----------|--------------|---------------|
| `en_attente` | En attente | Soumise, en attente de décision |
| `valide` | Validé | Acceptée par le manager |
| `refuse` | Refusé | Rejetée (avec motif obligatoire) |

## Décision & cycle de vie

- **Création** — un salarié déclare pour lui-même ; un manager/admin peut déclarer **pour un rapporté** (champ `userId`). La déclaration naît `en_attente` et notifie le manager. Contrainte : `recup_minutes ≤ minutes`.
- **Décision** — le manager **valide** ou **refuse** (`PATCH …/decision`). Un **refus exige un commentaire** (`400 « Un motif de refus est requis »` sinon). La décision est tracée dans le journal d'audit (`overtime.decide`) et notifie l'auteur.
- **Modification par l'auteur** — l'auteur édite sa déclaration **en attente** (`PUT …/:id`). Sur une déclaration **déjà décidée**, il passe par une **demande de modification** (`PATCH …/request-change`) qui la repositionne en `en_attente`.
- **Correction par le manager** — un manager peut corriger une déclaration d'un rapporté **quel que soit son statut** ; l'édition la ramène en `en_attente` pour re-validation.
- **Suppression** — l'auteur supprime sa propre déclaration **en attente** ; un titulaire de `overtime:validate` supprime n'importe laquelle.

> **Avertissement** — Toute édition ou demande de modification **efface la décision précédente** et repasse la déclaration en `en_attente`. Un crédit de récup éventuellement déjà accordé est alors retiré (voir ci-dessous), puis re-crédité seulement si la déclaration est à nouveau validée.

## Basculement en récup

Le champ `recup_minutes` porte la part de la déclaration convertie en récupération. Le système maintient l'invariant suivant : **un crédit de récup lié à la déclaration existe si et seulement si** la déclaration est `valide` **et** `recup_minutes > 0`.

- À la validation avec `recup_minutes > 0` : un mouvement de récup **crédit** est créé (source `overtime`, motif « Conversion heures sup → récup »), daté sur le lundi de `date`.
- Au refus, à l'édition ou à la suppression : le crédit est retiré (idempotence par index partiel `recup_overtime_decl_uniq` ; suppression propagée par cascade de clé étrangère).

Le solde de récup résultant est décrit dans « Récupération : règles, attribution & solde ».

## Écran `/heures-sup` (`OvertimePage`)

La page s'adapte au rôle de l'utilisateur :

- **Nouvelle déclaration** — formulaire self-service (nature, date, heures, part récup, motif). Un garde-fou empêche `récup > heures`.
- **À valider** (manager/admin) — file de triage des déclarations en attente de l'équipe : valider, refuser (avec motif) ou supprimer.
- **Mes déclarations** — l'historique personnel avec statut : édition/suppression tant qu'elles sont en attente, « demander une modification » sur une validée, suppression admin sur n'importe quel statut.
- **Récap heures sup de l'équipe** (`ManagerConsole`) — matrice mensuelle (une ligne par salarié, une colonne par nature active, plus « Autres », « Total H sup », « Récup » et « En attente »), panneau de gestion par salarié, déclaration pour le compte d'un salarié, et impression du récapitulatif.
- **Natures d'heures sup** (admin / `overtime:natures:manage`) — création, édition, activation et suppression des natures.

Le récapitulatif d'équipe agrège, par salarié et par mois : minutes validées, minutes en récup, minutes et nombre en attente, nombre de refus, et le détail par nature.

## Capacités & module

| Élément | Valeur | Portée |
|---------|--------|--------|
| Module de tenant | `heures_sup` | Active toutes les routes `/overtime` |
| Capacité | `overtime:validate` | « Valider les heures supplémentaires » (groupe Heures sup) |
| Capacité | `overtime:natures:manage` | « Gérer les natures d'heures sup » (groupe Heures sup) |

## Endpoints

Toutes les routes sont montées sous `/overtime` et gardées par le module `heures_sup`.

### Natures

| Méthode & chemin | Capacité |
|------------------|----------|
| `GET /overtime/natures` | lecture par tous |
| `POST /overtime/natures` | `overtime:natures:manage` |
| `PUT /overtime/natures/:id` | `overtime:natures:manage` |
| `DELETE /overtime/natures/:id` | `overtime:natures:manage` |

### Déclarations

| Méthode & chemin | Autorisation |
|------------------|--------------|
| `GET /overtime/declarations?userId=` | self, ou `canManage` sur la cible |
| `GET /overtime/declarations/pending` | `overtime:validate` |
| `GET /overtime/declarations/team-summary?month=YYYY-MM` | `overtime:validate` |
| `POST /overtime/declarations` | self, ou `canManage` (déclaration pour un rapporté) |
| `PATCH /overtime/declarations/:id/decision` | `overtime:validate` (+ `canManage` sur la cible) |
| `PUT /overtime/declarations/:id` | auteur (en attente) ou manager (tout statut) |
| `PATCH /overtime/declarations/:id/request-change` | auteur |
| `DELETE /overtime/declarations/:id` | auteur (en attente) ou `overtime:validate` |

## Références

- `server/src/services/overtimeDeclaration.service.ts`
- `server/src/services/overtimeNature.service.ts`
- `server/src/controllers/overtimeDeclaration.controller.ts`
- `server/src/routes/overtime.routes.ts`
- `server/src/services/calc.service.ts` (`heuresSupMin`, `seuilHeuresSupMin`)
- `shared/src/overtime.ts` (`OvertimeNature`, `OvertimeDeclaration`, `OvertimeStatus`, `OvertimeTeamSummary`)
- `client/src/pages/OvertimePage.tsx`
- `client/src/App.tsx` (route `/heures-sup`)
