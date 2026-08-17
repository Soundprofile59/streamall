# Streamall

Streamall est une discothèque personnelle intelligente, privée et multi-source. La bibliothèque possède ses propres identités `Track` et `Mix`; Audius, YouTube, Jamendo et Mixcloud ne sont que des Sources de recherche et/ou de lecture.

## État

Baseline V1 exécutable. Le cœur domaine, l’accès single-user, la bibliothèque, Google Sheets, la recherche multi-provider, le Player Orchestrator, la Queue, le Random Engine, l’historique, l’édition Genre/Mood/Energy et le backup JSON sont implémentés. La suite locale validée comprend 18 tests de domaine/serveur et 4 scénarios E2E Chromium/WebKit. Les validations provider live avec credentials, iPhone réel et PWA installée restent obligatoires avant un statut `READY`.

Voir [les limitations connues](docs/known-limitations.md) et [la matrice de capacités](docs/platform-capabilities.md).

## Démarrage local

Prérequis : Node 22 et pnpm 11.19.0.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

En développement uniquement, sans variables d’auth configurées, le mot de passe est `streamall` et le repository est en mémoire. Les données disparaissent au redémarrage du serveur. En production, Streamall refuse explicitement ce mode.

Pour une persistance réelle :

1. créez une Google Sheet vide ;
2. créez un service account Google et activez Google Sheets API ;
3. partagez la feuille avec `GOOGLE_SERVICE_ACCOUNT_EMAIL` ;
4. renseignez `GOOGLE_SHEETS_SPREADSHEET_ID`, l’email et la clé privée ;
5. définissez `STREAMALL_REPOSITORY=sheets`.

Le repository crée les onglets `Meta`, `Artists`, `Albums`, `Tracks`, `Mixes`, `Sources` et `History` au premier accès.

## Credentials provider

- Audius : `AUDIUS_API_KEY`; `AUDIUS_BEARER_TOKEN` reste strictement serveur.
- YouTube : `YOUTUBE_API_KEY`, restreinte au domaine et à YouTube Data API.
- Jamendo : `JAMENDO_CLIENT_ID`.
- Mixcloud : la recherche publique n’exige pas de credential.
- SoundCloud : non activé en V1 tant que l’application/les credentials ne sont pas disponibles.

Aucun secret ne doit être committé. `.env*`, sauf `.env.example`, et les fichiers de service account sont ignorés.

## Vérifications

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Les smoke tests provider live ne sont pas exécutés dans la CI et ne doivent jamais utiliser la bibliothèque utilisateur. La route `/dev/platform-lab` est disponible en développement; en production elle retourne 404 sauf `ENABLE_PLATFORM_LAB=true`, tout en restant derrière l’authentification Streamall.

## Documentation

- [Architecture](docs/architecture.md)
- [Modèle de données](docs/data-model.md)
- [Random Engine](docs/random-engine.md)
- [Capacités providers](docs/platform-capabilities.md)
- [Décisions techniques](docs/decisions.md)
- [Tests manuels](docs/manual-testing.md)
- [Déploiement](docs/deployment.md)
- [Limitations connues](docs/known-limitations.md)
