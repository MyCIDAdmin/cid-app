from collections import Counter
from decimal import Decimal

from django.apps import apps
from django.db import transaction
from django.db.models import Avg, Count, Exists, ExpressionWrapper, F, FloatField, OuterRef, Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Role

from .models import (
    Angebot,
    AngebotStatus,
    Partner,
    PartnerBewertung,
    PartnerDokument,
    PartnerEinnahme,
    PartnerKategorie,
    PartnerKontakt,
    PartnerStatus,
    PartnerTyp,
    PartnerVerknuepfung,
    VerknuepfungRolle,
)
from .permissions import PartnerPermission
from .serializers import (
    LOGO_STANDARD_ROLLEN,
    AngebotSerializer,
    PartnerBewertungSerializer,
    PartnerDetailSerializer,
    PartnerDokumentSerializer,
    PartnerEinnahmeSerializer,
    PartnerKategorieSerializer,
    PartnerKontaktSerializer,
    PartnerLogoSerializer,
    PartnerSerializer,
    PartnerVerknuepfungCreateSerializer,
    PartnerVerknuepfungSerializer,
    PartnerVerknuepfungUpdateSerializer,
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


def partner_basis_queryset():
    return Partner.objects.prefetch_related("kategorien", "kontakte").annotate(
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


def filtere_partner(qs, q):
    """Filter der Partnerliste — auch vom Reporting (reporting.py) genutzt."""
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
    if q.get("auf_startseite") == "1":
        qs = qs.filter(auf_startseite=True)
    suche = (q.get("q") or "").strip()
    if suche:
        qs = qs.filter(
            Q(nom__icontains=suche)
            | Exists(PartnerKontakt.objects.filter(partner=OuterRef("pk"), name__icontains=suche))
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


class PartnerViewSet(viewsets.ModelViewSet):
    """/partenaires/partner/ — Lesen ab RH, Pflegen/Bewerten ab Bureau Admin ; kein DELETE
    (Archivieren statt Löschen)."""

    permission_classes = [PartnerPermission]
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        return PartnerDetailSerializer if self.action == "retrieve" else PartnerSerializer

    def get_queryset(self):
        qs = partner_basis_queryset()
        if self.action != "list":
            return qs
        return filtere_partner(qs, self.request.query_params)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        # Partner werden archiviert, nie gelöscht (Historie von Verknüpfungen/Bewertungen).
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["post", "delete"])
    def logo(self, request, pk=None):
        partner = self.get_object()
        if request.method == "DELETE":
            if partner.logo:
                partner.logo.delete(save=False)
            partner.logo = None
            partner.save(update_fields=["logo", "updated_at"])
        else:
            serializer = PartnerLogoSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            if partner.logo:
                partner.logo.delete(save=False)
            partner.logo = serializer.validated_data["logo"]
            partner.save(update_fields=["logo", "updated_at"])
        return Response(PartnerSerializer(partner).data)

    @action(detail=True, methods=["get", "post"])
    def dokumente(self, request, pk=None):
        partner = self.get_object()
        if request.method == "GET":
            return Response(PartnerDokumentSerializer(partner.dokumente.all(), many=True).data)
        serializer = PartnerDokumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(partner=partner, hochgeladen_von=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

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
        logo_anzeigen = daten.get("logo_anzeigen", rolle in LOGO_STANDARD_ROLLEN)
        vorhanden = PartnerVerknuepfung.objects.filter(
            partner=partner, rolle=rolle, **{daten["ziel_typ"]: ziel}
        )
        if vorhanden.exists():
            raise ValidationError("Diese Verknüpfung besteht bereits.")
        verknuepfung = PartnerVerknuepfung.objects.create(
            partner=partner,
            rolle=rolle,
            notiz=daten.get("notiz", ""),
            logo_anzeigen=logo_anzeigen,
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


class PartnerKontaktViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Ansprechpersonen: Anlegen (mit `partner`), Ändern, Löschen ; genau ein Hauptkontakt."""

    permission_classes = [PartnerPermission]
    serializer_class = PartnerKontaktSerializer
    queryset = PartnerKontakt.objects.all()
    http_method_names = ["post", "patch", "delete", "head", "options"]

    @staticmethod
    def _hauptkontakt_festlegen(kontakt):
        if kontakt.hauptkontakt:
            PartnerKontakt.objects.filter(partner=kontakt.partner).exclude(pk=kontakt.pk).update(
                hauptkontakt=False
            )

    @transaction.atomic
    def perform_create(self, serializer):
        kontakt = serializer.save()
        # Der erste Kontakt eines Partners ist automatisch der Hauptkontakt.
        if (
            not PartnerKontakt.objects.filter(partner=kontakt.partner)
            .exclude(pk=kontakt.pk)
            .exists()
        ):
            kontakt.hauptkontakt = True
            kontakt.save(update_fields=["hauptkontakt"])
        self._hauptkontakt_festlegen(kontakt)

    @transaction.atomic
    def perform_update(self, serializer):
        self._hauptkontakt_festlegen(serializer.save())


class PartnerEinnahmeViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """/partenaires/einnahmen/?partner=<id> — Einnahmen von Partnern (z. B. Sponsoring) ;
    Lesen ab RH, Pflegen ab Bureau Admin."""

    permission_classes = [PartnerPermission]
    serializer_class = PartnerEinnahmeSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = PartnerEinnahme.objects.select_related("projet", "evenement")
        if self.request.query_params.get("partner"):
            qs = qs.filter(partner=self.request.query_params["partner"])
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class PartnerBannerView(APIView):
    """GET /partenaires/banner/ — öffentlich (Startseite, auch ohne Anmeldung) : Logos der
    aktiven Partner mit gesetztem Schalter `auf_startseite` und vorhandenem Logo. Nur Name,
    Logo und Website — keine internen Daten."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    pagination_class = None

    def get(self, request):
        qs = (
            Partner.objects.filter(auf_startseite=True, statut=PartnerStatus.AKTIV)
            .exclude(logo="")
            .exclude(logo__isnull=True)
            .order_by("-bevorzugt", "nom")
        )
        return Response(
            [
                {"id": str(p.pk), "nom": p.nom, "logo_url": p.logo.url, "website": p.website}
                for p in qs
            ]
        )


class PartnerDokumentView(APIView):
    """PATCH (Titel, Typ, Gültig bis, Notiz) und DELETE eines Partner-Dokuments."""

    permission_classes = [PartnerPermission]

    def _hole(self, pk):
        dokument = PartnerDokument.objects.filter(pk=pk).first()
        if dokument is None:
            raise NotFound()
        return dokument

    def patch(self, request, pk):
        dokument = self._hole(pk)
        serializer = PartnerDokumentSerializer(dokument, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        dokument = self._hole(pk)
        if dokument.datei:
            dokument.datei.delete(save=False)
        dokument.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PartnerVerknuepfungLoeschenView(APIView):
    permission_classes = [PartnerPermission]

    def delete(self, request, pk):
        PartnerVerknuepfung.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def patch(self, request, pk):
        verknuepfung = PartnerVerknuepfung.objects.filter(pk=pk).first()
        if verknuepfung is None:
            raise NotFound()
        serializer = PartnerVerknuepfungUpdateSerializer(
            verknuepfung, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PartnerVerknuepfungSerializer(verknuepfung).data)


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


def _bewertung_schnitt():
    return Avg(
        ExpressionWrapper(
            (
                F("partner__bewertungen__qualitaet")
                + F("partner__bewertungen__preis_leistung")
                + F("partner__bewertungen__zuverlaessigkeit")
                + F("partner__bewertungen__kommunikation")
            )
            / 4.0,
            output_field=FloatField(),
        )
    )


class AngebotViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Angebotsvergleich je Projekt: `?projet=<id>` ; Zuschlag/Zurücksetzen als Aktionen."""

    permission_classes = [PartnerPermission]
    serializer_class = AngebotSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Angebot.objects.select_related("partner", "dokument").annotate(
            partner_note=_bewertung_schnitt()
        )
        projet = self.request.query_params.get("projet")
        if projet:
            qs = qs.filter(projet=projet)
        elif self.action == "list":
            raise ValidationError({"projet": "Projekt angeben."})
        return qs.order_by("betrag", "created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != AngebotStatus.OFFEN:
            raise ValidationError("Nur offene Angebote können geändert werden.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.status == AngebotStatus.ZUSCHLAG:
            raise ValidationError("Zuschlag zuerst zurücksetzen.")
        instance.delete()

    @action(detail=True, methods=["post"])
    def zuschlag(self, request, pk=None):
        angebot = self.get_object()
        with transaction.atomic():
            Angebot.objects.filter(projet=angebot.projet).exclude(pk=angebot.pk).update(
                status=AngebotStatus.ABGELEHNT
            )
            Angebot.objects.filter(pk=angebot.pk).update(status=AngebotStatus.ZUSCHLAG)
            # Der Gewinner wird (falls noch nicht geschehen) automatisch mit dem Projekt verknüpft.
            PartnerVerknuepfung.objects.get_or_create(
                partner=angebot.partner,
                projet=angebot.projet,
                rolle=VerknuepfungRolle.LIEFERANT,
                defaults={"created_by": request.user},
            )
        return Response(AngebotSerializer(self.get_queryset().get(pk=angebot.pk)).data)

    @action(detail=True, methods=["post"])
    def zuruecksetzen(self, request, pk=None):
        angebot = self.get_object()
        Angebot.objects.filter(projet=angebot.projet).update(status=AngebotStatus.OFFEN)
        return Response(AngebotSerializer(self.get_queryset().get(pk=angebot.pk)).data)


def _name(schreibweisen: Counter) -> str:
    """Häufigste Schreibweise ; bei Gleichstand die alphabetisch erste (deterministisch)."""
    return sorted(schreibweisen.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]


def _norm(name: str) -> str:
    return " ".join((name or "").lower().split())


class AusgabenImportView(APIView):
    """POST /partenaires/import-ausgaben/ — Lieferantennamen aus Ausgaben als Partner anlegen und
    die Ausgaben verknüpfen. Ohne `bestaetigen: true` nur Vorschau (nichts wird geschrieben)."""

    permission_classes = [PartnerPermission]

    def post(self, request):
        from apps.finances.models import Depense

        bestaetigen = str(request.data.get("bestaetigen", "")).lower() in {"1", "true"}
        gruppen: dict[str, dict] = {}
        for d in Depense.objects.filter(partner__isnull=True).exclude(fournisseur=""):
            key = _norm(d.fournisseur)
            if not key:
                continue
            eintrag = gruppen.setdefault(
                key, {"schreibweisen": Counter(), "ids": [], "summe": Decimal("0")}
            )
            eintrag["schreibweisen"][" ".join(d.fournisseur.split())] += 1
            eintrag["ids"].append(d.pk)
            eintrag["summe"] += d.montant
        vorhanden = {_norm(p.nom): p for p in Partner.objects.all()}

        vorschau = []
        for key, g in sorted(gruppen.items()):
            name = _name(g["schreibweisen"])
            vorschau.append(
                {
                    "name": name,
                    "anzahl": len(g["ids"]),
                    "summe": float(g["summe"]),
                    "neu": key not in vorhanden,
                }
            )
        if not bestaetigen:
            return Response({"gruppen": vorschau, "bestaetigt": False})

        neu = verknuepft = 0
        with transaction.atomic():
            for key, g in gruppen.items():
                partner = vorhanden.get(key)
                if partner is None:
                    name = _name(g["schreibweisen"])
                    partner = Partner.objects.create(
                        nom=name, typ=PartnerTyp.LIEFERANT, created_by=request.user
                    )
                    neu += 1
                verknuepft += Depense.objects.filter(pk__in=g["ids"]).update(partner=partner)
        return Response(
            {
                "gruppen": vorschau,
                "bestaetigt": True,
                "partner_neu": neu,
                "ausgaben_verknuepft": verknuepft,
            }
        )
