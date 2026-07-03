Le module **récup** trace les heures de récupération de chaque salarié sous forme de mouvements datés (crédits et débits) dont la somme constitue un solde. Il s'adresse d'abord aux contrats **sans heures supplémentaires** : lorsqu'un salarié dépasse son temps attendu sur un tel contrat, le dépassement devient *éligible* à la récupération, mais il n'est **jamais** crédité automatiquement. C'est le manager qui décide d'attribuer, d'ajuster ou de valider la récupération, et chaque décision reste tracée.

## Principe

Le calcul hebdomadaire (voir « Compteurs & règles de calcul ») distingue deux traitements du dépassement selon le contrat :

- Contrat **avec** heures sup (`heuresSupAutorisees = true`) : le dépassement alimente le compteur d'heures supplémentaires (voir « Heures supplémentaires : natures, déclarations & décision »).
- Contrat **sans** heures sup (`heuresSupAutorisees = false`) : le dépassement est reporté dans `recupEligibleMin`, un montant *éligible* à la récupération.

> Le montant éligible n'est qu'une **proposition** issue du calcul. Tant qu'un manager ne l'a pas attribué ou validé, il ne figure pas au solde de récupération du salarié.

Extrait du calcul (`calc.service.ts`) :

```ts
if (overflow > 0 && contrat) {
  if (contrat.heuresSupAutorisees) {
    // dépassement → heures supplémentaires (au-delà du seuil éventuel)
    const floor = contrat.seuilHeuresSupMin ?? attenduMin;
    heuresSupMin = Math.max(0, realiseMin - Math.max(attenduMin, floor));
  } else {
    // pas d'heures sup → le dépassement devient éligible à la récup
    recupEligibleMin = overflow;
  }
}
```

## Mouvements de récupération

Chaque ligne de la table `recup_mouvements` est un mouvement rattaché à une semaine (le lundi de la semaine concernée). La durée est toujours **positive** ; c'est le champ `sens` qui donne la direction (crédit ou débit). Le solde est la somme des crédits moins la somme des débits.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | int | Identifiant du mouvement. |
| `tenant_id` | int | Workspace propriétaire. |
| `user_id` | int | Salarié concerné. |
| `semaine` | date | Lundi de la semaine à laquelle s'applique le mouvement. |
| `heures_min` | int | Montant en minutes (toujours positif). |
| `sens` | enum | `credit` ou `debit`. |
| `motif` | text | Motif libre (facultatif). |
| `source` | string(16) | Provenance du mouvement (voir ci-dessous). `null` = attribution manuelle. |
| `overtime_declaration_id` | int | Renseigné lorsque le mouvement provient d'une conversion d'heures sup en récup. |
| `shift_id` | int | Renseigné lorsque le mouvement est la trace d'un créneau de type `recup` planifié. |
| `created_by` | int | Auteur du mouvement. |
| `created_at` | timestamp | Date de création. |

Le champ `sens` est contraint en base :

```sql
ALTER TABLE recup_mouvements ADD CONSTRAINT recup_sens_chk
  CHECK (sens IN ('credit','debit'));
```

### Provenance (source)

La provenance permet de distinguer les mouvements saisis à la main de ceux générés par le système. L'interface affiche un libellé lisible pour chacun.

| `source` | Libellé affiché | Sens | Origine |
| --- | --- | --- | --- |
| `manual` (ou `null`) | Manuel | crédit ou débit | Attribution ou ajustement saisi par le manager. |
| `eligible` | Validation semaine | crédit | Crédit automatique du dépassement éligible lors de la validation d'une semaine. |
| `overtime` | Heures sup | crédit | Portion d'une déclaration d'heures sup **validée** convertie en récup. |
| `recup-shift` | Récup planning | débit | Débit reflétant un créneau de type `recup` posé au planning. |

> Les mouvements `overtime` et `recup-shift` sont maintenus par le système pour rester cohérents avec leur source : modifier ou supprimer la déclaration d'heures sup, ou le créneau de planning, répercute automatiquement le mouvement de récup lié. Les mouvements `manual` et `eligible`, eux, résultent d'une action explicite du manager.

## Solde

Le solde courant est un calcul, jamais une valeur stockée :

