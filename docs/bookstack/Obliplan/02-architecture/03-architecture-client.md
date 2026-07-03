Le client est une **SPA React** bâtie avec Vite. Le routage est assuré par `react-router-dom`, l'état global par Zustand, et l'apparence par le design system Obli (tokens CSS + Tailwind). L'application est installable (PWA) et sait recevoir des notifications Web Push.

## Amorçage (`main.tsx`)

`ReactDOM.createRoot` monte `<App />` sous `<React.StrictMode>`. Trois comportements transverses sont câblés au démarrage :

- **`initInstallPrompt()`** capture l'événement `beforeinstallprompt` (qui ne se déclenche qu'une fois, tôt) pour pouvoir proposer l'installation PWA plus tard depuis le profil.
- Sur `vite:preloadError` (chunk lazy supprimé par un déploiement plus récent), la page se **recharge** une fois pour récupérer le shell à jour.
- En **production uniquement**, le service worker `/sw.js` est enregistré (le dev garde le HMR intact).

## Routage et gardes de routes

`App.tsx` déclare l'arbre de routes sous `<BrowserRouter>`. `checkSession()` est appelé au montage pour réhydrater la session. Quatre gardes protègent les routes :

| Garde | Condition de passage | Sinon |
|---|---|---|
| `ProtectedRoute` | utilisateur connecté (spinner tant que non initialisé) ; `requiredRole` optionnel | redirige `/login` (ou `/` si rôle insuffisant) |
| `CapabilityRoute` | `can(capability)` (les admins plateforme passent toujours) | redirige `/` |
| `RecupSelfRoute` | `isManager()` **ou** `user.recupSelfService` | redirige `/` |
| `PlatformAdminRoute` | `isPlatformAdmin()` (config globale) | redirige `/` |

Toutes les pages applicatives sont imbriquées sous `ProtectedRoute` puis `AppLayout`. Exemples de correspondance route ↔ garde (extraits de `App.tsx`) :

| Route | Garde |
|---|---|
| `/`, `/mon-planning`, `/conges`, `/heures-sup`, `/projets`, `/taches`, `/temps` | `ProtectedRoute` |
| `/ma-recup` | `RecupSelfRoute` |
| `/vue-equipe` | `CapabilityRoute capability="planning:view_team"` |
| `/equipe`, `/planning-equipe`, `/charge`, `/rapports` | `CapabilityRoute capability="planning:read_team"` |
| `/import-planning` | `CapabilityRoute capability="planning:write"` |
| `/recup` | `CapabilityRoute capability="recup:manage"` |
| `/types-heures` | `CapabilityRoute capability="hourtypes:manage"` |
| `/audit` | `CapabilityRoute capability="users:manage"` |
| `/contrats`, `/clients`, `/utilisateurs`, `/equipes`, `/permissions` | `ProtectedRoute requiredRole="admin"` |
| `/workspaces`, `/settings` | `PlatformAdminRoute` |

## État global (Zustand)

Deux stores couvrent l'état applicatif.

### `authStore` — session & droits

`useAuthStore` (`store/authStore.ts`) porte la session et les droits résolus pour le tenant actif :

- **État** : `user`, `currentTenantId`, `tenants`, `capabilities`, `modules`, `platformAdmin`, `isLoading`, `isInitialized`.
- **Actions** : `login(username, password)`, `logout()`, `checkSession()`, `switchTenant(tenantId)`.
- **Sélecteurs** :

| Sélecteur | Renvoie `true` quand |
|---|---|
| `isAdmin()` | `user.role === 'admin'` |
| `isPlatformAdmin()` | flag `platformAdmin` (admin système, distinct d'un admin de tenant) |
| `isManager()` | rôle `manager` ou `admin` |
| `can(capability)` | admin ⇒ toujours ; sinon `capabilities.includes(capability)` |
| `hasModule(key)` | `modules.includes(key)` |

`login()` stocke le `sessionToken` (contexte iframe) puis charge `/auth/me` ; `logout()` déclenche un single-logout complet pour les utilisateurs SSO Obligate. Le thème préféré d'un utilisateur SSO est resynchronisé sur `uiStore` à chaque chargement de session.

### `uiStore` — préférences d'interface

`useUiStore` (`store/uiStore.ts`) gère les préférences persistées en `localStorage` :

- `theme` (parmi `VALID_THEMES` = `obli-operator`, `obli-daylight`, `modern`, `neon` ; repli sur `obli-operator` pour toute valeur inconnue) ;
- `sidebarCollapsed` (rail replié) ;
- `mobileNavOpen` (tiroir de navigation mobile hors-canvas).

`setTheme` applique l'attribut `data-theme` sur `<html>` et persiste le choix.

## Client API (`api/client.ts`)

Une instance `axios` unique centralise les appels :

- `baseURL: '/api'`, `withCredentials: true`, en-tête `Content-Type: application/json` ;
- **Détection d'iframe cross-site** (`window !== window.top`) : dans ce cas, un intercepteur de requête ajoute l'en-tête `X-Auth-Token` (lu dans `sessionStorage`, clé `obliplan_auth_token`) pour compenser le blocage des cookies ;
- **Gestion d'erreurs** : un intercepteur de réponse traite le `401` — en iframe il purge le token stocké ; hors iframe il redirige vers `/login` (sauf si l'on y est déjà) ;
- `storeSessionToken(token)` enregistre le jeton renvoyé par le login lorsqu'on est en iframe.

