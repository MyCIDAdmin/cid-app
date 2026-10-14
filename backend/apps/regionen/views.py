"""Regionen (Release 26) — API unter /api/v1/regionen/.

  GET    /regionen/                                   aktive Regionen mit Verantwortlichen
  GET    /regionen/<slug>/                            Regionsseite (Standorte, Länder, Karten)
  PATCH  /regionen/<slug>/                            Beschreibung DE/FR (Verantwortliche, Büro)
  POST|DELETE /regionen/<slug>/banner/                Banner hochladen/entfernen
  POST   /regionen/<slug>/verantwortliche/            Person zuweisen (Büro, App Admin)
  PATCH|DELETE /regionen/<slug>/verantwortliche/<id>/ eigene Karte ändern / Zuweisung entfernen
  POST|DELETE /regionen/<slug>/verantwortliche/<id>/foto/
  GET    /regionen/personen/?q=                       Personensuche für die Zuweisung
  GET|POST /regionen/verwaltung/                      alle Regionen / neue Region (App Admin)
  PATCH|DELETE /regionen/verwaltung/<id>/             Name, Farbe, Reihenfolge, aktiv / löschen
  PUT    /regionen/verwaltung/<id>/laender/           Bundesländer der Region festlegen
  POST   /regionen/verwaltung/<id>/standorte/         Standort anlegen
  PATCH|DELETE /regionen/verwaltung/standorte/<id>/   Standort ändern / löschen
"""

import uuid

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.communaute.validators import valider_et_reencoder_photo
from apps.membres.models import Bundesland

from . import services
from .models import FARBE_PRUEFUNG, Region, RegionLand, Standort, Verantwortlicher
from .permissions import IsAuthenticated, IsSuperAdmin

BUNDESLAENDER = dict(Bundesland.choices)


def _text(daten, feld, maximum, pflicht=False) -> str:
    wert = daten.get(feld, "")
    if wert is None:
        wert = ""
    if not isinstance(wert, str):
        raise ValidationError({feld: "Text erwartet."})
    wert = wert.strip()
    if pflicht and not wert:
        raise ValidationError({feld: "Pflichtfeld."})
    if len(wert) > maximum:
        raise ValidationError({feld: f"Höchstens {maximum} Zeichen."})
    return wert


def _uuid(wert, feld):
    try:
        return uuid.UUID(str(wert))
    except ValueError:
        raise ValidationError({feld: "Ungültige ID."})


def _bild(request, feld):
    datei = request.FILES.get(feld)
    if datei is None:
        raise ValidationError({feld: "Datei fehlt."})
    return valider_et_reencoder_photo(datei)


def _url(bild) -> str | None:
    return bild.url if bild else None


def standort_dict(s: Standort) -> dict:
    return {"id": str(s.id), "name": s.name, "land": s.land, "aktiv": s.aktiv}


def karte_dict(v: Verantwortlicher, request_user) -> dict:
    return {
        "id": str(v.id),
        "name": v.anzeige_name,
        "funktion": v.funktion,
        "standort": (
            {"id": str(v.standort_id), "name": v.standort.name} if v.standort_id else None
        ),
        "vorstellung": v.vorstellung,
        "foto_url": _url(v.foto),
        "kontakt_email": v.kontakt_email,
        "eigene": v.user_id == request_user.id,
    }


def region_dict(region: Region, user, detail=False) -> dict:
    daten = {
        "id": str(region.id),
        "slug": region.slug,
        "name": region.name,
        "farbe": region.farbe,
        "banner_url": _url(region.banner),
        "beschreibung": {"de": region.beschreibung_de, "fr": region.beschreibung_fr},
        "mitglieder": services.mitglieder_zahl(region),
        "verantwortliche": [
            karte_dict(v, user) for v in region.verantwortliche.select_related("standort")
        ],
        "meine_region": (services.meine_region(user) or None) == region,
    }
    if detail:
        daten.update(
            {
                "standorte": [standort_dict(s) for s in region.standorte.filter(aktiv=True)],
                "laender": [
                    {"code": z.land, "name": BUNDESLAENDER[z.land]} for z in region.laender.all()
                ],
                "darf_bearbeiten": services.darf_bearbeiten(user, region),
                "darf_personen_verwalten": services.ist_personenverwalter(user),
            }
        )
    return daten


