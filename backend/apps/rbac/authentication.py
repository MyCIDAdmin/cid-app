"""
Authentification JWT avec barrière "non-membre" — app rbac (ajouté le 2026-10-11).

Demande utilisateur : "Es soll garantiert werden, dass ein User, der in der neuen Kampagne nicht
mehr angemeldet ist, NUR die Module sieht, die ein Nicht-Mitglied sehen darf." Jusqu'ici la
visibilité (tableau Sichtbarkeit) ne pilotait que le MENU : l'API de la communauté, des votes,
etc. restait ouverte à tout compte authentifié, et aucune route frontend n'était barrée — un
compte marqué non-membre pouvait donc toujours ouvrir /fil ou appeler l'API directement. Les
permissions bespoke de chaque app n'ont jamais été conçues pour tenir compte du statut associatif.

Plutôt que d'ajouter une classe de permission à la quarantaine de ViewSets (et d'oublier la
prochaine), la barrière vit à UN seul endroit : la classe d'authentification par défaut de DRF
(settings.REST_FRAMEWORK). Après un JWT valide, `services.gate_nicht_mitglied` décide si le
compte peut atteindre le préfixe d'API demandé ; sinon 403. Les endpoints sans authentification
(Startseite publique) et les chemins hors de registry.API_PREFIXES_MENU ne sont jamais concernés.
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

from . import services


class ModuleNonDisponible(PermissionDenied):
    default_detail = "Ce module n'est pas disponible tant que vous n'êtes pas membre actif."
    default_code = "module_non_disponible"


class GatedJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        resultat = super().authenticate(request)
        if resultat is None:
            return None
        user, _token = resultat
        if not services.gate_nicht_mitglied(user, request.path):
            raise ModuleNonDisponible()
        return resultat
