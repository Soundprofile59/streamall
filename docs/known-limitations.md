# Limitations connues

- Audius Search/stream, YouTube Search/IFrame et Jamendo Search/audio sont implémentés mais non testés live faute de credentials valides fournis. Le client de démonstration Jamendo actuellement suspendu n’est pas considéré comme une validation.
- Google Sheets est implémenté mais non testé contre une feuille dédiée faute de credentials; la CI utilise exclusivement MemoryRepository.
- Les writes Sheets remplacent le snapshot par batch multi-ranges. C’est adapté à une bibliothèque personnelle V1, mais une très grosse History devra être paginée/append-only avant croissance importante.
- Le cache provider est opportuniste dans la mémoire serverless; il réduit les doublons dans une instance mais n’est pas un cache distribué.
- Les métadonnées YouTube conservées se limitent au nécessaire; une procédure opérationnelle de refresh/suppression conforme doit être validée avec la clé réelle avant production.
- L’ajout par URL Bandcamp et l’édition Genre/Mood en lot ne sont pas encore implémentés.
- SoundCloud n’est pas intégré sans app Artist Pro et credentials. Spotify et fichiers locaux sont hors V1.
- Les E2E automatisés passent sur Chromium desktop et WebKit avec profil iPhone 13. Un iPhone Safari physique, l’installation PWA, l’audio/autoplay, Premium/publicités et le background restent `MANUAL TEST REQUIRED`.
- La lecture YouTube background n’est volontairement pas supportée conformément aux politiques YouTube.
- Le shell PWA peut s’ouvrir hors ligne; aucun média distant n’est promis ni mis en cache.
- Le déploiement Vercel n’est pas créé tant que secrets, feuille Google et choix de domaine ne sont pas configurés.
