Trois mécanismes transverses encadrent le planning : les **jours fériés** (qui allègent les heures attendues), les **drapeaux de conformité** (qui signalent un planning à risque sans le bloquer) et la vue **Charge** (qui compare travail assigné et capacité).

## Jours fériés

Les jours fériés vivent dans la table `public_holidays`. Deux origines coexistent :

- le **jeu national FR global** (`tenant_id` NULL), partagé par tous les tenants ;
- des **jours personnalisés par tenant** (`tenant_id` renseigné).

`holidayService.getSet(tenantId, from, toExclusive)` renvoie l'union des deux pour une fenêtre de dates.

| Endpoint | Rôle | Capacité |
|---|---|---|
| `GET /holidays` | Lister les fériés (global + tenant), option `year` | tout utilisateur authentifié du tenant |
| `POST /holidays` | Ajouter un férié personnalisé au tenant | `planning:write` |
| `DELETE /holidays/:id` | Supprimer un férié **du tenant** | `planning:write` |

> `addCustom` refuse (409) une date déjà couverte par un férié global ou du tenant. `deleteCustom` ne peut jamais supprimer le jeu global (`tenant_id` NULL) : seuls les fériés propres au tenant sont supprimables. La gestion se fait depuis l'écran Paramètres (capacité `planning:write`).

### Effet sur le planning

Un jour férié a **deux effets distincts** :

1. **Calcul** — un férié tombant sur un jour **travaillé** (lundi→vendredi, selon le `workPattern` le cas échéant) **réduit les heures attendues** de la semaine, d'une valeur d'un jour travaillé (`feriesInWeek` → `attenduMinutes`). Voir « Compteurs & règles de calcul ».
2. **Affichage** — un férié n'est qu'un **marqueur visuel** (`HolidayPill`, pastille « Férié ») : les créneaux restent affichés, ajoutables et éditables sur un jour férié. La liste des fériés de la semaine est fournie à chaque vue (`holidays`, dates ISO triées).

## Drapeaux de conformité

`complianceService.computeFlags` calcule, pour la semaine d'un salarié, des **alertes de temps de travail non bloquantes** (aucune modification de schéma, aucun effet de bord). Elles sont surfacées via `ComplianceFlags` afin qu'un manager voie un planning illégal ou risqué **avant** de le publier.

| Code | Sévérité | Règle contrôlée |
|---|---|---|
| `OVERLAP` | `error` | Chevauchement de deux créneaux le même jour |
| `MAX_DAY_10H` | `error` | Plus de 10h **travaillées** dans une journée |
| `MAX_WEEK_48H` | `error` | Plus de 48h **travaillées** sur la semaine |
| `REST_DAILY_11H` | `error` | Moins de 11h de repos entre deux jours consécutifs |
| `REST_WEEKLY_35H` | `warn` | Aucun repos hebdomadaire continu de 35h détecté |

Détails du calcul :

- Chaque créneau est projeté en minutes absolues depuis le lundi 00:00. Les types `pause`, `repos`, `conge`, `absence` sont **entièrement ignorés** (ni travail, ni occupation).
- Les plafonds journalier (10h) et hebdomadaire (48h) ne comptent que le **travail** (`type = 'travail'`). L'astreinte, elle, compte comme occupation pour le chevauchement et les repos, mais **pas** dans ces plafonds de travail.
- Le repos hebdomadaire retient le **plus grand bloc continu de repos** sur toute la fenêtre lundi 00:00 → dimanche 24:00 (temps avant le premier créneau et après le dernier inclus), ce qui rend une semaine lun-ven avec week-end libre correctement conforme.

Les seuils sont des constantes (défauts du droit du travail français) : `REST_DAILY_MIN = 11h`, `REST_WEEKLY_MIN = 35h`, `MAX_DAY_MIN = 10h`, `MAX_WEEK_MIN = 48h`. Le composant `ComplianceFlags` n'affiche rien quand la semaine est propre ; sinon il résume le nombre d'alertes et détaille chaque message.

> Ces drapeaux sont **informatifs** : ils n'empêchent ni la saisie, ni la publication d'un planning.

## Charge / workload

La vue **Charge** (`/charge`, `WorkloadPage`) compare, par salarié, le **travail actif assigné** à sa **capacité hebdomadaire**. Elle est alimentée par `GET /reports/workload` (`workloadService.teamWorkload`), gatée par **`planning:read_team`**.

Pour chaque salarié (`WorkloadRow`) :

| Champ | Calcul |
|---|---|
| `assignedMin` | Σ `estimate_min` des cartes assignées, dans une colonne **non terminée**, sur les boards visibles par l'acteur |
| `capacityMin` | Base contrat hebdo − (jours de congé validés cette semaine × base/5), borné à ≥ 0 |
| `cardCount` | Nombre de cartes actives assignées |
| `overCount` | Parmi elles, combien **sans estimation** (honnêteté de la barre) |

Portée : un **admin** (ou platform admin) couvre tout le tenant ; un **manager** ne couvre que ses subordonnés directs et les boards qu'il peut voir. Le ratio `assigned / capacity` colore la barre (vert → ambre à partir de 90% → rouge au-delà de 100%) ; les lignes sont triées de la plus chargée à la moins chargée.

## Références

- `server/src/services/holiday.service.ts`, `shared/src/holiday.ts` (`PublicHoliday`)
- `client/src/components/planning/HolidayPill.tsx`
- `server/src/services/compliance.service.ts`, `shared/src/compliance.ts` (`ComplianceFlag`, `ComplianceCode`)
- `client/src/components/planning/ComplianceFlags.tsx`
- `server/src/services/workload.service.ts`, `shared/src/kanban.ts` (`WorkloadRow`)
- `client/src/pages/WorkloadPage.tsx`
- `server/src/routes/holidays.routes.ts`, `server/src/routes/reports.routes.ts`