Le module `api/index.ts` regroupe, au-dessus de ce client, des façades typées par domaine (`authApi`, `tenantApi`, `moduleApi`, `planningApi`, `shiftApi`, `leaveApi`, `overtimeApi`, `pushApi`, `gdprApi`, `auditApi`, etc.), chacune renvoyant directement le `data` de l'enveloppe `ApiResponse`.

> En développement, Vite proxifie `/api` et `/auth` vers `http://localhost:3003` (`vite.config.ts`), tandis que le front tourne sur le port 5173.

## Design system Obli

L'apparence repose sur des **tokens CSS** définis dans `index.css` sous `:root` / `[data-theme='…']`. Les couleurs sont stockées en triplets RGB séparés par des espaces, ce qui permet à Tailwind d'appliquer les modificateurs d'opacité (`bg-accent/30`).

- `tailwind.config.ts` mappe ces variables sur des utilitaires sémantiques : `bg.{primary,secondary,tertiary,hover,active}`, `text.{primary,secondary,muted}`, `border`, `status.*`, `accent.{DEFAULT,hover,dark}`, plus la palette de marque `obli.*`.
- Quatre thèmes sont livrés : `obli-operator` (sombre, défaut), `obli-daylight` (clair « Nordic Mist »), `modern`, `neon`. L'accent de marque d'Obliplan est le **violet** (`#7c6cff` / `#9d8cff`), conservé dans tous les thèmes.
- Polices : `Inter` (sans), `Rajdhani` (display), `JetBrains Mono` (mono).

## Layout applicatif

`AppLayout` compose le châssis de l'application :

| Composant | Rôle |
|---|---|
| `Header` | barre supérieure pleine largeur : logo, `TenantSwitcher`, sélecteur d'apps Obli, `NotificationBell`, pastille utilisateur + déconnexion |
| `Sidebar` | rail de navigation persistant (desktop, repliable) ou tiroir (mobile) ; les entrées sont filtrées par module, capacité, rôle admin tenant ou admin plateforme |
| `MobileTabBar` | barre d'onglets fixe en bas, affichée uniquement sous le point de rupture `md` |
| tiroir hors-canvas | version mobile de la `Sidebar`, ouverte via `mobileNavOpen` |

La visibilité de chaque entrée de menu suit la même logique que les gates serveur : un module désactivé masque l'entrée, une capacité manquante la masque, et les sections « Administration » (tenant) / « Plateforme » (système) n'apparaissent qu'aux rôles concernés. Voir « Multi-tenant, isolation & modules par tenant ».

## PWA : installation & notifications push

- **Installation** : `useInstallPrompt` expose `canInstall` / `promptInstall()` à partir du `beforeinstallprompt` capturé au démarrage ; sur iOS/Safari (événement absent), l'app retombe sur l'indice manuel « partager → sur l'écran d'accueil ».
- **Web Push** : `usePushNotifications` gère l'abonnement **par appareil** de l'utilisateur connecté. Il dégrade proprement : navigateur non compatible ou serveur sans clés VAPID ⇒ l'option est masquée. L'abonnement passe par `Notification.requestPermission()`, `PushManager.subscribe` (avec la clé publique VAPID récupérée via `pushApi.publicKey()`), puis enregistrement côté serveur (`pushApi.subscribe`). Le service worker (`/sw.js`, en production) délivre les notifications.

## Toaster

Les notifications éphémères utilisent `react-hot-toast` : un `<Toaster />` unique est monté dans `App.tsx` (position `top-right`, style aligné sur le thème sombre).

## Références

- `client/src/main.tsx`, `client/src/App.tsx`
- `client/src/api/client.ts`, `client/src/api/index.ts`
- `client/src/store/authStore.ts`, `client/src/store/uiStore.ts`
- `client/src/components/layout/` (`AppLayout.tsx`, `Sidebar.tsx`, `Header.tsx`, `MobileTabBar.tsx`, `ProtectedRoute.tsx`)
- `client/src/hooks/useInstallPrompt.ts`, `client/src/hooks/usePushNotifications.ts`
- `client/src/index.css`, `client/tailwind.config.ts`, `client/vite.config.ts`