def verwaltung_dict(region: Region) -> dict:
    return {
        "id": str(region.id),
        "slug": region.slug,
        "name": region.name,
        "farbe": region.farbe,
        "reihenfolge": region.reihenfolge,
        "aktiv": region.aktiv,
        "mitglieder": services.mitglieder_zahl(region),
        "verantwortliche": region.verantwortliche.count(),
        "laender": [z.land for z in region.laender.all()],
        "standorte": [standort_dict(s) for s in region.standorte.all()],
    }


def _region(slug) -> Region:
    return get_object_or_404(Region, slug=slug, aktiv=True)


def _bearbeitbar(request, slug) -> Region:
    region = _region(slug)
    if not services.darf_bearbeiten(request.user, region):
        raise PermissionDenied()
    return region


def _personenverwalter(request):
    if not services.ist_personenverwalter(request.user):
        raise PermissionDenied()


class RegionListeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        regionen = Region.objects.filter(aktiv=True)
        return Response(
            {
                "ergebnisse": [region_dict(r, request.user) for r in regionen],
                "ohne_region": services.meine_region(request.user) is None,
            }
        )


class RegionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        return Response(region_dict(_region(slug), request.user, detail=True))

    def patch(self, request, slug):
        region = _bearbeitbar(request, slug)
        for sprache in ("de", "fr"):
            feld = f"beschreibung_{sprache}"
            if feld in request.data:
                setattr(region, feld, _text(request.data, feld, 4000))
        region.save()
        return Response(region_dict(region, request.user, detail=True))


class BannerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        region = _bearbeitbar(request, slug)
        bild = _bild(request, "banner")
        if region.banner:
            region.banner.delete(save=False)
        region.banner = bild
        region.save()
        return Response(region_dict(region, request.user, detail=True))

    def delete(self, request, slug):
        region = _bearbeitbar(request, slug)
        if region.banner:
            region.banner.delete(save=False)
        region.banner = None
        region.save()
        return Response(region_dict(region, request.user, detail=True))


class PersonenSucheView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _personenverwalter(request)
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"ergebnisse": []})
        treffer = (
            User.objects.filter(is_active=True)
            .filter(
                Q(email__icontains=q) | Q(membre__prenom__icontains=q) | Q(membre__nom__icontains=q)
            )
            .select_related("membre")
            .order_by("email")[:20]
        )
        return Response(
            {
                "ergebnisse": [
                    {
                        "id": str(u.id),
                        "name": services.anzeigename_von(u) or u.email,
                        "email": u.email,
                    }
                    for u in treffer
                ]
            }
        )


class VerantwortlicheView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        _personenverwalter(request)
        region = _region(slug)
        user_id = _uuid(request.data.get("user"), "user")
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if user is None:
            raise ValidationError({"user": "Person nicht gefunden."})
        if Verantwortlicher.objects.filter(region=region, user=user).exists():
            raise ValidationError({"user": "Diese Person ist bereits Verantwortliche."})
        name = _text(request.data, "name", 100) or services.anzeigename_von(user)
        if not name:
            raise ValidationError({"name": "Anzeigename fehlt (Person hat kein Mitgliedsprofil)."})
        v = Verantwortlicher.objects.create(
            region=region,
            user=user,
            anzeige_name=name,
            funktion=_text(request.data, "funktion", 100),
            standort=_standort(region, request.data.get("standort")),
        )
        return Response(karte_dict(v, request.user), status=201)


