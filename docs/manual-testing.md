# Validation manuelle

Renseigner appareil, OS, navigateur, date, résultat et preuve pour chaque ligne.

## Prévalidation technique — 18 août 2026

- PASS : accès sans cookie `/` → `/login`; `/api/library` → 401.
- PASS : connexion production et chargement de la bibliothèque Google Sheets réelle (2 Tracks, 1 Mix, état `Synchronisé`).
- PASS : `/dev/platform-lab` retourne 404 après authentification avec `ENABLE_PLATFORM_LAB=false`.
- PASS : recherche production, 44 résultats; Audius, YouTube, Jamendo et Mixcloud `LIVE`.
- PASS : Random génère une queue de 16; Audius play/pause/reprise et fallback; Mixcloud play/pause après geste; YouTube play/pause/reprise.
- PASS local : Google Sheets, export/restauration/redémarrage; Audius et Jamendo seek/ended; Mixcloud progression.
- RETEST MAC REQUIS : le premier essai physique a révélé qu’une ligne `▶` ne lançait la lecture qu’au double-clic. Le clic/tap simple appelle désormais directement le lecteur et passe l’E2E Chromium/WebKit.
- RESTE MANUEL : tous les points Mac ci-dessous qui exigent audition/observation physique, puis iPhone Safari et PWA.

## Mac desktop

1. Connexion privée; vérifier qu’un visiteur sans cookie ne lit ni page, ni `/api/library`, ni export, ni Platform Lab production.
2. Audius : Search → Add → Play → Pause → Seek → Ended → Next.
3. YouTube : Search → Add → player visible → Play → Pause → Seek → Ended → Next; vérifier attribution et absence d’overlay.
4. Deux Sources sur un Track : faire échouer la première et constater le fallback sans boucle.
5. Random avec Mood/Genre : 20 Next, aucun contenu hors filtre; vérifier Artist/Album non répétés trop tôt.
6. Edit Mood/Genre/Energy, recharger et vérifier la persistance.
7. Export, restaurer dans une feuille de test vide, comparer la bibliothèque.

## iPhone Safari

1. Connexion, navigation et targets tactiles à ~390 px.
2. Random → premier play → Next; noter toute interaction `Tap to continue`.
3. Audius, YouTube, Jamendo et Mixcloud séparément : play/pause/seek/ended.
4. Verrouiller l’écran et changer d’application; documenter le comportement, sans attente de background universel.

## iPhone PWA installée

1. Ajouter à l’écran d’accueil, démarrer en standalone, vérifier icône/theme/navigation.
2. Refaire Random/Next/Queue et les providers.
3. Déployer une nouvelle version, rouvrir et confirmer la mise à jour cohérente.

## YouTube spécifique

Tester autoplay après interaction, player >200×200 et majoritairement visible, contenu Made for Kids, vidéo non embeddable/supprimée/géobloquée, session Premium et publicités. Ne jamais marquer Premium/no-ads comme validé sans preuve de la session réelle.
