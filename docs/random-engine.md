# Random Engine

Le moteur travaille exclusivement sur `Track` et `Mix` Streamall.

## Pipeline

1. Exclure définitivement contenu/artiste disabled, Source désactivée ou globalement bloquée, et tout contenu hors filtres explicites.
2. Appliquer les fenêtres anti-répétition Track (40), Artist (12), Album (18).
3. Si le jeu devient vide, relaxer dans l’ordre Album, Artist, puis Track.
4. Calculer les poids et tirer avec un PRNG seedable.
5. Ajouter l’élément à l’historique simulé avant de générer l’entrée suivante.

Les filtres Mood, Genre, Energy et type ne sont jamais relaxés.

## Poids

- Favorite : ×1,4.
- More often : ×2.
- Less often : ×0,45.
- Jamais joué : bonus `1 + rediscoveryStrength × 1,5`.
- Ancienneté : bonus plafonné, progressif sur environ 90 jours.
- Nombre d’écoutes : légère réduction logarithmique.
- Mix : `NEVER=0`, `RARE=0,18`, `NORMAL=0,65`, `FREQUENT=1,25`; un Mix >90 min reçoit encore ×0,55.

Les diagnostics enregistrent la seed, la taille du jeu candidat, l’ID choisi et le niveau de relaxation. Les tests couvrent plusieurs milliers de tirages, les contraintes dures, la pondération et les petites bibliothèques.
