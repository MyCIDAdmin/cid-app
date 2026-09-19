"""
Vues API — app stats (FDD §5.3) :
  GET /stats/financier/   — ?annee=&ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant=
  GET /stats/membres/     — ?ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant=
  GET /stats/evenements/  — ?annee=&ville=&statut=&land=&pays=
                             &date_adhesion_apres=&date_adhesion_avant=

land/pays/date_adhesion_apres/date_adhesion_avant ajoutés le 2026-09-19 (demande
utilisateur : "Bei ... Statistiken & KPIs füge mehr Filtermöglichten hinzu z.B.
Bundesland").

Pas de ModelViewSet : ce module n'a pas de modèle propre (voir models.py/services.py), seulement
des agrégations en lecture seule sur les modèles existants — de simples APIView suffisent, sans
pagination ni filtres DRF génériques (les filtres de la barre mockup #pg-stats sont des paramètres
de requête simples, traduits en arguments de services.py).
"""

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import StatsPermission
from .services import kpis_evenements, kpis_financier, kpis_membres


def _annee_depuis_requete(request):
    brut = request.query_params.get("annee")
    if not brut:
        return None
    try:
        return int(brut)
    except ValueError as exc:
        raise ValidationError({"annee": "Doit être une année numérique."}) from exc


class BaseStatsView(APIView):
    permission_classes = [IsAuthenticated, StatsPermission]

    def _filtres_communs(self, request):
        # land/pays/date_adhesion_* ajoutés le 2026-09-19 (demande utilisateur : "Bei ...
        # Statistiken & KPIs füge mehr Filtermöglichten hinzu z.B. Bundesland") — voir
        # services._filtrer_par_membre.
        return {
            "ville": request.query_params.get("ville") or None,
            "statut": request.query_params.get("statut") or None,
            "land": request.query_params.get("land") or None,
            "pays": request.query_params.get("pays") or None,
            "date_adhesion_apres": request.query_params.get("date_adhesion_apres") or None,
            "date_adhesion_avant": request.query_params.get("date_adhesion_avant") or None,
        }


class StatsFinancierView(BaseStatsView):
    def get(self, request):
        return Response(
            kpis_financier(annee=_annee_depuis_requete(request), **self._filtres_communs(request))
        )


class StatsMembresView(BaseStatsView):
    def get(self, request):
        return Response(kpis_membres(**self._filtres_communs(request)))


class StatsEvenementsView(BaseStatsView):
    def get(self, request):
        return Response(
            kpis_evenements(annee=_annee_depuis_requete(request), **self._filtres_communs(request))
        )
