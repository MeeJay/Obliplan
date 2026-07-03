Le jeu de données de démonstration crée un tenant complet avec un encadrant, trois salariés aux contrats différents et une semaine de planning déjà saisie et validée. Il permet d'explorer immédiatement les calculs de compteurs (réalisé, attendu, récupération, heures supplémentaires) sans saisie manuelle. Le seed est idempotent : il peut être rejoué, il reconstruit à chaque fois les données du tenant `demo`.

## Exécuter le seed

En développement local :

```bash
npm run seed
```

En Docker (dans le conteneur `server` déjà démarré) :

```bash
docker compose exec server npm run seed
```

Les deux commandes exécutent `knex seed:run`, qui applique `server/src/db/seeds/01_demo.ts`.

> À réserver aux environnements de test. Tous les comptes partagent un mot de passe faible et connu ; ne jamais exécuter ce seed sur une instance de production.

## Comportement idempotent

Le seed est rejouable sans risque de doublon : tout est cantonné au tenant de slug `demo`. À chaque exécution, il purge d'abord les données existantes de ce tenant dans l'ordre respectant les clés étrangères (`leave_requests`, `leave_types`, `recup_mouvements`, `shifts`, `jours_ecole`, appartenances `user_tenants`, `users`, `contrats`), puis recrée l'ensemble. Les autres tenants ne sont pas touchés.

## Tenant et comptes créés

Le tenant est **Demo SARL** (slug `demo`). Quatre comptes sont créés, tous avec le même mot de passe et la langue préférée `fr`.

**Mot de passe commun : `demo1234`** (haché en bcrypt, 12 tours).

| Login     | Nom affiché          | Rôle      | Contrat                          | Particularité                                   |
|-----------|----------------------|-----------|----------------------------------|-------------------------------------------------|
| `manager` | Marie Manager        | `manager` | —                                | Encadre les trois salariés.                     |
| `alice`   | Alice (35h)          | `employe` | 35h sans heures sup              | 36h réalisées → 1h de **récup éligible**.       |
| `bob`     | Bob (39h + sup)      | `employe` | 39h avec heures sup              | 40h réalisées + astreinte → **heures sup**.     |
| `chloe`   | Chloé (alternante)   | `employe` | Alternance 35h (jours d'école)   | Jeudi/vendredi à l'école → attendu **21h**.     |

Les adresses e-mail suivent le motif `<login>@demo.test`. Les trois salariés ont `manager` pour responsable (`manager_id`).

## Contrats créés

| Libellé                            | Base hebdo | Heures sup autorisées | Seuil heures sup | Alternance |
|------------------------------------|------------|-----------------------|------------------|------------|
| 35h sans heures sup                | 2100 min (35h) | Non               | —                | Non        |
| 39h avec heures sup                | 2340 min (39h) | Oui               | non défini (`null`) | Non     |
| Alternance 35h (jours d'école)     | 2100 min (35h) | Non               | —                | Oui        |

Les durées sont stockées en minutes (`heures_hebdo_base_min`).

## Planning de la semaine courante

Le seed positionne les shifts sur la semaine en cours (à partir du lundi), tous au statut `valide`, créés et mis à jour par `manager`.

| Salarié | Jours travaillés                          | Détail                                   | Total réalisé |
|---------|-------------------------------------------|------------------------------------------|---------------|
| Alice   | Lundi à jeudi + vendredi                  | 09:00–17:00 (pause 60 min) du lundi au jeudi, 09:00–18:00 (pause 60 min) le vendredi | 36h |
| Bob     | Lundi à vendredi                          | 09:00–18:00 (pause 60 min) chaque jour   | 40h           |
| Chloé   | Lundi à mercredi                          | 09:00–17:00 (pause 60 min) chaque jour   | 21h           |

Illustrations complémentaires :

- **Chloé — jours d'école** : deux entrées `jours_ecole` récurrentes (jeudi et vendredi) plus deux shifts de type `ecole` (neutres sur le réalisé) posés en fin de semaine. Ces jours d'école réduisent l'attendu, d'où un attendu de 21h après deux jours d'école.
- **Bob — astreinte** : un shift de type `astreinte` le samedi (20:00–22:30), validé, illustrant un dépassement comptabilisé en heures supplémentaires.

## Types de congés créés

Le seed configure également quatre types de congés pour le tenant, tous réduisant l'attendu (`reduces_attendu`).

| Libellé        | Code  | Payé | Justificatif requis | Droit annuel (jours) |
|----------------|-------|------|---------------------|----------------------|
| Congés payés   | `CP`  | Oui  | Non                 | 25                   |
| RTT            | `RTT` | Oui  | Non                 | 10                   |
| Arrêt maladie  | `MAL` | Oui  | Oui                 | non plafonné (`null`) |
| Sans solde     | `SS`  | Non  | Non                 | non plafonné (`null`) |

## Ce que le jeu illustre

- **Récup éligible** (Alice) : contrat sans heures sup, le dépassement de 1h (36h réalisées pour 35h attendues) devient une récupération éligible, à attribuer manuellement par le manager.
- **Heures supplémentaires** (Bob) : contrat avec heures sup autorisées, le dépassement (et l'astreinte) est comptabilisé en heures supplémentaires.
- **Alternance** (Chloé) : les jours d'école réduisent l'attendu hebdomadaire, ramené à 21h.

> Le détail des règles de calcul (réalisé, attendu, seuils) relève du chapitre métier ; cette page ne documente que le contenu injecté par le seed.

## Références

- `server/src/db/seeds/01_demo.ts`
- `server/knexfile.ts`
- `server/package.json`
- `package.json`
