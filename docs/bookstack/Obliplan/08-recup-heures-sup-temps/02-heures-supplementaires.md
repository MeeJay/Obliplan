Le module **heures_sup** couvre les heures supplémentaires : leur comptage automatique sur les contrats qui les autorisent, leur déclaration par les salariés selon une nature configurable, et le circuit de décision (validation ou refus) du manager. Une déclaration validée peut, en tout ou partie, **basculer en récupération**. Le module s'active par le module de tenant `heures_sup` ; ses routes sont montées sous le préfixe `/overtime`.

## Principe : compter le dépassement

Sur un contrat **avec** heures sup (`heuresSupAutorisees = true`), le dépassement du temps attendu est comptabilisé en heures supplémentaires. Un **seuil** facultatif (`seuilHeuresSupMin`) décale le déclenchement : seul le temps au-delà du plus grand des deux bornes (temps attendu et seuil) compte.

```ts
// calc.service.ts — contrat avec heures sup
const floor = contrat.seuilHeuresSupMin ?? attenduMin;
heuresSupMin = Math.max(0, realiseMin - Math.max(attenduMin, floor));
// Le temps d'astreinte compte toujours en heures sup, quel que soit le contrat.
heuresSupMin += astreinteMin;
```

> Sur un contrat **sans** heures sup, le dépassement n'est pas compté ici mais devient éligible à la récupération (voir « Récupération : règles, attribution & solde »).

Ce comptage automatique nourrit les compteurs hebdomadaires. À côté, le module offre un circuit de **déclaration** par lequel le salarié (ou son manager) saisit explicitement des heures supplémentaires — par exemple une intervention ponctuelle — soumises à décision.

> **Périmètre MVP.** On **compte** les heures supplémentaires (en minutes), on ne les **valorise pas** en euros. Aucune conversion monétaire, aucun taux de majoration : le module produit des volumes, pas des montants.

## Natures d'heures sup

Chaque workspace configure ses propres **natures** (`overtime_natures`) pour qualifier les déclarations : Inter, Astreinte Admin, Jour Férié, etc. Une nature porte un libellé, une couleur et un rang de tri, et peut être désactivée sans être supprimée.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | int | Identifiant. |
| `tenant_id` | int | Workspace propriétaire. |
| `libelle` | string | Libellé affiché (ex. « Inter »). |
| `color` | string \| null | Couleur d'affichage (pastille / colonne du récap). |
| `position` | int | Ordre de tri. |
| `is_active` | bool | Une nature inactive n'est plus proposée mais reste référencée par l'historique. |
| `created_at` / `updated_at` | timestamp | Horodatage. |

La gestion des natures se fait dans un bloc dédié de l'écran `/heures-sup` (visible aux administrateurs), gouverné par la capacité `overtime:natures:manage`.

> Dans le récap d'équipe, chaque nature **active** devient une colonne. Les minutes validées sur une nature devenue inactive sont regroupées dans une colonne « Autres » afin que chaque ligne se réconcilie avec son total d'heures sup.

## Déclarations

Une déclaration (`overtime_declarations`) est une demande datée, rattachée à une nature, exprimée en minutes, avec une part éventuellement convertible en récup et un motif libre. Elle suit un workflow à trois états.

| Colonne | Type | Description |
| --- | --- | --- |
| `id` | int | Identifiant. |
| `tenant_id` | int | Workspace propriétaire. |
| `user_id` | int | Salarié concerné. |
| `nature_id` | int | Nature choisie (référence `overtime_natures`). |
| `date` | date | Date des heures. |
| `minutes` | int | Heures supplémentaires déclarées, en minutes. |
| `recup_minutes` | int | Part convertie en récup (0 à `minutes`). |
| `motif` | text \| null | Motif / description de l'intervention. |
| `status` | enum | `en_attente`, `valide` ou `refuse`. |
| `decided_by` | int \| null | Auteur de la décision. |
| `decided_at` | timestamp \| null | Date de la décision. |
| `decision_comment` | text \| null | Commentaire du manager (obligatoire au refus). |
| `created_at` / `updated_at` | timestamp | Horodatage. |

Le statut est contraint en base :

```sql
ALTER TABLE overtime_declarations ADD CONSTRAINT overtime_declarations_status_chk
  CHECK (status IN ('en_attente','valide','refuse'));
```

### Statuts

