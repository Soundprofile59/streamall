# Journal de décisions

- **Next.js 16 / React 19 / Node 22 / pnpm 11** : versions stables vérifiées et verrouillées le 17 août 2026.
- **State management React local** : le périmètre single-user ne justifie pas une dépendance globale; modules domaine purs et refs contrôlent les processus concurrents.
- **Providers séparés** : recherche serveur et playback navigateur ont des contrats distincts; aucune capability absente n’est simulée.
- **Auth single-user signée** : mot de passe et secret d’environnement, cookie HMAC. Plus simple qu’un système multi-user et indépendant d’un plan Vercel payant.
- **Google service account** : accès server-to-server recommandé par Google, feuille partagée explicitement, aucun JSON credential committé.
- **Optimistic concurrency** : revision globale et operationId; rechargement déterministe lors d’un conflit.
- **Player générationnel** : chaque load invalide le précédent; les événements anciens deviennent inertes.
- **PWA native Next.js** : manifest App Router et petit service worker explicite plutôt qu’un plugin PWA ancien. Aucun média/API privé en cache.
- **Mixcloud/Jamendo candidats activés** : coût faible et contrats officiels actuels. SoundCloud reste bloqué par credentials, Bandcamp secondaire.
- **Import REPLACE uniquement** : comportement non ambigu et testable; MERGE est reporté.
