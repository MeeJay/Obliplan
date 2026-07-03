Le **calendrier d'équipe** (composant `LeaveCalendar`) offre aux valideurs une vue mensuelle des congés de leur équipe, afin de repérer d'un coup d'œil les absences et leurs chevauchements. Il est intégré à l'écran `/conges`, sous le bloc « À valider ». La saisie et la validation des demandes sont décrites dans « Demandes, validation & demi-journées ».

## Accès et lecture par rôle

Le calendrier n'est rendu que pour les utilisateurs disposant de la capacité **`leave:validate`** : dans `CongesPage`, le composant `LeaveCalendar` est conditionné par `canValidate`. Les employés sans cette capacité ne voient pas ce bloc.

Les données sont servies par `GET /leave/calendar?month=YYYY-MM`, protégé par `requireTenantCapability('leave:validate')`. La portée dépend du rôle, comme pour la liste « À valider » :

| Rôle | Portée du calendrier |
| --- | --- |
| Manager | Ses seuls rapportés (utilisateurs dont `manager_id` = manager) |
| Administrateur / *platform admin* | Tout le tenant (`managerId = null`) |

> Si le paramètre `month` est absent ou mal formé (format attendu `YYYY-MM`), le contrôleur retombe sur le mois courant.

## Données affichées

`leaveRequestService.getCalendar` renvoie les demandes dont le statut est **`valide` ou `en_attente`** et qui **chevauchent** le mois demandé (`start_date < début du mois suivant` et `end_date >= premier jour du mois`), jointes à l'utilisateur et au type de congé.

Chaque entrée est un `LeaveCalendarEntry` :

| Champ | Description |
| --- | --- |
| `id` | Identifiant de la demande |
| `userId` / `userName` | Utilisateur concerné (nom = `display_name` sinon `username`) |
| `leaveTypeId` / `leaveTypeLibelle` / `leaveTypeColor` | Type de congé et sa couleur |
| `startDate` / `endDate` | Bornes de la demande |
| `startPeriod` / `endPeriod` | Périodes de demi-journée (`full` / `am` / `pm`) |
| `days` | Nombre de jours |
| `status` | `valide` ou `en_attente` |

## Rendu du calendrier

Le composant affiche une grille mensuelle du lundi au dimanche, complétée pour couvrir des semaines entières (`monthGridDays`). Pour chaque jour, les entrées qui l'englobent sont listées (`startDate <= jour <= endDate`).

- **Couleur** : chaque entrée reprend la couleur du type de congé (`leaveTypeColor`), avec un gris `#6b7280` par défaut.
- **Statut** : une demande **en attente** est rendue avec une bordure en pointillés et un fond plus clair ; une demande **validée** a un fond plein. Une légende rappelle cette distinction (*Validé* / *En attente*).
- **Demi-journées** : sur les jours de bordure, un repère textuel précise la demi-journée concernée via `periodMark` :

| Condition | Repère affiché |
| --- | --- |
| Jour de début, `startPeriod = 'pm'` | ` (am libre)` |
| Jour de début, `startPeriod = 'am'` | ` (matin)` |
| Jour de fin, `endPeriod = 'am'` | ` (matin)` |
| Jour de fin, `endPeriod = 'pm'` | ` (pm libre)` |

- **Chevauchements** : toutes les entrées d'un même jour sont empilées dans la case. Au-delà de **4 entrées**, les suivantes sont masquées et remplacées par un compteur `+N`. Un survol (`title`) indique « nom · type de congé » et, le cas échéant, « (en attente) ». La superposition des pastilles rend visibles les périodes où plusieurs personnes sont absentes simultanément.

La navigation se fait mois par mois via les flèches de l'en-tête ; le mois affiché est initialisé au mois courant. Chaque changement de mois recharge les données via `leaveApi.calendar(month)`.

> Le calendrier est en **lecture seule** : il ne permet pas de valider, refuser ou modifier une demande. Ces actions passent par le bloc « À valider » de l'écran `/conges` (voir « Demandes, validation & demi-journées »).

## Références

- `client/src/components/leave/LeaveCalendar.tsx`
- `client/src/pages/CongesPage.tsx` (intégration conditionnée par `leave:validate`)
- `server/src/services/leaveRequest.service.ts` (méthode `getCalendar`)
- `server/src/controllers/leaveRequest.controller.ts` (handler `calendar`)
- `server/src/routes/leave.routes.ts` (`GET /leave/calendar`)
- `shared/src/leave.ts` (`LeaveCalendarEntry`)
