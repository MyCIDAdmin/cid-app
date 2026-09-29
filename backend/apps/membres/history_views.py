"""
Vue API — historique de statut associatif du membre courant, par année.

Alimente la section "Jährlicher Mitgliedschaftsstatus" du widget "Mitgliedschaftsverlauf"
(frontend/src/pages/adhesions/MonAdhesionPage.tsx). Expose en lecture seule ce que
apps.membres.imports_historique.importer_historique_statuts et
apps.membres.services.enregistrer_statut_annuel écrivent dans HistoriqueStatutMembre —
jusqu'ici cette table n'était lue par aucune vue API (le seul point de lecture existant était
interne à services.py, pour un contrôle d'idempotence, voir sa docstring). Résultat concret
avant ce correctif : un import Historique (Excel) réussi restait invisible pour le membre
concerné côté frontend, quel que soit le contenu du fichier importé.

Ajouté le 2026-09-29 (diagnostic : import confirmé correct en base — CIN avec zéro non
significatif, email correspondant — mais aucune route ne l'exposait au frontend).
"""

from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import HistoriqueStatutMembre


class HistoriqueStatutMembreSerializer(serializers.ModelSerializer):
    class Meta:
        model = HistoriqueStatutMembre
        fields = ["annee", "statut", "raison", "date_effet"]
        read_only_fields = fields


class MonHistoriqueStatutView(APIView):
    """
    GET /api/v1/membres/mon-historique/ — historique de statut associatif (une ligne par année)
    du membre lié à l'utilisateur courant, trié par année décroissante (ordering par défaut du
    modèle, voir HistoriqueStatutMembre.Meta.ordering). Même convention que
    SouscriptionViewSet.mes_souscriptions (apps.adhesions.views) : jamais d'erreur si
    l'utilisateur courant n'a pas de fiche Membre associée, une liste vide dans ce cas.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            return Response([])
        queryset = membre.historique_statuts.all()
        return Response(HistoriqueStatutMembreSerializer(queryset, many=True).data)
