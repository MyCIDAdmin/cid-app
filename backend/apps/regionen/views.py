"""Regionen (Release 26) — API unter /api/v1/regionen/.

  GET    /regionen/                                   aktive Regionen mit Verantwortlichen
  GET    /regionen/<slug>/                            Regionsseite (Standorte, Länder, Karten)
  PATCH  /regionen/<slug>/                            Beschreibung DE/FR (Verantwortliche, Büro)
  POST|DELETE /regionen/<slug>/banner/                Banner hochladen/entfernen
  POST   /regionen/<slug>/verantwortliche/            Person zuweisen (Büro, App Admin)
  PATCH|DELETE /regionen/<slug>/verantwortliche/<id>/ eigene Karte ändern / Zuweisung entfernen
  POST|DELETE /regionen/<slug>/verantwortliche/<id>/foto/
  GET|POST /regionen/<slug>/beitraege/                Beiträge lesen (?limit&offset) / schreiben
  PATCH|DELETE /regionen/<slug>/beitraege/<id>/       Beitrag ändern / löschen
  POST|DELETE /regionen/<slug>/beitraege/<id>/bild/   Beitragsbild
  POST   /regionen/<slug>/beitraege/<id>/ausblenden/  ausblenden/einblenden (Büro)
  PUT    /regionen/<slug>/beitraege/<id>/reaktion/    {art, aktiv} Emoji-Reaktion setzen/entfernen
  GET    /regionen/personen/?q=                       Personensuche für die Zuweisung
  GET|POST /regionen/verwaltung/                      alle Regionen / neue Region (App Admin)
  PATCH|DELETE /regionen/verwaltung/<id>/             Name, Farbe, Reihenfolge, aktiv / löschen
  PUT    /regionen/verwaltung/<id>/laender/           Bundesländer der Region festlegen
  POST   /regionen/verwaltung/<id>/standorte/         Standort anlegen
  PATCH|DELETE /regionen/verwaltung/standorte/<id>/   Standort ändern / löschen
"""

import uuid

from django.db import transaction
from django.db.models import Count, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.communaute.validators import valider_et_reencoder_photo
from apps.membres.models import Bundesland

from . import formattext, services, wettbewerb
from .models import (
    FARBE_PRUEFUNG,
    REAKTIONEN,
    Beitrag,
    Reaktion,
    Region,
    RegionLand,
    RegionPays,
    Standort,
    Verantwortlicher,
)
from .permissions import IsAuthenticated, IsSuperAdmin

BUNDESLAENDER = dict(Bundesland.choices)
STAATEN = services.STAATEN


