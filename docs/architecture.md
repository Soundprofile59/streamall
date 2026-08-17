# Architecture

Vérifié le 17 août 2026.

```text
Next.js UI
  ├─ Library/Search/Metadata/Backup
  ├─ Queue + Random Engine (identités Streamall seulement)
  └─ Player Orchestrator
       └─ Source Resolver
            ├─ HTML Audio (Audius/Jamendo)
            ├─ YouTube IFrame API (player visible)
            └─ Mixcloud Widget (player visible)

API privée Next.js
  ├─ Provider search adapters
  ├─ Backup/restore
  └─ Library Service
       └─ LibraryRepository
            ├─ MemoryLibraryRepository (dev/tests)
            └─ GoogleSheetsLibraryRepository (production V1)
```

Le domaine ne dépend ni de React, ni de Next.js, ni d’un SDK provider, ni de Google Sheets. `Track` et `Mix` ont des identités globales Streamall. `Source.playableItemId` est l’unique représentation persistante de la relation vers un contenu; retirer une Source ne retire jamais son contenu.

## Frontières

- `src/domain`: modèles, validation, queue, sélection Random, résolution de Sources, machine Player.
- `src/server`: auth, repositories, cache/rate-limit et providers.
- `src/client`: UI et adapters de playback navigateur.
- `src/app/api`: routes authentifiées minces.

## État et concurrence

Google Sheets est la source de vérité. Le client conserve un snapshot de travail et sérialise les écritures après un debounce de 650 ms. Chaque sauvegarde inclut `expectedRevision` et `operationId`. Un conflit `409` recharge la version distante; une opération rejouée est idempotente. Les entités ont également `revision`, `createdAt` et `updatedAt`.

Le cache Sheets en mémoire (30 s) n’est qu’un cache opportuniste; il n’est jamais considéré comme persistance. Le player et la queue n’interrogent pas Sheets à chaque `Next`.

## Erreurs provider

Le resolver trie les Sources activées et techniquement utilisables. Le Player tente la suivante après un échec, invalide les anciens chargements avec une génération, ignore les événements tardifs et déduplique `ended`. Une panne temporaire augmente `consecutiveFailures` sans transformer la préférence utilisateur ni déclarer la Source définitivement indisponible.

## Sécurité

Un mot de passe single-user crée un cookie signé HMAC, `HttpOnly`, `SameSite=Lax`, `Secure` en production. Le proxy protège pages et API; chaque route privée vérifie également la session. La connexion est rate-limitée. Les secrets providers et Google restent côté serveur, ne sont ni renvoyés ni loggés.

Le service worker n’intercepte jamais `/api/*` et ne met jamais en cache un flux média externe.
