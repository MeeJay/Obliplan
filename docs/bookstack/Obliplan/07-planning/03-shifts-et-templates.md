Créer, éditer et valider des créneaux (« shifts ») est réservé aux profils disposant de la capacité **`planning:write`**. Cette page décrit les deux éditeurs de créneau, le rôle du statut *validé* dans le calcul du réalisé, et les modèles de créneaux qui accélèrent la saisie.

## Capacité et endpoints

| Action | Endpoint | Capacité |
|---|---|---|
| Créer un créneau | `POST /shifts` | `planning:write` |
| Modifier un créneau | `PUT /shifts/:id` | `planning:write` |
| Supprimer un créneau | `DELETE /shifts/:id` | `planning:write` |
| Lister des créneaux | `GET /shifts` | soi-même, ou manager/admin (contrôlé dans le contrôleur) |

## Anatomie d'un créneau

Un créneau (`Shift`) porte les champs suivants (mappés depuis la table `shifts`) :

| Champ | Type | Rôle |
|---|---|---|
| `userId` | number | Salarié concerné (réaffectable) |
| `date` | ISO `yyyy-mm-dd` | Jour du créneau |
| `heureDebut` / `heureFin` | `HH:mm` ou null | Bornes horaires (null pour les types plein-jour) |
| `pauseMin` | number | Pause non payée, en minutes |
| `type` | `ShiftType` | Nature du créneau (voir table ci-dessous) |
| `statut` | `brouillon` \| `valide` | Brouillon (non publié) ou validé |
| `note` | string ou null | Note libre |
| `hourTypeId` | number ou null | Type d'heure (activité, couleur) |
| `boardId` | number ou null | Projet rattaché |

Types de créneau (`ShiftType`) : `travail`, `astreinte`, `pause`, `repos`, `recup`, `conge`, `absence`, `ecole`.

## Éditeur complet — `ShiftEditor`

Ouvert depuis le récap équipe (`/equipe`) ou la vue Semaine du tableau planning, `ShiftEditor` est une boîte de dialogue avec les champs :

- **Modèle** : pré-remplit le créneau à partir d'un modèle existant.
- **Type** : l'un des huit `ShiftType`.
- Si le type porte des heures (`travail`, `astreinte`, `pause`) : **Début**, **Fin**, **Pause (min)**, **Type d'heure** et **Projet**. Un lien « + Nouveau projet » crée un board à la volée (nom, et — via la clé à molette — un client optionnel).
- **Statut** : `Brouillon` ou `Validé`.
- **Note**.

> Valeurs par défaut d'un **nouveau** créneau via `ShiftEditor` : type `travail`, 09:00–17:00, pause 60 min, **statut `Validé`**. Pour les types sans heures, `heureDebut`, `heureFin`, `hourTypeId`, `boardId` sont forcés à null et `pauseMin` à 0 à l'enregistrement.

## Éditeur rapide — `ShiftQuickEditor`

Popover compact du flux « dessiner puis qualifier » de la grille horaire. Après avoir tracé un créneau (créé en **brouillon**, type `travail`), il permet de régler le **type**, les **heures**, le **type d'heure** (boutons colorés), le **projet**, le **statut** et la **note**. Il ne gère pas la pause ni la création de projet à la volée (contrairement à `ShiftEditor`).

## Statut brouillon → validé, et son rôle dans le calcul

Le statut est central pour le calcul du réalisé :

```ts
// server/src/services/calc.service.ts
export function shiftWorkedMinutes(shift: Shift): number {
  if (shift.type !== 'travail' || shift.statut !== 'valide') return 0;
  return shiftSpanMinutes(shift); // fin − début − pause, borné ≥ 0
}
```

Seuls les créneaux **`travail` ET `valide`** comptent dans le **réalisé**. Un brouillon, quel que soit son type, ne pèse pas dans les compteurs. C'est pourquoi la saisie assistée (dessin, glisser d'un modèle, duplication de semaine, import CSV) crée systématiquement des **brouillons**, à réviser puis **publier**.

**Publier une semaine** bascule tous les brouillons de la fenêtre `[lundi, lundi+7)` des salariés visés en `valide`, puis notifie chaque employé concerné (`POST /planning/publish`, capacité `planning:write`). L'astreinte suit la même règle de validation : seul un créneau `astreinte` **validé** est compté.

## Astreinte et pause

- **Astreinte** (`type = 'astreinte'`) : créneau horaire. Une fois validé, son temps est **toujours** compté en heures supplémentaires (quel que soit le contrat) et chaque créneau d'astreinte compte pour un **déclenchement**. Voir « Compteurs & règles de calcul ».
- **Pause** (`type = 'pause'`) : créneau horaire, mais **exclu du réalisé** et des plafonds de conformité. Le calcul de conformité ignore purement et simplement les créneaux `pause` (comme `repos`, `conge`, `absence`).

> Cas particulier : un créneau `recup` porteur d'heures crée (ou met à jour) automatiquement un **mouvement de récupération au débit** tracé (`source = 'recup-shift'`, motif « Récup planifiée ») via `recupService.syncRecupForShift`, appelé à chaque création/mise à jour de créneau.

## Modèles de créneaux — `ShiftTemplatesManager`

Les modèles (`ShiftTemplate`) sont des créneaux nommés réutilisables, gérés par les managers (`planning:write`). Le gestionnaire (replié par défaut) liste les modèles existants et propose un formulaire de création.

| Endpoint | Capacité |
|---|---|
| `GET /shift-templates` | lisible par tout profil `planning:write` |
| `POST /shift-templates` | `planning:write` |
| `PUT /shift-templates/:id` | `planning:write` |
| `DELETE /shift-templates/:id` | `planning:write` |

Champs d'un modèle : `name`, `heureDebut`, `heureFin`, `pauseMin`, `type` (défaut `travail`), `hourTypeId`, `boardId`, `color`. Un modèle s'applique de deux façons : via le sélecteur « Modèle » de `ShiftEditor` (pré-remplit le formulaire), ou en **glissant** une vignette de la barre de modèles sur une case de la vue Semaine, ce qui crée un créneau en **brouillon**.

## Références

- `client/src/components/planning/ShiftEditor.tsx`
- `client/src/components/planning/ShiftQuickEditor.tsx`
- `client/src/components/planning/ShiftTemplatesManager.tsx`
- `client/src/components/planning/shiftMeta.ts`
- `server/src/services/shift.service.ts`
- `server/src/services/shiftTemplate.service.ts`
- `server/src/services/planning.service.ts` (`publishWeek`)
- `server/src/services/calc.service.ts` (`shiftWorkedMinutes`)
- `server/src/routes/shifts.routes.ts`, `server/src/routes/shiftTemplates.routes.ts`
- `shared/src/types.ts` (`Shift`, `ShiftTemplate`, `ShiftType`, `ShiftStatus`)