def _html(daten, feld, maximum, pflicht=False) -> str:
    """Formatierter Text aus dem Editor : bereinigt ; die Länge zählt nur den sichtbaren Text."""
    wert = daten.get(feld, "")
    if wert is None:
        wert = ""
    if not isinstance(wert, str):
        raise ValidationError({feld: "Text erwartet."})
    if len(wert) > maximum * 10:
        raise ValidationError({feld: "Der Text ist zu lang."})
    bereinigt = formattext.bereinige(wert)
    if pflicht and not bereinigt:
        raise ValidationError({feld: "Pflichtfeld."})
    if len(formattext.klartext(bereinigt)) > maximum:
        raise ValidationError({feld: f"Höchstens {maximum} Zeichen."})
    return bereinigt


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
        "naechste_veranstaltung": services.naechste_veranstaltung(region),
    }
    if detail:
        daten.update(
            {
                "standorte": [standort_dict(s) for s in region.standorte.filter(aktiv=True)],
                "laender": [
                    {"code": z.land, "name": BUNDESLAENDER[z.land]} for z in region.laender.all()
                ],
                "staaten": [
                    {"code": z.pays, "name": STAATEN.get(z.pays, z.pays)}
                    for z in region.staaten.all()
                ],
                "darf_bearbeiten": services.darf_bearbeiten(user, region),
                "darf_personen_verwalten": services.ist_personenverwalter(user),
                "wettbewerb": wettbewerb.platz_von(region),
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
        "staaten": [z.pays for z in region.staaten.all()],
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
                "darf_freigeben": services.ist_personenverwalter(request.user),
                "darf_berichte": services.darf_berichte(request.user),
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
                setattr(region, feld, _html(request.data, feld, 4000))
        region.save()
        return Response(region_dict(region, request.user, detail=True))


class RegionStandortView(APIView):
    """Verantwortliche der Region legen Standorte selbst an (z. B. fürs Treffen-Formular)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, slug):
        region = _bearbeitbar(request, slug)
        name = _text(request.data, "name", 100, pflicht=True)
        land = request.data.get("land", "") or ""
        if land and land not in BUNDESLAENDER:
            raise ValidationError({"land": "Ungültiges Bundesland."})
        vorhanden = Standort.objects.filter(region=region, name__iexact=name).first()
        if vorhanden and vorhanden.aktiv:
            raise ValidationError({"name": "Diesen Standort gibt es im Sektor schon."})
        if vorhanden:
            vorhanden.aktiv = True
            vorhanden.save(update_fields=["aktiv"])
            return Response(standort_dict(vorhanden), status=201)
        standort = Standort.objects.create(region=region, name=name, land=land)
        return Response(standort_dict(standort), status=201)


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
        raise ValidationError({"standort": "Standort gehört nicht zu diesem Sektor."})
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
            karte.vorstellung = _html(daten, "vorstellung", 1000)
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
        raise ValidationError({"name": "Ein Sektor mit diesem Namen existiert bereits."})


class VerwaltungListeView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        regionen = Region.objects.prefetch_related("laender", "staaten", "standorte")
        vergeben = set(RegionLand.objects.values_list("land", flat=True))
        staaten_vergeben = set(RegionPays.objects.values_list("pays", flat=True))
        return Response(
            {
                "ergebnisse": [verwaltung_dict(r) for r in regionen],
                "laender": [{"code": c, "name": n} for c, n in Bundesland.choices],
                "ohne_region": [c for c, _ in Bundesland.choices if c not in vergeben],
                "staaten": [{"code": c, "name": n} for c, n in STAATEN.items()],
                "staaten_ohne_region": [c for c in STAATEN if c not in staaten_vergeben],
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
                {"detail": "Der Sektor hat noch Verantwortliche. Bitte zuerst entfernen."}
            )
        if region.punkte.exists():
            raise ValidationError(
                {"detail": "Der Sektor hat Wettbewerbspunkte. Bitte stattdessen deaktivieren."}
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


class VerwaltungStaatenView(APIView):
    """Ordnet Länder außerhalb Deutschlands (Dänemark, Frankreich …) einem Sektor zu."""

    permission_classes = [IsSuperAdmin]

    def put(self, request, pk):
        region = get_object_or_404(Region, pk=pk)
        staaten = request.data.get("staaten")
        if not isinstance(staaten, list) or any(s not in STAATEN for s in staaten):
            raise ValidationError({"staaten": "Liste gültiger Ländercodes erwartet."})
        with transaction.atomic():
            RegionPays.objects.filter(region=region).exclude(pays__in=staaten).delete()
            # Ein Land gehört zu höchstens einem Sektor : es wird hierher verschoben.
            RegionPays.objects.filter(pays__in=staaten).exclude(region=region).delete()
            for pays in set(staaten):
                RegionPays.objects.get_or_create(region=region, pays=pays)
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
            raise ValidationError({"name": "Diesen Standort gibt es im Sektor schon."})
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
                raise ValidationError({"name": "Diesen Standort gibt es im Sektor schon."})
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


# --- Beiträge und Reaktionen (Release 27) ---------------------------------------------------

MAX_BEITRAEGE = 50


def _reaktionen(beitrag: Beitrag, user) -> list[dict]:
    zaehler = dict(beitrag.reaktionen.values_list("art").annotate(n=Count("id")).order_by())
    meine = set(beitrag.reaktionen.filter(user=user).values_list("art", flat=True))
    return [{"art": a, "anzahl": zaehler.get(a, 0), "meine": a in meine} for a in REAKTIONEN]


def beitrag_dict(b: Beitrag, user, verwalter: bool, bearbeiter: bool) -> dict:
    return {
        "id": str(b.id),
        "titel": b.titel,
        "text": b.text,
        "bild_url": _url(b.bild),
        "autor_name": b.autor_name,
        "created_at": b.created_at.isoformat(),
        "ausgeblendet": b.ausgeblendet,
        "ausgeblendet_grund": b.ausgeblendet_grund if verwalter else "",
        "reaktionen": _reaktionen(b, user),
        "darf_bearbeiten": bearbeiter,
        "darf_ausblenden": verwalter,
    }


def _beitrag(slug, pk, request, nur_bearbeiter=False):
    region = _region(slug)
    beitrag = get_object_or_404(Beitrag, pk=pk, region=region)
    verwalter = services.ist_personenverwalter(request.user)
    bearbeiter = verwalter or services.darf_bearbeiten(request.user, region)
    if nur_bearbeiter and not bearbeiter:
        raise PermissionDenied()
    # Ausgeblendete Beiträge sind nur für Büro und Verantwortliche der Region erreichbar.
    if beitrag.ausgeblendet and not bearbeiter:
        raise Http404()
    return region, beitrag, verwalter, bearbeiter


class BeitraegeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        region = _region(slug)
        verwalter = services.ist_personenverwalter(request.user)
        bearbeiter = verwalter or services.darf_bearbeiten(request.user, region)
        try:
            limit = max(1, min(int(request.query_params.get("limit", 20)), MAX_BEITRAEGE))
            offset = max(0, int(request.query_params.get("offset", 0)))
        except ValueError:
            raise ValidationError({"limit": "Zahl erwartet."})
        liste = region.beitraege.all()
        if not bearbeiter:
            liste = liste.filter(ausgeblendet=False)
        gesamt = liste.count()
        seite = liste[offset : offset + limit]
        return Response(
            {
                "gesamt": gesamt,
                "ergebnisse": [beitrag_dict(b, request.user, verwalter, bearbeiter) for b in seite],
            }
        )

    def post(self, request, slug):
        region = _bearbeitbar(request, slug)
        karte = region.verantwortliche.filter(user=request.user).first()
        beitrag = Beitrag.objects.create(
            region=region,
            autor=request.user,
            # Name der Vorstellungskarte, sonst Profilname (nie die E-Mail-Adresse).
            autor_name=karte.anzeige_name if karte else services.anzeigename_von(request.user),
            titel=_text(request.data, "titel", 150, pflicht=True),
            text=_html(request.data, "text", 4000, pflicht=True),
        )
        verwalter = services.ist_personenverwalter(request.user)
        return Response(beitrag_dict(beitrag, request.user, verwalter, True), status=201)


class BeitragDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, slug, pk):
        _, beitrag, verwalter, _ = _beitrag(slug, pk, request, nur_bearbeiter=True)
        if "titel" in request.data:
            beitrag.titel = _text(request.data, "titel", 150, pflicht=True)
        if "text" in request.data:
            beitrag.text = _html(request.data, "text", 4000, pflicht=True)
        beitrag.save()
        return Response(beitrag_dict(beitrag, request.user, verwalter, True))

    def delete(self, request, slug, pk):
        _, beitrag, _, _ = _beitrag(slug, pk, request, nur_bearbeiter=True)
        if beitrag.bild:
            beitrag.bild.delete(save=False)
        beitrag.delete()
        return Response(status=204)


class BeitragBildView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk):
        _, beitrag, verwalter, _ = _beitrag(slug, pk, request, nur_bearbeiter=True)
        bild = _bild(request, "bild")
        if beitrag.bild:
            beitrag.bild.delete(save=False)
        beitrag.bild = bild
        beitrag.save()
        return Response(beitrag_dict(beitrag, request.user, verwalter, True))

    def delete(self, request, slug, pk):
        _, beitrag, verwalter, _ = _beitrag(slug, pk, request, nur_bearbeiter=True)
        if beitrag.bild:
            beitrag.bild.delete(save=False)
            beitrag.bild = None
            beitrag.save()
        return Response(beitrag_dict(beitrag, request.user, verwalter, True))


class BeitragAusblendenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, slug, pk):
        _personenverwalter(request)
        _, beitrag, _, _ = _beitrag(slug, pk, request)
        ausblenden = request.data.get("ausgeblendet", True)
        if not isinstance(ausblenden, bool):
            raise ValidationError({"ausgeblendet": "Ja/Nein erwartet."})
        beitrag.ausgeblendet = ausblenden
        beitrag.ausgeblendet_grund = (
            _text(request.data, "grund", 200, pflicht=True) if ausblenden else ""
        )
        beitrag.save()
        return Response(beitrag_dict(beitrag, request.user, True, True))


class BeitragReaktionView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, slug, pk):
        _, beitrag, _, _ = _beitrag(slug, pk, request)
        art = request.data.get("art")
        aktiv = request.data.get("aktiv", True)
        if art not in REAKTIONEN:
            raise ValidationError({"art": "Unbekannte Reaktion."})
        if not isinstance(aktiv, bool):
            raise ValidationError({"aktiv": "Ja/Nein erwartet."})
        if aktiv:
            Reaktion.objects.get_or_create(beitrag=beitrag, user=request.user, art=art)
        else:
            Reaktion.objects.filter(beitrag=beitrag, user=request.user, art=art).delete()
        return Response({"id": str(beitrag.id), "reaktionen": _reaktionen(beitrag, request.user)})