```ts
// Σ crédits − Σ débits (en minutes)
export function recupSoldeMinutes(movements: RecupMouvement[]): number {
  return movements.reduce(
    (acc, m) => acc + (m.sens === 'credit' ? m.heuresMin : -m.heuresMin),
    0,
  );
}
```

Un solde peut donc être négatif (récupération prise d'avance) ; l'interface l'affiche alors en couleur d'alerte.

## Écrans

### Gestion manager — `/recup`

La page **Attribution de récupération** (`RecupPage`) est réservée aux managers et administrateurs : la route front est protégée par la capacité `recup:manage`, et le module `recup` doit être actif sur le workspace. Un manager n'y voit que les salariés qui lui sont rattachés (`manager_id`) ; un administrateur voit l'ensemble du workspace.

Elle réunit trois blocs pour le salarié sélectionné :

- **Valider la semaine** : affiche un aperçu (durée éligible de la semaine, solde actuel, montant à créditer, solde projeté) puis crédite le montant éligible d'un clic. L'opération est **idempotente** : re-valider une semaine déjà créditée remplace le crédit `eligible` existant au lieu de le dupliquer. Un interrupteur *Accès self-service* y permet d'activer la vue employé (voir plus bas).
- **Attribution manuelle** : formulaire semaine (lundi) / durée en heures / sens (crédit ou débit) / motif. C'est le geste par lequel le manager attribue ou ajuste la récupération. Un raccourci pré-remplit la durée avec la récup éligible de la semaine en cours.
- **Mouvements** : historique complet (semaine, sens, durée, source, motif).

### Vue employé — `/ma-recup`

La page **Ma récupération** (`RecupSelfPage`) est une vue en lecture seule : le salarié y consulte son solde courant et l'historique de ses mouvements, sans pouvoir en créer ni en modifier. L'accès est un **opt-in** : la route est ouverte aux managers/administrateurs, ou aux salariés dont l'indicateur `user.recupSelfService` (colonne `users.recup_self_service`, `false` par défaut) a été activé par leur manager depuis l'écran `/recup`.

### Endpoints

| Endpoint | Méthode | Capacité | Rôle |
| --- | --- | --- | --- |
| `/recup` | GET | — (contrôlée dans le contrôleur) | Liste les mouvements et le solde. Soi‑même si self-service activé, sinon manager/admin sur la cible. |
| `/recup/week-preview` | GET | `recup:manage` | Aperçu de ce que créditerait la validation d'une semaine. |
| `/recup/validate-week` | POST | `recup:manage` | Crédite (idempotent) la récup éligible de la semaine. |
| `/recup/self-service` | PATCH | `recup:manage` | Active/désactive la vue self-service d'un salarié. |
| `/recup` | POST | `recup:manage` | Crée un mouvement (attribution manuelle). |
| `/recup/:id` | DELETE | `recup:manage` | Supprime un mouvement. |

Toutes ces routes sont montées sous le préfixe `/recup` et protégées par le module `recup`.

> Côté serveur, l'attribution manuelle refuse toute création par un tiers non habilité : « Seul le manager peut attribuer de la récupération ». La lecture de sa propre récup par un salarié est refusée tant que le self-service n'est pas activé (« Accès self-service récup non activé »).

## Références

- `server/src/services/recup.service.ts`
- `server/src/controllers/recup.controller.ts`
- `server/src/routes/recup.routes.ts`
- `server/src/services/calc.service.ts` (`recupSoldeMinutes`, `recupEligibleMin`)
- `server/src/db/migrations/010_create_recup_mouvements.ts`
- `server/src/db/migrations/025_recup_redesign.ts` (colonne `source`, `recup_self_service`, source `eligible`)
- `server/src/db/migrations/042_overtime_recup_and_decision_comment.ts` (colonne `overtime_declaration_id`, source `overtime`)
- `server/src/db/migrations/044_recup_shift_link.ts` (colonne `shift_id`, source `recup-shift`)
- `shared/src/types.ts` (`RecupSens`, `RecupMouvement`, `recupSelfService`)
- `client/src/pages/RecupPage.tsx`
- `client/src/pages/RecupSelfPage.tsx`
