Le cœur métier d'Obliplan est le calcul hebdomadaire du temps de travail, centralisé dans `calc.service.ts`. Tous les compteurs sont **dérivés** (jamais stockés) et exprimés en **minutes**. Cette page décrit chaque grandeur et l'illustre sur les trois profils de démonstration (Alice, Bob, Chloé).

## Le compteur hebdomadaire

Un `WeeklyCounter` est produit par `computeWeeklyCounter` pour une semaine (lundi) et un salarié. Ses champs :

| Champ | Définition |
|---|---|
| `realiseMin` | Σ(fin − début − pause) des créneaux `travail` **validés** |
| `attenduMin` | Base contrat − jours d'école − jours fériés − congés (jours travaillés) |
| `ecartMin` | `realiseMin − attenduMin` (peut être négatif) |
| `heuresSupMin` | Heures supplémentaires (contrat avec heures sup) + astreinte |
| `recupEligibleMin` | Dépassement éligible à la récupération (contrat sans heures sup) |
| `joursEcole` | Nombre de jours d'école exclus de l'attendu cette semaine |
| `astreinteMin` | Temps d'astreinte de la semaine (compté en heures sup) |
| `astreinteDeclenchements` | Nombre de déclenchements d'astreinte |
| `congeJours` | Jours de congé validés ayant réduit l'attendu |

## Réalisé

```ts
// Un créneau ne compte que s'il est travail ET validé.
if (shift.type !== 'travail' || shift.statut !== 'valide') return 0;
span = (fin − début − pause), borné à ≥ 0
```

Conséquences directes :

- Les types `ecole`, `recup`, `repos`, `conge`, `absence`, `pause` **ne sont pas** du travail : ils comptent **0** dans le réalisé.
- Un créneau `travail` encore en **brouillon** compte **0** tant qu'il n'est pas validé/publié.
- L'**astreinte** n'entre pas dans le réalisé : elle est comptabilisée à part (voir plus bas).

## Attendu

L'attendu part de la **base contractuelle**, puis on retire les jours non travaillés :

- **Base** : `heuresHebdoBaseMin` du contrat, ou, si un `workPattern` est défini, la somme hebdomadaire du pattern.
- **Jours d'école** : uniquement si le contrat est en `alternance`. Comptés sur les jours **lundi→vendredi effectivement travaillés** de la semaine.
- **Jours fériés** : jours fériés lundi→vendredi tombant sur un jour travaillé.
- **Congés** : jours de congé validés dont le type `reducesAttendu` est vrai, sur les jours réellement travaillés.

La valeur retirée par jour est `base / 5` pour un contrat classique, ou la **moyenne d'un jour travaillé** (`somme hebdo / nombre de jours travaillés`) pour un contrat à `workPattern`. Le résultat est **borné à ≥ 0** :

```ts
attendu = base − (joursEcole + fériés) × valeurJour        // attenduMinutes()
attendu = max(0, attendu − congés × valeurJour)            // computeWeeklyCounter()
```

## Écart, dépassement et sa ventilation

`ecart = réalisé − attendu`. Le **dépassement** est la part positive : `overflow = max(0, ecart)`. Sa destination dépend du contrat :

| Contrat | Ventilation du dépassement |
|---|---|
| **`heuresSupAutorisees = false`** | Tout le dépassement devient **récup éligible** (`recupEligibleMin`) |
| **`heuresSupAutorisees = true`** | Part au-delà du seuil comptée en **heures sup** (`heuresSupMin`) |

Pour un contrat avec heures sup, le plancher est le seuil s'il est défini, sinon l'attendu :

```ts
floor = seuilHeuresSupMin ?? attenduMin
heuresSupMin = max(0, realiseMin − max(attenduMin, floor))
```

> La **récup éligible** n'est jamais créditée automatiquement au fil du calcul : elle est **attribuée manuellement par le manager** et tracée dans `recup_mouvements` (`POST /recup`, ou crédit idempotent de la semaine via `POST /recup/validate-week`). Voir « Récupération ».

## Astreinte

Les créneaux `astreinte` **validés** sont traités indépendamment du contrat :

- leur temps (`astreinteMin`) est **toujours ajouté aux heures sup** ;
- chaque créneau d'astreinte compte pour un **déclenchement** (`astreinteDeclenchements`).

## Exemples chiffrés (jeu de démonstration)

Les trois salariés du seed illustrent les trois cas. Semaine sans férié ni congé.

### Alice — contrat « 35h sans heures sup »

Base 35h, `heuresSupAutorisees = false`, pas d'alternance.

| Jour | Créneau | Travaillé |
|---|---|---|
| Lun→Jeu | 09:00–17:00, pause 60 min | 7h × 4 = 28h |
| Ven | 09:00–18:00, pause 60 min | 8h |

- Réalisé = **36h** ; Attendu = **35h** ; Écart = **+1h**.
- Contrat sans heures sup → dépassement en **récup éligible = 1h** (à attribuer par le manager).

### Bob — contrat « 39h avec heures sup »

Base 39h, `heuresSupAutorisees = true`, seuil non défini.

| Jour | Créneau | Compté |
|---|---|---|
| Lun→Ven | 09:00–18:00, pause 60 min | travail : 8h × 5 = 40h |
| Sam | 20:00–22:30 (astreinte) | astreinte : 2h30, 1 déclenchement |

- Réalisé (travail) = **40h** ; Attendu = **39h** ; Écart = **+1h**.
- Seuil absent → plancher = attendu (39h) → **heures sup = 1h**.
- Astreinte : +2h30 ajoutées aux heures sup → **heures sup totales = 3h30**, **1 déclenchement**. L'astreinte n'entre pas dans le réalisé.

### Chloé — contrat « Alternance 35h »

Base 35h, `alternance = true`. Jours d'école récurrents : **jeudi et vendredi**.

| Jour | Créneau | Effet |
|---|---|---|
| Lun→Mer | 09:00–17:00, pause 60 min | travail : 7h × 3 = 21h |
| Jeu, Ven | Créneau `ecole` (sans heures) | neutre sur le réalisé, réduit l'attendu |

- Réalisé = **21h**.
- Attendu = 35h − 2 jours d'école × (35h / 5) = 35h − 2 × 7h = **21h**.
- Écart = **0** : ni heures sup, ni récup. Le type `ecole` est **neutre** sur le réalisé mais **réduit** l'attendu.

## Solde de récupération

Le **solde de récup** (`recupSoldeMin`) est indépendant du compteur hebdomadaire : c'est la somme des mouvements `recup_mouvements` (crédits − débits). Il est affiché à côté des compteurs (voir « Ma semaine (employé) » et « Récupération »). Un créneau de type `recup` porteur d'heures génère automatiquement un mouvement au **débit**.

## Renvois

- Attribution et solde de récupération : « Récupération ».
- Contrats avec heures sup et seuils : « Heures supplémentaires ».

## Références

- `server/src/services/calc.service.ts` (`shiftWorkedMinutes`, `attenduMinutes`, `computeWeeklyCounter`, `expectedMinutesForDay`, `joursEcoleInWeek`, `feriesInWeek`)
- `server/src/services/planning.service.ts` (`getUserWeek` : assemblage écoles/fériés/congés)
- `server/src/db/seeds/01_demo.ts` (Alice / Bob / Chloé)
- `shared/src/types.ts` (`WeeklyCounter`, `Contrat`)
