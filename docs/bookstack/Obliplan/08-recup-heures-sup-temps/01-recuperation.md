Le module **récup** gère les heures de récupération d'un salarié : les crédits gagnés, les débits consommés et le solde qui en résulte. Il s'active par le module de tenant `recup` et repose sur un principe simple : un dépassement d'horaire sur un contrat **sans heures supplémentaires** ouvre un droit à récupération, mais ce droit n'est jamais crédité tout seul — un manager doit toujours l'attribuer ou valider la semaine.

## Principe

Le calcul hebdomadaire (voir « Compteurs & règles de calcul ») produit, pour chaque salarié et chaque semaine, un écart entre le temps réalisé et le temps attendu. Lorsque le contrat **n'autorise pas** les heures supplémentaires (`heuresSupAutorisees = false`), le dépassement positif est classé comme **récup éligible** (`recupEligibleMin`) plutôt que comme heures supplémentaires.

```ts
// server/src/services/calc.service.ts (extrait)
const overflow = Math.max(0, ecartMin); // realiseMin - attenduMin
if (overflow > 0 && contrat) {
  if (contrat.heuresSupAutorisees) {
    // → comptabilisé en heures sup (voir « Heures supplémentaires »)
  } else {
    recupEligibleMin = overflow; // éligible à une attribution manuelle de récup
  }
}
```

> **Point clé** — `recupEligibleMin` est un **compteur calculé**, jamais stocké. Il indique un droit *potentiel*. Tant qu'aucun manager n'a agi, aucun mouvement de récup n'existe et le solde reste inchangé. L'éligibilité ne se transforme jamais en crédit de façon automatique.

## Attribution : toujours à l'initiative du manager

Le crédit d'un droit à récupération passe par une action explicite d'un utilisateur disposant de la capacité `recup:manage` :

- **Attribution manuelle** — le manager saisit un mouvement (semaine, durée, sens, motif). Le contrôleur exige `userService.canManage` sur le salarié cible et rejette sinon la demande (`403 « Seul le manager peut attribuer de la récupération »`).
- **Validation de semaine** — le manager valide la semaine et le montant éligible est crédité en un seul mouvement idempotent (voir « Validation de semaine »).

> **Note** — Un manager ne voit et ne gère que les salariés qui lui sont rattachés (`manager_id`). Un administrateur (ou un platform admin) porte sur l'ensemble du tenant.

## Mouvements de récup

Chaque ligne de la table `recup_mouvements` est un mouvement daté sur une semaine (le lundi). Le solde est la somme algébrique de ces mouvements.

### Colonnes

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | entier | Identifiant du mouvement |
| `tenant_id` | entier | Workspace propriétaire |
| `user_id` | entier | Salarié concerné |
| `semaine` | date ISO | Lundi de la semaine visée |
| `heures_min` | entier | Durée en minutes, **toujours positive** (le signe est porté par `sens`) |
| `sens` | enum | `credit` (+) ou `debit` (−) |
| `motif` | texte \| null | Libellé libre |
| `source` | texte \| null | Provenance du mouvement (voir table ci-dessous) |
| `overtime_declaration_id` | entier \| null | Déclaration d'heures sup à l'origine du crédit (source `overtime`) |
| `shift_id` | entier \| null | Créneau à l'origine du débit (source `recup-shift`) |
| `created_by` | entier \| null | Auteur du mouvement |
| `created_at` | horodatage | Date de création |

### Sens

| Valeur | Signification | Effet sur le solde |
|--------|---------------|--------------------|
| `credit` | Heures de récup **gagnées** | `+ heures_min` |
| `debit` | Heures de récup **consommées** | `− heures_min` |

### Provenance (`source`)

La colonne `source` trace l'origine du mouvement. Elle distingue l'attribution manuelle des mouvements maintenus automatiquement par le système en miroir d'autres objets (déclarations d'heures sup, créneaux de récup).

| `source` | Libellé (UI) | Sens | Comment il est produit |
|----------|--------------|------|------------------------|
| `manual` | Manuel | crédit ou débit | Saisie directe du manager (`POST /recup`) |
| `eligible` | Validation semaine | crédit | Validation de semaine — crédite `recupEligibleMin` |
| `overtime` | Heures sup | crédit | Part `recupMinutes` d'une déclaration d'heures sup **validée** (conversion) |
| `recup-shift` | Récup planning | débit | Trace d'un créneau de type `recup` posé au planning |
| `null` | Manuel | — | Provenance inconnue → traitée comme manuelle dans l'UI |

> **Note** — Les mouvements `overtime` et `recup-shift` sont maintenus par invariant : le crédit lié à une déclaration existe **si et seulement si** la déclaration est validée avec `recupMinutes > 0` ; le débit lié à un créneau existe **si et seulement si** le créneau est de type `recup` avec une durée positive. Modifier, refuser ou supprimer l'objet source ajuste ou retire le mouvement (idempotence garantie par des index partiels et des cascades de clé étrangère). La conversion heures sup → récup est décrite dans « Heures supplémentaires : natures, déclarations & décision ».

