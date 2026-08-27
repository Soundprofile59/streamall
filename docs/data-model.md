# Modèle de données

Schéma actuel : `schemaVersion = 1`.

## Entités

- `Artist`: identité Streamall, nom, état disabled.
- `Album`: identité Streamall, artistes et artwork facultatif.
- `Track`: titre, artistes multiples, album/numéro/durée/artwork facultatifs, genres, moods, energy, feedback et état disabled.
- `Mix`: même sémantique jouable que Track sans être assimilé à un Track.
- `Source`: provider, providerId, URL de résolution/lecture, priorité, préférence utilisateur, santé technique et metadata provider confinées.
- `HistoryEntry`: item typé, session, Source/provider, durée jouée et outcome explicite.
- `Settings`: volume, priorité providers et réglages Random.

Les IDs provider ne sont jamais des IDs Streamall. Tous les IDs domaine sont globalement uniques et préfixés (`track_…`, `mix_…`, `source_…`).

## Google Sheets

Chaque onglet d’entité contient `id | json`. `Meta!A1` porte version du schéma, revision globale, taxonomies, settings, compteurs de lignes et les derniers IDs d’opération. La lecture utilise `batchGet`; l’écriture utilise un `values.batchUpdate` multi-ranges. Les compteurs empêchent des lignes résiduelles d’être relues après un import plus petit.

## Import et migration

L’import V1 est exclusivement `REPLACE` : parse, validation Zod, contrôle strict de version, preview, export de sécurité automatique côté client, puis écriture avec contrôle de revision. Un échec n’est jamais annoncé comme succès. Une future migration doit être ajoutée avant d’accepter un ancien `schemaVersion`; aucune conversion silencieuse n’est permise.
