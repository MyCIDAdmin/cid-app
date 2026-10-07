from django.apps import apps
from django.db.models import Avg, Count, ExpressionWrapper, F, FloatField, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role

from .models import (
    Partner,
    PartnerBewertung,
    PartnerKategorie,
    PartnerStatus,
    PartnerVerknuepfung,
    VerknuepfungRolle,
)
from .permissions import PartnerPermission
from .serializers import (
    PartnerBewertungSerializer,
    PartnerDetailSerializer,
    PartnerKategorieSerializer,
    PartnerSerializer,
    PartnerVerknuepfungCreateSerializer,
    PartnerVerknuepfungSerializer,
)

ZIEL_MODELLE = {
    "projet": ("projets", "Projet", "titre"),
    "evenement": ("evenements", "Evenement", "titre"),
    "produit": ("boutique", "Produit", "nom"),
}
SORTIERUNG = {
    "nom": "nom",
    "-nom": "-nom",
    "note": "-bewertung_schnitt",
    "-created_at": "-created_at",
}


def _liste(wert):
    return [w.strip() for w in (wert or "").split(",") if w.strip()]


class PartnerViewSet(viewsets.ModelViewSet):
    """/partenaires/partner/ — Lesen ab RH, Pflegen/Bewerten ab Bureau Admin ; kein DELETE
    (Archivieren statt Löschen)."""

    permission_classes = [PartnerPermission]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self):
        return PartnerDetailSerializer if self.action == "retrieve" else PartnerSerializer

    def get_queryset(self):
        qs = Partner.objects.prefetch_related("kategorien").annotate(
            bewertung_schnitt=Avg(
                ExpressionWrapper(
                    (
                        F("bewertungen__qualitaet")
                        + F("bewertungen__preis_leistung")
                        + F("bewertungen__zuverlaessigkeit")
                        + F("bewertungen__kommunikation")
                    )
                    / 4.0,
                    output_field=FloatField(),
                )
            ),
            bewertung_anzahl=Count("bewertungen", distinct=True),
            verknuepfungen_anzahl=Count("verknuepfungen", distinct=True),
        )
        if self.action != "list":
            return qs
        q = self.request.query_params
        statut = q.get("statut")
        if statut in PartnerStatus.values:
            qs = qs.filter(statut=statut)
        elif q.get("alle") != "1":
            qs = qs.exclude(statut=PartnerStatus.ARCHIVIERT)
        if q.get("typ") in ("partner", "lieferant"):
            # "Lieferant" schließt "beides" ein, ebenso "Partner".
            qs = qs.filter(typ__in=[q["typ"], "beides"])
        kategorien = _liste(q.get("kategorie"))
        if kategorien:
            qs = qs.filter(kategorien__in=kategorien).distinct()
        if q.get("bevorzugt") == "1":
            qs = qs.filter(bevorzugt=True)
        suche = (q.get("q") or "").strip()
        if suche:
            qs = qs.filter(
                Q(nom__icontains=suche)
                | Q(ansprechpartner__icontains=suche)
                | Q(ville__icontains=suche)
                | Q(email__icontains=suche)
            )
        for ziel in ("projet", "evenement", "produit"):
            if q.get(ziel):
                qs = qs.filter(**{f"verknuepfungen__{ziel}": q[ziel]}).distinct()
        if q.get("min_note"):
            try:
                qs = qs.filter(bewertung_schnitt__gte=float(q["min_note"]))
            except ValueError as exc:
                raise ValidationError({"min_note": "Zahl erwartet."}) from exc
        return qs.order_by(SORTIERUNG.get(q.get("ordering"), "nom"), "nom")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def archivieren(self, request, pk=None):
        partner = self.get_object()
        partner.statut = PartnerStatus.ARCHIVIERT
        partner.save(update_fields=["statut", "updated_at"])
        return Response(PartnerSerializer(partner).data)

    @action(detail=True, methods=["post"])
    def reaktivieren(self, request, pk=None):
        partner = self.get_object()
        partner.statut = PartnerStatus.AKTIV
        partner.save(update_fields=["statut", "updated_at"])
        return Response(PartnerSerializer(partner).data)

    @action(detail=True, methods=["post"])
    def verknuepfen(self, request, pk=None):
        partner = self.get_object()
        serializer = PartnerVerknuepfungCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        daten = serializer.validated_data
        app, modell, _ = ZIEL_MODELLE[daten["ziel_typ"]]
        ziel = apps.get_model(app, modell).objects.filter(pk=daten["ziel_id"]).first()
        if ziel is None:
            raise ValidationError({"ziel_id": "Ziel nicht gefunden."})
        rolle = daten.get("rolle", VerknuepfungRolle.SONSTIGE)
        vorhanden = PartnerVerknuepfung.objects.filter(
            partner=partner, rolle=rolle, **{daten["ziel_typ"]: ziel}
        )
        if vorhanden.exists():
            raise ValidationError("Diese Verknüpfung besteht bereits.")
        verknuepfung = PartnerVerknuepfung.objects.create(
            partner=partner,
            rolle=rolle,
            notiz=daten.get("notiz", ""),
            created_by=request.user,
            **{daten["ziel_typ"]: ziel},
        )
        return Response(
            PartnerVerknuepfungSerializer(verknuepfung).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["get", "post"])
    def bewertungen(self, request, pk=None):
        partner = self.get_object()
        if request.method == "GET":
            qs = partner.bewertungen.select_related("bewerter", "verknuepfung")
            return Response(PartnerBewertungSerializer(qs, many=True).data)
        serializer = PartnerBewertungSerializer(
            data=request.data, context={"partner": partner, "request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(partner=partner, bewerter=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PartnerKategorieViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [PartnerPermission]
    serializer_class = PartnerKategorieSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return PartnerKategorie.objects.annotate(
            anzahl=Count(
                "partner", filter=~Q(partner__statut=PartnerStatus.ARCHIVIERT), distinct=True
            )
        )


class PartnerVerknuepfungLoeschenView(APIView):
    permission_classes = [PartnerPermission]

    def delete(self, request, pk):
        PartnerVerknuepfung.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerBewertungLoeschenView(APIView):
    """Eine Bewertung löschen darf nur ihr Autor oder der Administrator App."""

    permission_classes = [PartnerPermission]

    def delete(self, request, pk):
        bewertung = PartnerBewertung.objects.filter(pk=pk).first()
        if bewertung is None:
            raise NotFound()
        if bewertung.bewerter_id != request.user.pk and request.user.role != Role.SUPER_ADMIN:
            raise PermissionDenied("Nur der Autor kann die Bewertung löschen.")
        bewertung.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerZieleView(APIView):
    """GET /partenaires/ziele/?typ=projet|evenement|produit&q= — Auswahl für die Verknüpfung."""

    permission_classes = [PartnerPermission]

    def get(self, request):
        typ = request.query_params.get("typ")
        if typ not in ZIEL_MODELLE:
            raise ValidationError({"typ": "Unbekannter Zieltyp."})
        app, modell, feld = ZIEL_MODELLE[typ]
        qs = apps.get_model(app, modell).objects.all()
        suche = (request.query_params.get("q") or "").strip()
        if suche:
            qs = qs.filter(**{f"{feld}__icontains": suche})
        return Response(
            [{"id": str(o.pk), "label": getattr(o, feld)} for o in qs.order_by(feld)[:20]]
        )
