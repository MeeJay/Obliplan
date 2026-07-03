Cette page dresse le panorama des fonctionnalités d'Obliplan et distingue celles qui sont **universelles** (toujours présentes) de celles portées par un **module activable par tenant**. Les concepts sous-jacents sont définis dans « Concepts clés & glossaire » ; les rôles et capacités dans « Rôles, capacités & périmètres ».

## Modules activables vs fonctions universelles

Sept modules peuvent être **activés ou désactivés par tenant** (tous actifs par défaut). Un module désactivé disparaît de la navigation et son API renvoie **HTTP 403**.

| Module (clé) | Libellé | Ce qu'il porte |
|--------------|---------|----------------|
| `recup` | Récupération | Attribution et solde de récup, vue « Ma récup ». |
| `heures_sup` | Heures sup | Déclaration et validation des heures supplémentaires. |
| `conges` | Congés | Demandes de congés/absences et leur validation. |
| `temps` | Suivi du temps | Pointage (timer + saisie) sur projets/cartes. |
| `projets` | Projets | Tableaux Kanban/Scrum. |
| `taches` | Tâches | Gestionnaire de tâches (listes, étapes, partage). |
| `clients` | Clients | Fiches clients rattachées aux projets. |

Tout le reste est **universel** : planning et compteurs, shifts, jours d'école, jours fériés, notifications, calendrier ICS, rapports, tableau de bord, audit, RGPD, todo, équipes, types d'heures, contrats, salariés, permissions.

## Grandes fonctionnalités

### Planning & temps de travail

- **Mon planning** — la semaine du salarié avec ses compteurs (réalisé/attendu, écart, solde récup).
- **Planning équipe** — grille d'équipe, semaine d'un salarié, et vue **Charge** (charge de travail vs capacité), gardés par `planning:read_team`.
- **Vue équipe** (lecture seule) — projection *qui-travaille-quand* pour les salariés qui ne gèrent pas le planning (uniquement les shifts validés, note masquée), gardée par `planning:view_team`.
- **Shifts** — création/édition/validation (`planning:write`), 8 types (`travail`, `pause`, `repos`, `recup`, `conge`, `absence`, `ecole`, `astreinte`), statuts brouillon/validé, et **modèles de shift** réutilisables.
- **Jours d'école** — dates ou jours récurrents d'alternance réduisant l'attendu.
- **Import de planning** — import CSV en 2 étapes (aperçu + auto-mapping, puis application en brouillons) avec stratégies de fusion (`replace` / `merge` / `add`), garde `planning:write`.
- **Jours fériés** — jeu national FR global + lignes personnalisées par tenant ; utilisés dans le calcul de l'attendu (lecture par tout utilisateur, écriture `planning:write`).
- **Calendrier ICS** — flux `.ics` public *token-gated* pour s'abonner à son propre planning depuis un agenda externe ; chaque utilisateur gère son jeton.

### Récupération, heures sup & pointage

- **Récupération** (module `recup`) — mouvements crédit/débit, solde, attribution manuelle par le manager (`recup:manage`) ; vue **Ma récup** pour les salariés en opt-in (`recupSelfService`) ou les managers/admins.
- **Heures supplémentaires** (module `heures_sup`) — auto-déclaration par le salarié, natures paramétrables (`overtime:natures:manage`), validation (`overtime:validate`), conversion partielle en récup.
- **Suivi du temps** (module `temps`) — pointage par timer ou saisie manuelle sur un projet (et éventuellement une carte), totaux par carte/projet.

### Congés & absences (module `conges`)

- Types de congés paramétrables par tenant (CP, RTT, maladie…), avec règles d'acquisition (`fixed_annual` / `monthly`), justificatif, impact ou non sur l'attendu.
- Demandes avec workflow (`brouillon`, `en_attente`, `valide`, `refuse`, `annule`), demi-journées, calcul des jours, soldes par période, calendrier d'équipe. Validation gardée par `leave:validate` ; gestion des types par `leave:types:manage`.

### Projets, tâches & équipes

- **Clients** (module `clients`) — fiches clients (logo, contact, archivage) auxquelles se rattachent les projets ; gestion par `clients:manage`.
- **Projets Kanban/Scrum** (module `projets`) — tableaux avec colonnes (limites WIP, colonne « terminé »), cartes (priorité, points, estimation, échéances, assignation, sous-tâches, liens de dépendance, commentaires, activité), sprints ; création gardée par `projects:create`.
- **Tâches** (module `taches`) — gestionnaire de tâches type Microsoft To-Do : listes, groupes, listes intelligentes (Ma journée, Important, Planifié, Assigné…), étapes, partage et assignation.
- **Todo** — liste personnelle simple (titre, échéance, coché/décoché) exposée par `/api/todos` (**universelle**, sans module).
- **Équipes** — regroupements d'utilisateurs porteurs d'un périmètre de ressources (clients/projets, lecture seule ou lecture-écriture), gérés par `users:manage`.

