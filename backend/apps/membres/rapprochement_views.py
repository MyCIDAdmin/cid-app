"""
Vues API — rapprochement (Zuordnung) des comptes inscrits avec les fiches importées.

  GET  /api/v1/membres/rapprochement/            — comptes avec suggestions de fiches (score)
  POST /api/v1/membres/rapprochement/fusionner/  — {inscrit_id, importe_id} : lie le compte
  POST /api/v1/membres/rapprochement/ecarter/    — {inscrit_id} : "aucune correspondance"

Réservé RH+ (même gate que l'import). Voir apps.membres.rapprochement pour les règles.
"""

from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsRHOrAbove

from .models import Membre
from .rapprochement import RapprochementError, fusionner, inscrits_a_rapprocher


def _fiche(membre: Membre) -> dict:
    return {
        "id": str(membre.pk),
        "numero_membre": membre.numero_membre,
        "prenom": membre.prenom,
        "nom": membre.nom,
        "email": membre.email,
        "date_naissance": membre.date_naissance,
        "ville_de": membre.ville_de,
        "statut": membre.statut,
        "date_adhesion": membre.date_adhesion,
    }


class FusionnerSerializer(serializers.Serializer):
    inscrit_id = serializers.UUIDField()
    importe_id = serializers.UUIDField()


class EcarterSerializer(serializers.Serializer):
    inscrit_id = serializers.UUIDField()


class RapprochementListView(APIView):
    permission_classes = [IsRHOrAbove]

    def get(self, request):
        donnees = []
        for inscrit, candidats in inscrits_a_rapprocher():
            donnees.append(
                {
                    "inscrit": {**_fiche(inscrit), "compte_cree_le": inscrit.user.created_at},
                    "candidats": [
                        {**_fiche(c.membre), "score": c.score, "raisons": c.raisons}
                        for c in candidats
                    ],
                }
            )
        return Response({"count": len(donnees), "results": donnees})


class RapprochementFusionnerView(APIView):
    permission_classes = [IsRHOrAbove]

    def post(self, request):
        serializer = FusionnerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        inscrit = get_object_or_404(Membre, pk=serializer.validated_data["inscrit_id"])
        importe = get_object_or_404(Membre, pk=serializer.validated_data["importe_id"])
        try:
            conserve = fusionner(inscrit, importe)
        except RapprochementError as exc:
            return Response(
                {"code": "rapprochement_impossible", "message": str(exc), "details": {}},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(_fiche(conserve), status=status.HTTP_200_OK)


class RapprochementEcarterView(APIView):
    permission_classes = [IsRHOrAbove]

    def post(self, request):
        serializer = EcarterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        inscrit = get_object_or_404(
            Membre, pk=serializer.validated_data["inscrit_id"], user__isnull=False
        )
        inscrit.rapprochement_ecarte = True
        inscrit.save(update_fields=["rapprochement_ecarte", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
