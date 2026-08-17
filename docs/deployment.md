# Déploiement Vercel

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

## Rollback

Conserver l’export JSON pré-déploiement. En cas de migration future, exporter avant toute écriture. Un rollback code n’altère pas automatiquement la feuille; vérifier `schemaVersion` avant de redéployer une version ancienne.