### Pilotage & administration

- **Rapports** — agrégats de gestion en lecture seule sur une période (KPI, temps par projet, temps par salarié, astreintes par quinzaine), garde `planning:read_team`.
- **Notifications** — centre in-app (une ligne par destinataire), **Web Push** (abonnements par appareil), et **emails** best-effort quand le SMTP est configuré. Universelles.
- **Types d'heures** — types d'activité paramétrables par tenant (Front, Back, Pause…), garde `hourtypes:manage`.
- **Contrats / Salariés / Permissions** — administration du tenant (`contrats:manage`, `users:manage`, permission sets).
- **Journal d'audit** — trace inviolable (chaîne de hachage) des mutations sensibles, garde `users:manage`.
- **RGPD** — export de ses propres données (tout utilisateur) et export/anonymisation par l'administration (`users:manage`).
- **Workspaces & Paramètres** — configuration **globale** de l'instance, réservée à l'**administrateur de plateforme**.

## Fonctionnalité → module → rôle minimal

| Fonctionnalité | Module | Rôle / capacité minimale |
|----------------|--------|--------------------------|
| Mon planning & compteurs | universel | `employe` (les siens) |
| Vue équipe (lecture seule) | universel | `planning:view_team` |
| Planning équipe (grille / semaine) | universel | `planning:read_team` |
| Charge (workload) | universel | `planning:read_team` |
| Shifts (CRUD / validation) | universel | `planning:write` |
| Modèles de shift | universel | `planning:write` |
| Jours d'école | universel | lecture : self/manager · écriture : `planning:write` |
| Import de planning | universel | `planning:write` |
| Jours fériés | universel | lecture : tout auth · écriture : `planning:write` |
| Calendrier ICS | universel | `employe` (son propre jeton) |
| Récupération (attribution / solde) | `recup` | `recup:manage` |
| Ma récup | `recup` | `employe` en opt-in, ou manager/admin |
| Heures supplémentaires (déclaration) | `heures_sup` | `employe` |
| Heures sup (validation / natures) | `heures_sup` | `overtime:validate` / `overtime:natures:manage` |
| Congés & absences (demande) | `conges` | `employe` |
| Congés (validation / types) | `conges` | `leave:validate` / `leave:types:manage` |
| Suivi du temps (pointage) | `temps` | `employe` (le sien) |
| Clients | `clients` | `clients:manage` |
| Projets Kanban/Scrum | `projets` | `employe` · création : `projects:create` |
| Tâches (listes, étapes) | `taches` | `employe` |
| Todo (liste personnelle) | universel | `employe` |
| Équipes | universel | `users:manage` |
| Types d'heures | universel | `hourtypes:manage` |
| Rapports | universel | `planning:read_team` |
| Notifications (in-app / push / email) | universel | `employe` |
| Contrats | universel | `contrats:manage` (admin) |
| Salariés | universel | `users:manage` |
| Permissions (permission sets) | universel | admin de tenant |
| Journal d'audit | universel | `users:manage` |
| RGPD (export self / admin) | universel | self : `employe` · admin : `users:manage` |
| Workspaces & Paramètres | universel | administrateur de plateforme |

## Pour aller plus loin

- Planning, compteurs, shifts, import et ICS : voir le guide « Guide fonctionnel — Planning & temps ».
- Récup, heures sup et pointage : voir « Guide fonctionnel — Récup, heures sup & pointage ».
- Congés et absences : voir « Guide fonctionnel — Congés & absences ».
- Projets, tâches et équipes : voir « Guide fonctionnel — Projets, tâches & équipes ».
- Contrats, salariés, permissions, modules et clients : voir le chapitre « Administration ».
- Notifications, audit, RGPD et sécurité : voir « Exploitation, sécurité & RGPD ».
- Détail du modèle d'autorisation : voir « RBAC : capacités, permission sets & rôles ».

## Références

- `server/src/routes/index.ts` (montage des routes, gardes `requireModule`)
- `server/src/middleware/module.ts` (rejet 403 des modules désactivés)
- `shared/src/modules.ts` (catalogue des 7 modules)
- `shared/src/permissions.ts` (capacités)
- `client/src/App.tsx` et `client/src/components/layout/Sidebar.tsx` (routes et navigation par module / capacité / rôle)
- `shared/src/kanban.ts`, `tasks.ts`, `leave.ts`, `overtime.ts`, `timetracking.ts`, `reporting.ts`, `planningImport.ts`, `holiday.ts`, `teams.ts`, `notification.ts`
