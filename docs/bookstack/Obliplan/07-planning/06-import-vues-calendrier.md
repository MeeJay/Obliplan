Cette page couvre trois fonctions périphériques du planning : l'**import CSV** d'un planning existant, les **vues** enregistrées (presets d'équipes visibles) et l'**abonnement calendrier ICS** qui expose son propre planning à un client d'agenda.

## Import de planning (CSV)

Écran `/import-planning` (`ImportPlanningPage`), service `planningImport.service`, capacité **`planning:write`**. L'import se fait en **deux étapes** — aperçu puis application — pour ne jamais écrire à l'aveugle.

| Étape | Endpoint | Capacité |
|---|---|---|
| Aperçu (détection + auto-mapping) | `POST /planning/import/preview` | `planning:write` |
| Application (création des créneaux) | `POST /planning/import/apply` | `planning:write` |

### Format attendu

Le fichier est un tableur **délimité par « ; »** avec des **blocs de semaine répétés** :

1. une ligne d'en-tête de jours (`Lundi JJ/MM`, `Mardi JJ/MM`, … — au moins 3 jours détectés) ;
2. une ligne de créneaux horaires (`8h-9h`, `9h-10h`, … — **12 créneaux par jour**) ;
3. des **bandes de salariés** : une bande démarre sur une ligne dont la première cellule (le nom) est non vide et n'est pas un en-tête de jour, et court jusqu'à la bande suivante.

Le format empile une couche « site » et une couche « tâche » : pour chaque créneau, la **dernière valeur non vide** de la bande l'emporte (la tâche prime sur le site). Les créneaux consécutifs identiques sont **fusionnés** en un seul shift. Les dates `JJ/MM` ne portent pas d'année : l'utilisateur la saisit à l'application. Côté client, le fichier est décodé en **windows-1252** (exports Excel français) pour préserver les accents.

### Mapping (aperçu)

L'aperçu renvoie `weekLabels`, `employees`, `labels`, `totalShifts`, un `sample` et des `warnings`.

- **Salariés** : chaque nom du CSV est rapproché d'un compte par correspondance floue — (1) égalité normalisée, (2) tous les jetons du CSV contenus dans un candidat, (3) même premier jeton. Une correspondance n'est **auto-suggérée que si un seul candidat** qualifie ; un nom ambigu reste à associer à la main (ou à laisser de côté).
- **Activités** → mappées vers une action (`ImportLabelAction`) :

| Action | Effet |
|---|---|
| `hourtype` | Créneau **travaillé** (`travail`) avec un type d'heure (existant ou **créé** depuis le libellé) |
| `ignore` | Ignoré (ex. « Off », bruit, URL) |
| `pause` | Créneau `pause` (avec heures, exclu du réalisé/plafonds) |
| `repos` | Créneau `repos` |
| `conge` | Créneau `conge` |
| `absence` | Créneau `absence` |
| `ecole` | Créneau `ecole` |

Suggestions par défaut (`suggestLabel`) : une URL ou un libellé trop court → `ignore` ; `off` → `ignore` ; commence par `conge` → `conge` ; `maladie` → `absence` ; `ecole` → `ecole` ; commence par `pause` → `pause` ; sinon un type d'heure existant du même libellé, ou création. Une action `hourtype` peut aussi porter un **projet** libre (`projectName`) : le board est réutilisé par nom (insensible à la casse) ou créé à la volée, avec un `clientId` optionnel.

### Application

Le corps (`ImportApplyRequest`) porte `csvText`, `year`, `employeeMap` (csvName → userId ou null), `labelMap` (label → mapping), `statut` (défaut **`brouillon`**) et `mode`. Les créneaux sont créés en **brouillon** par défaut : rien n'est publié sans revue.

**Autorisation** (jamais la carte cliente n'est crue) : une cible n'est importable que si elle est **membre du tenant** ET que l'acteur peut la gérer (admin → tout membre, manager → ses subordonnés, ou soi-même). Les noms hors périmètre sont ignorés et signalés.

Trois **modes** combinent l'import avec l'existant sur chaque couple (salarié, jour) touché :

| Mode | Comportement |
|---|---|
| `replace` (défaut) | Vide les journées touchées, puis pose l'import à la place |
| `merge` | Conserve l'existant mais **rogne/découpe** les créneaux chevauchés (l'import gagne) |
| `add` | Cumule tout, ne supprime ni ne fusionne (seuls les doublons exacts sont ignorés) |

Le résultat (`ImportApplyResult`) rapporte `createdShifts`, `createdHourTypes`, `createdBoards`, `skipped`, `deletedShifts`, `trimmedShifts`, un détail `perEmployee` et des `warnings`. Après import, on va sur le tableau d'équipe pour vérifier puis **publier** (voir « Édition des shifts, modèles & validation »).

## Vues de planning personnalisées

Les **vues** (`planning_views`, `planningView.service`) sont des **presets par utilisateur** des équipes visibles dans les grilles d'équipe. Une vue appartient à **un seul utilisateur** au sein d'**un seul tenant** ; `teamIds` liste les équipes Axis-C (`user_teams`) gardées visibles, et un tableau **vide** signifie « toutes les équipes ».

| Endpoint | Rôle | Capacité |
|---|---|---|
| `GET /planning/views` | Lister ses propres vues (triées par nom) | `planning:view_team` |
| `POST /planning/views` | Créer une vue | `planning:view_team` |
| `PUT /planning/views/:id` | Modifier une vue (owner-scoped) | `planning:view_team` |
| `DELETE /planning/views/:id` | Supprimer une vue | `planning:view_team` |

Règles de validation (`sanitizeInput`) : le nom est **obligatoire**, découpé à **80 caractères** ; les `teamIds` sont dédupliqués et doivent tous appartenir aux `user_teams` **du tenant** (sinon 400). L'unicité `(tenant, utilisateur, nom)` est garantie en base (conflit → 409). Le filtre d'équipe interactif (état courant) est par ailleurs mémorisé dans le navigateur (`localStorage`), comme décrit dans « Planning & grille équipe (manager) ».

## Abonnement calendrier ICS

`ics.service` publie un **flux iCalendar public, gaté par jeton**, qu'un client d'agenda peut interroger en continu. Le jeton (`users.ics_token`) est **le seul secret** et ne résout qu'au **propre planning** de son porteur.

| Endpoint | Auth | Rôle |
|---|---|---|
| `GET /api/ics/:token(.ics)` | **Aucune** (public) | Émet le flux du porteur du jeton |
| `GET /api/ics/me` | Authentifié | Garantit un jeton et renvoie l'URL d'abonnement |
| `POST /api/ics/regenerate` | Authentifié | **Régénère** le jeton (l'ancienne URL cesse de fonctionner) |

Le flux public est monté globalement, **avant** le routeur authentifié, et les mots réservés `me` et `regenerate` sont laissés passer pour ne pas être avalés comme des jetons. Un jeton inconnu renvoie un **404** en texte brut. L'URL d'abonnement a la forme `{appUrl}/api/ics/{token}.ics`.

### Ce qui est exporté

Fenêtre exposée relative à aujourd'hui : **`[today − 31 jours, today + 92 jours)`**, restreinte au **tenant d'origine** du porteur (`users.tenant_id`).

- **Créneaux** : uniquement les types **horodatés `travail` et `astreinte`**, au statut **`valide`**, avec heures de début et de fin. Chaque créneau devient un `VEVENT` horaire ; le `SUMMARY` reprend le libellé du type d'heure, sinon le libellé du type de créneau ; la note éventuelle alimente la `DESCRIPTION`.
- **Congés** : demandes de congé au statut `valide`, en événements **journée entière** (`DTEND` exclusif = fin + 1 jour) ; un congé d'une seule journée en matin/après-midi est annoté en conséquence.
- Si aucun créneau ni congé n'existe dans la fenêtre, un événement **transparent** de repère est ajouté pour que le client accepte le flux (RFC 5545 exige au moins un composant).

Le corps respecte le pliage de lignes RFC 5545 et est encodé en UTF-8. Régénérer le jeton **invalide** immédiatement l'URL précédente.

> Renvoi : le détail du flux et de sa mise en place technique est documenté dans « API ICS ».

## Références

- `client/src/pages/ImportPlanningPage.tsx`
- `server/src/services/planningImport.service.ts`, `shared/src/planningImport.ts`
- `server/src/services/planningView.service.ts`, `shared/src/planningViews.ts`
- `server/src/services/ics.service.ts`, `server/src/controllers/ics.controller.ts`, `server/src/routes/ics.routes.ts`
- `server/src/routes/planning.routes.ts`, `server/src/routes/index.ts`