| `status` | Signification |
| --- | --- |
| `en_attente` | Déclaration créée, en attente de décision. C'est l'état initial. |
| `valide` | Validée par un décideur. Si `recup_minutes > 0`, la part correspondante est créditée en récup. |
| `refuse` | Refusée, avec un `decision_comment` obligatoire. Aucun crédit de récup. |

## Décision et bascule en récup

La décision (`PATCH /overtime/declarations/:id/decision`, capacité `overtime:validate`) fixe le statut à `valide` ou `refuse`, enregistre l'auteur, l'horodatage et le commentaire, puis synchronise le crédit de récup lié.

L'invariant maintenu est : *un crédit de récup lié existe si et seulement si la déclaration est `valide` et `recupMinutes > 0`, pour un montant égal à `recupMinutes`, sur le lundi de la date de la déclaration.* La synchronisation est idempotente et se répercute sur toutes les transitions :

- Validation avec `recupMinutes > 0` → création (ou mise à jour) d'un mouvement de récup `source = 'overtime'`, motif « Conversion heures sup → récup ».
- Refus, ou repassage en `en_attente` (édition / demande de modification), ou suppression → le crédit de récup lié est retiré (la suppression s'appuie sur le `ON DELETE CASCADE`).

> La part récup ne peut **jamais** excéder les heures déclarées : l'interface comme les validateurs rejettent `recupMinutes > minutes` (« La récup ne peut excéder les heures déclarées »).

### Édition et demande de modification

Le propriétaire peut éditer sa déclaration tant qu'elle est `en_attente`. Sur une déclaration déjà **validée**, il peut demander une modification : la déclaration repasse alors en `en_attente`, la décision antérieure est effacée, et tout crédit de récup précédemment attribué est retiré jusqu'à nouvelle validation.

## Écran `/heures-sup`

La page **Heures supplémentaires** (`OvertimePage`) réunit, selon les droits de l'utilisateur :

- **Nouvelle déclaration** : formulaire nature / date / heures / récup / motif, pour se déclarer ses propres heures.
- **Mes déclarations** : historique personnel avec statut, édition/suppression tant qu'en attente, et « Demander une modification » sur une déclaration validée. Le motif de refus est affiché.
- **À valider** (managers) : file de tri rapide des déclarations en attente de l'équipe, avec validation en un clic ou refus motivé.
- **Récap heures sup de l'équipe** (managers) : matrice mensuelle salariés × natures (total H sup, récup, en attente), imprimable, avec panneau de gestion par salarié et déclaration pour le compte d'un salarié.
- **Natures d'heures sup** (administrateurs) : création, édition (dont activation/désactivation) et suppression des natures.

### Endpoints

| Endpoint | Méthode | Capacité |
| --- | --- | --- |
| `/overtime/natures` | GET | — (lecture ouverte) |
| `/overtime/natures` | POST | `overtime:natures:manage` |
| `/overtime/natures/:id` | PUT | `overtime:natures:manage` |
| `/overtime/natures/:id` | DELETE | `overtime:natures:manage` |
| `/overtime/declarations` | GET | — (les siennes ; managers sur l'équipe) |
| `/overtime/declarations` | POST | — (soi‑même ; manager pour un salarié) |
| `/overtime/declarations/pending` | GET | `overtime:validate` |
| `/overtime/declarations/team-summary` | GET | `overtime:validate` |
| `/overtime/declarations/:id/decision` | PATCH | `overtime:validate` |
| `/overtime/declarations/:id` | PUT | — (propriétaire ; contrôlé côté contrôleur) |
| `/overtime/declarations/:id/request-change` | PATCH | — (propriétaire ; contrôlé côté contrôleur) |
| `/overtime/declarations/:id` | DELETE | — (propriétaire si en attente, ou `overtime:validate`) |

## Références

- `server/src/services/overtimeDeclaration.service.ts`
- `server/src/services/overtimeNature.service.ts`
- `server/src/routes/overtime.routes.ts`
- `server/src/services/calc.service.ts` (`heuresSupMin`, `seuilHeuresSupMin`)
- `server/src/db/migrations/026_create_overtime_natures.ts`
- `server/src/db/migrations/027_create_overtime_declarations.ts`
- `server/src/db/migrations/042_overtime_recup_and_decision_comment.ts` (colonnes `recup_minutes`, `decision_comment`)
- `shared/src/overtime.ts` (`OvertimeStatus`, `OvertimeNature`, `OvertimeDeclaration`, `OvertimeTeamSummary`)
- `client/src/pages/OvertimePage.tsx`
