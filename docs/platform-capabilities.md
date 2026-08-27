# Matrice providers

Recherche officielle effectuée le 17 août 2026; validations live effectuées les 17 et 18 août 2026. `LIVE_TESTED` ne couvre que les opérations explicitement indiquées.

| Provider | Search | Play | Pause | Seek | Ended | Autoplay | Mobile/PWA | Statut V1 |
|---|---|---|---|---|---|---|---|---|
| Audius | LIVE_TESTED | LIVE_TESTED local + production | LIVE_TESTED | LIVE_TESTED | LIVE_TESTED | LIVE_TESTED après geste; contexte dépendant | MANUAL TEST REQUIRED | V1 CANDIDATE |
| YouTube | LIVE_TESTED | LIVE_TESTED en production HTTPS | LIVE_TESTED en production | MANUAL TEST REQUIRED | MANUAL TEST REQUIRED | CONTEXT_DEPENDENT | MANUAL TEST REQUIRED | V1 CANDIDATE |
| Jamendo | LIVE_TESTED | LIVE_TESTED dans Platform Lab | LIVE_TESTED | LIVE_TESTED | LIVE_TESTED | LIVE_TESTED après geste; contexte dépendant | MANUAL TEST REQUIRED | V1 CANDIDATE |
| Mixcloud | LIVE_TESTED | LIVE_TESTED local + production | LIVE_TESTED | PARTIAL/MANUAL TEST REQUIRED | MANUAL TEST REQUIRED | LIVE_TESTED après geste; contexte dépendant | MANUAL TEST REQUIRED | V1 CANDIDATE |
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

YouTube seek/ended, autoplay/visibilité/erreurs/Premium-publicités, iPhone Safari, PWA installée, écran verrouillé et background; Mixcloud seek/ended et widget mobile; les parcours complets Mac physiques de chaque provider. Aucun résultat n’est inventé avant ces tests.

Le client de démonstration public cité dans l’ancienne documentation Jamendo répondait `suspended application` lors du smoke test du 17 août 2026. Streamall détecte ce statut métier même lorsque HTTP répond 200. Le client du projet fourni ensuite a validé Search, Range, play, pause, seek et ended.

Mixcloud a obtenu 10 résultats live; le widget visible a ensuite validé play, pause, reprise et progression locale, puis play/pause sur le domaine Vercel. Audius a validé Search, Range 206, play/pause/seek/ended et un fallback réel. YouTube a validé Search puis play/pause/reprise en production HTTPS. La recherche production du 18 août a renvoyé 44 résultats avec Audius, YouTube, Jamendo et Mixcloud tous `LIVE`.
