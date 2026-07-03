Le cœur métier d'Obliplan est le calcul hebdomadaire du temps de travail, centralisé dans `calc.service.ts`. Tous les compteurs sont **dérivés** (jamais stockés) et exprimés en **minutes**. Cette page décrit chaque grandeur, puis l'illustre sur trois profils (Alice, Bob, Chloé).

## Le compteur hebdomadaire

`computeWeeklyCounter` produit un `WeeklyCounter` pour un salarié et une semaine (lundi). Champs principaux :

| Champ | Formule / source |
| --- | --- |
| `realiseMin` | Σ des minutes des créneaux `travail` **validés** |
| `attenduMin` | Base du contrat − (école + fériés + congés) valorisés |
| `ecartMin` | `realiseMin − attenduMin` (peut être négatif) |
| `heuresSupMin` | Dépassement compté en heures sup + temps d'astreinte |
| `recupEligibleMin` | Dépassement éligible à une récup (contrat sans heures sup) |
| `astreinteMin` | Σ des minutes des créneaux `astreinte` validés |
| `astreinteDeclenchements` | Nombre de créneaux `astreinte` validés |
| `joursEcole` | Nombre de jours d'école déduits de l'attendu |
| `congeJours` | Jours de congé (réducteurs) de la semaine |

## Réalisé

```ts
// shiftWorkedMinutes
if (shift.type !== 'travail' || shift.statut !== 'valide') return 0;
return max(0, hmToMin(fin) - hmToMin(début) - pauseMin);
```

Seuls les créneaux **`travail` validés** comptent. Un créneau `travail` en brouillon, ou tout autre type (`ecole`, `recup`, `repos`, `conge`, `absence`, `pause`), apporte **0** au réalisé. La pause est soustraite.

## Attendu

L'attendu part de la **base du contrat** :

- contrat classique : `heuresHebdoBaseMin` ;
- contrat avec **rythme de travail** (`workPattern`, minutes par jour Lun→Dim) : la somme hebdomadaire du pattern.

On en **retire une journée travaillée** par jour réducteur. Le nombre de jours réducteurs est :

```
reducedDays = (alternance ? joursEcole : 0) + fériés + congés
```

La valeur d'une journée retirée (`workingDayAverage`) est :

- `base / 5` pour un contrat classique ;
- `sommeHebdo / nombre de jours travaillés` pour un contrat à `workPattern`.

```
attendu = max(0, round(base − reducedDays × valeurJournée))
```

> Les jours d'école ne réduisent l'attendu **que** si le contrat est en `alternance`. Un jour d'école, un férié ou un congé qui tombe sur un **jour structurellement non travaillé** (pattern à 0, ou week-end) n'est pas décompté : `joursEcoleInWeek` et `feriesInWeek` ignorent ces jours.

### Effet des types sur le calcul

| Type | Réalisé | Attendu |
| --- | --- | --- |
| `travail` (validé) | ajoute la durée | — |
| `ecole` | neutre (0) | réduit l'attendu si contrat en alternance et jour d'école configuré |
| `recup`, `repos` | neutre (0) — ce n'est pas du travail | — |
| `conge` / congés validés | neutre (0) | réduit l'attendu (types de congé marqués `reducesAttendu`) |
| férié (jour) | — | réduit l'attendu sur un jour travaillé |

Les **jours d'école** sont des règles rattachées au salarié (`jours_ecole`) : soit une date précise, soit un jour de semaine récurrent avec période optionnelle (`jourEcole.service`).

## Dépassement : heures sup ou récup éligible

Soit `overflow = max(0, ecartMin)`. Sa ventilation dépend du contrat :

```ts
if (overflow > 0 && contrat) {
  if (contrat.heuresSupAutorisees) {
    const floor = contrat.seuilHeuresSupMin ?? attenduMin;
    heuresSupMin = max(0, realiseMin - max(attenduMin, floor));
  } else {
    recupEligibleMin = overflow; // attribution MANUELLE par le manager
  }
}
heuresSupMin += astreinteMin; // l'astreinte est toujours des heures sup
```

- **Contrat sans heures sup autorisées** : tout le dépassement devient **récup éligible**. Il n'est **pas** crédité automatiquement : le manager attribue le crédit à la main, et ce mouvement est tracé dans le compteur de récup (voir « Récupération : règles, attribution & solde »).
- **Contrat avec heures sup autorisées** : le dépassement compte en **heures sup**, éventuellement à partir d'un **seuil** (`seuilHeuresSupMin`) si défini ; à défaut, au-delà de l'attendu.
- **Astreinte** : le temps d'astreinte validé s'ajoute toujours aux heures sup, indépendamment du contrat.

## Solde de récupération

```ts
// recupSoldeMinutes
Σ crédits − Σ débits (minutes)
```

Le solde affiché (barre de compteurs, Récap équipe) est la somme des mouvements de récup (crédits moins débits). Détails dans « Récupération : règles, attribution & solde » et « Heures supplémentaires : natures, déclarations & décision ».

## Exemples chiffrés

Les valeurs sont en heures pour la lisibilité (le service raisonne en minutes).

### Alice — 35 h, sans heures sup

Contrat classique 35 h, `heuresSupAutorisees = false`, non alternance. Semaine sans férié ni congé. Réalisé (créneaux `travail` validés) = 37 h.

- Attendu = 35 h
- Écart = +2 h → `overflow = 2 h`
- Contrat sans heures sup → **récup éligible = 2 h**, heures sup = 0
- Le manager décide (ou non) de créditer ces 2 h en récup.

### Bob — 39 h, heures sup autorisées

Contrat 39 h, `heuresSupAutorisees = true`, sans seuil (`seuilHeuresSupMin = null`). Réalisé = 42 h.

- Attendu = 39 h
- `floor = attendu = 39 h`
- **Heures sup = 42 − max(39, 39) = 3 h**, récup éligible = 0

Si Bob avait en plus 2 h d'astreinte validée, `heuresSupMin = 3 h + 2 h = 5 h` et `astreinteDeclenchements = 1`.

### Chloé — alternance, un jour d'école

Contrat classique 35 h, `alternance = true`, un jour d'école cette semaine (jour travaillé). Réalisé = 28 h.

- Valeur d'une journée = 35 / 5 = 7 h
- Attendu = 35 − 1 × 7 = **28 h**
- Écart = 0, ni heures sup ni récup

Sans l'alternance, le même jour d'école ne réduirait **pas** l'attendu (`ecoleDays = 0`), donnant attendu = 35 h et un écart de −7 h.

## Références

- `server/src/services/calc.service.ts` (`shiftWorkedMinutes`, `attenduMinutes`, `computeWeeklyCounter`, `recupSoldeMinutes`)
- `server/src/services/planning.service.ts` (`getUserWeek` : congés et fériés réducteurs)
- `server/src/services/jourEcole.service.ts`
- `shared/src/types.ts` (`Contrat`, `Shift`, `WeeklyCounter`)
