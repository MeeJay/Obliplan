Créer, éditer et supprimer des créneaux (« shifts ») est réservé aux profils disposant de la capacité **`planning:write`**. Cette page décrit les deux éditeurs de créneau, le rôle du statut *validé* dans le calcul du réalisé, et les modèles de créneaux qui accélèrent la saisie.

## Capacité et endpoints

| Action | Endpoint | Capacité |
| --- | --- | --- |
| Créer un créneau | `POST /shifts` | `planning:write` |
| Modifier un créneau | `PUT /shifts/:id` | `planning:write` |
| Supprimer un créneau | `DELETE /shifts/:id` | `planning:write` |
| Modèles (liste) | `GET /shift-templates` | aucune (tout utilisateur authentifié du tenant) |
| Modèles (créer/modifier/supprimer) | `POST` / `PUT /:id` / `DELETE /:id` `/shift-templates` | `planning:write` |

Côté client, la disponibilité de ces actions est gouvernée par `useAuthStore(...).can('planning:write')`.

## Anatomie d'un créneau

Un `Shift` (`shared/src/types.ts`) porte les champs suivants :

| Champ | Type | Rôle |
| --- | --- | --- |
| `date` | `string` (ISO `yyyy-mm-dd`) | Jour du créneau |
| `heureDebut` / `heureFin` | `string \| null` (`HH:mm`) | Plage horaire (nulle pour un type sans heures) |
| `pauseMin` | `number` | Pause non payée, en minutes |
| `type` | `ShiftType` | `travail`, `astreinte`, `pause`, `repos`, `recup`, `conge`, `absence`, `ecole` |
| `statut` | `ShiftStatus` | `brouillon` ou `valide` |
| `note` | `string \| null` | Note libre (masquée dans la vue d'ensemble) |
| `hourTypeId` | `number \| null` | Type d'heure/activité rattaché |
| `boardId` | `number \| null` | Projet (board) rattaché |

## Les deux éditeurs

### `ShiftEditor` — édition complète

Ouvert depuis le Récap (`/equipe`) ou la grille Semaine (`/planning-equipe`) sur un ajout ou un clic de créneau. Il permet de choisir un **modèle** (pré-remplissage), le **type**, les **heures** début/fin, la **pause (min)**, le **type d'heure**, le **projet** (avec création de projet à la volée « + Nouveau projet », client optionnel), le **statut** (Brouillon/Validé) et une **note**.

Règle clé : seuls les types dits « travaillés » (`TIMED_SHIFT_TYPES` = `travail`, `astreinte`, `pause`) conservent heures, pause, type d'heure et projet ; pour tout autre type, ces champs sont forcés à `null`/`0` à l'enregistrement. À la création, le statut par défaut proposé est **Validé**.

### `ShiftQuickEditor` — édition rapide

Popover compact ouvert après avoir dessiné un créneau sur la grille horaire (flux « tracer puis étiqueter »). Il règle le type, les heures, le type d'heure (palette de couleurs), le projet, le statut et la note. Idéal pour qualifier en un geste un créneau fraîchement créé en brouillon.

## Statut brouillon → validé et calcul du réalisé

Le statut est central pour les compteurs :

> **Seuls les créneaux `type = travail` ET `statut = valide` alimentent le réalisé** (`shiftWorkedMinutes` dans `calc.service.ts`). Un créneau `travail` resté en **brouillon** ne compte pas dans le réalisé.

Un créneau est créé en `brouillon` par défaut côté serveur (`shiftService.create`). Trois chemins le font passer à `valide` :

1. l'éditeur, en choisissant explicitement « Validé » ;
2. la **publication** d'une semaine (`planningService.publishWeek`), qui bascule tous les brouillons de la fenêtre en `valide` et notifie les salariés ;
3. l'**import** appliqué avec `statut: 'valide'` (l'import produit des brouillons par défaut).

De même, le temps d'**astreinte** ne compte (`shiftAstreinteMinutes`) que pour les créneaux `type = astreinte` **validés**.

La durée d'un créneau est toujours `fin − début − pause`, bornée à `≥ 0`.

## Astreinte et pause

- **Astreinte** (`astreinte`) : porte des heures. Son temps est **toujours** compté en heures sup, quel que soit le contrat, et le nombre de créneaux d'astreinte validés alimente le compteur de déclenchements (`astreinteDeclenchements`). Voir « Compteurs & règles de calcul ».
- **Pause** (`pause`) : porte des heures mais n'est **ni** du travail **ni** une occupation prise en compte pour le repos ; elle est ignorée dans le réalisé, les plafonds et les contrôles de conformité.

## Récup planifiée

Poser un créneau `type = recup` avec des heures crée automatiquement un **débit** de récupération lié au créneau (`recupService.syncRecupForShift`, `sens: 'debit'`, motif « Récup planifiée »). Modifier ou supprimer le créneau met à jour ou supprime ce mouvement. À l'inverse, l'attribution d'un **crédit** de récup reste une action **manuelle** du manager (voir « Récupération : règles, attribution & solde »).

## Modèles de créneaux (`ShiftTemplatesManager`)

Un `ShiftTemplate` est un créneau nommé et réutilisable (nom, heures, pause, type, type d'heure, projet, couleur). Le gestionnaire est un CRUD compact, réservé à `planning:write`, replié par défaut. Les modèles servent à :

- **pré-remplir** un créneau dans `ShiftEditor` (menu « Modèle ») ;
- être **glissés-déposés** sur une case de la grille Semaine pour créer un brouillon en un geste (`RotaGrid`).

## Références

- `server/src/services/shift.service.ts` (`create`, `update`, `delete`, `rowToShift`)
- `server/src/services/shiftTemplate.service.ts`
- `server/src/services/calc.service.ts` (`shiftWorkedMinutes`, `shiftAstreinteMinutes`)
- `server/src/services/recup.service.ts` (`syncRecupForShift`)
- `server/src/routes/shifts.routes.ts`, `shiftTemplates.routes.ts`
- `client/src/components/planning/ShiftEditor.tsx`, `ShiftQuickEditor.tsx`, `ShiftTemplatesManager.tsx`, `shiftMeta.ts`
