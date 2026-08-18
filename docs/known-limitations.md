# Limitations connues

- Audius, YouTube, Jamendo et Mixcloud sont validés live pour la recherche. Les opérations de lecture couvertes exactement sont consignées dans `platform-capabilities.md`; les parcours physiques Mac/iPhone restent obligatoires.
- Google Sheets réel, la persistance après redémarrage, l’export et la restauration `REPLACE` ont passé 12 contrôles dédiés. La CI reste volontairement sur MemoryRepository.
- Les writes Sheets remplacent le snapshot par batch multi-ranges. C’est adapté à une bibliothèque personnelle V1, mais une très grosse History devra être paginée/append-only avant croissance importante.
- Le cache provider est opportuniste dans la mémoire serverless; il réduit les doublons dans une instance mais n’est pas un cache distribué.
- Les métadonnées YouTube conservées se limitent au nécessaire; le test Premium/publicités et les cas non embeddable/supprimé/géobloqué restent manuels.
- L’ajout par URL Bandcamp et l’édition Genre/Mood en lot ne sont pas encore implémentés.
- SoundCloud n’est pas intégré sans app Artist Pro et credentials. Spotify et fichiers locaux sont hors V1.
- Les E2E automatisés passent sur Chromium desktop et WebKit avec profil iPhone 13. Un iPhone Safari physique, l’installation PWA, l’audio/autoplay, Premium/publicités et le background restent `MANUAL TEST REQUIRED`.
- La lecture YouTube background n’est volontairement pas supportée conformément aux politiques YouTube.
- Le shell PWA peut s’ouvrir hors ligne; aucun média distant n’est promis ni mis en cache.
- Le déploiement Vercel est actif sur `streamall-three.vercel.app` depuis la branche Draft `agent/streamall-v1`. La PR et la V1 restent non-Ready jusqu’aux checklists physiques.
