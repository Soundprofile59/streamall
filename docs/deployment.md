# Déploiement Vercel

## État validé — 18 août 2026

- Projet : `dystopik-asylum/streamall` (Hobby).
- Domaine canonique : <https://streamall-three.vercel.app>.
- Branche de production : `agent/streamall-v1`; PR #1 conservée en Draft.
- Runtime : preset Next.js, Node.js 22.x.
- Repository : Google Sheets réel; secrets Production et Preview configurés; `ENABLE_PLATFORM_LAB=false`.
- Déploiement du commit `e42c280` : `Ready` après redéploiement avec les paramètres Next.js.

## Préconditions

1. Créer une Google Sheet dédiée et un service account; partager la feuille avec son email.
2. Créer/restrindre les clés Audius, YouTube et Jamendo.
3. Générer un mot de passe et un `STREAMALL_SESSION_SECRET` aléatoire d’au moins 32 octets.
4. Configurer les variables de `.env.example` dans Vercel, avec `STREAMALL_REPOSITORY=sheets`.
5. Laisser `ENABLE_PLATFORM_LAB=false`.
6. Déployer, puis exécuter la checklist `manual-testing.md`.

L’auth Streamall protège également le domaine de production et ne dépend donc pas de Vercel Deployment Protection. Cette dernière peut être ajoutée comme seconde barrière selon le plan Vercel.

## Smoke test

```text
unauthorized / → /login
unauthorized /api/library → 401
owner login → library
search provider réel → résultat
add → reload → persistance Sheets
Random → play → ended → next
export → fichier JSON
/dev/platform-lab en production → 404
```

Résultats du 18 août 2026 : redirection `/` 307 vers `/login`, `/api/library` 401 sans cookie, bibliothèque Sheets chargée après connexion, quatre providers `LIVE`, Random/Next et playback Audius/Mixcloud/YouTube opérationnels, Platform Lab 404 authentifié. Le téléchargement export et la restauration restent à rejouer dans le navigateur Mac physique avant `READY`.

## Rollback

Conserver l’export JSON pré-déploiement. En cas de migration future, exporter avant toute écriture. Un rollback code n’altère pas automatiquement la feuille; vérifier `schemaVersion` avant de redéployer une version ancienne.