def _standort(region: Region, wert) -> Standort | None:
    if not wert:
        return None
    standort = Standort.objects.filter(
        pk=_uuid(wert, "standort"), region=region, aktiv=True
    ).first()
    if standort is None:
        raise ValidationError({"standort": "Standort gehört nicht zu dieser Region."})
    return standort


def _karte(slug, pk) -> tuple[Region, Verantwortlicher]:
    region = _region(slug)
    return region, get_object_or_404(Verantwortlicher, pk=pk, region=region)


def _karte_bearbeitbar(request, slug, pk):
    region, karte = _karte(slug, pk)
    if karte.user_id != request.user.id and not services.ist_personenverwalter(request.user):
        raise PermissionDenied()
    return region, karte


class VerantwortlicherDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, slug, pk):
        region, karte = _karte_bearbeitbar(request, slug, pk)
        daten = request.data
        if "name" in daten:
            karte.anzeige_name = _text(daten, "name", 100, pflicht=True)
        if "funktion" in daten:
            karte.funktion = _text(daten, "funktion", 100)
        if "vorstellung" in daten:
            karte.vorstellung = _text(daten, "vorstellung", 1000)
        if "kontakt_email" in daten:
            kontakt = _text(daten, "kontakt_email", 254)
            if kontakt and "@" not in kontakt:
                raise ValidationError({"kontakt_email": "Ungültige E-Mail-Adresse."})
            karte.kontakt_email = kontakt
        if "standort" in daten:
            karte.standort = _standort(region, daten["standort"])
        karte.save()
        return Response(karte_dict(karte, request.user))

    def delete(self, request, slug, pk):
        _personenverwalter(request)
        _, karte = _karte(slug, pk)
        if karte.foto:
            karte.foto.delete(save=False)
        karte.delete()
        return Response(status=204)


class VerantwortlicherFotoView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk):
        _, karte = _karte_bearbeitbar(request, slug, pk)
        foto = _bild(request, "foto")
        if karte.foto:
            karte.foto.delete(save=False)
        karte.foto = foto
        karte.save()
        return Response(karte_dict(karte, request.user))

    def delete(self, request, slug, pk):
        _, karte = _karte_bearbeitbar(request, slug, pk)
        if karte.foto:
            karte.foto.delete(save=False)
        karte.foto = None
        karte.save()
        return Response(karte_dict(karte, request.user))


# --- Struktur (nur App Admin) ----------------------------------------------------------------


def _farbe(daten) -> str | None:
    if "farbe" not in daten:
        return None
    farbe = _text(daten, "farbe", 7, pflicht=True)
    try:
        FARBE_PRUEFUNG(farbe)
    except Exception:
        raise ValidationError({"farbe": "Farbe im Format #RRGGBB erwartet."})
    return farbe


def _reihenfolge(daten) -> int | None:
    if "reihenfolge" not in daten:
        return None
    wert = daten["reihenfolge"]
    if isinstance(wert, bool) or not isinstance(wert, int) or not 0 <= wert <= 999:
        raise ValidationError({"reihenfolge": "Zahl von 0 bis 999 erwartet."})
    return wert


def _name_pruefen(name: str, ausser: Region | None = None):
    treffer = Region.objects.filter(name__iexact=name)
    if ausser is not None:
        treffer = treffer.exclude(pk=ausser.pk)
    if treffer.exists():
        raise ValidationError({"name": "Eine Region mit diesem Namen existiert bereits."})


class VerwaltungListeView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        regionen = Region.objects.prefetch_related("laender", "standorte")
        vergeben = set(RegionLand.objects.values_list("land", flat=True))
        return Response(
            {
                "ergebnisse": [verwaltung_dict(r) for r in regionen],
                "laender": [{"code": c, "name": n} for c, n in Bundesland.choices],
                "ohne_region": [c for c, _ in Bundesland.choices if c not in vergeben],
            }
        )

    def post(self, request):
        name = _text(request.data, "name", 100, pflicht=True)
        _name_pruefen(name)
        region = Region.objects.create(
            name=name,
            slug=services.eindeutiger_slug(name),
            farbe=_farbe(request.data) or "#1d4ed8",
            reihenfolge=_reihenfolge(request.data) or 0,
        )
        return Response(verwaltung_dict(region), status=201)


