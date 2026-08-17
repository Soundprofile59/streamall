# Matrice providers

Recherche officielle effectuée le 17 août 2026. `DOCS_CONFIRMED` ne signifie jamais `LIVE_TESTED`.

| Provider | Search | Play | Pause | Seek | Ended | Autoplay | Mobile/PWA | Statut V1 |
|---|---|---|---|---|---|---|---|---|
| Audius | DOCS_CONFIRMED, IMPLEMENTED, UNTESTED LIVE | DOCS_CONFIRMED, IMPLEMENTED, UNTESTED LIVE | HTML Audio, UNTESTED LIVE | HTML Audio, UNTESTED LIVE | HTML Audio, UNTESTED LIVE | CONTEXT_DEPENDENT | MANUAL TEST REQUIRED | BLOCKED BY `AUDIUS_API_KEY` |
| YouTube | DOCS_CONFIRMED, IMPLEMENTED, UNTESTED LIVE | IFrame API, IMPLEMENTED, UNTESTED LIVE | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | CONTEXT_DEPENDENT | MANUAL TEST REQUIRED | BLOCKED BY `YOUTUBE_API_KEY` |
| Jamendo | DOCS_CONFIRMED, IMPLEMENTED, UNTESTED WITH VALID KEY | direct licensed audio, IMPLEMENTED | HTML Audio | HTML Audio | HTML Audio | CONTEXT_DEPENDENT | MANUAL TEST REQUIRED | BLOCKED BY VALID `JAMENDO_CLIENT_ID` |
| Mixcloud | DOCS_CONFIRMED, IMPLEMENTED, LIVE_TESTED | visible widget, IMPLEMENTED, LOAD TESTED | IMPLEMENTED | PARTIAL (widget may reject) | IMPLEMENTED | CONTEXT_DEPENDENT | MANUAL AUDIO TEST REQUIRED | CANDIDATE V1 |
| SoundCloud | DOCS_CONFIRMED | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT IMPLEMENTED | NOT TESTED | NOT TESTED | BLOCKED BY APP CREDENTIAL AVAILABILITY |
| Bandcamp | URL/embed approach documented | NOT IMPLEMENTED | NOT IMPLEMENTED | UNSUPPORTED/UNKNOWN | NOT TESTED | NOT TESTED | NOT TESTED | SECONDARY/FUTURE |

## Sources officielles

- Audius SDK, credentials, plans et sécurité du bearer token : <https://docs.audius.co/llms-full.txt>. Free plan documenté : 10 req/s et 500 000 req/mois. La clé API peut être publique; le bearer reste serveur.
- YouTube IFrame API : <https://developers.google.com/youtube/iframe_api_reference>.
- YouTube minimum functionality/policies : <https://developers.google.com/youtube/terms/required-minimum-functionality> et <https://developers.google.com/youtube/terms/developer-policies>. Le player doit rester visible, mesurer au moins 200×200, ne pas être recouvert et ne doit pas servir à la lecture background.
- YouTube search/quota : <https://developers.google.com/youtube/v3/docs/search/list> et <https://developers.google.com/youtube/v3/determine_quota_cost>. La recherche est explicite, cachée 10 minutes et jamais déclenchée à chaque frappe.
- Mixcloud REST/widget : <https://www.mixcloud.com/developers/> et <https://www.mixcloud.com/developers/widget/>. Le widget doit être visible; `play()` n’est pas garanti sans geste utilisateur.
- Jamendo API v3 : <https://developer.jamendo.com/v3.0/tracks> et <https://developer.jamendo.com/v3.0/authentication>.
- SoundCloud API Guide : <https://developers.soundcloud.com/docs/api/guide>. En 2026, l’enregistrement d’app exige Artist Pro; les ressources publiques utilisent un flux client credentials serveur.
- Bandcamp API : <https://bandcamp.com/developer>. Aucune recherche catalogue publique générale confirmée pour ce besoin.

## Tests manuels indispensables

YouTube autoplay/visibilité/erreurs/Premium-publicités, iPhone Safari, PWA installée, écran verrouillé et background; Mixcloud widget mobile; Audius seek/ended; Jamendo ended et changements de contenu. Aucun résultat n’est inventé avant ces tests.

Le client de démonstration public cité dans l’ancienne documentation Jamendo répondait `suspended application` lors du smoke test du 17 août 2026. Streamall détecte maintenant ce statut métier (même lorsque HTTP répond 200) et classe le fournisseur en `ERROR`; une clé de projet valide reste nécessaire.

Le même smoke test a obtenu 10 résultats Mixcloud live, puis validé dans le navigateur l’ajout en bibliothèque, la génération d’une queue de 20 entrées et le chargement du widget visible. L’écoute audio/seek/ended reste une validation humaine.