## Solde

Le solde d'un salarié est calculé à la volée, jamais stocké :

```ts
// server/src/services/calc.service.ts
export function recupSoldeMinutes(movements: RecupMouvement[]): number {
  return movements.reduce((acc, m) => acc + (m.sens === 'credit' ? m.heuresMin : -m.heuresMin), 0);
}
```

Autrement dit : **solde = Σ crédits − Σ débits**, en minutes. Un solde négatif (plus de récup consommée que gagnée) est possible et affiché en rouge dans l'UI.

## Validation de semaine

L'écran manager propose de « valider la semaine » pour créditer d'un coup la récup éligible calculée. L'opération est **idempotente** par `(tenant_id, user_id, semaine)` : re-valider ne duplique pas le crédit, il le remplace.

- `GET /recup/week-preview?userId=&semaine=` renvoie ce que la validation créditerait : montant éligible, solde actuel, montant déjà crédité pour cette semaine, solde projeté.
- `POST /recup/validate-week` applique le crédit (source `eligible`, motif « Crédit récup éligible (validation semaine) »).

> **Note** — La validation reste une **action manuelle du manager**. Elle ne fait que matérialiser en crédit le montant que le compteur a jugé éligible ; le montant n'est jamais crédité sans ce geste.

## Écrans

### Gestion manager — `/recup`

Page `RecupPage`, protégée côté client par la capacité `recup:manage` et côté serveur par `requireTenantCapability('recup:manage')` sur les routes de mutation. Elle regroupe :

- la **liste des salariés** rattachés au manager (avec un badge de récup éligible pour la semaine courante) ;
- le **panneau de validation de semaine** (aperçu + bouton « Valider & créditer ») ;
- la case **Accès self-service** qui active la vue employé (voir ci-dessous) ;
- le **formulaire d'attribution** (semaine du lundi, durée en heures, sens crédit/débit, motif) ;
- le **tableau des mouvements** avec leur provenance.

### Vue self-service employé — `/ma-recup`

Page `RecupSelfPage`, en **lecture seule** : le salarié consulte son solde courant et l'historique de ses mouvements, sans pouvoir en créer ni en modifier. L'accès est conditionné (garde `RecupSelfRoute`) à `isManager() || user.recupSelfService` : un manager y accède toujours, un salarié uniquement si l'option a été activée pour lui.

> **Avertissement** — Le self-service est un **opt-in par salarié** (`users.recup_self_service`), basculé par le manager via `PATCH /recup/self-service`. Sans cet opt-in, un salarié non-manager qui appelle `GET /recup` sur lui-même reçoit un `403 « Accès self-service récup non activé »`.

## Capacité & module

| Élément | Valeur | Portée |
|---------|--------|--------|
| Module de tenant | `recup` | Active toutes les routes `/recup` |
| Capacité | `recup:manage` | « Gérer la récupération » (groupe Planning) |

## Endpoints

Toutes les routes sont montées sous `/recup` et gardées par le module `recup`.

| Méthode & chemin | Capacité | Rôle |
|------------------|----------|------|
| `GET /recup?userId=` | self (opt-in) ou `canManage` | Mouvements + solde d'un salarié |
| `GET /recup/week-preview?userId=&semaine=` | `recup:manage` | Aperçu de ce que créditerait la validation |
| `POST /recup/validate-week` | `recup:manage` | Crédite (idempotent) la récup éligible de la semaine |
| `PATCH /recup/self-service` | `recup:manage` | Active/désactive la vue self-service d'un salarié |
| `POST /recup` | `recup:manage` | Attribue un mouvement manuel |
| `DELETE /recup/:id` | `recup:manage` | Supprime un mouvement |

### Contraintes de saisie (attribution manuelle)

```ts
// server/src/validators/schemas.ts — createRecupSchema
{
  userId:    number entier positif,
  semaine:   date ISO yyyy-mm-dd,
  heuresMin: entier positif, max 7 * 24 * 60 (une semaine),
  sens:      'credit' | 'debit',
  motif:     chaîne ≤ 2000 caractères, optionnelle/nullable
}
```

## Références

- `server/src/services/recup.service.ts`
- `server/src/controllers/recup.controller.ts`
- `server/src/routes/recup.routes.ts`
- `server/src/validators/recup.schema.ts`, `server/src/validators/schemas.ts` (`createRecupSchema`)
- `server/src/services/calc.service.ts` (`recupSoldeMinutes`, `recupEligibleMin`)
- `shared/src/types.ts` (`RecupMouvement`, `RecupSens`)
- `client/src/pages/RecupPage.tsx`, `client/src/pages/RecupSelfPage.tsx`
- `client/src/App.tsx` (`RecupSelfRoute`, garde `recup:manage`)