class VerwaltungDetailView(APIView):
    permission_classes = [IsSuperAdmin]

    def patch(self, request, pk):
        region = get_object_or_404(Region, pk=pk)
        if "name" in request.data:
            name = _text(request.data, "name", 100, pflicht=True)
            _name_pruefen(name, region)
            region.name = name
        farbe, reihenfolge = _farbe(request.data), _reihenfolge(request.data)
        if farbe is not None:
            region.farbe = farbe
        if reihenfolge is not None:
            region.reihenfolge = reihenfolge
        if "aktiv" in request.data:
            if not isinstance(request.data["aktiv"], bool):
                raise ValidationError({"aktiv": "true oder false erwartet."})
            region.aktiv = request.data["aktiv"]
        region.save()
        return Response(verwaltung_dict(region))

    def delete(self, request, pk):
        region = get_object_or_404(Region, pk=pk)
        if region.verantwortliche.exists():
            raise ValidationError(
                {"detail": "Die Region hat noch Verantwortliche. Bitte zuerst entfernen."}
            )
        if region.banner:
            region.banner.delete(save=False)
        region.delete()
        return Response(status=204)


class VerwaltungLaenderView(APIView):
    permission_classes = [IsSuperAdmin]

    def put(self, request, pk):
        region = get_object_or_404(Region, pk=pk)
        laender = request.data.get("laender")
        if not isinstance(laender, list) or any(land not in BUNDESLAENDER for land in laender):
            raise ValidationError({"laender": "Liste gültiger Bundesland-Kürzel erwartet."})
        with transaction.atomic():
            RegionLand.objects.filter(region=region).exclude(land__in=laender).delete()
            # Ein Land gehört zu höchstens einer Region : es wird hierher verschoben.
            RegionLand.objects.filter(land__in=laender).exclude(region=region).delete()
            for land in set(laender):
                RegionLand.objects.get_or_create(region=region, land=land)
        return Response(verwaltung_dict(region))


class VerwaltungStandortListeView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        region = get_object_or_404(Region, pk=pk)
        name = _text(request.data, "name", 100, pflicht=True)
        land = request.data.get("land", "") or ""
        if land and land not in BUNDESLAENDER:
            raise ValidationError({"land": "Ungültiges Bundesland."})
        if Standort.objects.filter(region=region, name__iexact=name).exists():
            raise ValidationError({"name": "Diesen Standort gibt es in der Region schon."})
        standort = Standort.objects.create(region=region, name=name, land=land)
        return Response(standort_dict(standort), status=201)


class VerwaltungStandortView(APIView):
    permission_classes = [IsSuperAdmin]

    def patch(self, request, pk):
        standort = get_object_or_404(Standort, pk=pk)
        if "name" in request.data:
            name = _text(request.data, "name", 100, pflicht=True)
            doppelt = (
                Standort.objects.filter(region=standort.region, name__iexact=name)
                .exclude(pk=standort.pk)
                .exists()
            )
            if doppelt:
                raise ValidationError({"name": "Diesen Standort gibt es in der Region schon."})
            standort.name = name
        if "land" in request.data:
            land = request.data["land"] or ""
            if land and land not in BUNDESLAENDER:
                raise ValidationError({"land": "Ungültiges Bundesland."})
            standort.land = land
        if "aktiv" in request.data:
            if not isinstance(request.data["aktiv"], bool):
                raise ValidationError({"aktiv": "true oder false erwartet."})
            standort.aktiv = request.data["aktiv"]
        standort.save()
        return Response(standort_dict(standort))

    def delete(self, request, pk):
        standort = get_object_or_404(Standort, pk=pk)
        standort.delete()
        return Response(status=204)
