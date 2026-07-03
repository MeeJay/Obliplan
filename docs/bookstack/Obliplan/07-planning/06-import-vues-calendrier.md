Cette page couvre trois fonctions périphériques du planning : l'**import CSV** d'un planning existant, les **vues** enregistrées (presets d'équipes visibles) et l'**abonnement calendrier ICS** qui expose son propre planning à un client d'agenda.

## Import de planning (CSV)

Écran `/import-planning` (`ImportPlanningPage`), service `planningImport.service`, capacité **`planning:write`**. L'import se fait en **deux étapes** — aperçu puis application — pour ne jamais écrire à l'aveugle.

| Étape | Endpoint | Capacité |
| --- | --- | --- |
| Aperçu (analyse + auto-mapping) | `POST /planning/import/preview` | `planning:write` |
| Application (création des créneaux) | `POST /planning/import/apply` | `planning:write` |

### Format attendu

Le fichier est un tableur délimité par `;`, avec des **blocs de semaine répétés** :

1. une ligne d'en-tête de jours (`Lundi JJ/MM … Dimanche JJ/MM`) — un bloc est détecté dès qu'une ligne porte au moins **3** en-têtes de jour ;
2. une ligne de créneaux horaires (`8h-9h … 19h-20h`, **12 créneaux** par jour) ;
3. des « bandes » de salariés : une bande démarre sur une ligne dont la première colonne (le nom) n'est pas vide et s'étend jusqu'au nom suivant.

Par créneau, la **dernière valeur non vide** de la bande est retenue (la couche « tâche » l'emporte sur la couche « site »). Les créneaux consécutifs identiques sont **fusionnés** en un seul shift. Les dates du fichier (`JJ/MM`) ne portent pas d'année : l'utilisateur la fournit à l'application.

> Le client décode l'export en **windows-1252** (exports Excel français) pour préserver les accents.

### Mapping et suggestions

L'aperçu renvoie les semaines détectées, les salariés, les libellés d'activité et un échantillon :

- **Salariés → utilisateurs** : rapprochement flou (`matchUserId`) — correspondance exacte du nom normalisé, puis tous les tokens du nom CSV contenus dans un candidat, puis même premier token. Une correspondance n'est proposée que si **exactement un** candidat qualifie ; sinon le salarié reste à associer à la main.
- **Libellés → actions** (`suggestLabel`) : `ignore` (URL, bruit, « Off »), `conge` (préfixe « conge »), `absence` (« maladie »), `ecole` (« ecole »), `pause` (préfixe « pause »), sinon `hourtype` (type d'heure existant réutilisé par libellé, ou créé depuis le libellé).

Actions disponibles dans l'écran (`ImportLabelAction`) : `hourtype` (travail), `pause`, `repos`, `conge`, `absence`, `ecole`, `ignore`. Un libellé mappé en `hourtype` peut recevoir un **projet** libre (`projectName`) : le board est réutilisé par nom (insensible à la casse) ou créé à la volée, avec un **client** optionnel pour un board réellement créé.

### Validation et modes d'application

L'autorisation n'est **jamais** déléguée au client : à l'application, une cible n'est importable que si elle est **membre du tenant** ET que l'acteur peut la gérer (admin → tout membre ; manager → ses subordonnés ; ou soi-même). Les salariés hors périmètre sont ignorés et listés dans les avertissements.

Les créneaux sont créés en **brouillon** par défaut (`statut`). Trois modes de combinaison avec l'existant (`ImportMergeMode`) :

| Mode | Effet |
| --- | --- |
| `replace` (défaut) | Vide les journées touchées, puis pose l'import à la place |
| `merge` | Conserve l'existant mais **rogne/découpe** les créneaux qui chevauchent un créneau importé (l'import gagne le recouvrement) |
| `add` | Cumule tout sans rien supprimer (seuls les doublons exacts `début/fin` sont ignorés) |

Le résultat (`ImportApplyResult`) rapporte : `createdShifts`, `createdHourTypes`, `createdBoards`, `skipped`, `deletedShifts`, `trimmedShifts`, et un détail par salarié. L'écran invite ensuite à aller **publier** les brouillons depuis le tableau d'équipe.

## Vues de planning personnalisées

Les **vues** (`planning_views`, `planningView.service`) sont des presets **par utilisateur** d'équipes visibles pour les grilles d'équipe. Gérées sous la capacité **`planning:view_team`**.

| Action | Endpoint |
| --- | --- |
| Lister mes vues | `GET /planning/views` |
| Créer | `POST /planning/views` |
| Modifier | `PUT /planning/views/:id` |
| Supprimer | `DELETE /planning/views/:id` |

Une vue (`PlanningView`) porte un `name` et une liste `teamIds` (ids d'équipes Axis-C `user_teams`). Règles (`sanitizeInput`) : nom obligatoire, borné à 80 caractères ; `teamIds` dédupliqués et **restreints aux équipes du tenant** (sinon 400) ; une liste **vide** signifie « toutes les équipes » (aucun filtre). Les vues sont strictement **owner-scopées** (tenant + utilisateur). Les équipes disponibles pour construire une vue sont listées via `GET /planning/teams` (capacité `planning:view_team`).

## Abonnement calendrier ICS

`ics.service.ts` expose un **flux iCalendar public** que l'on ajoute à un client d'agenda pour suivre son planning. Le flux est **token-gaté** : le jeton (`users.ics_token`) est le seul secret et résout vers **un seul** utilisateur — son propre planning.

| Endpoint | Auth | Rôle |
| --- | --- | --- |
| `GET /api/ics/:token(.ics)` | **publique** (aucune auth/tenant) | Renvoie le flux `text/calendar` du propriétaire du jeton ; jeton inconnu → 404 texte |
| `GET /ics/me` | authentifiée | Garantit un jeton (le crée si absent) et renvoie l'URL d'abonnement |
| `POST /ics/regenerate` | authentifiée | **Régénère** le jeton (l'ancienne URL cesse de fonctionner) |

L'utilisateur gère son propre jeton depuis sa page **Profil** (`ProfilePage`, carte « Abonnement calendrier (ICS) ») : elle affiche l'URL, propose un lien `webcal://` et un bouton de **régénération**.

### Ce qui est exporté

Fenêtre exposée : `[aujourd'hui − 31 j, aujourd'hui + 92 j)`, scopée au tenant d'origine de l'utilisateur. Le flux contient uniquement **ses** données :

- les créneaux **validés** de type **`travail`** ou **`astreinte`** (les seuls types temporisés retenus, `TIMED_TYPES`), en `VEVENT` horaires ; le titre reprend le libellé du type d'heure si présent, sinon le libellé du type ;
- les **congés approuvés**, en `VEVENT` toute la journée (avec mention « matin »/« après-midi » pour une demi-journée) ;
- les **rendez-vous** réservés (confirmés → `CONFIRMED`, en attente → `TENTATIVE`), avec le demandeur externe en `ATTENDEE`.

Un abonné **sans** aucune donnée dans la fenêtre reçoit un événement d'ancrage transparent (`TRANSP:TRANSPARENT`) pour que les clients acceptent le flux (RFC 5545 exige au moins un composant). Les lignes sont pliées à 75 octets (accents/emoji multi-octets gérés). Les créneaux non validés, les autres types de créneau et les données d'autres utilisateurs ne sont **jamais** exposés.

Le détail technique du flux (VEVENT, encodage, en-têtes HTTP) est décrit dans la page « Planning, shifts, modèles, jours d'école & fériés ».

## Références

- `server/src/services/planningImport.service.ts`, `shared/src/planningImport.ts`
- `server/src/services/planningView.service.ts`, `shared/src/planningViews.ts`
- `server/src/services/ics.service.ts`, `server/src/controllers/ics.controller.ts`, `server/src/routes/ics.routes.ts`
- `server/src/routes/planning.routes.ts`
- `client/src/pages/ImportPlanningPage.tsx`, `client/src/pages/ProfilePage.tsx`
