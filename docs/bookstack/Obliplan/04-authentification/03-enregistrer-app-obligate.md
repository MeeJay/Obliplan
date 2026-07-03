Pour activer le SSO, Obliplan doit d'abord être déclaré comme **application connectée** dans Obligate, puis recevoir l'URL de la passerelle et la clé API générée. Cette page décrit la procédure pas-à-pas des deux côtés (Obligate, puis Obliplan) et rappelle où vit la clé API.

## 1. Déclarer l'application dans Obligate

Dans Obligate, ouvrir **Connected Apps → Add App** et renseigner :

| Champ | Valeur | Détail |
|-------|--------|--------|
| `app_type` (slug) | `obliplan` | Identifiant technique de l'application |
| `name` | `Obliplan` | Nom affiché |
| `base_url` | URL publique de l'instance | Ex. `http://localhost:3002` |
| `color` | `#7c6cff` | Accent de marque |

## 2. Récupérer la clé API

Obligate génère une `api_key`. Elle n'est **affichée qu'une seule fois** : copiez-la immédiatement.

> Cette clé joue un double rôle : Obliplan la présente comme `client_id` lors de la redirection OAuth et comme `Bearer` lors de l'échange du code ; Obligate la présente à son tour comme `Bearer` sur les endpoints inverses (`/api/auth/app-info`, `/dashboard-stats`, `/sso-user-sync`). Voir « SSO Obligate : flux OAuth détaillé ».

## 3. Configurer la passerelle dans Obliplan

Dans Obliplan, ouvrir `Administration → Paramètres → Obligate SSO Gateway` (réservé aux administrateurs de plateforme), puis :

1. Coller l'**URL Obligate** (base_url de la passerelle).
2. Coller la **clé API** récupérée à l'étape 2.
3. **Activer le SSO**.

Cette écran pilote l'endpoint `PATCH /api/admin/config/obligate`, dont la charge utile est :

```json
{
  "url": "https://obligate.example.org",
  "apiKey": "og_xxxxxxxxxxxxxxxxxxxx",
  "enabled": true
}
```

Règles appliquées côté serveur :

- `url` doit être une URL valide.
- `url` ne peut **pas** pointer vers l'instance Obliplan elle-même (garde-fou contre une boucle de redirection).
- La clé API n'est écrasée que si une valeur non vide est fournie (un `PATCH` sans `apiKey` conserve la clé existante).
- La vue publique de la configuration (`GET /api/admin/config/obligate`) ne renvoie jamais la clé : elle expose seulement `url`, `apiKeySet` (booléen) et `enabled`.

## 4. Mapper les rôles côté Obligate

Dans Obligate (**Permission Groups**), mapper les groupes vers les rôles exposés par Obliplan. Obliplan déclare trois rôles :

| Rôle Obliplan | Périmètre (résumé) |
|---------------|--------------------|
| `admin` | Administration du tenant (et God View si platform admin) |
| `manager` | Encadrement d'équipe, gestion du planning et des récup |
| `employe` | Consultation de son propre planning et de ses compteurs |

Obligate récupère la liste des rôles (et des tenants / permission sets) via `GET /api/auth/app-info`. Le mapping détermine le champ `role` de chaque entrée `tenants[]` dans l'assertion, appliqué ensuite à `user_tenants.role`. Le détail du modèle d'autorisation est décrit dans « RBAC : capacités, permission sets & rôles ».

## Où vit la clé API

La clé API et l'URL de la passerelle sont stockées **en base**, dans la table `app_config` :

| Clé `app_config` | Contenu |
|------------------|---------|
| `obligate_config` | JSON `{ url, apiKey }` |
| `obligate_enabled` | `'true'` \| `'false'` |

> La clé API n'est **jamais** écrite dans le dépôt ni dans les images Docker. Le fichier `.env` est listé dans `.gitignore` **et** `.dockerignore` ; la clé Obligate vit uniquement en base (`app_config`). C'est aussi pourquoi la bascule local ↔ SSO se pilote depuis l'application, sans variable d'environnement ni redéploiement.

## Références

- `README.md` (section « Enregistrer Obliplan comme app connectée dans Obligate »)
- `server/src/routes/appConfig.routes.ts`
- `server/src/controllers/appConfig.controller.ts`
- `server/src/services/appConfig.service.ts`
- `server/src/validators/schemas.ts` (`patchObligateSchema`)
- `server/src/routes/obligate.routes.ts` (`GET /api/auth/app-info`)
- `shared/src/config.ts` (`ObligateConfig`)
