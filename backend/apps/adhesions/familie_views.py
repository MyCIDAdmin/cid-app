"""Familienpaket (Release 34) — API.

  POST   /adhesions/souscriptions/<id>/kinder/             Kind eintragen (nur die Hauptperson)
  DELETE /adhesions/souscriptions/<id>/kinder/<kind_id>/   Kind entfernen (nur die Hauptperson)
  GET    /adhesions/familienpakete/?campagne=<id>          Übersicht fürs Büro
"""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ROLE_LEVELS
from apps.rbac.services import is_elevated_for_module

from . import familie
from .models import FamilienKind, Souscription, StatutSouscription
from .permissions import READ_ALL_SOUSCRIPTIONS_MIN_LEVEL
from .serializers import SouscriptionSerializer

_NICHT_AKTIV = (StatutSouscription.ANNULEE, StatutSouscription.EXPIREE)


def _eigene_souscription(request, pk) -> Souscription:
    """Nur die Hauptperson erreicht ihre Souscription (sonst 404, kein Hinweis auf fremde Daten)."""
    return get_object_or_404(
        Souscription.objects.select_related("offre", "membre", "campagne").prefetch_related(
            "kinder"
        ),
        pk=pk,
        membre__user=request.user,
    )


class KinderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        souscription = _eigene_souscription(request, pk)
        if souscription.statut in _NICHT_AKTIV:
            return Response({"detail": "souscription_nicht_aktiv"}, status=400)
        familie.kind_anlegen(souscription, request.user, request.data)
        souscription = _eigene_souscription(request, pk)
        return Response(SouscriptionSerializer(souscription).data, status=201)


class KindDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, kind_pk):
        souscription = _eigene_souscription(request, pk)
        get_object_or_404(FamilienKind, pk=kind_pk, souscription=souscription).delete()
        return Response(status=204)


class FamilienpaketeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) < READ_ALL_SOUSCRIPTIONS_MIN_LEVEL and (
            not is_elevated_for_module(user, "adhesions")
        ):
            raise PermissionDenied()
        pakete = (
            Souscription.objects.filter(offre__ist_familienpaket=True)
            .exclude(statut__in=_NICHT_AKTIV)
            .select_related("membre", "offre", "campagne")
            .prefetch_related("kinder")
            .order_by("-date_souscription")
        )
        campagne = request.query_params.get("campagne")
        if campagne:
            pakete = pakete.filter(campagne_id=campagne)
        daten = []
        bezahlt = plaetze_erw = kinder_eingetragen = 0
        for s in pakete:
            kinder = list(s.kinder.all())
            if s.statut == StatutSouscription.PAYEE:
                bezahlt += 1
                plaetze_erw += s.plaetze_erwachsene
                kinder_eingetragen += len(kinder)
            daten.append(
                {
                    "id": str(s.id),
                    "hauptperson": f"{s.membre.prenom} {s.membre.nom}".strip(),
                    "numero_membre": s.membre.numero_membre,
                    "angebot": s.offre.nom,
                    "campagne": s.campagne.nom,
                    "statut": s.statut,
                    "prix_paye": str(s.prix_paye),
                    "plaetze_erwachsene": s.plaetze_erwachsene,
                    "plaetze_kinder": s.plaetze_kinder,
                    "kinder": [
                        {"id": str(k.id), "name": f"{k.vorname} {k.nachname}", "alter": k.alter}
                        for k in kinder
                    ],
                }
            )
        return Response(
            {
                "zusammenfassung": {
                    "pakete_bezahlt": bezahlt,
                    "plaetze_erwachsene": plaetze_erw,
                    "kinder_eingetragen": kinder_eingetragen,
                },
                "pakete": daten,
            }
        )
